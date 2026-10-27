import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { objectId } from '@/lib/validation';
import { notify } from '@/lib/notifications';
import ClubApplication from '@/models/campus/ClubApplication';
import { addClubMember, canManageClub, loadClub } from '@/server/modules/campus-life/clubs';

export const GET = route({ feature: 'clubs' }, async ({ actor, params }) => {
  const club = await loadClub(params.slug, actor.campus);
  if (!canManageClub(club, actor.id)) throw ApiError.forbidden('Only the club’s leads and core team see applications.');
  const apps = await ClubApplication.find({ club: club._id, status: 'pending' }).sort({ createdAt: 1 }).populate<{ user: { _id: unknown; name: string; image: string; batch: string } }>('user', 'name image batch').lean();
  return ok({
    questions: club.recruitment.questions,
    applications: apps.map((a) => ({ _id: String(a._id), user: { _id: String(a.user._id), name: a.user.name, image: a.user.image, batch: a.user.batch }, answers: a.answers, createdAt: a.createdAt })),
  });
});

const schema = z.object({ applicationId: objectId, decision: z.enum(['accepted', 'declined']) });

export const POST = route({ feature: 'clubs', body: schema, rateLimit: 'write' }, async ({ actor, params, body }) => {
  const club = await loadClub(params.slug, actor.campus);
  if (!canManageClub(club, actor.id)) throw ApiError.forbidden('Only the club’s leads and core team decide applications.');
  const app = await ClubApplication.findOneAndUpdate({ _id: body.applicationId, club: club._id, status: 'pending' }, { $set: { status: body.decision, reviewedBy: actor.id } }, { new: true });
  if (!app) throw ApiError.notFound('That application was already decided.');
  if (body.decision === 'accepted') await addClubMember(club, String(app.user));
  await notify({
    user: app.user,
    kind: 'club_update',
    title: body.decision === 'accepted' ? `Welcome to ${club.name}!` : `${club.name} application update`,
    body: body.decision === 'accepted' ? 'Your application was accepted. Say hello in the club’s hub server.' : 'They could not take you on this round. Keep an eye out for the next one.',
    href: `/clubs/${club.slug}`,
    actor: actor.id,
  });
  return ok({ decided: body.decision });
});
