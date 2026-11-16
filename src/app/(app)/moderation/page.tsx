'use client';

import { useState } from 'react';
import { ShieldCheck, EyeOff, Check, UserX } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Field';
import { Avatar, Banner, Chip, EmptyState, Segmented, Stat } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { api } from '@/lib/client/api';
import { REPORT_REASON_META, MODERATOR_ROLES, type ReportReason } from '@/lib/constants';
import { timeAgo } from '@/lib/utils';
import styles from '../app.module.css';

/**
 * Campus health as a placement cell would read it.
 *
 * Grouped by the question each block answers rather than by which collection
 * the number came from — engagement, preparation, contribution, outcomes.
 */
interface CampusStats {
  engagement: { totalUsers: number; activeUsers: number; activeShare: number };
  preparation: {
    completedSessions: number;
    noShowSessions: number;
    openSlots: number;
    studentsWithSession: number;
    readinessShare: number;
  };
  contribution: {
    hostingMentors: number;
    totalMentors: number;
    mentorShare: number;
    totalResources: number;
    questionsLogged: number;
  };
  /** Null for moderators who are not institute staff. */
  outcomes: { trackedApplications: number; offers: number } | null;
}

interface Report {
  _id: string;
  targetType: 'post' | 'comment' | 'resource' | 'user' | 'whisper';
  target: string;
  preview: { subject: string; text: string; available: boolean };
  parent?: string;
  reason: ReportReason;
  detail: string;
  status: string;
  createdAt: string;
  reporter: { _id: string; name: string; image?: string };
}

/**
 * The moderator queue.
 *
 * §11 makes moderation tooling a precondition for anything anonymous. It ships
 * here in version one so the tooling exists before the pressure to loosen the
 * rules does — the API enforces the role independently of this page rendering.
 */
