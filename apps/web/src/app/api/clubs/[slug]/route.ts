import { z } from 'zod';
import { Types } from 'mongoose';
import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { objectId } from '@/lib/validation';
import { notify } from '@/lib/notifications';
import Club, { CLUB_CATEGORIES } from '@/models/campus/Club';
import ClubApplication from '@/models/campus/ClubApplication';
import Event from '@/models/campus/Event';
import User from '@/models/User';
import { addClubMember, canManageClub, loadClub, memberOf, removeClubMember } from '@/server/modules/campus-life/clubs';

export const GET = route({ feature: 'clubs' }, async ({ actor, params }) => {
  const club = (await loadClub(params.slug, actor.campus)).toObject();
  const me = memberOf(club, actor.id);
  const isCore = canManageClub(club, actor.id);
  const [users, events, application, pendingApplications] = await Promise.all([
    User.find({ _id: { $in: [...club.members.map((m) => m.user), ...club.tasks.flatMap((t) => (t.assignee ? [t.assignee] : []))] } }).select('name image batch year').lean(),
    Event.find({ club: club._id, status: 'scheduled', endAt: { $gte: new Date() } }).sort({ startAt: 1 }).limit(10).select('title startAt venue goingCount').lean(),
    ClubApplication.findOne({ club: club._id, user: actor.id }).select('status').lean(),
    isCore ? ClubApplication.countDocuments({ club: club._id, status: 'pending' }) : Promise.resolve(0),
  ]);
  const person = new Map(users.map((u) => [String(u._id), u]));
  const roleOrder = { lead: 0, core: 1, member: 2 } as const;
  const spent = club.budget.entries.filter((e) => e.kind === 'expense').reduce((n, e) => n + e.amount, 0);
  const income = club.budget.entries.filter((e) => e.kind === 'income').reduce((n, e) => n + e.amount, 0);

  return ok({
    club: {
      _id: String(club._id),
      slug: club.slug,
      name: club.name,
      tagline: club.tagline,
      description: club.description,
      category: club.category,
      logo: club.logo,
      official: club.official,
      links: club.links,
      memberCount: club.memberCount,
      hubServer: club.hubServer ? String(club.hubServer) : null,
      recruitment: { ...club.recruitment, open: club.recruitment.open && (!club.recruitment.deadline || club.recruitment.deadline > new Date()) },
      members: [...club.members]
        .sort((a, b) => roleOrder[a.role] - roleOrder[b.role])
        .map((m) => ({ _id: String(m.user), name: person.get(String(m.user))?.name ?? 'Member', image: person.get(String(m.user))?.image ?? '', batch: person.get(String(m.user))?.batch ?? '', role: m.role, title: m.title })),
      events: events.map((e) => ({ _id: String(e._id), title: e.title, startAt: e.startAt, venue: e.venue, goingCount: e.goingCount })),
      budget: isCore
        ? { allocated: club.budget.allocated, income, spent, balance: club.budget.allocated + income - spent, entries: [...club.budget.entries].sort((a, b) => b.at.getTime() - a.at.getTime()).map((e) => ({ ...e, _id: String(e._id), by: String(e.by) })) }
        : null,
      tasks: me
        ? club.tasks.map((t) => ({ _id: String(t._id), title: t.title, done: t.done, due: t.due ?? null, assignee: t.assignee ? { _id: String(t.assignee), name: person.get(String(t.assignee))?.name ?? '' } : null }))
        : null,
    },
    me: { role: me?.role ?? null, application: application?.status ?? null, canManage: isCore, canLead: canManageClub(club, actor.id, 'lead'), canAdmin: actor.canModerate || actor.canAdminCampus },
    pendingApplications,
  });
});

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('join') }),
  z.object({ action: z.literal('apply'), answers: z.array(z.string().trim().max(2000)).max(10) }),
  z.object({ action: z.literal('withdraw') }),
  z.object({ action: z.literal('leave') }),
  z.object({
    action: z.literal('update'),
    tagline: z.string().trim().max(140).optional(),
    description: z.string().trim().max(4000).optional(),
    category: z.enum(CLUB_CATEGORIES).optional(),
    logo: z.string().max(500).optional(),
    links: z.object({ instagram: z.string().max(300), linkedin: z.string().max(300), website: z.string().max(300) }).partial().optional(),
    recruitment: z.object({ open: z.boolean(), deadline: z.coerce.date().nullable().optional(), questions: z.array(z.string().trim().min(3).max(300)).max(10), note: z.string().max(1000).default('') }).optional(),
  }),
  z.object({ action: z.literal('set_role'), userId: objectId, role: z.enum(['lead', 'core', 'member']), title: z.string().trim().max(60).default('') }),
  z.object({ action: z.literal('remove_member'), userId: objectId }),
  z.object({ action: z.literal('budget_add'), label: z.string().trim().min(2).max(120), amount: z.number().positive().max(100_000_000), kind: z.enum(['income', 'expense']) }),
  z.object({ action: z.literal('budget_remove'), entryId: objectId }),
  z.object({ action: z.literal('budget_allocated'), allocated: z.number().min(0).max(100_000_000) }),
  z.object({ action: z.literal('task_add'), title: z.string().trim().min(2).max(200), assignee: objectId.optional(), due: z.coerce.date().optional() }),
  z.object({ action: z.literal('task_toggle'), taskId: objectId }),
  z.object({ action: z.literal('task_remove'), taskId: objectId }),
  z.object({ action: z.literal('official'), official: z.boolean() }),
  z.object({ action: z.literal('archive') }),
]);

