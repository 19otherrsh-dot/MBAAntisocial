'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Bot, Square, RotateCcw, ClipboardCheck, Users, Mic } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Avatar, Banner, Chip, Segmented, Stat } from '@/components/ui/Display';
import { useMe } from '@/lib/client/me';
import { api, errorMessage } from '@/lib/client/api';
import { streamText } from '@/lib/client/stream';
import { ROLE_TRACKS, ROLE_TRACK_META, type RoleTrack } from '@/lib/constants';
import { cn } from '@/lib/utils';
import styles from '../app.module.css';
import Markdown from '@/components/Markdown';

type Mode = 'interview' | 'gd';
type Style = 'case' | 'personal' | 'behavioural' | 'technical' | 'guesstimate';
interface Turn {
  role: 'user' | 'assistant';
  content: string;
}
interface Scorecard {
  overall: number;
  summary: string;
  dimensions: Array<{ name: string; score: number; evidence: string }>;
  strengths: string[];
  fixes: string[];
  drill: string;
}

const STYLES: Array<{ value: Style; label: string; blurb: string }> = [
  { value: 'personal', label: 'Personal interview', blurb: '“Walk me through your CV” and everything after.' },
  { value: 'case', label: 'Case interview', blurb: 'A structured business problem, interviewer-led.' },
  { value: 'behavioural', label: 'Behavioural', blurb: 'Leadership, conflict, failure — STAR-style probing.' },
  { value: 'technical', label: 'Domain technical', blurb: 'Fundamentals for your chosen track.' },
  { value: 'guesstimate', label: 'Guesstimate', blurb: 'Market sizing under time pressure.' },
];

const GD_SUGGESTIONS = [
  'Should India adopt a four-day work week?',
  'Quick commerce: convenience or bubble?',
  'Is the MBA still worth it in the age of AI?',
  'Gig workers deserve full employment protections.',
];

/**
 * AI practice — a fallback when no senior is free (§6.1 V3), never a
 * replacement. One-on-one interviews or a simulated GD group, both ending in
 * a structured scorecard.
 */
