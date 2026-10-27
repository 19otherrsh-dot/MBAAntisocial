'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Check, CloudOff, Download, Flame, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  RESUME_LIMITS,
  type ResumeData,
  type ResumeEducation,
  type ResumeExperience,
  type ResumePosition,
  type ResumeProject,
} from '@mba/shared/resume';
import Button from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { Banner, Segmented } from '@/components/ui/Display';
import { useConfirm } from '@/components/ui/useConfirm';
import { api, errorMessage } from '@/lib/client/api';
import { cn } from '@/lib/utils';
import BulletList from './BulletList';
import ResumeSheet from './ResumeSheet';
import styles from './resume.module.css';

export interface ResumeDoc {
  data: ResumeData;
  target: string;
}

/** A4 at CSS 96dpi, and the 12mm margin the sheet and @page both use. */
const PAGE_W = 793.7;
const PAGE_H = 1122.5;
const MARGIN = 45.35;
const CONTENT_H = PAGE_H - MARGIN * 2;
const AUTOSAVE_MS = 1200;

const TARGETS = ['Consulting', 'Investment banking', 'Corporate finance', 'Product management', 'Brand management', 'Sales & marketing', 'General management', 'Operations', 'Analytics'];

function saveRequest(doc: ResumeDoc, keepalive = false) {
  if (keepalive) {
    // Leaving the page: a keepalive request outlives the unload.
    return fetch('/api/resume', { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
  }
  return api.put('/api/resume', doc);
}

interface BuilderProps {
  initial: ResumeDoc;
  onRoast: () => void;
  /** Called with every edit, so a sibling (the roaster) can read the live draft. */
  onDocChange?: (doc: ResumeDoc) => void;
}

export default function Builder({ initial, onRoast, onDocChange }: BuilderProps) {
  const [doc, setDoc] = useState<ResumeDoc>(initial);
  const [version, setVersion] = useState(0);
  const [savedVersion, setSavedVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const { confirm, dialog } = useConfirm();

  const update = (next: (data: ResumeData) => ResumeData) => {
    setDoc((current) => ({ ...current, data: next(current.data) }));
    setVersion((v) => v + 1);
  };
  const setField = <K extends keyof ResumeData>(key: K, value: ResumeData[K]) => update((d) => ({ ...d, [key]: value }));
  const setTarget = (target: string) => {
    setDoc((current) => ({ ...current, target }));
    setVersion((v) => v + 1);
  };

  // Debounced autosave. State changes happen only in the async callbacks.
  useEffect(() => {
    if (version === savedVersion) return;
    const timer = setTimeout(() => {
      setSaving(true);
      saveRequest(doc)
        .then(() => {
          setSavedVersion(version);
          setSaveError('');
        })
        .catch((caught) => setSaveError(errorMessage(caught)))
        .finally(() => setSaving(false));
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [doc, version, savedVersion]);

  useEffect(() => onDocChange?.(doc), [doc, onDocChange]);

  // Flush unsaved edits when the tab closes or the builder unmounts.
  const pending = useRef<ResumeDoc | null>(null);
  useEffect(() => {
    pending.current = version === savedVersion ? null : doc;
  });
  useEffect(() => {
    const flush = () => {
      if (pending.current) void saveRequest(pending.current, true);
      pending.current = null;
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  // Preview scale and the one-page check, both measured, never guessed.
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  const [contentHeight, setContentHeight] = useState(0);
  useEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return;
    const observer = new ResizeObserver(() => {
      setScale(Math.min(1, frame.clientWidth / PAGE_W));
      setContentHeight(content.offsetHeight);
    });
    observer.observe(frame);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const download = () => {
    const previous = document.title;
    const name = doc.data.header.name.trim();
    document.title = name ? `${name} – Resume` : 'Resume';
    window.addEventListener('afterprint', () => (document.title = previous), { once: true });
    window.print();
  };

  const confirmRemove = async (what: string, hasContent: boolean) =>
    !hasContent || (await confirm({ title: `Remove this ${what}?`, body: 'Its bullets go with it.', confirmLabel: 'Remove', destructive: true }));

  const status = saveError ? (
    <span className={cn(styles.status, styles.statusError)} title={saveError}><CloudOff size={14} /> Not saved — {saveError}</span>
  ) : saving ? (
    <span className={styles.status}><Loader2 size={14} className={styles.spin} /> Saving…</span>
  ) : version !== savedVersion ? (
    <span className={styles.status}>Unsaved changes</span>
  ) : (
    <span className={styles.status}><Check size={14} /> Saved</span>
  );

  const d = doc.data;
  const overflow = Math.max(0, Math.round(contentHeight - CONTENT_H));
  const sheetHeight = Math.max(PAGE_H, contentHeight + MARGIN * 2);
  const overLines = Math.ceil(overflow / 16);

  return (
    <div className={styles.builder} data-view={view}>
      <div className={styles.builderBar}>
        <div className={styles.targetField}>
          <Input
            label="Targeting"
            placeholder="e.g. Consulting"
            list="resume-targets"
            maxLength={RESUME_LIMITS.target}
            value={doc.target}
            onChange={(event) => setTarget(event.target.value)}
            hint="Sharpens the AI rewrites and the roast."
          />
          <datalist id="resume-targets">{TARGETS.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
        <div className={styles.barActions}>
          {status}
          <Button variant="secondary" icon={<Flame size={15} />} onClick={onRoast}>Roast it</Button>
          <Button icon={<Download size={15} />} onClick={download}>Download PDF</Button>
        </div>
      </div>

      <div className={styles.viewSwitch}>
        <Segmented
          ariaLabel="Editor or preview"
          value={view}
          onChange={setView}
          options={[{ value: 'edit', label: 'Edit' }, { value: 'preview', label: overflow > 0 ? 'Preview · over a page' : 'Preview' }]}
        />
      </div>

      <div className={styles.columns}>
        <div className={styles.editor}>
          <EditorCard title="Contact">
            <div className={styles.grid2}>
              <Input label="Full name" value={d.header.name} maxLength={RESUME_LIMITS.line} onChange={(e) => setField('header', { ...d.header, name: e.target.value })} />
              <Input label="Email" type="email" value={d.header.email} maxLength={RESUME_LIMITS.line} onChange={(e) => setField('header', { ...d.header, email: e.target.value })} />
              <Input label="Phone" type="tel" optional value={d.header.phone} maxLength={RESUME_LIMITS.line} onChange={(e) => setField('header', { ...d.header, phone: e.target.value })} />
              <Input label="City" optional value={d.header.location} maxLength={RESUME_LIMITS.line} onChange={(e) => setField('header', { ...d.header, location: e.target.value })} />
            </div>
            <Input label="Links" optional placeholder="linkedin.com/in/you" value={d.header.links} maxLength={RESUME_LIMITS.line} onChange={(e) => setField('header', { ...d.header, links: e.target.value })} />
            <Textarea
              label="Summary"
              optional
              hint="Most B-school resumes skip this. Use it only for a career switch worth explaining."
              rows={2}
              maxLength={RESUME_LIMITS.summary}
              showCount
              value={d.summary}
              onChange={(e) => setField('summary', e.target.value)}
            />
          </EditorCard>

          <ListCard<ResumeEducation>
            title="Education"
            items={d.education}
            max={RESUME_LIMITS.education}
            noun="degree"
            make={() => ({ school: '', degree: '', start: '', end: '', detail: '' })}
            onChange={(next) => setField('education', next)}
            confirmRemove={(e) => confirmRemove('degree', Boolean(e.detail))}
            render={(e, set) => (
              <>
                <div className={styles.grid2}>
                  <Input label="Degree" placeholder="MBA (PGP)" value={e.degree} maxLength={RESUME_LIMITS.line} onChange={(ev) => set({ ...e, degree: ev.target.value })} />
                  <Input label="Institute" value={e.school} maxLength={RESUME_LIMITS.line} onChange={(ev) => set({ ...e, school: ev.target.value })} />
                  <Input label="From" placeholder="2025" value={e.start} maxLength={20} onChange={(ev) => set({ ...e, start: ev.target.value })} />
                  <Input label="To" placeholder="2027" value={e.end} maxLength={20} onChange={(ev) => set({ ...e, end: ev.target.value })} />
                </div>
                <Input label="Score & highlights" optional placeholder="CGPA 3.6/4.33 · Dean’s list" value={e.detail} maxLength={RESUME_LIMITS.line} onChange={(ev) => set({ ...e, detail: ev.target.value })} />
              </>
            )}
          />

          <ListCard<ResumeExperience>
            title="Work experience"
            items={d.experience}
            max={RESUME_LIMITS.experience}
            noun="role"
            make={() => ({ org: '', role: '', location: '', start: '', end: '', bullets: [''] })}
            onChange={(next) => setField('experience', next)}
            confirmRemove={(e) => confirmRemove('role', e.bullets.some((b) => b.trim()))}
            render={(e, set) => (
              <>
                <div className={styles.grid2}>
                  <Input label="Organisation" value={e.org} maxLength={RESUME_LIMITS.line} onChange={(ev) => set({ ...e, org: ev.target.value })} />
                  <Input label="Role" value={e.role} maxLength={RESUME_LIMITS.line} onChange={(ev) => set({ ...e, role: ev.target.value })} />
                  <Input label="From" placeholder="Jul 2022" value={e.start} maxLength={20} onChange={(ev) => set({ ...e, start: ev.target.value })} />
                  <Input label="To" placeholder="May 2025" value={e.end} maxLength={20} onChange={(ev) => set({ ...e, end: ev.target.value })} />
                </div>
                <BulletList
                  label="Bullet"
                  items={e.bullets}
                  role={[e.role, e.org].filter(Boolean).join(', ')}
                  target={doc.target}
                  placeholder="Cut month-end close from 9 to 5 days by automating 14 reconciliations"
                  onChange={(bullets) => set({ ...e, bullets })}
                />
              </>
            )}
          />

          <ListCard<ResumeProject>
            title="Projects"
            items={d.projects}
            max={RESUME_LIMITS.projects}
            noun="project"
            make={() => ({ name: '', context: '', bullets: [''] })}
            onChange={(next) => setField('projects', next)}
            confirmRemove={(p) => confirmRemove('project', p.bullets.some((b) => b.trim()))}
            render={(p, set) => (
              <>
                <div className={styles.grid2}>
                  <Input label="Project" value={p.name} maxLength={RESUME_LIMITS.line} onChange={(ev) => set({ ...p, name: ev.target.value })} />
                  <Input label="Context" optional placeholder="Live project · Tata Motors" value={p.context} maxLength={RESUME_LIMITS.line} onChange={(ev) => set({ ...p, context: ev.target.value })} />
                </div>
                <BulletList label="Bullet" items={p.bullets} role={p.name} target={doc.target} onChange={(bullets) => set({ ...p, bullets })} />
              </>
            )}
          />

          <ListCard<ResumePosition>
            title="Positions of responsibility"
            items={d.positions}
            max={RESUME_LIMITS.positions}
            noun="position"
            make={() => ({ title: '', org: '', start: '', end: '', bullets: [''] })}
            onChange={(next) => setField('positions', next)}
            confirmRemove={(p) => confirmRemove('position', p.bullets.some((b) => b.trim()))}
            render={(p, set) => (
              <>
                <div className={styles.grid2}>
                  <Input label="Title" placeholder="Coordinator" value={p.title} maxLength={RESUME_LIMITS.line} onChange={(ev) => set({ ...p, title: ev.target.value })} />
                  <Input label="Club or committee" value={p.org} maxLength={RESUME_LIMITS.line} onChange={(ev) => set({ ...p, org: ev.target.value })} />
                  <Input label="From" value={p.start} maxLength={20} onChange={(ev) => set({ ...p, start: ev.target.value })} />
                  <Input label="To" value={p.end} maxLength={20} onChange={(ev) => set({ ...p, end: ev.target.value })} />
                </div>
                <BulletList label="Bullet" items={p.bullets} role={[p.title, p.org].filter(Boolean).join(', ')} target={doc.target} onChange={(bullets) => set({ ...p, bullets })} />
              </>
            )}
          />

          <EditorCard title="Achievements">
            <BulletList
              label="Achievement"
              items={d.achievements.length ? d.achievements : ['']}
              max={RESUME_LIMITS.achievements}
              target={doc.target}
              placeholder="National finalist, HUL LIME Season 16 (top 10 of 2,400 teams)"
              onChange={(achievements) => setField('achievements', achievements)}
            />
          </EditorCard>

          <EditorCard title="Skills & interests">
            <Textarea
              rows={2}
              maxLength={RESUME_LIMITS.skills}
              showCount
              placeholder="Excel modelling, SQL, Tableau · Hindi, English, Tamil · Marathons (3 finished)"
              value={d.skills}
              onChange={(e) => setField('skills', e.target.value)}
            />
          </EditorCard>
        </div>

        <div className={styles.previewColumn}>
          {overflow > 0 ? (
            <Banner variant="warning" title="Spills onto a second page">
              About {overLines} {overLines === 1 ? 'line' : 'lines'} over. Recruiters read one page — cut the weakest bullets first.
            </Banner>
          ) : (
            <p className={styles.fits}><Check size={14} /> Fits on one page</p>
          )}
          <div className={styles.previewFrame} ref={frameRef} style={{ height: sheetHeight * scale }}>
            <div className={styles.page} style={{ transform: `scale(${scale})` }}>
              <ResumeSheet ref={contentRef} data={d} />
              {overflow > 0 && <div className={styles.pageBreak} style={{ top: PAGE_H - MARGIN }} aria-hidden><span>Page 1 ends here</span></div>}
            </div>
          </div>
        </div>
      </div>

      {createPortal(
        <div data-print-root className={styles.printRoot}>
          <ResumeSheet data={d} />
        </div>,
        document.body
      )}
      {dialog}
    </div>
  );
}

function EditorCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

interface ListCardProps<T> {
  title: string;
  noun: string;
  items: T[];
  max: number;
  make: () => T;
  onChange: (items: T[]) => void;
  confirmRemove: (item: T) => Promise<boolean>;
  render: (item: T, set: (next: T) => void) => React.ReactNode;
}

function ListCard<T>({ title, noun, items, max, make, onChange, confirmRemove, render }: ListCardProps<T>) {
  const move = (from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };
  const add = (
    <Button variant="ghost" size="sm" icon={<Plus size={14} />} disabled={items.length >= max} onClick={() => onChange([...items, make()])}>
      Add {noun}
    </Button>
  );
  return (
    <EditorCard title={title} action={items.length > 0 ? add : undefined}>
      {items.length === 0 ? (
        <button type="button" className={styles.emptyAdd} onClick={() => onChange([make()])}>
          <Plus size={15} /> Add a {noun}
        </button>
      ) : (
        items.map((item, index) => (
          <div key={index} className={styles.entry}>
            <div className={styles.entryTools}>
              <button type="button" className={styles.iconButton} aria-label={`Move ${noun} up`} disabled={index === 0} onClick={() => move(index, index - 1)}>
                <ArrowUp size={15} />
              </button>
              <button type="button" className={styles.iconButton} aria-label={`Move ${noun} down`} disabled={index === items.length - 1} onClick={() => move(index, index + 1)}>
                <ArrowDown size={15} />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Remove ${noun}`}
                onClick={async () => {
                  if (await confirmRemove(item)) onChange(items.filter((_, i) => i !== index));
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
            {render(item, (next) => onChange(items.map((current, i) => (i === index ? next : current))))}
          </div>
        ))
      )}
    </EditorCard>
  );
}
