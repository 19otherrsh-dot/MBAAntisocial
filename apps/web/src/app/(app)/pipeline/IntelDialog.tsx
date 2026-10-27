'use client';

import { useState } from 'react';
import { Plus, Check, Sparkles } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import { Switch, Textarea } from '@/components/ui/Field';
import { Banner, Chip } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/client/api';
import {
  ROUND_TYPE_META,
  QUESTION_DIFFICULTIES,
  QUESTION_DIFFICULTY_META,
  POINT_RULES,
  type QuestionDifficulty,
} from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { Application, Round } from './types';
import styles from '../app.module.css';

interface IntelDialogProps {
  application: Application;
  round: Round;
  onClose: () => void;
  onDone: () => void;
}

interface Draft {
  question: string;
  guidance: string;
  difficulty: QuestionDifficulty;
}

const EMPTY: Draft = { question: '', guidance: '', difficulty: 'standard' };

/**
 * The intel prompt, opened the moment a round is marked concluded.
 *
 * Timing is the whole design. Asked a week later, nobody remembers the
 * questions; asked at the moment of logging the outcome, the round is still in
 * the person's head. Several questions can go in at once because that is how
 * they are actually remembered — as a run, not one at a time.
 */
export default function IntelDialog({ application, round, onClose, onDone }: IntelDialogProps) {
  const toast = useToast();

  const [drafts, setDrafts] = useState<Draft[]>([{ ...EMPTY }]);
  const [anonymous, setAnonymous] = useState(round.outcome === 'rejected');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = ROUND_TYPE_META[round.type];
  const filled = drafts.filter((draft) => draft.question.trim().length >= 8);

  const update = (index: number, patch: Partial<Draft>) => {
    setDrafts((current) => current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));
  };

  const skip = async () => {
    // Recorded so this round never prompts again, whether or not anything came in.
    await api
      .patch(`/api/applications/${application._id}/rounds`, {
        action: 'dismiss_intel',
        roundId: round._id,
      })
      .catch(() => undefined);
    onDone();
  };

  const submit = async () => {
    if (filled.length === 0) {
      setError('Add at least one question, or skip — both are fine.');
      return;
    }

    setPending(true);
    setError(null);

    try {
      const askedAt = round.completedAt ?? round.scheduledAt ?? new Date().toISOString();

      // Sequential rather than parallel: the karma ledger applies a daily cap,
      // and racing the writes would make which ones land arbitrary.
      for (const draft of filled) {
        await api.post('/api/questions', {
          company: application.company,
          role: application.role,
          track: application.track,
          roundType: round.type,
          question: draft.question.trim(),
          guidance: draft.guidance.trim(),
          difficulty: draft.difficulty,
          tags: [],
          askedAt,
          anonymous,
          applicationId: application._id,
          roundId: round._id,
        });
      }

      toast.success(
        filled.length === 1 ? 'Question logged' : `${filled.length} questions logged`,
        'Your batch and every batch after it can see this now.'
      );
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that.');
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={`What did ${application.company} ask?`}
      description={`${meta.label} · ${application.role}. This is the part juniors cannot get anywhere else.`}
      footer={
        <>
          <Button variant="ghost" onClick={skip} disabled={pending}>
            Skip
          </Button>
          <Button onClick={submit} loading={pending} icon={<Check size={15} />}>
            {filled.length > 1 ? `Log ${filled.length} questions` : 'Log it'}
          </Button>
        </>
      }
    >
      {error && <Banner variant="danger">{error}</Banner>}

      <Banner variant="info" icon={<Sparkles size={16} />}>
        Worth {POINT_RULES.question_contributed.points} karma each — the highest single award in the
        app, because this is the only contribution that still helps people two years from now.
      </Banner>

      {drafts.map((draft, index) => (
        <div key={index} className="stack gap-3">
          {index > 0 && <hr style={{ border: 0, borderTop: '1px solid var(--line)' }} />}

          <Textarea
            label={drafts.length > 1 ? `Question ${index + 1}` : 'The question'}
            placeholder="Walk me through a time you disagreed with your manager and what you did about it."
            value={draft.question}
            onChange={(event) => update(index, { question: event.target.value })}
            maxLength={1000}
            rows={2}
            autoFocus={index === 0}
          />

          <Textarea
            label="What you wish you had said"
            placeholder="I rambled. The structure they wanted was: situation, the disagreement, what I actually did, the outcome. Two minutes, not five."
            value={draft.guidance}
            onChange={(event) => update(index, { guidance: event.target.value })}
            maxLength={2000}
            rows={2}
            optional
            hint="Often more useful than the question itself."
          />

          <div className="row gap-2 wrap">
            {QUESTION_DIFFICULTIES.map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={draft.difficulty === level}
                className={cn(
                  styles.checkTile,
                  draft.difficulty === level && styles.checkTileActive
                )}
                style={{ flex: '0 0 auto' }}
                onClick={() => update(index, { difficulty: level })}
              >
                {QUESTION_DIFFICULTY_META[level].label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div>
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => setDrafts((current) => [...current, { ...EMPTY }])}
        >
          They asked something else too
        </Button>
      </div>

      <hr style={{ border: 0, borderTop: '1px solid var(--line)' }} />

      <Switch
        label="Post without my name"
        hint={
          round.outcome === 'rejected'
            ? 'On by default here — logging a round you did not clear should not cost you anything publicly.'
            : 'Your name is shown by default, which is what makes this more trustworthy than a forum.'
        }
        checked={anonymous}
        onChange={setAnonymous}
      />

      <div className="row gap-2 wrap">
        <Chip tone="teal">Verified</Chip>
        <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>
          Logged from a tracked round, so it is marked as first-hand.
        </span>
      </div>
    </Dialog>
  );
}
