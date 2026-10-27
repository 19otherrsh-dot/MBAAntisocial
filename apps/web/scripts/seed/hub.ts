import HubServer from '../../src/models/hub/HubServer';
import HubRole from '../../src/models/hub/HubRole';
import HubMember from '../../src/models/hub/HubMember';
import HubChannel from '../../src/models/hub/HubChannel';
import HubMessage from '../../src/models/hub/HubMessage';
import HubConversation from '../../src/models/hub/HubConversation';
import HubReadState from '../../src/models/hub/HubReadState';
import HubInvite from '../../src/models/hub/HubInvite';
import HubJoinRequest from '../../src/models/hub/HubJoinRequest';
import HubBan from '../../src/models/hub/HubBan';
import type { Types } from 'mongoose';
import { addMember, createServer, ensureCampusServer } from '../../src/server/modules/hub/service';
import type { SeedContext } from './index';

/** A lived-in campus server, two circles, a forum thread, and one DM. */
export async function run({ campus, users }: SeedContext): Promise<string> {
  const old = await HubServer.find({ campus }).select('_id').lean();
  const oldIds = old.map((s) => s._id);
  await Promise.all([
    HubRole.deleteMany({ server: { $in: oldIds } }),
    HubMember.deleteMany({ server: { $in: oldIds } }),
    HubChannel.deleteMany({ server: { $in: oldIds } }),
    HubMessage.deleteMany({ server: { $in: oldIds } }),
    HubInvite.deleteMany({ server: { $in: oldIds } }),
    HubJoinRequest.deleteMany({ server: { $in: oldIds } }),
    HubBan.deleteMany({ server: { $in: oldIds } }),
    HubServer.deleteMany({ _id: { $in: oldIds } }),
  ]);
  const oldConversations = await HubConversation.find({ campus }).select('_id').lean();
  await Promise.all([
    HubMessage.deleteMany({ conversation: { $in: oldConversations.map((c) => c._id) } }),
    HubConversation.deleteMany({ campus }),
    HubReadState.deleteMany({ user: { $in: users.map((u) => u._id) } }),
  ]);

  const byEmail = (prefix: string) => users.find((u) => u.email.startsWith(`${prefix}@`));
  const ananya = byEmail('ananya');
  const rohit = byEmail('rohit');
  const priya = byEmail('priya');
  const sneha = byEmail('sneha');
  const arjun = byEmail('arjun');
  const meera = byEmail('meera');
  const devansh = byEmail('devansh');
  if (!ananya || !rohit || !priya || !sneha || !arjun || !meera || !devansh) return 'skipped (seed users missing)';

  const campusServer = await ensureCampusServer(campus);
  for (const user of users) await addMember(String(campusServer._id), String(user._id), { silent: true });
  const channel = async (serverId: Types.ObjectId, name: string) => (await HubChannel.findOne({ server: serverId, name }).select('_id').lean())!;

  let minutesAgo = 60 * 30;
  const post = async (where: { channel: Types.ObjectId; server: Types.ObjectId }, author: { _id: Types.ObjectId }, content: string, extra: Record<string, unknown> = {}) => {
    minutesAgo -= 17;
    return HubMessage.create({ ...where, author: author._id, content, createdAt: new Date(Date.now() - minutesAgo * 60_000), ...extra });
  };

  const announcements = await channel(campusServer._id, 'announcements');
  const general = await channel(campusServer._id, 'general');
  const placements = await channel(campusServer._id, 'placements');
  const askSeniors = await channel(campusServer._id, 'ask-seniors');
  const at = (c: { _id: Types.ObjectId }) => ({ channel: c._id, server: campusServer._id });

  await post(at(announcements), ananya, 'Summer placement prep calendar is pinned in #placements. Mock GD slots open every evening this week — book them from Sessions.', { pinned: true });
  await post(at(general), arjun, 'Anyone heading to the city tonight? Splitting a cab from the main gate at 7.');
  await post(at(general), meera, 'In! Two of us.');
  await post(at(general), devansh, `<@${meera._id}> save me a seat too 🙏`, { mentions: { users: [meera._id], roles: [], everyone: false } });
  await post(at(placements), rohit, 'Consulting shortlists usually drop two weeks before Day 0. Start casing with a partner now, not after.', { pinned: true });
  await post(at(placements), sneha, 'Is there a list of firms that do written tests before the case rounds?');
  const forumRoot = await post(at(askSeniors), sneha, 'Practise guesstimates alone or in pairs? Pairs feel slow but solo I skip steps.', { title: 'How do I get faster at guesstimates?', threadCount: 2 });
  await post(at(askSeniors), priya, 'Pairs, but time-box: 6 minutes each, then swap and critique the structure only. Speed comes from reusing structures, not from rushing.', { thread: forumRoot._id, markedUseful: true });
  await post(at(askSeniors), arjun, 'This worked for me. I kept a doc of every structure I used and reread it before each mock.', { thread: forumRoot._id });
  await HubMessage.updateOne({ _id: forumRoot._id }, { $set: { lastThreadAt: new Date() } });
  await HubChannel.updateMany({ server: campusServer._id }, { $set: { lastMessageAt: new Date() } });

  const finance = await createServer({ campus, ownerId: String(arjun._id), name: 'Finance circle', kind: 'circle', visibility: 'public', description: 'Markets, valuation drills, and weekly stock pitches.' });
  for (const user of [sneha, devansh, rohit]) await addMember(String(finance._id), String(user._id), { silent: true });
  const financeGeneral = await channel(finance._id, 'general');
  await post({ channel: financeGeneral._id, server: finance._id }, arjun, 'Stock pitch Friday: 3 minutes, one slide, one number that matters.');
  await post({ channel: financeGeneral._id, server: finance._id }, devansh, 'Calling dibs on a mid-cap pharma pitch.');

  await createServer({ campus, ownerId: String(meera._id), name: 'Sunday cricket', kind: 'circle', visibility: 'request', description: 'Tennis-ball cricket at the sports complex, every Sunday 7am.' });

  // A DM between a junior and the senior who ran their mock.
  const participants = [String(sneha._id), String(priya._id)].sort();
  const dm = await HubConversation.create({ campus, participants, key: participants.join(':'), kind: 'dm', createdBy: priya._id });
  await HubMessage.create({ conversation: dm._id, author: priya._id, content: 'Great mock today. Work on closing with a recommendation in the first minute.', createdAt: new Date(Date.now() - 90 * 60_000) });
  const last = await HubMessage.create({ conversation: dm._id, author: sneha._id, content: 'Thank you! Will do. Can I book you again next week?', createdAt: new Date(Date.now() - 60 * 60_000) });
  await HubConversation.updateOne({ _id: dm._id }, { $set: { lastMessageAt: last.createdAt, lastMessagePreview: last.content } });

  return '3 servers, a forum thread, and a DM';
}
