'use client';

import { useMemo, useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { RatingInput, Banner } from '@/components/ui/Display';
import { MENTOR_RUBRIC, MENTEE_RUBRIC } from '@/lib/constants';
import type { Slot } from './SlotCard';
import styles from '../app.module.css';

interface FeedbackDialogProps {
  slot: Slot | null;
  onClose: () => void;
  onSubmit: (slotId: string, scores: Record<string, number>, comments: string) => Promise<void>;
  pending: boolean;
  error: string | null;
}

const MIN_COMMENT = 10;

/**
 * The rubric form.
 *
 * Which rubric appears is decided by the viewer's role on the slot, matching
 * what the server enforces — a mentee cannot file mentor-side scores by
 * fiddling with the request.
 */
export default function FeedbackDialog({
  slot,
  onClose,
  onSubmit,
  pending,
  error,
}: FeedbackDialogProps) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState('');
  const [touched, setTouched] = useState(false);

  const isMentor = slot?.viewerRole === 'mentor';
  const rubric = isMentor ? MENTOR_RUBRIC : MENTEE_RUBRIC;

  const missing = useMemo(
    () => rubric.filter((criterion) => scores[criterion.key] === undefined),
    [rubric, scores]
  );

  const commentTooShort = comments.trim().length < MIN_COMMENT;
  const canSubmit = missing.length === 0 && !commentTooShort;

  const close = () => {
    setScores({});
    setComments('');
    setTouched(false);
    onClose();
  };

  const submit = async () => {
    setTouched(true);
    if (!slot || !canSubmit) return;
    await onSubmit(slot._id, scores, comments.trim());
    setScores({});
    setComments('');
    setTouched(false);
  };

  if (!slot) return null;

  const counterpart = isMentor ? slot.bookedBy?.name : slot.mentor.name;

  return (
    <Dialog
      open
      onClose={close}
      title={isMentor ? `How did ${counterpart ?? 'they'} do?` : `How was ${counterpart ?? 'the session'}?`}
      description={
        isMentor
          ? 'They will see this in full. Say the thing you would want said to you.'
          : 'Your mentor sees this. Being polite instead of specific helps nobody.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={pending}>
            Not now
          </Button>
          <Button onClick={submit} loading={pending} disabled={touched && !canSubmit}>
            Submit feedback
          </Button>
        </>
      }
    >
      {error && <Banner variant="danger">{error}</Banner>}

      <div className={styles.rubric}>
        {rubric.map((criterion) => (
          <div key={criterion.key} className={styles.rubricRow}>
            <div>
              <div className={styles.rubricLabel}>{criterion.label}</div>
              <p className={styles.rubricHelp} id={`help-${criterion.key}`}>
                {criterion.help}
              </p>
            </div>
            <RatingInput
              label={criterion.label}
              describedBy={`help-${criterion.key}`}
              value={scores[criterion.key] ?? null}
              onChange={(value) =>
                setScores((current) => ({ ...current, [criterion.key]: value }))
              }
            />
          </div>
        ))}
      </div>

      <Textarea
        label="What should they actually do differently?"
        placeholder="One thing that worked, one thing to fix. Specifics beat encouragement."
        value={comments}
        onChange={(event) => setComments(event.target.value)}
        maxLength={2000}
        showCount
        rows={5}
        error={touched && commentTooShort ? `Write at least ${MIN_COMMENT} characters.` : undefined}
      />

      {touched && missing.length > 0 && (
        <Banner variant="warning">
          Still to rate: {missing.map((criterion) => criterion.label).join(', ')}.
        </Banner>
      )}
    </Dialog>
  );
}
