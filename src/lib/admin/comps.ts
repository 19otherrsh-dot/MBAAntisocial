import { z } from 'zod';
import CaseComp from '@/models/CaseComp';
import { ApiError } from '@/lib/api/errors';
import { recordAudit } from '@/lib/audit';
import { COMP_CATEGORIES } from '@/lib/constants';
import type { Actor } from '@/lib/api/handler';

/**
 * The competition calendar, curated by each campus's admins. A campus admin
 * edits only entries scoped to their own campus; the shared, every-campus
 * entries are left to whoever operates the platform.
 */
const httpsUrl = z.string().trim().url('Enter a full https:// link.').refine((v) => v.startsWith('https://'), 'Links must use https.');

export const compInputSchema = z
  .object({
    title: z.string().trim().min(3, 'Give it a title.').max(200),
    host: z.string().trim().min(2, 'Who runs it?').max(120),
    description: z.string().trim().max(2000).default(''),
    category: z.enum(COMP_CATEGORIES).default('general'),
    registrationDeadline: z.coerce.date(),
    eventDate: z.coerce.date().optional().nullable(),
    prizePool: z.string().trim().max(80).default(''),
    teamSize: z.string().trim().max(40).default(''),
    eligibility: z.string().trim().max(300).default(''),
    url: httpsUrl,
  })
  .refine((v) => !v.eventDate || v.eventDate >= v.registrationDeadline, {
    message: 'The event cannot be before registration closes.',
    path: ['eventDate'],
  });

export type CompInput = z.infer<typeof compInputSchema>;

const auditActor = (actor: Actor) => ({ id: actor.id, campus: actor.campus, name: actor.name, role: actor.role });

export async function createComp(actor: Actor, input: CompInput) {
  const comp = await CaseComp.create({
    ...input,
    eventDate: input.eventDate ?? undefined,
    campuses: [actor.campus],
    source: 'curated',
    addedBy: actor.id,
  });
  await recordAudit({
    actor: auditActor(actor),
    action: 'comp.created',
    target: { type: 'comp', id: String(comp._id), label: comp.title },
  });
  return comp;
}

async function ownComp(actor: Actor, compId: string) {
  const comp = await CaseComp.findOne({ _id: compId, campuses: actor.campus });
  if (!comp) throw ApiError.notFound('That competition is not on your campus calendar.');
  return comp;
}

export async function updateComp(actor: Actor, compId: string, input: CompInput) {
  const comp = await ownComp(actor, compId);
  const changed = Object.keys(input).filter(
    (key) => String((comp as unknown as Record<string, unknown>)[key] ?? '') !== String((input as Record<string, unknown>)[key] ?? '')
  );
  comp.set({ ...input, eventDate: input.eventDate ?? undefined });
  await comp.save();
  await recordAudit({
    actor: auditActor(actor),
    action: 'comp.updated',
    target: { type: 'comp', id: compId, label: comp.title },
    detail: { fields: changed },
  });
  return comp;
}

export async function archiveComp(actor: Actor, compId: string) {
  const comp = await ownComp(actor, compId);
  if (comp.archivedAt) return comp;
  comp.archivedAt = new Date();
  await comp.save();
  await recordAudit({
    actor: auditActor(actor),
    action: 'comp.archived',
    target: { type: 'comp', id: compId, label: comp.title },
  });
  return comp;
}
