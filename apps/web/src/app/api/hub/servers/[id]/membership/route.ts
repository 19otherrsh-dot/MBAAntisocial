import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { objectId } from '@/lib/validation';
import { notifyMany } from '@/lib/notifications';
import HubServer from '@/models/hub/HubServer';
import HubMember from '@/models/hub/HubMember';
import HubJoinRequest from '@/models/hub/HubJoinRequest';
import HubRole from '@/models/hub/HubRole';
import { PERMISSIONS } from '@mba/shared/hub';
import { membershipSchema } from '@/server/modules/hub/schemas';
import { addMember, removeMember } from '@/server/modules/hub/service';

/** Join a public server, request to join a request-only one, leave, or change notification level. */
export const POST = route({ body: membershipSchema, rateLimit: 'write', feature: 'hub' }, async ({ actor, params, body }) => {
  const serverId = objectId.parse(params.id);
  const server = await HubServer.findOne({ _id: serverId, campus: actor.campus, archivedAt: { $exists: false } }).lean();
  if (!server) throw ApiError.notFound('That server does not exist.');

  if (body.notify) {
    await HubMember.updateOne({ server: serverId, user: actor.id }, { $set: { notify: body.notify } });
    return ok({ notify: body.notify });
  }

  switch (body.action) {
    case 'join': {
      if (server.visibility !== 'public') throw ApiError.forbidden('This server is not open to join. Request access or use an invite.');
      await addMember(serverId, actor.id);
      return ok({ joined: true });
    }
    case 'request': {
      if (server.visibility !== 'request') throw ApiError.badRequest('This server does not take requests.');
      await HubJoinRequest.updateOne({ server: serverId, user: actor.id }, { $setOnInsert: { note: body.note } }, { upsert: true });
      // Tell whoever can manage members.
      const managerRoles = await HubRole.find({
        server: serverId,
        permissions: { $bitsAnySet: PERMISSIONS.KICK_MEMBERS | PERMISSIONS.ADMINISTRATOR },
      })
        .select('_id')
        .lean();
      const managers = await HubMember.find({ server: serverId, $or: [{ roles: { $in: managerRoles.map((r) => r._id) } }, { user: server.owner }] }).select('user').limit(20).lean();
      await notifyMany(
        managers.map((m) => ({
          user: m.user,
          kind: 'club_update' as const,
          title: `${actor.name} asked to join ${server.name}`,
          body: body.note,
          href: `/hub/${serverId}?settings=requests`,
          actor: actor.id,
        }))
      );
      return ok({ requested: true });
    }
    case 'leave': {
      if (server.kind === 'campus') throw ApiError.badRequest('Everyone on campus stays in the campus server — mute it instead.');
      if (String(server.owner ?? '') === actor.id) throw ApiError.badRequest('Transfer or archive the server before leaving it.');
      await removeMember(serverId, actor.id);
      return ok({ left: true });
    }
  }
});
