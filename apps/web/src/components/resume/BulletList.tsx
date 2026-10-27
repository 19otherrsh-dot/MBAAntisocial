'use client';

import { useRef, useState } from 'react';
import { Plus, Sparkles, X } from 'lucide-react';
import { BULLET_HINT_LABEL, RESUME_LIMITS, bulletHints } from '@mba/shared/resume';
import Button from '@/components/ui/Button';
import { api, errorMessage } from '@/lib/client/api';
import { cn } from '@/lib/utils';
import styles from './resume.module.css';

interface Suggestion {
  index: number;
  loading: boolean;
  options: string[];
  missing: string;
  error: string;
}

interface BulletListProps {
  items: string[];
  onChange: (items: string[]) => void;
  /** Context for the AI rewrite: the role or title the bullets sit under. */
  role?: string;
  target: string;
  placeholder?: string;
  max?: number;
  /** "Improve with AI" is offered only where a rewrite makes sense. */
  improvable?: boolean;
  label: string;
}

/**
 * Bullets as a keyboard-first list: Enter starts the next bullet, Backspace on
 * an empty one removes it. Offline hints run on every keystroke; the AI
 * rewrite is one click away and never replaces text without a choice.
 */
export default function BulletList({ items, onChange, role = '', target, placeholder, max = RESUME_LIMITS.bullets, improvable = true, label }: BulletListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  const focusAt = (index: number, atEnd = true) => {
    requestAnimationFrame(() => {
      const field = listRef.current?.querySelectorAll('textarea')[index];
      if (!field) return;
      field.focus();
      if (atEnd) field.setSelectionRange(field.value.length, field.value.length);
    });
  };

  const set = (index: number, value: string) => onChange(items.map((item, i) => (i === index ? value : item)));

  const insertAfter = (index: number) => {
    if (items.length >= max) return;
    onChange([...items.slice(0, index + 1), '', ...items.slice(index + 1)]);
    focusAt(index + 1);
  };

  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
    if (suggestion?.index === index) setSuggestion(null);
    if (index > 0) focusAt(index - 1);
  };

  const improve = async (index: number) => {
    const bullet = items[index]?.trim() ?? '';
    if (bullet.length < 8) return;
    setSuggestion({ index, loading: true, options: [], missing: '', error: '' });
    try {
      const result = await api.post<{ options: string[]; missing: string }>('/api/ai/bullet', { bullet, role, target });
      setSuggestion({ index, loading: false, options: result.options, missing: result.missing, error: '' });
    } catch (caught) {
      setSuggestion({ index, loading: false, options: [], missing: '', error: errorMessage(caught) });
    }
  };

  const accept = (index: number, text: string) => {
    set(index, text.slice(0, RESUME_LIMITS.line));
    setSuggestion(null);
    focusAt(index);
  };

  return (
    <div className={styles.bullets} ref={listRef} role="group" aria-label={label}>
      {items.map((item, index) => {
        const hints = bulletHints(item);
        const open = suggestion?.index === index ? suggestion : null;
        return (
          <div key={index} className={styles.bulletRow}>
            <div className={styles.bulletLine}>
              <span className={styles.bulletDot} aria-hidden>•</span>
              <textarea
                className={styles.bulletInput}
                value={item}
                rows={1}
                maxLength={RESUME_LIMITS.line}
                placeholder={placeholder}
                aria-label={`${label} ${index + 1}`}
                onChange={(event) => set(index, event.target.value.replace(/\n/g, ' '))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    insertAfter(index);
                  } else if (event.key === 'Backspace' && item === '' && items.length > 1) {
                    event.preventDefault();
                    remove(index);
                  }
                }}
              />
              {improvable && (
                <button
                  type="button"
                  className={styles.iconButton}
                  title="Rewrite with AI"
                  aria-label={`Rewrite ${label.toLowerCase()} ${index + 1} with AI`}
                  disabled={item.trim().length < 8 || open?.loading}
                  onClick={() => improve(index)}
                >
                  <Sparkles size={15} />
                </button>
              )}
              <button type="button" className={styles.iconButton} aria-label={`Remove ${label.toLowerCase()} ${index + 1}`} onClick={() => remove(index)}>
                <X size={15} />
              </button>
            </div>

            {hints.length > 0 && (
              <div className={styles.hints}>
                {hints.map((hint) => (
                  <span key={hint} className={styles.hint}>{BULLET_HINT_LABEL[hint]}</span>
                ))}
              </div>
            )}

            {open && (
              <div className={styles.suggest} aria-live="polite">
                {open.loading && <p className="dim">Rewriting…</p>}
                {open.error && <p className={styles.suggestError}>{open.error}</p>}
                {open.options.map((option, i) => (
                  <button key={i} type="button" className={styles.suggestOption} onClick={() => accept(index, option)}>
                    {option}
                  </button>
                ))}
                {open.missing && <p className={styles.suggestNote}>{open.missing}</p>}
                {!open.loading && (
                  <button type="button" className={styles.suggestDismiss} onClick={() => setSuggestion(null)}>
                    Keep mine
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        icon={<Plus size={14} />}
        className={cn(styles.addBullet)}
        disabled={items.length >= max}
        onClick={() => {
          onChange([...items, '']);
          focusAt(items.length);
        }}
      >
        {items.length >= max ? `${max} is the most that fits` : `Add ${label.toLowerCase()}`}
      </Button>
    </div>
  );
}
