'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, GraduationCap, History, Pencil, TrendingUp } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Textarea, Input } from '@/components/ui/Field';
import { Avatar, Chip, EmptyState, Stat } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { timeAgo } from '@/lib/utils';
import RichText from '@/components/RichText';
import cs from '@/components/campus/campus.module.css';
import styles from '../../app.module.css';

const SECTION_META = {
  overview: { label: 'Overview', hint: 'What they do, where MBAs fit, how big the intake usually is.' },
  process: { label: 'Selection process', hint: 'Shortlisting, tests, rounds, timelines. What actually happened last year.' },
  roles: { label: 'Roles & offers', hint: 'Roles offered to MBAs, locations, what the work looks like in year one.' },
  prep: { label: 'How to prepare', hint: 'Cases, frameworks, books, people to talk to. What made the difference.' },
  culture: { label: 'Culture & life', hint: 'Hours, travel, people, growth. Candid but fair.' },
} as const;
type SectionKey = keyof typeof SECTION_META;

interface CompanyData {
  company: { key: string; name: string; sector: string; website: string; sections: Record<SectionKey, string>; updatedAt: string | null; hasPage: boolean; history: Array<{ editor: string; section: string; summary: string; at: string }> };
  questions: { count: number; recent: Array<{ _id: string; question: string; round: string; role: string; askedAt: string; upvotes: number }> };
  pipeline: Record<string, number>;
  offers: { count: number; median: number | null; low: number | null; high: number | null };
  alumni: Array<{ _id: string; name: string; image: string; designation: string; referralsOpen: boolean }>;
}

const lakh = (n: number) => `₹${(n / 100000).toFixed(n >= 1_000_000 ? 0 : 1)}L`;

export default function CompanyPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const toast = useToast();
  const { data, error, refetch } = useApiQuery<CompanyData>(`/api/companies/${key}`);
  const [editing, setEditing] = useState<SectionKey | null>(null);
  const [draft, setDraft] = useState('');
  const [summary, setSummary] = useState('');
  const [saving, setSaving] = useState(false);

  if (error) return <EmptyState art={<BookOpen size={36} strokeWidth={1.4} />} title="Nothing here yet" body={error} action={<Link href="/companies"><Button>All companies</Button></Link>} />;
  if (!data) return <div className="skeleton" style={{ height: 420 }} />;
  const c = data.company;

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.put(`/api/companies/${key}`, { name: c.name, section: editing, content: draft, summary });
      toast.success('Saved — thank you');
      setEditing(null);
      refetch();
    } catch (caught) {
      toast.error('Could not save', errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack gap-5" style={{ maxWidth: 960 }}>
      <Link href="/companies" className="row gap-1 dim" style={{ fontSize: 'var(--t-sm)' }}><ArrowLeft size={14} /> Company wiki</Link>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{c.name}</h1>
          <p className={styles.pageSubtitle}>{[c.sector, c.updatedAt ? `updated ${timeAgo(c.updatedAt)}` : 'no page yet — start one'].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="row gap-2">
          <Link href={`/intel?company=${encodeURIComponent(c.name)}`}><Button variant="secondary" icon={<BookOpen size={15} />}>Questions ({data.questions.count})</Button></Link>
        </div>
      </div>

      <div className="row gap-5 wrap">
        {data.offers.median !== null ? <Stat value={lakh(data.offers.median)} label="Median base" meta={`${lakh(data.offers.low!)}–${lakh(data.offers.high!)} · ${data.offers.count} offers`} /> : data.offers.count > 0 && <Stat value={data.offers.count} label="Offers logged" meta="too few to summarise" />}
        {Object.keys(data.pipeline).length > 0 && <Stat value={Object.values(data.pipeline).reduce((a, b) => a + b, 0)} label="Applied from campus" meta={data.pipeline.offer ? `${data.pipeline.offer} offers` : undefined} />}
        <Stat value={data.questions.count} label="Questions logged" />
      </div>

      <div className={cs.split}>
        <div className="stack gap-4">
          {(Object.keys(SECTION_META) as SectionKey[]).map((s) => (
            <section key={s} className={cs.panel}>
              <div className="row gap-2" style={{ justifyContent: 'space-between' }}>
                <strong>{SECTION_META[s].label}</strong>
                {editing !== s && <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => { setEditing(s); setDraft(c.sections[s] ?? ''); setSummary(''); }}>{c.sections[s] ? 'Edit' : 'Write'}</Button>}
              </div>
              {editing === s ? (
                <div className="stack gap-2">
                  <Textarea aria-label={SECTION_META[s].label} rows={10} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={SECTION_META[s].hint} />
                  <Input aria-label="What changed" placeholder="What changed? (optional)" value={summary} onChange={(e) => setSummary(e.target.value)} />
                  <div className="row gap-2"><Button size="sm" onClick={save} loading={saving}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div>
                </div>
              ) : c.sections[s] ? (
                <RichText text={c.sections[s]} />
              ) : (
                <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>{SECTION_META[s].hint}</p>
              )}
            </section>
          ))}
        </div>

        <aside className="stack gap-4">
          {data.questions.recent.length > 0 && (
            <section className={cs.panel}>
              <strong className="row gap-2"><BookOpen size={15} /> Recently asked</strong>
              {data.questions.recent.map((q) => (
                <div key={q._id} className="stack gap-1" style={{ fontSize: 'var(--t-sm)' }}>
                  <span>{q.question}</span>
                  <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{[q.round, q.role, timeAgo(q.askedAt)].filter(Boolean).join(' · ')}</span>
                </div>
              ))}
            </section>
          )}
          {data.alumni.length > 0 && (
            <section className={cs.panel}>
              <strong className="row gap-2"><GraduationCap size={15} /> Alumni there</strong>
              {data.alumni.map((a) => (
                <Link key={a._id} href={`/u/${a._id}`} className="row gap-2" style={{ color: 'inherit' }}>
                  <Avatar name={a.name} image={a.image} seed={a._id} size={28} />
                  <span className="stack" style={{ flex: 1, minWidth: 0 }}><strong className="truncate" style={{ fontSize: 'var(--t-sm)' }}>{a.name}</strong><span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{a.designation}</span></span>
                  {a.referralsOpen && <Chip tone="teal">Refers</Chip>}
                </Link>
              ))}
              <Link href="/alumni"><Button size="sm" variant="ghost" icon={<TrendingUp size={13} />}>Ask for a referral</Button></Link>
            </section>
          )}
          {c.history.length > 0 && (
            <section className={cs.panel}>
              <strong className="row gap-2"><History size={15} /> History</strong>
              {c.history.map((h, i) => (
                <div key={i} className="dim" style={{ fontSize: 'var(--t-xs)' }}><strong style={{ color: 'var(--text-secondary)' }}>{h.editor}</strong> edited {SECTION_META[h.section as SectionKey]?.label.toLowerCase() ?? h.section}{h.summary ? ` — ${h.summary}` : ''} · {timeAgo(h.at)}</div>
              ))}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