export default function PracticePage() {
  const { me } = useMe();
  const [mode, setMode] = useState<Mode>('interview');
  const [track, setTrack] = useState<RoleTrack>('consulting');
  const [style, setStyle] = useState<Style>('personal');
  const [company, setCompany] = useState('');
  const [topic, setTopic] = useState(GD_SUGGESTIONS[0]);
  const [started, setStarted] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [scoring, setScoring] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  const send = async (history: Turn[]) => {
    setStreaming(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setTurns([...history, { role: 'assistant', content: '' }]);
    try {
      const url = mode === 'interview' ? '/api/ai/interview' : '/api/ai/gd';
      const body = mode === 'interview' ? { messages: history, track, style, company: company || undefined } : { messages: history, topic };
      await streamText(url, body, (text) => setTurns([...history, { role: 'assistant', content: text }]), controller.signal);
    } catch (caught) {
      if ((caught as Error).name !== 'AbortError') {
        setError(errorMessage(caught));
        setTurns(history);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const start = () => {
    setStarted(true);
    setScorecard(null);
    void send([]);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    void send([...turns.filter((t) => t.content), { role: 'user', content: text }]);
  };

  const finish = async () => {
    setScoring(true);
    setError(null);
    try {
      const transcript = turns.filter((t) => t.content).slice(-80);
      const { scorecard: card } = await api.post<{ scorecard: Scorecard }>('/api/ai/scorecard', { kind: mode, transcript });
      setScorecard(card);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setScoring(false);
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setStarted(false);
    setTurns([]);
    setScorecard(null);
    setError(null);
  };

  const userTurns = turns.filter((t) => t.role === 'user').length;

  if (!started) {
    return (
      <>
        <div>
          <h2 className={styles.pageTitle}>AI practice</h2>
          <p className={styles.pageSubtitle}>
            When no senior is free tonight. It pushes back, never hands you the answer, and scores you at the end.
          </p>
        </div>

        <section className={styles.settingsGroup}>
          <Segmented
            ariaLabel="Practice mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'interview' as const, label: 'Interview', icon: <Mic size={14} /> },
              { value: 'gd' as const, label: 'Group discussion', icon: <Users size={14} /> },
            ]}
          />

          {mode === 'interview' ? (
            <>
              <div className={styles.checkGrid}>
                {STYLES.map((s) => (
                  <button key={s.value} type="button" aria-pressed={style === s.value} className={cn(styles.checkTile, style === s.value && styles.checkTileActive)} onClick={() => setStyle(s.value)} title={s.blurb}>
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>{STYLES.find((s) => s.value === style)?.blurb}</p>
              <div className="row gap-3 wrap">
                <Select label="Track" value={track} onChange={(e) => setTrack(e.target.value as RoleTrack)} options={ROLE_TRACKS.map((t) => ({ value: t, label: ROLE_TRACK_META[t].label }))} />
                <Input label="Firm (optional)" placeholder="e.g. Bain, HUL, Goldman" value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <Textarea label="Topic" rows={2} value={topic} onChange={(e) => setTopic(e.target.value)} />
              <div className="row gap-2 wrap">
                {GD_SUGGESTIONS.map((t) => <Chip key={t} outline className="clickable" title="Use this topic"><button type="button" onClick={() => setTopic(t)}>{t}</button></Chip>)}
              </div>
              <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>
                Four AI participants with distinct styles — the data-heavy one, the consensus-builder, the contrarian, the quiet closer.
              </p>
            </>
          )}

          <div className="row gap-3 wrap">
            <Button size="lg" icon={<Bot size={16} />} onClick={start} disabled={mode === 'gd' && topic.trim().length < 5}>
              {mode === 'interview' ? 'Start the interview' : 'Start the GD'}
            </Button>
            <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>Practice only — say “end {mode === 'gd' ? 'gd' : 'interview'}” any time for a verbal debrief.</span>
          </div>
        </section>
      </>
    );
  }

  return (
    <div className={styles.chatPage}>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>{mode === 'interview' ? STYLES.find((s) => s.value === style)?.label : 'Group discussion'}</h2>
          <p className={styles.pageSubtitle}>
            {mode === 'interview' ? `${ROLE_TRACK_META[track].label}${company ? ` · ${company}` : ''}` : topic}
          </p>
        </div>
        <div className="row gap-2 wrap">
          {streaming && <Button variant="soft" icon={<Square size={14} />} onClick={() => abortRef.current?.abort()}>Stop</Button>}
          <Button variant="secondary" icon={<ClipboardCheck size={16} />} onClick={finish} loading={scoring} disabled={userTurns < 2 || streaming}>
            End & score me
          </Button>
          <Button variant="ghost" icon={<RotateCcw size={16} />} onClick={reset}>New session</Button>
        </div>
      </div>

      {error && <Banner variant="danger">{error}</Banner>}

      {scorecard && <ScorecardView card={scorecard} />}

      <div className={styles.chatLog}>
        {turns.map((turn, i) => (
          <div key={i} className={cn(styles.chatRow, turn.role === 'user' && styles.chatRowMine)}>
            {turn.role === 'assistant' ? <span className={styles.chatBot}><Bot size={16} /></span> : <Avatar name={me?.name ?? 'You'} image={me?.image} seed={me?.id} size={30} />}
            <div className={cn(styles.chatBubble, turn.role === 'user' && styles.chatBubbleMine)}>
              {turn.content ? <Markdown text={turn.content} /> : <span className="dim">Thinking…</span>}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form className={styles.chatComposer} onSubmit={submit}>
        <textarea
          className={styles.chatInput}
          rows={2}
          placeholder={mode === 'gd' ? 'Make your point…' : 'Your answer…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(e);
            }
          }}
          disabled={streaming}
          maxLength={4000}
        />
        <Button type="submit" icon={<Send size={16} />} disabled={!input.trim() || streaming} aria-label="Send" />
      </form>
    </div>
  );
}

function ScorecardView({ card }: { card: Scorecard }) {
  return (
    <section className={styles.settingsGroup}>
      <div className="between gap-3 wrap">
        <h3 className={styles.settingsTitle}>Scorecard</h3>
        <Stat value={`${card.overall}/10`} label="Overall" tone={card.overall >= 7 ? 'teal' : card.overall >= 5 ? 'amber' : 'rose'} />
      </div>
      <p>{card.summary}</p>
      <div className={styles.feedbackScores}>
        {card.dimensions.map((d) => (
          <span key={d.name} className={styles.feedbackScore} title={d.evidence}>
            {d.name}<span className={styles.feedbackScoreValue}>{d.score}/5</span>
          </span>
        ))}
      </div>
      <div className="row gap-6 wrap" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <span className="eyebrow">What worked</span>
          <ul className={styles.templatePrompts} style={{ listStyle: 'disc' }}>{card.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <span className="eyebrow">Fix next</span>
          <ul className={styles.templatePrompts} style={{ listStyle: 'disc' }}>{card.fixes.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      </div>
      <Banner variant="info" title="Tomorrow’s drill">{card.drill}</Banner>
      <p className="dim" style={{ fontSize: 'var(--t-xs)' }}>An AI’s read, not a verdict. Book a senior to pressure-test it.</p>
    </section>
  );
}