export default function ModerationPage() {
  const { me, loading: meLoading } = useMe();
  const toast = useToast();

  const canModerate = me ? MODERATOR_ROLES.includes(me.role) : false;

  const { data, loading, error, refetch } = useApiQuery<{ reports: Report[] }>(
    canModerate ? '/api/reports' : null
  );

  const [tab, setTab] = useState<'queue' | 'analytics'>('queue');

  const { data: statsData, loading: statsLoading } = useApiQuery<CampusStats>(
    canModerate && tab === 'analytics' ? '/api/admin/stats' : null
  );

  const [resolving, setResolving] = useState<{ report: Report; action: Resolution } | null>(null);

  if (meLoading) return <div className="skeleton" style={{ height: 260 }} />;

  if (!canModerate) {
    return (
      <EmptyState
        art={<ShieldCheck size={40} strokeWidth={1.4} />}
        title="Moderators only"
        body="This queue is limited to campus moderators. If you reported something, you will hear back through your notifications."
      />
    );
  }

  const reports = data?.reports ?? [];

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>Admin Dashboard</h2>
          <p className={styles.pageSubtitle}>
            {me?.campus} campus moderation and analytics.
          </p>
        </div>
      </div>

      <Segmented
        ariaLabel="Admin tools"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'queue', label: 'Moderation Queue' },
          { value: 'analytics', label: 'Analytics' },
        ]}
      />

      {tab === 'queue' && (
        <>
          <Banner variant="info">
        Hiding content never deletes it. The record stays reviewable — including when the call was
        wrong.
      </Banner>

      {error && <div className={styles.errorBox}>{error}</div>}

      {loading ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : reports.length === 0 ? (
        <EmptyState
          art={<Check size={40} strokeWidth={1.4} />}
          title="Queue is clear"
          body="Nothing waiting on you. Reports from your campus land here as they come in."
        />
      ) : (
        <div className={styles.cardList}>
          {reports.map((report) => (
            <article key={report._id} className={styles.slotCard}>
              <div className={styles.slotMain}>
                <div className={styles.slotTop}>
                  <Chip tone="rose">{REPORT_REASON_META[report.reason].label}</Chip>
                  <Chip outline>{report.targetType}</Chip>
                  <Chip outline>{timeAgo(report.createdAt)}</Chip>
                </div>

                <div className={styles.slotPerson}>
                  <Avatar
                    name={report.reporter?.name ?? '?'}
                    image={report.reporter?.image}
                    seed={report.reporter?._id}
                    size={28}
                  />
                  <div>
                    <div className={styles.slotName}>{report.reporter?.name}</div>
                    <div className={styles.slotRole}>Reported this</div>
                  </div>
                </div>

                {report.detail && <p className={styles.slotNote}>“{report.detail}”</p>}

                {/* The reported content itself — the thing being judged. */}
                <div className={styles.feedbackBlock}>
                  {report.preview.subject && (
                    <div className={styles.slotRole}>{report.preview.subject}</div>
                  )}
                  <p className={styles.feedbackComment}>{report.preview.text}</p>
                </div>

                <div className={styles.slotActions}>
                  {report.targetType === 'user' ? (
                    <Button
                      size="sm"
                      variant="danger"
                      icon={<UserX size={14} />}
                      disabled={!report.preview.available}
                      onClick={() => setResolving({ report, action: 'suspend_user' })}
                    >
                      Suspend account
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="danger"
                      icon={<EyeOff size={14} />}
                      disabled={!report.preview.available}
                      onClick={() => setResolving({ report, action: 'hide_content' })}
                    >
                      Hide content
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setResolving({ report, action: 'dismiss' })}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

        <ResolveDialog
          state={resolving}
          onClose={() => setResolving(null)}
          onDone={() => {
            setResolving(null);
            toast.success('Report resolved', 'The reporter has been notified.');
            refetch();
          }}
        />
      </>
      )}

      {tab === 'analytics' &&
        (statsLoading ? (
          <div className="skeleton" style={{ height: 240 }} />
        ) : statsData ? (
          <>
            <Banner variant="info">
              Placement portals report outcomes. This reports <em>preparation</em> — the thing
              nobody else can see, because nobody else holds the data.
            </Banner>

            <section className={styles.section}>
              <h3 className={styles.sectionHead}>Batch readiness</h3>
              <div className={styles.statStrip}>
                <Stat
                  value={`${statsData.preparation.readinessShare}%`}
                  label="First-years mock-ready"
                  meta={`${statsData.preparation.studentsWithSession} have sat at least one`}
                  tone={statsData.preparation.readinessShare >= 50 ? 'teal' : 'amber'}
                />
                <Stat
                  value={statsData.preparation.completedSessions}
                  label="Sessions completed"
                  meta={`${statsData.preparation.noShowSessions} no-shows`}
                />
                <Stat
                  value={statsData.preparation.openSlots}
                  label="Slots open now"
                  meta="Bookable this minute"
                  tone={statsData.preparation.openSlots === 0 ? 'rose' : undefined}
                />
              </div>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionHead}>Senior participation</h3>
              <div className={styles.statStrip}>
                <Stat
                  value={`${statsData.contribution.mentorShare}%`}
                  label="Seniors hosting"
                  meta={`${statsData.contribution.hostingMentors} of ${statsData.contribution.totalMentors}`}
                  tone={statsData.contribution.mentorShare >= 30 ? 'teal' : 'amber'}
                />
                <Stat
                  value={statsData.contribution.totalResources}
                  label="Resources shared"
                  meta="Notes and past papers"
                />
                <Stat
                  value={statsData.contribution.questionsLogged}
                  label="Interview questions"
                  meta="Logged by people who sat the round"
                  tone="violet"
                />
              </div>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionHead}>Engagement and outcomes</h3>
              <div className={styles.statStrip}>
                <Stat
                  value={`${statsData.engagement.activeShare}%`}
                  label="Active this month"
                  meta={`${statsData.engagement.activeUsers} of ${statsData.engagement.totalUsers}`}
                />
                {statsData.outcomes && (
                  <>
                    <Stat
                      value={statsData.outcomes.trackedApplications}
                      label="Processes tracked"
                      meta="Across the batch"
                    />
                    <Stat
                      value={statsData.outcomes.offers}
                      label="Offers recorded"
                      meta="Self-reported by students"
                      tone={statsData.outcomes.offers > 0 ? 'teal' : undefined}
                    />
                  </>
                )}
              </div>
            </section>
          </>
        ) : (
          <Banner variant="danger">Could not load the campus figures.</Banner>
        ))}
    </>
  );
}

type Resolution = 'hide_content' | 'suspend_user' | 'dismiss';

const RESOLUTION_COPY: Record<Resolution, { title: string; description: string; confirm: string }> = {
  hide_content: {
    title: 'Hide this content',
    description: 'It disappears from the campus. The record is kept, so the call can be reviewed.',
    confirm: 'Hide it',
  },
  suspend_user: {
    title: 'Suspend this account',
    description:
      'They are signed out immediately and cannot sign back in. Use this for a person, not for one bad post.',
    confirm: 'Suspend',
  },
  dismiss: {
    title: 'Dismiss this report',
    description: 'Nothing changes, and the reporter is told a moderator reviewed it.',
    confirm: 'Dismiss',
  },
};

function ResolveDialog({
  state,
  onClose,
  onDone,
}: {
  state: { report: Report; action: Resolution } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!state) return null;

  const copy = RESOLUTION_COPY[state.action];
  const noteRequired = state.action === 'suspend_user';

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await api.patch('/api/reports', {
        reportId: state.report._id,
        resolution: state.action,
        note: note.trim(),
      });
      setNote('');
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not resolve that.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={state.action === 'dismiss' ? 'primary' : 'danger'}
            onClick={submit}
            loading={pending}
            disabled={noteRequired && !note.trim()}
          >
            {copy.confirm}
          </Button>
        </>
      }
    >
      {error && <Banner variant="danger">{error}</Banner>}

      <Textarea
        label={noteRequired ? 'Reason' : 'Note for the record'}
        placeholder="Why you made this call. Future moderators will read it."
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={1000}
        rows={3}
        optional={!noteRequired}
      />
    </Dialog>
  );
}
