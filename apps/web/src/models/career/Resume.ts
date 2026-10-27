import mongoose, { Schema, type Model, type Types } from 'mongoose';

/** A structured, one-page resume. Stored as one document per person. */
export interface ResumeData {
  header: { name: string; email: string; phone: string; location: string; links: string };
  summary: string;
  education: Array<{ school: string; degree: string; start: string; end: string; detail: string }>;
  experience: Array<{ org: string; role: string; location: string; start: string; end: string; bullets: string[] }>;
  projects: Array<{ name: string; context: string; bullets: string[] }>;
  positions: Array<{ title: string; org: string; start: string; end: string; bullets: string[] }>;
  achievements: string[];
  skills: string;
}

export interface IResume {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  data: ResumeData;
  target: string;
  updatedAt: Date;
}

const ResumeSchema = new Schema<IResume, Model<IResume>>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    data: { type: Schema.Types.Mixed, required: true },
    target: { type: String, default: '', maxlength: 80 },
  },
  { timestamps: { createdAt: false, updatedAt: true }, minimize: false }
);

const Resume = (mongoose.models.Resume as Model<IResume>) || mongoose.model<IResume>('Resume', ResumeSchema);
export default Resume;

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
  block('EDUCATION', d.education.map((e) => [`${e.degree}, ${e.school} (${e.start}–${e.end})`, e.detail]));
  block('EXPERIENCE', d.experience.map((e) => [`${e.role}, ${e.org}${e.location ? `, ${e.location}` : ''} (${e.start}–${e.end})`, ...e.bullets.map((b) => `• ${b}`)]));
  block('PROJECTS', d.projects.map((p) => [`${p.name}${p.context ? ` — ${p.context}` : ''}`, ...p.bullets.map((b) => `• ${b}`)]));
  block('POSITIONS OF RESPONSIBILITY', d.positions.map((p) => [`${p.title}, ${p.org} (${p.start}–${p.end})`, ...p.bullets.map((b) => `• ${b}`)]));
  if (d.achievements.length) block('ACHIEVEMENTS', [d.achievements.map((a) => `• ${a}`)]);
  if (d.skills) lines.push('SKILLS', d.skills);
  return lines.join('\n').trim();
}
