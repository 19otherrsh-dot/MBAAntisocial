'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, BookOpen, ArrowBigUp, Plus, ShieldCheck, Clock3, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { Avatar, Banner, Chip, EmptyState } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/useConfirm';
import { useApiQuery, useAction, useDebounced } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { api } from '@/lib/client/api';
import {
  ROUND_TYPES,
  ROUND_TYPE_META,
  ROLE_TRACKS,
  ROLE_TRACK_META,
  QUESTION_DIFFICULTIES,
  QUESTION_DIFFICULTY_META,
  QUESTION_FRESHNESS_MONTHS,
  type RoundType,
  type RoleTrack,
  type QuestionDifficulty,
} from '@/lib/constants';
import { cn, formatDate, timeAgo, toDateTimeLocalValue } from '@/lib/utils';
import styles from '../app.module.css';

interface Contributor {
  _id: string;
  name: string;
  image?: string;
  year?: 1 | 2;
  batch?: string;
}

interface Question {
  _id: string;
  company: string;
  role: string;
  track: RoleTrack;
  roundType: RoundType;
  question: string;
  guidance: string;
  difficulty: QuestionDifficulty;
  tags: string[];
  askedAt: string;
  anonymous: boolean;
  verified: boolean;
  upvoteCount: number;
  hasUpvoted: boolean;
  isOwn: boolean;
  dated: boolean;
  contributor: Contributor | null;
  createdAt: string;
}

interface IntelResponse {
  questions: Question[];
  companies: Array<{ key: string; company: string; count: number }>;
  pagination: { total: number };
}

export default function IntelPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 320 }} />}>
      <IntelView />
    </Suspense>
  );
}

function IntelView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { me } = useMe();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const company = searchParams.get('company') ?? '';
  const [search, setSearch] = useState('');
  const [roundType, setRoundType] = useState<RoundType | ''>('');
  const [track, setTrack] = useState<RoleTrack | ''>('');
  const [sort, setSort] = useState<'recent' | 'useful'>('recent');
  const [addOpen, setAddOpen] = useState(false);

  const debouncedSearch = useDebounced(search, 300);

  const query = useMemo(
    () => ({ search: debouncedSearch, company, roundType, track, sort }),
    [debouncedSearch, company, roundType, track, sort]
  );

  const { data, loading, error, refetch, mutate } = useApiQuery<IntelResponse>(
    '/api/questions',
    query
  );

  const questions = data?.questions ?? [];
  const companies = data?.companies ?? [];

  const setCompany = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set('company', next);
    else params.delete('company');
    router.replace(`/intel${params.toString() ? `?${params}` : ''}`, { scroll: false });
  };

  const upvote = async (question: Question) => {
    const next = !question.hasUpvoted;

    mutate((current) => ({
      ...current,
      questions: current.questions.map((row) =>
        row._id === question._id
          ? { ...row, hasUpvoted: next, upvoteCount: row.upvoteCount + (next ? 1 : -1) }
          : row
      ),
    }));

    try {
      await api.patch('/api/questions', { action: 'upvote', questionId: question._id });
    } catch (caught) {
      mutate((current) => ({
        ...current,
        questions: current.questions.map((row) => (row._id === question._id ? question : row)),
      }));
      toast.error('Could not vote', caught instanceof Error ? caught.message : undefined);
    }
  };

  const remove = async (question: Question) => {
    const confirmed = await confirm({
      title: 'Delete this question?',
      body: 'It disappears from the campus bank for everyone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await api.patch('/api/questions', { action: 'delete', questionId: question._id });
      toast.success('Deleted');
      refetch();
    } catch (caught) {
      toast.error('Could not delete', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>Interview intel</h2>
          <p className={styles.pageSubtitle}>
            What panels actually asked at {me?.campus ?? 'your campus'} — logged by the people who
            were in the room.
          </p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>
          Log a question
        </Button>
      </div>

      <Banner variant="info" icon={<BookOpen size={16} />}>
        This exists because it is scoped to one campus. A national marketplace has its users spread
        across every institute, so it can never say what <em>this</em> panel asked <em>here</em>.
        Every round you debrief makes it better for the batch behind you.
      </Banner>

      {companies.length > 0 && (
        <div className={styles.companyRail}>
          <button
            className={cn(styles.companyChip, !company && styles.companyChipActive)}
            onClick={() => setCompany('')}
          >
            All companies
            <span className={styles.companyChipCount}>{data?.pagination.total ?? 0}</span>
          </button>
          {companies.map((entry) => (
            <button
              key={entry.key}
              className={cn(
                styles.companyChip,
                company.toLowerCase() === entry.company.toLowerCase() && styles.companyChipActive
              )}
              onClick={() => setCompany(entry.company)}
            >
              {entry.company}
              <span className={styles.companyChipCount}>{entry.count}</span>
            </button>
          ))}
        </div>
      )}

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Input
            aria-label="Search questions"
            placeholder="Search questions, companies, or tags"
            icon={<Search size={15} />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <Select
          aria-label="Filter by round"
          value={roundType}
          onChange={(event) => setRoundType(event.target.value as RoundType | '')}
          options={[
            { value: '', label: 'All rounds' },
            ...ROUND_TYPES.map((value) => ({ value, label: ROUND_TYPE_META[value].label })),
          ]}
        />

        <Select
          aria-label="Filter by track"
          value={track}
          onChange={(event) => setTrack(event.target.value as RoleTrack | '')}
          options={[
            { value: '', label: 'All tracks' },
            ...ROLE_TRACKS.map((value) => ({ value, label: ROLE_TRACK_META[value].label })),
          ]}
        />

        <Select
          aria-label="Sort"
          value={sort}
          onChange={(event) => setSort(event.target.value as typeof sort)}
          options={[
            { value: 'recent', label: 'Most recent' },
            { value: 'useful', label: 'Most useful' },
          ]}
        />
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {loading ? (
        <div className={styles.cardList}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 150 }} />
          ))}
        </div>
      ) : questions.length === 0 ? (
        <EmptyState
          art={<BookOpen size={40} strokeWidth={1.4} />}
          title={company ? `Nothing logged for ${company} yet` : 'The bank is empty'}
          body={
            company
              ? 'Somebody from your campus will sit that process eventually. If it was you, this is the moment to write down what they asked.'
              : 'This fills up one debrief at a time. The first entry is the hardest and the most valuable.'
          }
          action={<Button onClick={() => setAddOpen(true)}>Log the first one</Button>}
        />
      ) : (
        <div className={styles.cardList}>
          {questions.map((question) => (
            <QuestionCard
              key={question._id}
              question={question}
              onUpvote={() => upvote(question)}
              onDelete={() => remove(question)}
            />
          ))}
        </div>
      )}

      <AddQuestionDialog
        open={addOpen}
        defaultCompany={company}
        onClose={() => setAddOpen(false)}
        onDone={() => {
          setAddOpen(false);
          refetch();
        }}
      />

      {confirmDialog}
    </>
  );
}

