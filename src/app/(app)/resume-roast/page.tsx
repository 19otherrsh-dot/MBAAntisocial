'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, FileText, Flame, RotateCcw, Square } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Banner, Segmented } from '@/components/ui/Display';
import Markdown from '@/components/ui/Markdown';
import { errorMessage } from '@/lib/client/api';
import { readTextStream } from '@/lib/client/stream';
import { MAX_DIRECT_UPLOAD_BYTES } from '@/lib/constants';
import { cn, formatFileSize } from '@/lib/utils';
import styles from '../app.module.css';
import chat from '../chat.module.css';

type Intensity = 'gentle' | 'honest' | 'savage';

const INTENSITY_NOTE: Record<Intensity, string> = {
  gentle: 'Kind but direct. The fixes that matter most, without the bruising.',
  honest: 'What a tired recruiter actually thinks, with no padding.',
  savage: 'No mercy for the bullets. It roasts the writing, never you.',
};

const MAX_MB = Math.round(MAX_DIRECT_UPLOAD_BYTES / 1_048_576);

export default function ResumeRoastPage() {
  const [file, setFile] = useState<File | null>(null);
  const [intensity, setIntensity] = useState<Intensity>('honest');
  const [roast, setRoast] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const roastLength = roast.length;
  useEffect(() => {
    if (busy) endRef.current?.scrollIntoView({ block: 'end' });
  }, [roastLength, busy]);

  const pick = (next: File | null) => {
    setError(null);
    if (next && next.size > MAX_DIRECT_UPLOAD_BYTES) {
      setFile(null);
      setError(`That PDF is ${formatFileSize(next.size)}. Keep it under ${MAX_MB} MB — export without embedded images.`);
      return;
    }
    setFile(next);
  };

  const start = async () => {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setRoast('');

    try {
      // Sent straight to the roast endpoint, read in memory, and discarded.
      const form = new FormData();
      form.append('file', file);
      form.append('intensity', intensity);

      const response = await fetch('/api/ai/roast', { method: 'POST', body: form, signal: controller.signal });
      await readTextStream(response, setRoast);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
        setError(errorMessage(caught) || 'The roaster gave up. Try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setRoast('');
    setFile(null);
    setError(null);
  };

  const showResult = busy || roast.length > 0;

  if (!showResult) {
    return (
      <>
        <div className={styles.pageHead}>
          <div>
            <h2 className={styles.pageTitle}>Resume roast</h2>
            <p className={styles.pageSubtitle}>
              A line-by-line teardown before a recruiter does it for real — and silently.
            </p>
          </div>
        </div>

        <div className={chat.setup}>
          <div>
            <h3 className={chat.setupTitle}>Upload your resume</h3>
            <p className={chat.setupBody}>
              It gets read once and is not kept — there is no copy of your resume on our side after
              the roast finishes.
            </p>
          </div>

          {error && <Banner variant="danger">{error}</Banner>}

          <div className="stack gap-2">
            <input
              id="resume-file"
              type="file"
              accept="application/pdf,.pdf"
              aria-label="Resume PDF"
              onChange={(event) => pick(event.target.files?.[0] ?? null)}
              style={{
                padding: 'var(--s-5)',
                border: '2px dashed var(--line-strong)',
                borderRadius: 'var(--r-md)',
                background: 'var(--bg-sunken)',
                color: 'var(--text)',
                fontSize: 'var(--t-sm)',
                width: '100%',
                cursor: 'pointer',
              }}
            />
            <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>
              PDF, up to {MAX_MB} MB. Exported from a document, not a scan.
            </span>
          </div>

          <div className="stack gap-2">
            <span style={{ fontSize: 'var(--t-sm)', fontWeight: 560 }}>How hard?</span>
            <Segmented
              ariaLabel="Roast intensity"
              value={intensity}
              onChange={setIntensity}
              options={[
                { value: 'gentle' as const, label: 'Gentle' },
                { value: 'honest' as const, label: 'Honest' },
                { value: 'savage' as const, label: 'Savage' },
              ]}
            />
            <span className="dim" style={{ fontSize: 'var(--t-sm)' }}>{INTENSITY_NOTE[intensity]}</span>
          </div>

          <Button size="lg" fullWidth icon={<Flame size={16} />} disabled={!file} onClick={start}>
            Roast it
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className={cn(chat.shell, chat.shellSingle)}>
      <section className={chat.thread}>
        <header className={chat.threadHead}>
          <FileText size={18} aria-hidden />
          <div>
            <div className={chat.threadTitle}>{file?.name ?? 'Your resume'}</div>
            <div className={chat.threadSub}>
              {busy ? 'Reading… and wincing' : 'Roast complete'} · {intensity}
            </div>
          </div>
          <div className={chat.threadHeadPush}>
            {busy ? (
              <Button size="sm" variant="secondary" icon={<Square size={14} />} onClick={() => abortRef.current?.abort()}>
                Stop
              </Button>
            ) : (
              <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={reset}>
                Another
              </Button>
            )}
          </div>
        </header>

        <div className={chat.document} aria-live="polite">
          {roast ? (
            <Markdown className={chat.prose}>{roast}</Markdown>
          ) : (
            <span className={chat.typing} aria-label="Reading your resume">
              <span />
              <span />
              <span />
            </span>
          )}

          {error && (
            <Banner variant="danger" className="animate-rise">
              {error}
            </Banner>
          )}

          {!busy && roast && (
            <div className={chat.scoreActions} style={{ marginTop: 'var(--s-6)' }}>
              <Link href="/sessions?sessionType=resume_review">
                <Button icon={<CalendarClock size={16} />}>Get a senior to review the rewrite</Button>
              </Link>
              <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={reset}>
                Roast another version
              </Button>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </section>
    </div>
  );
}
