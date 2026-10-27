import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import HubInvite from '@/models/hub/HubInvite';
import HubServer from '@/models/hub/HubServer';
import { addMember } from '@/server/modules/hub/service';

async function loadInvite(code: string, campus: string) {
  const invite = await HubInvite.findOne({ code: code.toUpperCase() }).lean();
  if (!invite || (invite.expiresAt && invite.expiresAt < new Date()) || (invite.maxUses > 0 && invite.uses >= invite.maxUses)) {
    throw ApiError.notFound('That invite has expired.');
  }
  const server = await HubServer.findOne({ _id: invite.server, campus, archivedAt: { $exists: false } }).lean();
  // Invites never cross campuses.
  if (!server) throw ApiError.notFound('That invite has expired.');
  return { invite, server };
}

export const GET = route({ feature: 'hub' }, async ({ actor, params }) => {
  const { server } = await loadInvite(params.code, actor.campus);
  return ok({ server: { _id: String(server._id), name: server.name, description: server.description, memberCount: server.memberCount, kind: server.kind, color: server.color } });
});

export const POST = route({ rateLimit: 'write', feature: 'hub' }, async ({ actor, params }) => {
  const { invite, server } = await loadInvite(params.code, actor.campus);
  const joined = await addMember(String(server._id), actor.id);
  if (joined) await HubInvite.updateOne({ _id: invite._id }, { $inc: { uses: 1 } });
  return ok({ serverId: String(server._id) });
});
