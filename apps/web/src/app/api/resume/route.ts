import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import Resume from '@/models/career/Resume';
import User from '@/models/User';
import { RESUME_LIMITS, emptyResume, resumeDataSchema, type ResumeData } from '@mba/shared/resume';

export const GET = route({ feature: 'resume' }, async ({ actor }) => {
  const resume = await Resume.findOne({ user: actor.id }).lean();
  if (resume) return ok({ data: resume.data, target: resume.target, updatedAt: resume.updatedAt });
  // A first draft pre-filled from the profile, so the page is never blank.
  const user = await User.findById(actor.id).select('name email campus batch').lean();
  const [from, to] = user?.batch?.split('-') ?? [];
  const data: ResumeData = emptyResume();
  data.header.name = user?.name ?? '';
  data.header.email = user?.email ?? '';
  data.education.push({ school: user?.campus ?? '', degree: 'MBA (PGP)', start: from ?? '', end: to ? `20${to}` : '', detail: '' });
  return ok({ data, target: '', updatedAt: null });
});

export const PUT = route({ feature: 'resume', body: z.object({ data: resumeDataSchema, target: z.string().trim().max(RESUME_LIMITS.target).default('') }), rateLimit: 'write' }, async ({ actor, body }) => {
  await Resume.updateOne({ user: actor.id }, { $set: { data: body.data, target: body.target } }, { upsert: true });
  return ok({ saved: true });
});
