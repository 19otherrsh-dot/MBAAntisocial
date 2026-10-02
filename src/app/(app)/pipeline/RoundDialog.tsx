'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Trash2 } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Banner, Chip } from '@/components/ui/Display';
import { api } from '@/lib/client/api';
import {
  ROUND_TYPES,
  ROUND_TYPE_META,
  ROUND_OUTCOMES,
  ROUND_OUTCOME_META,
  SESSION_TYPE_META,
} from '@/lib/constants';
import { toDateTimeLocalValue } from '@/lib/utils';
import type { Application, Round } from './types';
import styles from '../app.module.css';

interface RoundDialogProps {
  application: Application;
  /** Null when adding a new round. */
  round: Round | null;
  onClose: () => void;
  /** `promptIntel` is true when the save concluded a round worth debriefing. */
  onDone: (result: { round: Round; promptIntel: boolean }) => void;
}

export default function RoundDialog({ application, round, onClose, onDone }: RoundDialogProps) {
  const isNew = round === null;

  const [type, setType] = useState(round?.type ?? 'case');
  const [label, setLabel] = useState(round?.label ?? '');
  const [scheduledAt, setScheduledAt] = useState(
    round?.scheduledAt ? toDateTimeLocalValue(new Date(round.scheduledAt)) : ''
  );
  const [outcome, setOutcome] = useState(round?.outcome ?? 'pending');
  const [notes, setNotes] = useState(round?.notes ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = ROUND_TYPE_META[type];

  const save = async () => {
    setPending(true);
    setError(null);

    try {
      const body = isNew
        ? {
            action: 'add' as const,
            type,
            label: label.trim(),
            scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          }
        : {
            action: 'update' as const,
            roundId: round._id,
            label: label.trim(),
            scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
            outcome,
            notes: notes.trim(),
          };

      const result = await api.patch<{ round: Round; promptForIntel?: boolean }>(
        `/api/applications/${application._id}/rounds`,
        body
      );

      onDone({ round: result.round, promptIntel: Boolean(result.promptForIntel) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that.');
      setPending(false);
    }
  };

  const remove = async () => {
    if (isNew) return;
    setPending(true);
    try {
      await api.patch(`/api/applications/${application._id}/rounds`, {
        action: 'remove',
        roundId: round._id,
      });
      onDone({ round, promptIntel: false });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove that.');
      setPending(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={isNew ? `Add a round at ${application.company}` : ROUND_TYPE_META[round.type].label}
      description={application.role}
      footer={
        <>
          {!isNew && (
            <Button
              variant="dangerGhost"
              onClick={remove}
              disabled={pending}
              icon={<Trash2 size={15} />}
            >
              Remove
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} loading={pending}>
            {isNew ? 'Add round' : 'Save'}
          </Button>
        </>
      }
    >
      {error && <Banner variant="danger">{error}</Banner>}

      {isNew && (
        <Select
          label="Which round"
          value={type}
          onChange={(event) => setType(event.target.value as typeof type)}
          options={ROUND_TYPES.map((value) => ({ value, label: ROUND_TYPE_META[value].label }))}
        />
      )}

      <Input
        label="Call it something else"
        placeholder={isNew ? 'Partner round' : ROUND_TYPE_META[type].label}
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        maxLength={80}
        optional
      />

      <Input
        label="When"
        type="datetime-local"
        value={scheduledAt}
        onChange={(event) => setScheduledAt(event.target.value)}
        optional
        hint="A date here writes a deadline into your task list."
      />

      {!isNew && (
        <>
          <Select
            label="How did it go"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as typeof outcome)}
            options={ROUND_OUTCOMES.map((value) => ({
              value,
              label: ROUND_OUTCOME_META[value].label,
            }))}
            hint="Marking this anything but 'not yet' opens the debrief."
          />

          <Textarea
            label="Your notes"
            placeholder="Panel of two. Went hard on the market-sizing and barely touched the resume."
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={2000}
            rows={3}
            optional
            hint="Private to you. The shared question bank is a separate, deliberate step."
          />
        </>
      )}

      {/* The strongest booking trigger in the product: a real round, on a real
          date, with the matching practice type one tap away. */}
      {meta.practiceWith && outcome === 'pending' && (
        <div className={styles.qGuidance}>
          <span className={styles.qGuidanceLabel}>Prepare for it</span>
          <div className="row gap-3 wrap">
            <span style={{ fontSize: 'var(--t-sm)' }}>
              A {SESSION_TYPE_META[meta.practiceWith].label.toLowerCase()} with a senior is the
              closest thing to the real round.
            </span>
            <Link href={`/sessions?type=${meta.practiceWith}`}>
              <Button size="sm" variant="secondary" icon={<CalendarClock size={14} />}>
                Find a slot
              </Button>
            </Link>
          </div>
        </div>
      )}

      {application.intelAvailable > 0 && (
        <div className="row gap-2 wrap">
          <Chip tone="violet">{application.intelAvailable} logged</Chip>
          <Link
            href={`/intel?company=${encodeURIComponent(application.company)}`}
            style={{ fontSize: 'var(--t-sm)', color: 'var(--accent-text)', fontWeight: 550 }}
          >
            See what {application.company} has asked before
          </Link>
        </div>
      )}
    </Dialog>
  );
}
