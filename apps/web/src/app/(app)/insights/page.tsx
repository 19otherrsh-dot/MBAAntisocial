'use client';

import { LineChart, Lock } from 'lucide-react';
import { ROLE_TRACK_META } from '@/lib/constants';
import { EmptyState, Stat } from '@/components/ui/Display';
import { useApiQuery } from '@/lib/client/hooks';
import ps from '@/components/personal/personal.module.css';
import cs from '@/components/campus/campus.module.css';
import styles from '../app.module.css';

interface InsightsData {
  offers: { total: number; tracks: Array<{ track: string; count: number; median: number | null; p25: number | null; p75: number | null }>; minSample: number };
  funnel: { total: number; stages: Record<string, number> };
  rounds: Array<{ round: string; count: number }>;
  topics: Array<{ tag: string; count: number }>;
  opportunities: Array<{ kind: string; count: number }>;
}

const lakh = (n: number) => `₹${(n / 100000).toFixed(1)}L`;
const STAGE_ORDER = ['interested', 'applied', 'in_process', 'offer', 'accepted'] as const;
const STAGE_LABEL: Record<string, string> = { interested: 'Interested', applied: 'Applied', in_process: 'In process', offer: 'Offer', accepted: 'Accepted', rejected: 'Rejected', withdrawn: 'Withdrawn' };
const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function Bars({ rows, format = String }: { rows: Array<{ label: string; value: number; title?: string }>; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className={ps.bars} role="list">
      {rows.map((r) => (
        <div key={r.label} className={ps.barRow} role="listitem" title={r.title ?? `${r.label}: ${format(r.value)}`}>
          <span className="truncate">{r.label}</span>
          <div className={ps.barTrack}><div className={ps.barFill} style={{ width: `${(r.value / max) * 100}%` }} /></div>
          <span className={ps.barValue}>{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function InsightsPage() {
  const { data } = useApiQuery<InsightsData>('/api/insights');

  return (
    <div className="stack gap-5">
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Placement insights</h1>
          <p className={styles.pageSubtitle}>Patterns from your campus’s own offers, applications, and interview logs — aggregated, never per person.</p>
        </div>
      </div>
      {!data ? <div className="skeleton" style={{ height: 320 }} /> : data.offers.total + data.funnel.total + data.rounds.length === 0 ? (
        <EmptyState art={<LineChart size={36} strokeWidth={1.4} />} title="Not enough data yet" body="As your batch logs offers, applications, and interview questions, the patterns show up here." />
      ) : (
        <>
          <div className="row gap-5 wrap">
            <Stat value={data.offers.total} label="Offers logged" />
            <Stat value={data.funnel.total} label="Applications tracked" />
            {data.funnel.total > 0 && <Stat value={`${Math.round((((data.funnel.stages.offer ?? 0) + (data.funnel.stages.accepted ?? 0)) / data.funnel.total) * 100)}%`} label="Reach an offer" />}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--s-5)' }}>
            <section className={cs.panel}>
              <strong>Median base pay by track</strong>
              {data.offers.tracks.filter((t) => t.median !== null).length === 0 ? <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>Each track needs at least {data.offers.minSample} offers before it is shown.</p> : (
                <Bars rows={data.offers.tracks.filter((t) => t.median !== null).map((t) => ({ label: ROLE_TRACK_META[t.track as keyof typeof ROLE_TRACK_META]?.label ?? label(t.track), value: t.median!, title: `${t.count} offers${t.p25 ? ` · middle half ${lakh(t.p25)}–${lakh(t.p75!)}` : ''}` }))} format={lakh} />
              )}
              {data.offers.tracks.some((t) => t.median === null) && <span className="dim row gap-1" style={{ fontSize: 'var(--t-xs)' }}><Lock size={11} /> Tracks with fewer than {data.offers.minSample} offers are hidden.</span>}
            </section>
            {data.funnel.total > 0 && (
              <section className={cs.panel}>
                <strong>How far applications get</strong>
                <Bars rows={STAGE_ORDER.filter((s) => data.funnel.stages[s]).map((s) => ({ label: STAGE_LABEL[s], value: data.funnel.stages[s] }))} />
              </section>
            )}
            {data.rounds.length > 0 && (
              <section className={cs.panel}>
                <strong>Rounds questions come from</strong>
                <Bars rows={data.rounds.slice(0, 8).map((r) => ({ label: label(r.round), value: r.count }))} />
              </section>
            )}
            {data.topics.length > 0 && (
              <section className={cs.panel}>
                <strong>Most-asked topics</strong>
                <Bars rows={data.topics.slice(0, 10).map((t) => ({ label: t.tag, value: t.count }))} />
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
