import { forwardRef } from 'react';
import type { ResumeData } from '@mba/shared/resume';
import styles from './resume.module.css';

const range = (start: string, end: string) => [start, end].filter(Boolean).join(' – ');
const filled = (list: string[]) => list.filter((item) => item.trim());

function Bullets({ items }: { items: string[] }) {
  const list = filled(items);
  if (!list.length) return null;
  return (
    <ul className={styles.sheetBullets}>
      {list.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Entry({ title, subtitle, when, children }: { title: string; subtitle?: string; when?: string; children?: React.ReactNode }) {
  return (
    <div className={styles.sheetEntry}>
      <div className={styles.sheetEntryHead}>
        <span>
          <strong>{title}</strong>
          {subtitle && <span className={styles.sheetSub}>{title ? ' · ' : ''}{subtitle}</span>}
        </span>
        {when && <span className={styles.sheetWhen}>{when}</span>}
      </div>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.sheetSection}>
      <h2 className={styles.sheetHeading}>{title}</h2>
      {children}
    </section>
  );
}

/**
 * The resume as it prints: an A4 page laid out in real units, so the preview,
 * the one-page check, and the PDF all agree. Empty sections are left out.
 */
/** `nameLevel` lets the on-screen preview sit under the page's own h1; the printed sheet is a document of its own. */
const ResumeSheet = forwardRef<HTMLDivElement, { data: ResumeData; nameLevel?: 'h1' | 'h2' }>(function ResumeSheet({ data, nameLevel: Name = 'h1' }, ref) {
  const h = data.header;
  const contact = [h.email, h.phone, h.location, h.links].filter((part) => part.trim());
  const education = data.education.filter((e) => e.school || e.degree);
  const experience = data.experience.filter((e) => e.org || e.role);
  const projects = data.projects.filter((p) => p.name);
  const positions = data.positions.filter((p) => p.title || p.org);
  const achievements = filled(data.achievements);

  return (
    <div ref={ref} className={styles.sheetContent}>
      <header className={styles.sheetHeader}>
        <Name className={styles.sheetName}>{h.name || 'Your name'}</Name>
        {contact.length > 0 && <p className={styles.sheetContact}>{contact.join('  |  ')}</p>}
      </header>

      {data.summary.trim() && <p className={styles.sheetSummary}>{data.summary}</p>}

      {education.length > 0 && (
        <Section title="Education">
          {education.map((e, i) => (
            <Entry key={i} title={e.degree} subtitle={e.school} when={range(e.start, e.end)}>
              {e.detail && <p className={styles.sheetDetail}>{e.detail}</p>}
            </Entry>
          ))}
        </Section>
      )}

      {experience.length > 0 && (
        <Section title="Work experience">
          {experience.map((e, i) => (
            <Entry key={i} title={e.org} subtitle={[e.role, e.location].filter(Boolean).join(', ')} when={range(e.start, e.end)}>
              <Bullets items={e.bullets} />
            </Entry>
          ))}
        </Section>
      )}

      {projects.length > 0 && (
        <Section title="Projects">
          {projects.map((p, i) => (
            <Entry key={i} title={p.name} subtitle={p.context}>
              <Bullets items={p.bullets} />
            </Entry>
          ))}
        </Section>
      )}

      {positions.length > 0 && (
        <Section title="Positions of responsibility">
          {positions.map((p, i) => (
            <Entry key={i} title={p.title} subtitle={p.org} when={range(p.start, p.end)}>
              <Bullets items={p.bullets} />
            </Entry>
          ))}
        </Section>
      )}

      {achievements.length > 0 && (
        <Section title="Achievements">
          <Bullets items={achievements} />
        </Section>
      )}

      {data.skills.trim() && (
        <Section title="Skills & interests">
          <p className={styles.sheetDetail}>{data.skills}</p>
        </Section>
      )}
    </div>
  );
});

export default ResumeSheet;
