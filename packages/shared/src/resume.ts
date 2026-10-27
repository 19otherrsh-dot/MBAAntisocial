/**
 * The one-page resume: its shape, limits, plain-text form, and the cheap,
 * deterministic bullet checks that run as you type (the AI rewrite is the
 * expensive, opt-in step on top of these).
 */
import { z } from 'zod';

export const RESUME_LIMITS = {
  line: 300,
  summary: 600,
  skills: 500,
  target: 80,
  education: 5,
  experience: 6,
  projects: 5,
  positions: 5,
  achievements: 10,
  bullets: 8,
} as const;

const line = z.string().trim().max(RESUME_LIMITS.line);
const bullets = z.array(z.string().trim().max(RESUME_LIMITS.line)).max(RESUME_LIMITS.bullets);
const range = { start: z.string().trim().max(20).default(''), end: z.string().trim().max(20).default('') };

export const resumeDataSchema = z.object({
  header: z.object({ name: line, email: line, phone: line, location: line, links: line }),
  summary: z.string().trim().max(RESUME_LIMITS.summary).default(''),
  education: z.array(z.object({ school: line, degree: line, ...range, detail: line.default('') })).max(RESUME_LIMITS.education),
  experience: z
    .array(z.object({ org: line, role: line, location: line.default(''), ...range, bullets }))
    .max(RESUME_LIMITS.experience),
  projects: z.array(z.object({ name: line, context: line.default(''), bullets })).max(RESUME_LIMITS.projects),
  positions: z.array(z.object({ title: line, org: line, ...range, bullets })).max(RESUME_LIMITS.positions),
  achievements: z.array(line).max(RESUME_LIMITS.achievements),
  skills: z.string().trim().max(RESUME_LIMITS.skills).default(''),
});

export type ResumeData = z.infer<typeof resumeDataSchema>;
export type ResumeEducation = ResumeData['education'][number];
export type ResumeExperience = ResumeData['experience'][number];
export type ResumeProject = ResumeData['projects'][number];
export type ResumePosition = ResumeData['positions'][number];

export function emptyResume(): ResumeData {
  return {
    header: { name: '', email: '', phone: '', location: '', links: '' },
    summary: '',
    education: [],
    experience: [],
    projects: [],
    positions: [],
    achievements: [],
    skills: '',
  };
}

const dates = (start: string, end: string) => (start || end ? ` (${[start, end].filter(Boolean).join('–')})` : '');

/** Plain text in reading order: what the AI reviewer and ATS parsers see. */
export function resumeToText(d: ResumeData): string {
  const lines: string[] = [];
  const h = d.header;
  lines.push(h.name, [h.email, h.phone, h.location, h.links].filter(Boolean).join(' | '), '');
  if (d.summary) lines.push('SUMMARY', d.summary, '');
  const block = (title: string, rows: string[][]) => {
    if (!rows.length) return;
    lines.push(title);
    for (const r of rows) lines.push(...r.filter(Boolean));
    lines.push('');
  };
  const items = (list: string[]) => list.filter((b) => b.trim()).map((b) => `• ${b}`);
  block('EDUCATION', d.education.map((e) => [`${[e.degree, e.school].filter(Boolean).join(', ')}${dates(e.start, e.end)}`, e.detail]));
  block('EXPERIENCE', d.experience.map((e) => [`${[e.role, e.org, e.location].filter(Boolean).join(', ')}${dates(e.start, e.end)}`, ...items(e.bullets)]));
  block('PROJECTS', d.projects.map((p) => [`${p.name}${p.context ? ` — ${p.context}` : ''}`, ...items(p.bullets)]));
  block('POSITIONS OF RESPONSIBILITY', d.positions.map((p) => [`${[p.title, p.org].filter(Boolean).join(', ')}${dates(p.start, p.end)}`, ...items(p.bullets)]));
  if (d.achievements.some((a) => a.trim())) block('ACHIEVEMENTS', [items(d.achievements)]);
  if (d.skills) lines.push('SKILLS', d.skills);
  return lines.join('\n').trim();
}

/** Openers that describe a duty rather than an outcome. */
const WEAK_OPENERS = [
  'responsible for',
  'worked on',
  'worked with',
  'helped',
  'assisted',
  'involved in',
  'part of',
  'participated in',
  'duties included',
  'tasked with',
  'handled',
];

const FILLER = ['various', 'several', 'multiple', 'synergy', 'leveraged', 'utilized', 'dynamic', 'results-driven', 'go-getter', 'hardworking'];

export type BulletHint = 'no_number' | 'weak_opener' | 'too_long' | 'filler' | 'first_person';

export const BULLET_HINT_LABEL: Record<BulletHint, string> = {
  no_number: 'Add a number',
  weak_opener: 'Lead with what you did',
  too_long: 'Over 28 words',
  filler: 'Filler word',
  first_person: 'Drop “I/my”',
};

/** Quick, offline checks on one bullet. Empty means nothing obvious to fix. */
export function bulletHints(bullet: string): BulletHint[] {
  const text = bullet.trim();
  if (text.length < 8) return [];
  const lower = text.toLowerCase();
  const hints: BulletHint[] = [];
  if (WEAK_OPENERS.some((w) => lower.startsWith(w))) hints.push('weak_opener');
  if (!/\d|\[x/i.test(text)) hints.push('no_number');
  if (text.split(/\s+/).length > 28) hints.push('too_long');
  if (FILLER.some((w) => new RegExp(`\\b${w}\\b`).test(lower))) hints.push('filler');
  // A bare capital I mid-line is usually a roman numeral ("Term I"), so only the opener and "my" count.
  if (/^(i|my|we)\b/i.test(text) || /\bmy\b/i.test(text)) hints.push('first_person');
  return hints;
}
