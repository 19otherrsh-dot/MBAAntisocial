import mongoose, { Types, type Model } from 'mongoose';
import './all-models';
import User from '@/models/User';
import HubServer from '@/models/hub/HubServer';
import InterviewSlot from '@/models/InterviewSlot';
import Team from '@/models/campus/Team';
import ExternalAccount from '@/models/ExternalAccount';
import { ApiError } from '@/lib/api/errors';
import { audit } from '@/server/modules/admin/audit';
import { invalidateAuthz } from '@/server/modules/auth/authz';
import { ACCOUNT_RULES, NOT_EXPORTED, type AccountRule } from './registry';
import { splitSubdocumentPath } from './paths';

/**
 * Data export and account deletion (the DPDP Act's rights of access and
 * erasure). What happens to each collection is decided in ./registry.ts.
 */

/** What anonymised records point at: no user has this id, so it reads as "Deleted user". */
export const DELETED_USER_ID = new Types.ObjectId('000000000000000000000000');

const SECRET_KEY = /password|secret|token|hash|otp/i;
const EXPORT_LIMIT = 5000;

const modelOf = (name: string) => mongoose.models[name] as Model<unknown> | undefined;

/** Drops anything credential-like, at any depth. */
function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value instanceof Types.ObjectId || value instanceof Date) return value;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEY.test(key)).map(([key, v]) => [key, scrub(v)]));
  }
  return value;
}

/** Everything the app holds that is about or by this person, as one JSON document. */
export async function exportAccount(userId: string) {
  const id = new Types.ObjectId(userId);
  const account = await User.findById(id).lean();
  if (!account) throw ApiError.notFound('That account does not exist.');

  const collections: Record<string, unknown[]> = {};
  for (const [name, rules] of Object.entries(ACCOUNT_RULES)) {
    const model = modelOf(name);
    const theirs = rules.filter((rule) => rule.action !== 'keep' && !rule.path.endsWith('.$*'));
    if (!model || NOT_EXPORTED[name] || theirs.length === 0) continue;
    const docs = await model.find({ $or: theirs.map((rule) => ({ [rule.path]: id })) }).limit(EXPORT_LIMIT).lean();
    if (docs.length) collections[name] = docs.map(scrub);
  }
  const connected = await ExternalAccount.find({ user: id }).select('provider createdAt').lean();

  return {
    exportedAt: new Date().toISOString(),
    about:
      'Everything MBAAntisocial stores that you created or that is about you. Records you share with others (messages, notes, matches) are included in full. Credentials and one-time codes are left out.',
    account: scrub(account),
    connectedApps: connected.map((c) => ({ provider: c.provider, connectedAt: c.createdAt })),
    collections,
    notIncluded: NOT_EXPORTED,
  };
}

/** Things deletion would leave broken for other people; each must be sorted out first. */
export async function deletionBlockers(userId: string): Promise<string[]> {
  const id = new Types.ObjectId(userId);
  const [servers, sessions, teams] = await Promise.all([
    HubServer.find({ owner: id, kind: { $ne: 'campus' }, archivedAt: { $exists: false } }).select('name').lean(),
    InterviewSlot.countDocuments({ status: 'booked', startAt: { $gte: new Date() }, $or: [{ mentor: id }, { bookedBy: id }] }),
    Team.find({ captain: id, 'members.1': { $exists: true } }).select('name').lean(),
  ]);
  const blockers: string[] = [];
  for (const s of servers) blockers.push(`You own the hub server “${s.name}”. Transfer it to someone or delete it first.`);
  if (sessions) blockers.push(`You have ${sessions} upcoming ${sessions === 1 ? 'session' : 'sessions'}. Cancel ${sessions === 1 ? 'it' : 'them'} first so the other person is told.`);
  for (const t of teams) blockers.push(`You captain “${t.name}”. Hand the captaincy to a teammate first.`);
  return blockers;
}

async function apply(model: Model<unknown>, rule: AccountRule, id: Types.ObjectId): Promise<number> {
  const collection = model.collection;
  if (rule.action === 'keep') return 0;

  // A map of id arrays (Post.reactions): pull from every key that holds the id.
  if (rule.path.endsWith('.$*')) {
    const field = rule.path.slice(0, -3);
    const docs = await collection.find({ [field]: { $exists: true } }, { projection: { [field]: 1 } }).toArray();
    let changed = 0;
    for (const doc of docs) {
      const map = (doc[field] ?? {}) as Record<string, Types.ObjectId[]>;
      const keys = Object.keys(map).filter((key) => (map[key] ?? []).some((v) => String(v) === String(id)));
      if (keys.length === 0) continue;
      await collection.updateOne({ _id: doc._id }, { $pull: Object.fromEntries(keys.map((key) => [`${field}.${key}`, id])) as never });
      changed += 1;
    }
    return changed;
  }

  const match = { [rule.path]: id };
  if (rule.action === 'delete') return (await collection.deleteMany(match)).deletedCount;

  const split = splitSubdocumentPath(model, rule.path);
  if (rule.action === 'anonymise') {
    const result = split
      ? await collection.updateMany(match, { $set: { [`${split.list}.$[e].${split.field}`]: DELETED_USER_ID } }, { arrayFilters: [{ [`e.${split.field}`]: id }] })
      : await collection.updateMany(match, { $set: { [rule.path]: DELETED_USER_ID } });
    return result.modifiedCount;
  }

  // pull
  if (!split) return (await collection.updateMany(match, { $pull: { [rule.path]: id } as never })).modifiedCount;
  const fieldIsList = (model.schema.path(split.list) as unknown as { schema: mongoose.Schema }).schema.path(split.field)?.instance === 'Array';
  const update = fieldIsList ? { $pull: { [`${split.list}.$[].${split.field}`]: id } } : { $pull: { [split.list]: { [split.field]: id } } };
  return (await collection.updateMany(match, update as never)).modifiedCount;
}

/**
 * Deletes the account: private records go, shared ones are credited to nobody,
 * and the person is removed from lists. Refuses while deleting would strand
 * other people (see `deletionBlockers`). Returns what changed, per collection.
 */
export async function deleteAccount(userId: string): Promise<Record<string, number>> {
  const blockers = await deletionBlockers(userId);
  if (blockers.length) throw ApiError.conflict(blockers.join(' '));
  const id = new Types.ObjectId(userId);
  const user = await User.findById(id).select('campus').lean();
  if (!user) throw ApiError.notFound('That account does not exist.');

  const changed: Record<string, number> = {};
  for (const [name, rules] of Object.entries(ACCOUNT_RULES)) {
    const model = modelOf(name);
    if (!model) continue;
    let total = 0;
    for (const rule of rules) total += await apply(model, rule, id);
    if (total) changed[name] = total;
  }
  await User.deleteOne({ _id: id });
  await invalidateAuthz(userId);
  // Who and when only: the record must not keep what the person asked to erase.
  await audit(userId, { action: 'account.delete', targetType: 'user', targetId: userId, targetLabel: 'Deleted account', campus: user.campus });
  return changed;
}