/* ───────────────────────── Card ───────────────────────── */

function QuestionCard({
  question,
  onUpvote,
  onDelete,
}: {
  question: Question;
  onUpvote: () => void;
  onDelete: () => void;
}) {
  const roundMeta = ROUND_TYPE_META[question.roundType];
  const difficultyMeta = QUESTION_DIFFICULTY_META[question.difficulty];

  return (
    <article className={styles.qCard}>
      <div className={styles.qMeta}>
        <Chip tone="slate">{question.company}</Chip>
        <Chip tone={roundMeta.tone}>{roundMeta.label}</Chip>
        <Chip tone={difficultyMeta.tone}>{difficultyMeta.label}</Chip>
        {question.verified && (
          <Chip tone="teal" icon={<ShieldCheck size={11} />} title="Logged from a tracked round">
            First-hand
          </Chip>
        )}
        {question.dated && (
          <span className={styles.qDated} title={`Older than ${QUESTION_FRESHNESS_MONTHS} months`}>
            <Clock3 size={11} style={{ display: 'inline', marginRight: 3 }} />
            {formatDate(question.askedAt)}
          </span>
        )}
      </div>

      <p className={styles.qText}>{question.question}</p>

      {question.guidance && (
        <div className={styles.qGuidance}>
          <span className={styles.qGuidanceLabel}>What they wish they had said</span>
          {question.guidance}
        </div>
      )}

      <div className={styles.qFoot}>
        <button
          className={cn(styles.voteBtn, question.hasUpvoted && styles.voteActive)}
          onClick={onUpvote}
          disabled={question.isOwn}
          aria-pressed={question.hasUpvoted}
          title={question.isOwn ? 'You logged this' : 'Mark as useful'}
        >
          <ArrowBigUp size={14} />
          {question.upvoteCount}
        </button>

        <div className={styles.qAttribution}>
          {question.contributor ? (
            <>
              <Avatar
                name={question.contributor.name}
                image={question.contributor.image}
                seed={question.contributor._id}
                size={20}
              />
              <span className="truncate">
                {question.contributor.name}
                {question.contributor.batch ? ` · ${question.contributor.batch}` : ''}
              </span>
            </>
          ) : (
            <span>Logged anonymously</span>
          )}
          <span>· asked {timeAgo(question.askedAt)}</span>
        </div>

        {question.isOwn && (
          <button
            onClick={onDelete}
            aria-label="Delete this question"
            style={{ marginLeft: 'auto', color: 'var(--text-muted)', display: 'flex', padding: 4 }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </article>
  );
}

/* ───────────────────────── Add ───────────────────────── */

function AddQuestionDialog({
  open,
  defaultCompany,
  onClose,
  onDone,
}: {
  open: boolean;
  defaultCompany: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();

  const [company, setCompany] = useState(defaultCompany);
  const [role, setRole] = useState('');
  const [track, setTrack] = useState<RoleTrack>('consulting');
  const [roundType, setRoundType] = useState<RoundType>('case');
  const [question, setQuestion] = useState('');
  const [guidance, setGuidance] = useState('');
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>('standard');
  const [askedAt, setAskedAt] = useState(() => toDateTimeLocalValue(new Date()).slice(0, 10));
  const [anonymous, setAnonymous] = useState(false);

  const create = useAction(async () => {
    await api.post('/api/questions', {
      company: company.trim(),
      role: role.trim(),
      track,
      roundType,
      question: question.trim(),
      guidance: guidance.trim(),
      difficulty,
      tags: [],
      askedAt: new Date(askedAt).toISOString(),
      anonymous,
    });

    toast.success('Logged', 'Thanks — that one outlives you.');
    setQuestion('');
    setGuidance('');
    onDone();
  });

  if (!open) return null;

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title="Log an interview question"
      description="Something a panel actually asked you. Second-hand rumours are worse than nothing."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.pending}>
            Cancel
          </Button>
          <Button
            onClick={() => create.run()}
            loading={create.pending}
            disabled={!company.trim() || question.trim().length < 8}
          >
            Log it
          </Button>
        </>
      }
    >
      {create.error && <Banner variant="danger">{create.error}</Banner>}

      <Banner variant="warning">
        Logging this from your{' '}
        <Link href="/pipeline" style={{ textDecoration: 'underline' }}>
          pipeline
        </Link>{' '}
        instead marks it first-hand, which is what readers filter on. This form is for rounds you
        never tracked.
      </Banner>

      <div className={styles.checkGrid}>
        <Input
          label="Company"
          placeholder="Bain & Company"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          maxLength={120}
          autoFocus
        />
        <Input
          label="Role"
          placeholder="Associate Consultant"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          maxLength={120}
          optional
        />
      </div>

      <div className={styles.checkGrid}>
        <Select
          label="Round"
          value={roundType}
          onChange={(event) => setRoundType(event.target.value as RoundType)}
          options={ROUND_TYPES.map((value) => ({ value, label: ROUND_TYPE_META[value].label }))}
        />
        <Select
          label="Track"
          value={track}
          onChange={(event) => setTrack(event.target.value as RoleTrack)}
          options={ROLE_TRACKS.map((value) => ({ value, label: ROLE_TRACK_META[value].label }))}
        />
      </div>

      <Textarea
        label="The question"
        placeholder="Size the market for electric two-wheelers in tier-two Indian cities."
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        maxLength={1000}
        showCount
        rows={3}
      />

      <Textarea
        label="What you wish you had said"
        placeholder="I went straight to numbers. They wanted the segmentation logic first — households, then two-wheeler penetration, then the electric share."
        value={guidance}
        onChange={(event) => setGuidance(event.target.value)}
        maxLength={2000}
        rows={3}
        optional
      />

      <div className={styles.checkGrid}>
        <div>
          <span
            style={{
              fontSize: 'var(--t-sm)',
              fontWeight: 560,
              display: 'block',
              marginBottom: 'var(--s-2)',
            }}
          >
            How hard was it
          </span>
          <div className="row gap-2 wrap">
            {QUESTION_DIFFICULTIES.map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={difficulty === level}
                className={cn(styles.checkTile, difficulty === level && styles.checkTileActive)}
                style={{ flex: '0 0 auto' }}
                onClick={() => setDifficulty(level)}
              >
                {QUESTION_DIFFICULTY_META[level].label}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="When were you asked"
          type="date"
          value={askedAt}
          onChange={(event) => setAskedAt(event.target.value)}
          hint="The season matters — patterns drift."
        />
      </div>

      <Switch
        label="Post without my name"
        hint="Your name is shown by default. That attribution is what makes this more trustworthy than a forum thread."
        checked={anonymous}
        onChange={setAnonymous}
      />
    </Dialog>
  );
}
