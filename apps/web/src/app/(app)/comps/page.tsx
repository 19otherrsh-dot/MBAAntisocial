'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Swords, ExternalLink, Bookmark, BookmarkCheck, CalendarPlus, Trophy, Users } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { Chip, EmptyState, Segmented } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api } from '@/lib/client/api';
import { COMP_CATEGORIES, type CompCategory, type Tone } from '@/lib/constants';
import { cn, describeDeadline, formatDate, pluralise } from '@/lib/utils';
import styles from '../app.module.css';

interface Comp {
  _id: string;
  title: string;
  host: string;
  description: string;
  category: CompCategory;
  registrationDeadline: string;
  eventDate?: string;
  prizePool: string;
  teamSize: string;
  eligibility: string;
  url: string;
  isSaved: boolean;
  saveCount: number;
  isGlobal: boolean;
}

const CATEGORY_TONE: Record<CompCategory, Tone> = {
  consulting: 'violet',
  marketing: 'rose',
  finance: 'teal',
  operations: 'blue',
  product: 'amber',
  sustainability: 'teal',
  general: 'slate',
};

const URGENCY_CLASS = {
  none: styles.dueSafe,
  safe: styles.dueSafe,
  soon: styles.dueSoon,
  urgent: styles.dueUrgent,
  overdue: styles.dueOverdue,
} as const;

export default function CompsPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 300 }} />}>
      <CompsView />
    </Suspense>
  );
}

function CompsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const savedOnly = searchParams.get('saved') === 'true';
  const [category, setCategory] = useState<CompCategory | 'all'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useMemo(
    () => ({ category, saved: String(savedOnly) }),
    [category, savedOnly]
  );

  const { data, loading, error, refetch, mutate } = useApiQuery<{ comps: Comp[] }>(
    '/api/comps',
    query
  );

  const comps = data?.comps ?? [];

  const setSavedOnly = (value: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set('saved', 'true');
    else params.delete('saved');
    router.replace(`/comps${params.toString() ? `?${params}` : ''}`, { scroll: false });
  };

  const toggleSave = async (comp: Comp) => {
    const next = !comp.isSaved;

    mutate((current) => ({
      comps: current.comps.map((row) =>
        row._id === comp._id
          ? { ...row, isSaved: next, saveCount: row.saveCount + (next ? 1 : -1) }
          : row
      ),
    }));

    try {
      await api.patch('/api/comps', { action: next ? 'save' : 'unsave', compId: comp._id });
    } catch (caught) {
      mutate((current) => ({
        comps: current.comps.map((row) => (row._id === comp._id ? comp : row)),
      }));
      toast.error('Could not save', caught instanceof Error ? caught.message : undefined);
    }
  };

  const track = async (comp: Comp) => {
    setBusyId(comp._id);
    try {
      await api.patch('/api/comps', { action: 'track', compId: comp._id });
      toast.success('Added to your tasks', `Deadline set for ${formatDate(comp.registrationDeadline)}.`);
      refetch();
    } catch (caught) {
      toast.error('Could not track that', caught instanceof Error ? caught.message : undefined);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>Competitions</h2>
          <p className={styles.pageSubtitle}>
            {pluralise(comps.length, 'live listing')}. Track one and its registration deadline lands
            in your task list.
          </p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <Segmented
          ariaLabel="Saved filter"
          value={savedOnly ? 'saved' : 'all'}
          onChange={(value) => setSavedOnly(value === 'saved')}
          options={[
            { value: 'all', label: 'All open' },
            { value: 'saved', label: 'Saved' },
          ]}
        />

        <div className={styles.toolbarPush}>
          <Select
            aria-label="Filter by category"
            value={category}
            onChange={(event) => setCategory(event.target.value as CompCategory | 'all')}
            options={[
              { value: 'all', label: 'All categories' },
              ...COMP_CATEGORIES.map((value) => ({
                value,
                label: value.charAt(0).toUpperCase() + value.slice(1),
              })),
            ]}
          />
        </div>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {loading ? (
        <div className={styles.cardGrid}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cn('skeleton', styles.skeletonCard)} />
          ))}
        </div>
      ) : comps.length === 0 ? (
        <EmptyState
          art={<Swords size={40} strokeWidth={1.4} />}
          title={savedOnly ? 'Nothing saved yet' : 'No open competitions listed'}
          body={
            savedOnly
              ? 'Save a competition and it shows up here — plus on your home screen until the deadline passes.'
              : 'The calendar is curated by campus moderators. Nothing is open right now, which happens between seasons.'
          }
          action={
            savedOnly && (
              <Button variant="secondary" onClick={() => setSavedOnly(false)}>
                Browse everything
              </Button>
            )
          }
        />
      ) : (
        <div className={styles.cardGrid}>
          {comps.map((comp) => {
            const deadline = describeDeadline(comp.registrationDeadline);

            return (
              <article key={comp._id} className={styles.compCard}>
                <div className={styles.compTop}>
                  <div style={{ minWidth: 0 }}>
                    <h3 className={styles.compTitle}>{comp.title}</h3>
                    <p className={styles.compHost}>{comp.host}</p>
                  </div>
                  <button
                    onClick={() => toggleSave(comp)}
                    aria-label={comp.isSaved ? 'Remove from saved' : 'Save this competition'}
                    aria-pressed={comp.isSaved}
                    style={{
                      color: comp.isSaved ? 'var(--accent)' : 'var(--text-muted)',
                      display: 'flex',
                      flexShrink: 0,
                    }}
                  >
                    {comp.isSaved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
                  </button>
                </div>

                <div className="row gap-2 wrap">
                  <Chip tone={CATEGORY_TONE[comp.category]}>
                    {comp.category.charAt(0).toUpperCase() + comp.category.slice(1)}
                  </Chip>
                  {comp.isGlobal && <Chip outline>Global</Chip>}
                  <span className={cn(styles.taskDue, URGENCY_CLASS[deadline.urgency])}>
                    Registration {deadline.text}
                  </span>
                </div>

                {comp.description && (
                  <p className={cn(styles.compDesc, 'clamp-3')}>{comp.description}</p>
                )}

                <div className={styles.compFacts}>
                  {comp.prizePool && (
                    <span className={styles.compFact}>
                      <span className={styles.compFactLabel}>
                        <Trophy size={9} style={{ display: 'inline', marginRight: 3 }} />
                        Prize
                      </span>
                      <span className={styles.compFactValue}>{comp.prizePool}</span>
                    </span>
                  )}
                  {comp.teamSize && (
                    <span className={styles.compFact}>
                      <span className={styles.compFactLabel}>
                        <Users size={9} style={{ display: 'inline', marginRight: 3 }} />
                        Team
                      </span>
                      <span className={styles.compFactValue}>{comp.teamSize}</span>
                    </span>
                  )}
                  <span className={styles.compFact}>
                    <span className={styles.compFactLabel}>Closes</span>
                    <span className={styles.compFactValue}>
                      {formatDate(comp.registrationDeadline)}
                    </span>
                  </span>
                </div>

                <div className={styles.compFoot}>
                  <Button
                    size="sm"
                    icon={<CalendarPlus size={14} />}
                    onClick={() => track(comp)}
                    loading={busyId === comp._id}
                  >
                    Track deadline
                  </Button>
                  <a href={comp.url} target="_blank" rel="noopener noreferrer nofollow">
                    <Button size="sm" variant="secondary" iconAfter={<ExternalLink size={13} />}>
                      Details
                    </Button>
                  </a>
                  {comp.saveCount > 0 && (
                    <span className="dim" style={{ fontSize: 'var(--t-xs)', marginLeft: 'auto' }}>
                      {pluralise(comp.saveCount, 'save')}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
