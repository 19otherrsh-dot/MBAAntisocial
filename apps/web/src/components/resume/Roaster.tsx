'use client';

import { useRef, useState } from 'react';
import { FileText, Flame, RotateCcw, Square, UploadCloud } from 'lucide-react';
import { RESUME_LIMITS, resumeToText } from '@mba/shared/resume';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Banner, Segmented } from '@/components/ui/Display';
import Markdown from '@/components/Markdown';
import { api, errorMessage } from '@/lib/client/api';
import { streamText } from '@/lib/client/stream';
import { uploadFile } from '@/lib/client/upload';
import type { ResumeDoc } from './Builder';
import styles from './resume.module.css';

type Source = 'built' | 'pdf';
const MAX_PDF_BYTES = 8 * 1024 * 1024;

/**
 * The teardown: of the resume built here (sent as text) or of any PDF. The
 * review streams in as it is written, and can be stopped at any point.
 */
interface RoasterProps {
  initialTarget: string;
  /** The builder's live draft, including edits not yet autosaved. */
  getDraft: () => ResumeDoc | null;
  onEdit: () => void;
}

export default function Roaster({ initialTarget, getDraft, onEdit }: RoasterProps) {
  const [source, setSource] = useState<Source>('built');
  const [target, setTarget] = useState(initialTarget);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'reading' | 'streaming' | 'done'>('idle');
  const [review, setReview] = useState('');
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);

  const busy = phase === 'uploading' || phase === 'reading' || phase === 'streaming';

  const run = async () => {
    setError('');
    setReview('');
    const controller = new AbortController();
    abort.current = controller;
    let streamed = '';
    try {
      let body: { text: string; target: string } | { pdfUrl: string; target: string };
      if (source === 'pdf') {
        if (!file) return;
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) throw new Error('That file is not a PDF.');
        if (file.size > MAX_PDF_BYTES) throw new Error('Keep it under 8 MB — a one-page resume is far smaller.');
        setPhase('uploading');
        const uploaded = await uploadFile(file, 'resumes');
        body = { pdfUrl: uploaded.url, target };
      } else {
        setPhase('reading');
        const draft = getDraft() ?? (await api.get<ResumeDoc>('/api/resume'));
        const text = resumeToText(draft.data);
        if (text.length < 80) throw new Error('There is not enough on your resume yet. Add a role or two in Build first.');
        body = { text, target };
      }
      setPhase('streaming');
      await streamText('/api/ai/roast', body, (text) => {
        streamed = text;
        setReview(text);
      }, controller.signal);
      setPhase('done');
    } catch (caught) {
      const message = errorMessage(caught);
      // A stop is not an error: keep whatever streamed in.
      if (controller.signal.aborted) setPhase('done');
      else {
        setError(message || 'The review failed. Try again.');
        setPhase(streamed ? 'done' : 'idle');
      }
    } finally {
      abort.current = null;
    }
  };

  const stop = () => abort.current?.abort();

  return (
    <div className={styles.roaster}>
      <section className={styles.card}>
        <div className={styles.roastControls}>
          <Segmented
            ariaLabel="What to review"
            value={source}
            onChange={(value) => {
              setSource(value);
              setError('');
            }}
            options={[
              { value: 'built', label: 'My built resume', icon: <FileText size={14} /> },
              { value: 'pdf', label: 'Upload a PDF', icon: <UploadCloud size={14} /> },
            ]}
          />
          <div className={styles.targetField}>
            <Input label="Targeting" optional placeholder="e.g. Consulting" maxLength={RESUME_LIMITS.target} value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
        </div>

        {source === 'pdf' && (
          <label className={styles.drop}>
            <input
              type="file"
              accept="application/pdf,.pdf"
              className={styles.dropInput}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <UploadCloud size={22} />
            <span>{file ? file.name : 'Choose a PDF, or drop it here'}</span>
            <span className="dim">PDF, up to 8 MB. Layout and formatting get reviewed too.</span>
          </label>
        )}

        <div className="row gap-2 wrap">
          {busy ? (
            <Button variant="secondary" icon={<Square size={14} />} onClick={stop} disabled={phase !== 'streaming'}>
              {phase === 'uploading' ? 'Uploading…' : phase === 'reading' ? 'Reading…' : 'Stop'}
            </Button>
          ) : (
            <Button icon={review ? <RotateCcw size={15} /> : <Flame size={15} />} onClick={run} disabled={source === 'pdf' && !file}>
              {review ? 'Roast again' : 'Roast it'}
            </Button>
          )}
          {source === 'built' && !busy && (
            <Button variant="ghost" onClick={onEdit}>Back to editing</Button>
          )}
        </div>
        <p className={styles.note}>Blunt about the writing, never about you. An AI’s read — run the big calls past a senior.</p>
      </section>

      {error && <Banner variant="danger" title="That didn’t work">{error}</Banner>}

      {(review || phase === 'streaming') && (
        <section className={styles.card} aria-live="polite" aria-busy={phase === 'streaming'}>
          {review ? <Markdown text={review} /> : <p className="dim">Reading it the way a recruiter would…</p>}
        </section>
      )}
    </div>
  );
}
