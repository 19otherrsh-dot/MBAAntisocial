'use client';

import type { Ratio } from '@/server/modules/admin/metrics';
import type { SuccessMetrics } from './types';
import styles from './admin.module.css';

const CARDS: Array<{ key: keyof Omit<SuccessMetrics, 'windowDays'>; label: string; caption: (r: Ratio, days: number) => string; target?: number }> = [
  { key: 'mockReach', label: 'First-years with a mock', caption: (r, d) => `${r.numerator} of ${r.denominator} first-years completed one in ${d} days`, target: 60 },
  { key: 'seniorParticipation', label: 'Seniors hosting', caption: (r, d) => `${r.numerator} of ${r.denominator} seniors and alumni hosted in ${d} days`, target: 30 },
  { key: 'feedWeeklyActive', label: 'Feed weekly active', caption: (r) => `${r.numerator} of ${r.denominator} members posted or commented this week` },
  { key: 'hubWeeklyActive', label: 'Hub weekly active', caption: (r) => `${r.numerator} of ${r.denominator} members wrote in the hub this week` },
  { key: 'notesCoverage', label: 'Courses with notes', caption: (r) => `${r.numerator} of ${r.denominator} tracked courses have a shared note set`, target: 70 },
  { key: 'streak7', label: 'Reached a 7-day streak', caption: (r) => `${r.numerator} of ${r.denominator} members here a week or more` },
  { key: 'streak30', label: 'Reached a 30-day streak', caption: (r) => `${r.numerator} of ${r.denominator} members here a month or more` },
];

/**
 * PRD §9, one tile per metric: the number, a single-hue meter, and the counts
 * behind it. A group under the privacy floor shows no number at all.
 */
export default function MetricCards({ metrics, computedAt, onRefresh }: { metrics: SuccessMetrics; computedAt?: string; onRefresh?: () => void }) {
  return (
    <>
    {computedAt && (
      <p className={styles.note}>
        Figures as of {new Date(computedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}; they are recomputed every five minutes.{' '}
        {onRefresh && (
          <button type="button" className={styles.linkButton} onClick={onRefresh}>
            Recompute now
          </button>
        )}
      </p>
    )}
    <div className={styles.metrics}>
      {CARDS.map((card) => {
        const r = metrics[card.key];
        return (
          <section key={card.key} className={styles.metric} data-reveal="">
            <span className={styles.metricLabel}>{card.label}</span>
            {r.suppressed || r.value === null ? (
              <>
                <span className={styles.metricValueMuted}>—</span>
                <span className={styles.metricCaption}>
                  {r.denominator === 0 ? 'No one to count yet.' : `Too few to report (${r.denominator}); shown from 5 up.`}
                </span>
              </>
            ) : (
              <>
                <span className={styles.metricValue}>{r.value}%</span>
                <div
                  className={styles.meter}
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={r.value}
                  aria-label={card.label}
                  title={`${r.numerator} of ${r.denominator}`}
                >
                  <span className={styles.meterFill} style={{ width: `${Math.max(1, r.value)}%` }} />
                  {card.target && <span className={styles.meterTarget} style={{ left: `${card.target}%` }} title={`Target ${card.target}%`} />}
                </div>
                <span className={styles.metricCaption}>
                  {card.caption(r, metrics.windowDays)}
                  {card.target ? ` · target ${card.target}%` : ''}
                </span>
              </>
            )}
          </section>
        );
      })}
    </div>
    </>
  );
}