export const POST = route({ feature: 'clubs', body: actionSchema, rateLimit: 'write' }, async ({ actor, params, body }) => {
  const club = await loadClub(params.slug, actor.campus);
  const core = () => {
    if (!canManageClub(club, actor.id)) throw ApiError.forbidden('Only the club’s leads and core team can do that.');
  };
  const lead = () => {
    if (!canManageClub(club, actor.id, 'lead')) throw ApiError.forbidden('Only club leads can do that.');
  };
  const recruitingOpen = club.recruitment.open && (!club.recruitment.deadline || club.recruitment.deadline > new Date());

  switch (body.action) {
    case 'join':
      if (!recruitingOpen) throw ApiError.conflict('This club is not taking members right now.');
      if (club.recruitment.questions.length > 0) throw ApiError.badRequest('This club asks a few questions first — apply instead.');
      await addClubMember(club, actor.id);
      break;
    case 'apply': {
      if (!recruitingOpen) throw ApiError.conflict('Applications are closed.');
      if (memberOf(club, actor.id)) throw ApiError.conflict('You are already a member.');
      await ClubApplication.updateOne({ club: club._id, user: actor.id }, { $set: { answers: body.answers, status: 'pending' } }, { upsert: true });
      const leads = club.members.filter((m) => m.role !== 'member');
      await Promise.all(leads.map((m) => notify({ user: m.user, kind: 'club_update', title: `${actor.name} applied to ${club.name}`, href: `/clubs/${club.slug}?tab=applications`, actor: actor.id, entityType: 'Club', entity: club._id })));
      break;
    }
    case 'withdraw':
      await ClubApplication.updateOne({ club: club._id, user: actor.id, status: 'pending' }, { $set: { status: 'withdrawn' } });
      break;
    case 'leave':
      await removeClubMember(club, actor.id);
      break;
    case 'update': {
      core();
      const { action: _action, links, recruitment, ...rest } = body;
      const set: Record<string, unknown> = { ...rest };
      if (links) for (const [k, v] of Object.entries(links)) set[`links.${k}`] = v;
      if (recruitment) set.recruitment = { ...recruitment, deadline: recruitment.deadline ?? undefined };
      await Club.updateOne({ _id: club._id }, { $set: set });
      break;
    }
    case 'set_role': {
      lead();
      if (!memberOf(club, body.userId)) throw ApiError.notFound('They are not a member.');
      if (body.userId === actor.id && body.role !== 'lead' && club.members.filter((m) => m.role === 'lead').length === 1) throw ApiError.badRequest('Make someone else a lead first.');
      await Club.updateOne({ _id: club._id, 'members.user': new Types.ObjectId(body.userId) }, { $set: { 'members.$.role': body.role, 'members.$.title': body.title } });
      break;
    }
    case 'remove_member':
      lead();
      await removeClubMember(club, body.userId);
      break;
    case 'budget_add':
      core();
      await Club.updateOne({ _id: club._id }, { $push: { 'budget.entries': { label: body.label, amount: body.amount, kind: body.kind, at: new Date(), by: actor.id } } });
      break;
    case 'budget_remove':
      core();
      await Club.updateOne({ _id: club._id }, { $pull: { 'budget.entries': { _id: body.entryId } } });
      break;
    case 'budget_allocated':
      lead();
      await Club.updateOne({ _id: club._id }, { $set: { 'budget.allocated': body.allocated } });
      break;
    case 'task_add':
      core();
      await Club.updateOne({ _id: club._id }, { $push: { tasks: { title: body.title, assignee: body.assignee, due: body.due, done: false, createdBy: actor.id } } });
      if (body.assignee && body.assignee !== actor.id) await notify({ user: body.assignee, kind: 'club_update', title: `${club.name}: ${body.title}`, body: 'You were assigned a task.', href: `/clubs/${club.slug}?tab=tasks`, actor: actor.id });
      break;
    case 'task_toggle': {
      if (!memberOf(club, actor.id)) throw ApiError.forbidden('Members only.');
      const task = club.tasks.find((t) => String(t._id) === body.taskId);
      if (!task) throw ApiError.notFound('That task does not exist.');
      await Club.updateOne({ _id: club._id, 'tasks._id': task._id }, { $set: { 'tasks.$.done': !task.done } });
      break;
    }
    case 'task_remove':
      core();
      await Club.updateOne({ _id: club._id }, { $pull: { tasks: { _id: body.taskId } } });
      break;
    case 'official':
      if (!actor.canModerate && !actor.canAdminCampus) throw ApiError.forbidden('Only the campus team can recognise clubs.');
      await Club.updateOne({ _id: club._id }, { $set: { official: body.official } });
      break;
    case 'archive':
      if (!canManageClub(club, actor.id, 'lead') && !actor.canModerate) throw ApiError.forbidden('Only club leads can archive it.');
      await Club.updateOne({ _id: club._id }, { $set: { archivedAt: new Date() } });
      break;
  }
  return ok({ ok: true });
});
