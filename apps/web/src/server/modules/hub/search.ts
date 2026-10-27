import HubServer from '@/models/hub/HubServer';
import HubMember from '@/models/hub/HubMember';
import HubChannel from '@/models/hub/HubChannel';
import type { SearchProvider } from '../search/types';

const servers: SearchProvider = {
  type: 'server',
  label: 'Hub servers',
  campusOnly: true,
  async search(actor, pattern, limit) {
    const rows = await HubServer.find({
      campus: actor.campus,
      archivedAt: { $exists: false },
      visibility: { $ne: 'invite' },
      name: pattern,
    })
      .select('name kind memberCount')
      .limit(limit)
      .lean();
    return rows.map((s) => ({ id: String(s._id), type: 'server', title: s.name, subtitle: `${s.kind} · ${s.memberCount} members`, href: `/hub/${s._id}` }));
  },
};

const channels: SearchProvider = {
  type: 'channel',
  label: 'Channels',
  campusOnly: true,
  async search(actor, pattern, limit) {
    const memberships = await HubMember.find({ user: actor.id }).select('server').lean();
    const rows = await HubChannel.find({ server: { $in: memberships.map((m) => m.server) }, archivedAt: { $exists: false }, name: pattern })
      .select('name server kind')
      .limit(limit)
      .lean();
    return rows.map((c) => ({ id: String(c._id), type: 'channel', title: `#${c.name}`, subtitle: c.kind, href: `/hub/${c.server}/${c._id}` }));
  },
};

export const hubSearchProviders: SearchProvider[] = [servers, channels];
