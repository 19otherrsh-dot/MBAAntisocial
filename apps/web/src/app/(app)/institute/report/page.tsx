'use client';

import {
  Building2,
  Download,
  ShieldCheck,
  TriangleAlert,
  Info,
  RefreshCw,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { Banner, Chip, EmptyState, Stat } from '@/components/ui/Display';
import { useApiQuery } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { STAFF_ROLES, APPLICATION_STAGE_META, type ApplicationStage } from '@/lib/constants';
import { cn, formatDateTime, pluralise } from '@/lib/utils';
import styles from '../app.module.css';

interface FunnelStage {
  stage: ApplicationStage;
  label: string;
  count: number;
}

interface CampusReport {
  campus: string;
  generatedAt: string;
  cohort: { firstYears: number; secondYears: number; total: number; active30d: number };
  readiness: {
    studentsWithSession: number;
    readinessShare: number;
    completedSessions: number;
    noShows: number;
    openSlots: number;
    slotsNextFortnight: number;
  };
  supply: {
    hostingMentors: number;
    eligibleMentors: number;
    mentorShare: number;
    medianSessionsPerHost: number;
  };
  library: { resources: number; coursesCovered: number; questions: number; companiesCovered: number };
  funnel: FunnelStage[];
  byTrack: Array<{ track: string; label: string; students: number; offers: number }>;
  weeklySessions: Array<{ label: string; value: number }>;
  gaps: Array<{ label: string; detail: string; severity: 'high' | 'medium' }>;
  suppressedAny: boolean;
  minCohort: number;
}

/**
 * The placement-cell view.
 *
 * Deliberately its own route rather than a tab inside moderation: the two
 * audiences are different people with different permissions, and a placement
 * officer should never land on a page whose other half hides student posts.
 */
export default function CampusReportPage() {
  const { me, loading: meLoading } = useMe();
  const canRead = me ? STAFF_ROLES.includes(me.role) : false;

  const { data, loading, error, refetch } = useApiQuery<{ report: CampusReport }>(
    canRead ? '/api/campus/report' : null
  );

  if (meLoading) return <div className="skeleton" style={{ height: 300 }} />;

  if (!canRead) {
    return (
      <EmptyState
        art={<Building2 size={40} strokeWidth={1.4} />}
        title="Institute staff only"
        body="This report is for your placement office. It contains no individual student data — only campus-level figures — but access is still limited to staff accounts."
      />
    );
  }

  const report = data?.report;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>Campus report</h2>
          <p className={styles.pageSubtitle}>
            {report ? `${report.campus} · generated ${formatDateTime(report.generatedAt)}` : 'Loading…'}
          </p>
        </div>
        <div className="row gap-2">
          <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={refetch}>
            Refresh
          </Button>
          <a href="/api/campus/report?format=csv" download>
            <Button icon={<Download size={16} />}>Export CSV</Button>
          </a>
        </div>
      </div>

      <Banner variant="info" icon={<Info size={16} />}>
        Placement portals record <em>outcomes</em>, which are only knowable once it is too late to
        act on them. Everything here is a leading indicator — the state of preparation while there
        is still a term left to change it.
      </Banner>

      {error && <div className={styles.errorBox}>{error}</div>}

      {loading || !report ? (
        <div className={styles.reportGrid}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 150 }} />
          ))}
        </div>
      ) : (
        <>
          {report.gaps.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionHead}>
                <TriangleAlert size={15} style={{ color: 'var(--amber)' }} />
                Where to intervene
                <span className={styles.sectionCount}>{report.gaps.length}</span>
              </h3>
              <div className={styles.gapList}>
                {report.gaps.map((gap) => (
                  <div
                    key={gap.label}
                    className={cn(
                      styles.gapRow,
                      gap.severity === 'high' ? styles.gapHigh : styles.gapMedium
                    )}
                  >
                    <div>
                      <div className={styles.gapLabel}>{gap.label}</div>
                      <p className={styles.gapDetail}>{gap.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className={styles.statStrip}>
            <Stat
              value={`${report.readiness.readinessShare}%`}
              label="First-years mock-ready"
              meta={`${report.readiness.studentsWithSession} of ${report.cohort.firstYears}`}
              tone={report.readiness.readinessShare >= 50 ? 'teal' : 'amber'}
            />
            <Stat
              value={`${report.supply.mentorShare}%`}
              label="Seniors hosting"
              meta={`${report.supply.hostingMentors} of ${report.supply.eligibleMentors}`}
              tone={report.supply.mentorShare >= 30 ? 'teal' : 'amber'}
            />
            <Stat
              value={report.readiness.slotsNextFortnight}
              label="Slots next fortnight"
              meta="Bookable right now"
              tone={report.readiness.slotsNextFortnight === 0 ? 'rose' : undefined}
            />
            <Stat
              value={`${Math.round((report.cohort.active30d / Math.max(report.cohort.total, 1)) * 100)}%`}
              label="Active this month"
              meta={`${report.cohort.active30d} of ${report.cohort.total}`}
            />
          </div>

          <div className={styles.reportGrid}>
            <section className={styles.reportCard}>
              <div className={styles.reportCardHead}>
                <span className={styles.reportCardTitle}>Placement funnel</span>
                <Chip outline>Self-reported</Chip>
              </div>
              <FunnelChart stages={report.funnel} />
              <p className={styles.reportCaption}>
                Students record their own processes, so this is a sample of the batch rather than
                the official register — it moves earlier than the official one, which is the point.
              </p>
            </section>

            <section className={styles.reportCard}>
              <div className={styles.reportCardHead}>
                <span className={styles.reportCardTitle}>Sessions completed</span>
                <Chip outline>12 weeks</Chip>
              </div>
              <Sparkline points={report.weeklySessions} />
              <p className={styles.reportCaption}>
                {report.readiness.completedSessions} all time ·{' '}
                {report.readiness.noShows} no-shows · median{' '}
                {report.supply.medianSessionsPerHost} per host
              </p>
            </section>

            <section className={styles.reportCard}>
              <div className={styles.reportCardHead}>
                <span className={styles.reportCardTitle}>Demand by track</span>
              </div>
              {report.byTrack.length === 0 ? (
                <p className={styles.reportCaption}>
                  No track has {report.minCohort} or more students tracking a process yet.
                </p>
              ) : (
                <table className={styles.trackTable}>
                  <thead>
                    <tr>
                      <th scope="col">Track</th>
                      <th scope="col">Students</th>
                      <th scope="col">Offers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byTrack
                      .slice()
                      .sort((a, b) => b.students - a.students)
                      .map((row) => (
                        <tr key={row.track}>
                          <td>{row.label}</td>
                          <td>{row.students}</td>
                          <td>{row.offers}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className={styles.reportCard}>
              <div className={styles.reportCardHead}>
                <span className={styles.reportCardTitle}>Knowledge base</span>
              </div>
              <div className="row gap-5 wrap">
                <div>
                  <div className={styles.reportHeadline}>{report.library.questions}</div>
                  <div className={styles.reportCaption}>
                    interview questions across {pluralise(report.library.companiesCovered, 'company', 'companies')}
                  </div>
                </div>
                <div>
                  <div className={styles.reportHeadline}>{report.library.resources}</div>
                  <div className={styles.reportCaption}>
                    resources across {pluralise(report.library.coursesCovered, 'course')}
                  </div>
                </div>
              </div>
              <p className={styles.reportCaption}>
                Contributed by students who sat the round. This compounds each season and is the
                asset no external platform can replicate for your campus.
              </p>
            </section>
          </div>

          <Banner variant="success" icon={<ShieldCheck size={16} />} title="No individual data appears here">
            Student pipelines are private. Any breakdown covering fewer than {report.minCohort}{' '}
            students is withheld entirely rather than rounded, because a thin cell would identify
            the people in it.
            {report.suppressedAny && ' Some rows were withheld on that basis.'}
          </Banner>
        </>
      )}
    </>
  );
}

function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(...stages.map((stage) => stage.count), 1);

  return (
    <div className={styles.funnel}>
      {stages.map((stage) => {
        const meta = APPLICATION_STAGE_META[stage.stage];
        return (
          <div key={stage.stage} className={styles.funnelRow}>
            <span className={styles.funnelLabel}>{meta?.label ?? stage.label}</span>
            <div className={styles.funnelTrack}>
              <div
                className={styles.funnelBar}
                style={{
                  width: `${Math.max((stage.count / max) * 100, stage.count > 0 ? 3 : 0)}%`,
                  background: `var(--${meta?.tone ?? 'slate'})`,
                }}
              />
            </div>
            <span className={styles.funnelValue}>{stage.count}</span>
          </div>
        );
      })}
    </div>
  );
}

function Sparkline({ points }: { points: Array<{ label: string; value: number }> }) {
  if (points.length === 0) {
    return <p className={styles.reportCaption}>No sessions completed in the last twelve weeks.</p>;
  }

  const max = Math.max(...points.map((point) => point.value), 1);

  return (
    <div className={styles.spark} role="img" aria-label={`Sessions completed per week: ${points.map((p) => `${p.label} ${p.value}`).join(', ')}`}>
      {points.map((point, index) => (
        <div
          key={point.label}
          className={cn(styles.sparkBar, index === points.length - 1 && styles.sparkBarLast)}
          style={{ height: `${(point.value / max) * 100}%` }}
          title={`${point.label}: ${pluralise(point.value, 'session')}`}
        />
      ))}
    </div>
  );
}
