'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Target, Trash2, BookOpen } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Banner, Chip, EmptyState, Segmented, Stat } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/useConfirm';
import { useApiQuery, useAction } from '@/lib/client/hooks';
import { api } from '@/lib/client/api';
import RoundDialog from './RoundDialog';
import IntelDialog from './IntelDialog';
import { nextRound, type Application, type PipelineResponse, type Round } from './types';
import {
  APPLICATION_STAGES,
  APPLICATION_STAGE_META,
  APPLICATION_SOURCES,
  APPLICATION_SOURCE_META,
  ROLE_TRACKS,
  ROLE_TRACK_META,
  ROUND_TYPE_META,
  type ApplicationStage,
  type ApplicationSource,
  type RoleTrack,
} from '@/lib/constants';
import { cn, describeDeadline, formatDayLabel, pluralise } from '@/lib/utils';
import styles from '../app.module.css';

type Filter = 'open' | 'all' | 'offer' | 'rejected';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'open', label: 'Live' },
  { value: 'offer', label: 'Offers' },
  { value: 'rejected', label: 'Closed' },
  { value: 'all', label: 'Everything' },
];

export default function PipelinePage() {
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [filter, setFilter] = useState<Filter>('open');
  const [addOpen, setAddOpen] = useState(false);
  const [roundTarget, setRoundTarget] = useState<{ application: Application; round: Round | null } | null>(null);
  const [intelTarget, setIntelTarget] = useState<{ application: Application; round: Round } | null>(null);

  const query = useMemo(() => ({ stage: filter }), [filter]);
  const { data, loading, error, refetch } = useApiQuery<PipelineResponse>('/api/applications', query);

  const applications = data?.applications ?? [];
  const summary = data?.summary;

  const remove = async (application: Application) => {
    const confirmed = await confirm({
      title: `Remove ${application.company}?`,
      body: 'The rounds and your private notes go with it.',
      warning:
        application.rounds.some((round) => round.questionsLogged > 0)
          ? 'Questions you contributed stay in the campus bank — they were given to your batch, not attached to your record-keeping.'
          : undefined,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await api.delete(`/api/applications/${application._id}`);
      toast.success('Removed');
      refetch();
    } catch (caught) {
      toast.error('Could not remove', caught instanceof Error ? caught.message : undefined);
    }
  };

  const setStage = async (application: Application, stage: ApplicationStage) => {
    try {
      await api.patch(`/api/applications/${application._id}`, { stage });
      refetch();
    } catch (caught) {
      toast.error('Could not update', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>Placement pipeline</h2>
          <p className={styles.pageSubtitle}>
            Every process you are in, round by round — and what your campus already knows about
            each company.
          </p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>
          Track a company
        </Button>
      </div>

      {summary && (summary.open > 0 || summary.closed > 0) && (
        <div className={styles.statStrip}>
          <Stat value={summary.open} label="Live processes" tone={summary.open > 0 ? 'violet' : undefined} />
          <Stat
            value={summary.upcomingRounds}
            label="Rounds scheduled"
            tone={summary.upcomingRounds > 0 ? 'amber' : undefined}
          />
          <Stat value={summary.offers} label="Offers" tone={summary.offers > 0 ? 'teal' : undefined} />
          <Stat value={summary.closed} label="Closed out" />
        </div>
      )}

      <Segmented ariaLabel="Filter pipeline" value={filter} onChange={setFilter} options={FILTERS} />

      {error && <div className={styles.errorBox}>{error}</div>}

      {loading ? (
        <div className={styles.cardList}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 150 }} />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <EmptyState
          art={<Target size={40} strokeWidth={1.4} />}
          title={filter === 'open' ? 'Nothing tracked yet' : 'Nothing here'}
          body={
            filter === 'open'
              ? 'Add the first company you are chasing. Every round you log pulls up what your own campus was asked there — and adds to it when yours is done.'
              : 'Processes show up here once they close out.'
          }
          action={
            filter === 'open' && <Button onClick={() => setAddOpen(true)}>Track a company</Button>
          }
        />
      ) : (
        <div className={styles.cardList}>
          {applications.map((application) => (
            <ApplicationCard
              key={application._id}
              application={application}
              onAddRound={() => setRoundTarget({ application, round: null })}
              onOpenRound={(round) => setRoundTarget({ application, round })}
              onRemove={() => remove(application)}
              onStage={(stage) => setStage(application, stage)}
            />
          ))}
        </div>
      )}

      <AddApplicationDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onDone={() => {
          setAddOpen(false);
          refetch();
        }}
      />

      {roundTarget && (
        <RoundDialog
          application={roundTarget.application}
          round={roundTarget.round}
          onClose={() => setRoundTarget(null)}
          onDone={({ round, promptIntel }) => {
            const application = roundTarget.application;
            setRoundTarget(null);
            refetch();
            // The debrief opens straight off the outcome change, while the round
            // is still fresh — this is the only moment the answers exist.
            if (promptIntel) setIntelTarget({ application, round });
          }}
        />
      )}

      {intelTarget && (
        <IntelDialog
          application={intelTarget.application}
          round={intelTarget.round}
          onClose={() => setIntelTarget(null)}
          onDone={() => {
            setIntelTarget(null);
            refetch();
          }}
        />
      )}

      {confirmDialog}
    </>
  );
}

/* ───────────────────────── Card ───────────────────────── */

function ApplicationCard({
  application,
  onAddRound,
  onOpenRound,
  onRemove,
  onStage,
}: {
  application: Application;
  onAddRound: () => void;
  onOpenRound: (round: Round) => void;
  onRemove: () => void;
  onStage: (stage: ApplicationStage) => void;
}) {
  const stageMeta = APPLICATION_STAGE_META[application.stage];
  const trackMeta = ROLE_TRACK_META[application.track];
  const upcoming = nextRound(application);

  const deadline = upcoming?.scheduledAt ? describeDeadline(upcoming.scheduledAt) : null;

  return (
    <article
      className={styles.appCard}
      style={{ borderLeftColor: `var(--${stageMeta.tone})` }}
    >
      <div className={styles.appTop}>
        <div style={{ minWidth: 0 }}>
          <h3 className={styles.appCompany}>{application.company}</h3>
          <p className={styles.appRole}>{application.role}</p>
        </div>
        <div className="row gap-2 wrap" style={{ justifyContent: 'flex-end' }}>
          <Chip tone={stageMeta.tone}>{stageMeta.label}</Chip>
        </div>
      </div>

      <div className="row gap-2 wrap">
        <Chip tone={trackMeta.tone}>{trackMeta.label}</Chip>
        <Chip outline>{APPLICATION_SOURCE_META[application.source].label}</Chip>
        {deadline && upcoming && (
          <span
            className={cn(
              styles.taskDue,
              deadline.urgency === 'overdue'
                ? styles.dueOverdue
                : deadline.urgency === 'urgent'
                  ? styles.dueUrgent
                  : deadline.urgency === 'soon'
                    ? styles.dueSoon
                    : styles.dueSafe
            )}
          >
            {ROUND_TYPE_META[upcoming.type].label} · {deadline.text}
          </span>
        )}
      </div>

      {/* The process, left to right. Where someone stands reads without opening
          anything, which is the only way a board like this stays useful. */}
      <div className={styles.roundStrip}>
        {application.rounds.map((round) => {
          const meta = ROUND_TYPE_META[round.type];
          const isNext = upcoming?._id === round._id;
          const scheduled = round.scheduledAt ? new Date(round.scheduledAt) : null;

          return (
            <button
              key={round._id}
              className={cn(
                styles.roundPip,
                round.outcome === 'cleared' && styles.roundCleared,
                round.outcome === 'rejected' && styles.roundRejected,
                isNext && round.outcome === 'pending' && styles.roundNext
              )}
              onClick={() => onOpenRound(round)}
            >
              <span className={styles.roundPipLabel}>{round.label || meta.label}</span>
              <span className={styles.roundPipMeta}>
                {round.outcome !== 'pending'
                  ? round.questionsLogged > 0
                    ? `${pluralise(round.questionsLogged, 'question')} logged`
                    : 'Add what they asked'
                  : scheduled
                    ? formatDayLabel(scheduled)
                    : 'No date'}
              </span>
            </button>
          );
        })}

        <button className={styles.addRoundPip} onClick={onAddRound}>
          <Plus size={13} />
          Round
        </button>
      </div>

      <div className={styles.appFoot}>
        <Link
          href={`/intel?company=${encodeURIComponent(application.company)}`}
          className={cn(styles.intelPill, application.intelAvailable === 0 && styles.intelPillEmpty)}
        >
          <BookOpen size={12} />
          {application.intelAvailable > 0
            ? `${pluralise(application.intelAvailable, 'question')} from your campus`
            : 'No intel yet — be the first'}
        </Link>

        {!stageMeta.closed && (
          <Select
            aria-label={`Stage for ${application.company}`}
            value={application.stage}
            onChange={(event) => onStage(event.target.value as ApplicationStage)}
            options={APPLICATION_STAGES.map((value) => ({
              value,
              label: APPLICATION_STAGE_META[value].label,
            }))}
            className={styles.stageSelect}
          />
        )}

        <button
          onClick={onRemove}
          aria-label={`Remove ${application.company}`}
          style={{ marginLeft: 'auto', color: 'var(--text-muted)', display: 'flex', padding: 4 }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}

/* ───────────────────────── Add ───────────────────────── */

function AddApplicationDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();

  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [track, setTrack] = useState<RoleTrack>('consulting');
  const [source, setSource] = useState<ApplicationSource>('campus');
  const [stage, setStage] = useState<ApplicationStage>('applied');
  const [notes, setNotes] = useState('');

  const create = useAction(async () => {
    await api.post('/api/applications', {
      company: company.trim(),
      role: role.trim(),
      track,
      source,
      stage,
      notes: notes.trim(),
    });
    toast.success('Tracking it', 'Add the rounds as they get scheduled.');
    setCompany('');
    setRole('');
    setNotes('');
    onDone();
  });

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Track a company"
      description="One row per company and role. Rounds go inside it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.pending}>
            Cancel
          </Button>
          <Button
            onClick={() => create.run()}
            loading={create.pending}
            disabled={!company.trim() || !role.trim()}
          >
            Add to pipeline
          </Button>
        </>
      }
    >
      {create.error && <Banner variant="danger">{create.error}</Banner>}

      <Input
        label="Company"
        placeholder="Bain & Company"
        value={company}
        onChange={(event) => setCompany(event.target.value)}
        maxLength={120}
        autoFocus
        hint="Spelling variations are matched automatically, so intel still aggregates."
      />

      <Input
        label="Role"
        placeholder="Associate Consultant — Summer Internship"
        value={role}
        onChange={(event) => setRole(event.target.value)}
        maxLength={120}
      />

      <div className={styles.checkGrid}>
        <Select
          label="Track"
          value={track}
          onChange={(event) => setTrack(event.target.value as RoleTrack)}
          options={ROLE_TRACKS.map((value) => ({ value, label: ROLE_TRACK_META[value].label }))}
        />
        <Select
          label="Route"
          value={source}
          onChange={(event) => setSource(event.target.value as ApplicationSource)}
          options={APPLICATION_SOURCES.map((value) => ({
            value,
            label: APPLICATION_SOURCE_META[value].label,
          }))}
        />
      </div>

      <Select
        label="Where you are"
        value={stage}
        onChange={(event) => setStage(event.target.value as ApplicationStage)}
        options={APPLICATION_STAGES.filter(
          (value) => !APPLICATION_STAGE_META[value].closed
        ).map((value) => ({ value, label: APPLICATION_STAGE_META[value].label }))}
      />

      <Textarea
        label="Notes"
        placeholder="Referred by a senior. JD emphasises analytics more than the usual."
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        maxLength={2000}
        rows={2}
        optional
        hint="Private to you."
      />
    </Dialog>
  );
}
