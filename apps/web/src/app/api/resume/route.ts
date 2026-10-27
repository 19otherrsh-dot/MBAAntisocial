import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import Resume from '@/models/career/Resume';
import User from '@/models/User';

const line = z.string().trim().max(300);
const bullets = z.array(z.string().trim().max(300)).max(8);
const range = { start: z.string().trim().max(20).default(''), end: z.string().trim().max(20).default('') };

const dataSchema = z.object({
  header: z.object({ name: line, email: line, phone: line, location: line, links: line }),
  summary: z.string().trim().max(600).default(''),
  education: z.array(z.object({ school: line, degree: line, ...range, detail: line.default('') })).max(5),
  experience: z.array(z.object({ org: line, role: line, location: line.default(''), ...range, bullets })).max(6),
  projects: z.array(z.object({ name: line, context: line.default(''), bullets })).max(5),
  positions: z.array(z.object({ title: line, org: line, ...range, bullets })).max(5),
  achievements: z.array(line).max(10),
  skills: z.string().trim().max(500).default(''),
});

export const GET = route({ feature: 'resume' }, async ({ actor }) => {
  const resume = await Resume.findOne({ user: actor.id }).lean();
  if (resume) return ok({ data: resume.data, target: resume.target, updatedAt: resume.updatedAt });
  // A first draft pre-filled from the profile, so the page is never blank.
  const user = await User.findById(actor.id).select('name email campus batch').lean();
  return ok({
    data: {
      header: { name: user?.name ?? '', email: user?.email ?? '', phone: '', location: '', links: '' },
      summary: '',
      education: [{ school: user?.campus ?? '', degree: 'MBA (PGP)', start: user?.batch?.split('-')[0] ?? '', end: user?.batch ? `20${user.batch.split('-')[1] ?? ''}` : '', detail: '' }],
      experience: [],
      projects: [],
      positions: [],
      achievements: [],
      skills: '',
    },
    target: '',
    updatedAt: null,
  });
});

export const PUT = route({ feature: 'resume', body: z.object({ data: dataSchema, target: z.string().trim().max(80).default('') }), rateLimit: 'write' }, async ({ actor, body }) => {
  await Resume.updateOne({ user: actor.id }, { $set: { data: body.data, target: body.target } }, { upsert: true });
  return ok({ saved: true });
});
