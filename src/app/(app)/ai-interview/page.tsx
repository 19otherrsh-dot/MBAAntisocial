'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BookOpen, CalendarClock, ClipboardCheck, RotateCcw, Send, Square } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Banner, Chip } from '@/components/ui/Display';
import { Input, Select } from '@/components/ui/Field';
import Markdown from '@/components/ui/Markdown';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage, notifyMutation } from '@/lib/client/api';
import { readTextStream } from '@/lib/client/stream';
import {
  ROLE_TRACKS,
  ROLE_TRACK_META,
  type RoleTrack,
  type RubricCriterion,
} from '@/lib/constants';
import { cn, pluralise } from '@/lib/utils';
import styles from '../app.module.css';
import chat from '../chat.module.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Debrief {
  scores: Record<string, number>;
  strengths: string[];
  improvements: string[];
  verdict: string;
}

interface PipelineLite {
  applications: Array<{ _id: string; company: string; track: RoleTrack; intelAvailable: number }>;
}

/** Answers needed before a scorecard means anything. Mirrors the API. */
const MIN_ANSWERS_FOR_DEBRIEF = 3;

export default function AIInterviewPage() {
  // `useSearchParams` needs a Suspense boundary to keep the route prerenderable.
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 420 }} />}>
      <Interview />
    </Suspense>
  );
}

function Interview() {
  const params = useSearchParams();
  const presetTrack = params.get('track');

  // `?company=Bain` deep-links from a pipeline card straight into practice.
  const [company, setCompany] = useState(params.get('company') ?? '');
  const [track, setTrack] = useState<RoleTrack>(
    (ROLE_TRACKS as readonly string[]).includes(presetTrack ?? '') ? (presetTrack as RoleTrack) : 'consulting'
  );

  const pipeline = useApiQuery<PipelineLite>('/api/applications', { stage: 'open' });

  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grounded, setGrounded] = useState(0);
  const [debrief, setDebrief] = useState<{ result: Debrief; rubric: RubricCriterion[] } | null>(null);
  const [scoring, setScoring] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const last = messages[messages.length - 1];
  const scrollKey = `${messages.length}:${last?.content.length ?? 0}:${debrief ? 1 : 0}`;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [scrollKey]);

  // Stop any in-flight reply if the page is left mid-answer.
  useEffect(() => () => abortRef.current?.abort(), []);

  /** Sends the conversation so far and streams the interviewer's next turn. */
  const ask = async (history: Message[]) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'interview', track, company: company.trim(), messages: history }),
        signal: controller.signal,
      });

      setGrounded(Number(response.headers.get('X-Grounded-Questions') ?? 0));

      await readTextStream(response, (text) => {
        setMessages([...history, { role: 'assistant', content: text }]);
      });
    } catch (caught) {
      // Stopping is the user's own choice, not an error to report.
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
        setError(errorMessage(caught) || 'The interviewer dropped off. Try again.');
      }
    } finally {
      setBusy(false);
      // The answer may have counted towards a quest; let the game layer look.
      notifyMutation();
    }
  };

  const start = () => {
    setStarted(true);
    setMessages([]);
    setDebrief(null);
    // An empty history tells the server to open the interview.
    void ask([]);
  };

  const send = () => {
    const content = input.trim();
    if (!content || busy) return;
    setInput('');
    const history: Message[] = [...messages, { role: 'user', content }];
    setMessages(history);
    void ask(history);
  };

  const finish = async () => {
    setScoring(true);
    setError(null);
    try {
      const result = await api.post<{ debrief: Debrief; rubric: RubricCriterion[] }>('/api/ai/interview', {
        mode: 'debrief',
        track,
        company: company.trim(),
        messages,
      });
      setDebrief({ result: result.debrief, rubric: result.rubric });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setScoring(false);
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setStarted(false);
    setMessages([]);
    setDebrief(null);
    setError(null);
    setGrounded(0);
  };

  const answered = messages.filter((message) => message.role === 'user').length;
  const applications = pipeline.data?.applications ?? [];

  if (!started) {
    return (
      <>
        <div className={styles.pageHead}>
          <div>
            <h2 className={styles.pageTitle}>AI mock interviewer</h2>
            <p className={styles.pageSubtitle}>
              Practise against the questions your own campus was asked — then book a senior for the real thing.
            </p>
          </div>
        </div>

        <div className={chat.setup}>
          <div>
            <h3 className={chat.setupTitle}>Who are you interviewing with?</h3>
            <p className={chat.setupBody}>
              Name a company and the interviewer draws on what your batch and seniors logged in
              Interview Intel after their rounds there. Leave it blank for a general round.
            </p>
          </div>

          {applications.length > 0 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 'var(--s-2)' }}>From your pipeline</div>
              <div className={chat.quickPicks}>
                {applications.slice(0, 6).map((application) => (
                  <button
                    key={application._id}
                    type="button"
                    className={cn(chat.quickPick, company === application.company && chat.quickPickActive)}
                    onClick={() => {
                      setCompany(application.company);
                      setTrack(application.track);
                    }}
                  >
                    {application.company}
                    {application.intelAvailable > 0 && (
                      <span className={chat.quickPickCount}>
                        {pluralise(application.intelAvailable, 'question')}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Input
            label="Company"
            placeholder="e.g. Bain & Company"
            value={company}
            maxLength={120}
            onChange={(event) => setCompany(event.target.value)}
            optional
          />

          <Select
            label="Role track"
            value={track}
            onChange={(event) => setTrack(event.target.value as RoleTrack)}
            options={ROLE_TRACKS.map((value) => ({ value, label: ROLE_TRACK_META[value].label }))}
          />

          <Button size="lg" fullWidth onClick={start}>
            Start the interview
          </Button>

          <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>
            It will not hand you answers, and it will say when one was weak. Answer three or more
            questions to get a scorecard on the same rubric your seniors use.
          </p>
        </div>
      </>
    );
  }

  return (
    <div className={cn(chat.shell, chat.shellSingle)}>
      <section className={chat.thread}>
        <header className={chat.threadHead}>
          <div>
            <div className={chat.threadTitle}>
              {company.trim() ? `${company.trim()} · ` : ''}
              {ROLE_TRACK_META[track].label}
            </div>
            <div className={chat.threadSub}>Mock interview · {pluralise(answered, 'answer')} so far</div>
          </div>
          <div className={chat.threadHeadPush}>
            {grounded > 0 && (
              <Chip
                tone="violet"
                icon={<BookOpen size={12} />}
                title="The interviewer is drawing on questions logged in Interview Intel"
              >
                {pluralise(grounded, 'question')} from your campus
              </Chip>
            )}
            <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={reset}>
              New
            </Button>
          </div>
        </header>

        <div className={chat.stream} aria-live="polite">
          {messages.map((message, index) => (
            <div key={index} className={cn(chat.msg, message.role === 'user' && chat.msgMine)}>
              {message.role === 'assistant' && <span className={chat.msgAuthor}>Interviewer</span>}
              <div className={chat.bubble}>
                {message.role === 'assistant' ? (
                  <Markdown className={chat.prose}>{message.content}</Markdown>
                ) : (
                  message.content
                )}
              </div>
            </div>
          ))}

          {busy && last?.role !== 'assistant' && (
            <div className={chat.msg}>
              <span className={chat.msgAuthor}>Interviewer</span>
              <div className={chat.bubble}>
                <span className={chat.typing} aria-label="Thinking">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            </div>
          )}

          {error && (
            <Banner
              variant="danger"
              action={
                !debrief && (
                  <Button size="sm" variant="secondary" onClick={() => void ask(messages)}>
                    Try again
                  </Button>
                )
              }
            >
              {error}
            </Banner>
          )}

          {debrief && <Scorecard debrief={debrief.result} rubric={debrief.rubric} company={company.trim()} onReset={reset} />}

          <div ref={endRef} />
        </div>

        {!debrief && (
          <form
            className={chat.composer}
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <textarea
              className={chat.composerInput}
              rows={2}
              value={input}
              maxLength={4000}
              placeholder="Answer as you would in the room"
              aria-label="Your answer"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            {busy ? (
              <Button type="button" variant="secondary" icon={<Square size={14} />} onClick={() => abortRef.current?.abort()}>
                Stop
              </Button>
            ) : (
              <Button type="submit" icon={<Send size={16} />} disabled={!input.trim()}>
                Send
              </Button>
            )}
            {answered >= MIN_ANSWERS_FOR_DEBRIEF && !busy && (
              <Button
                type="button"
                variant="soft"
                icon={<ClipboardCheck size={16} />}
                loading={scoring}
                onClick={finish}
              >
                Finish
              </Button>
            )}
          </form>
        )}
      </section>
    </div>
  );
}

function Scorecard({
  debrief,
  rubric,
  company,
  onReset,
}: {
  debrief: Debrief;
  rubric: RubricCriterion[];
  company: string;
  onReset: () => void;
}) {
  return (
    <div className={cn(chat.scorecard, 'animate-rise')}>
      <div>
        <div className={chat.scoreTitle}>Your scorecard</div>
        <p className={chat.scoreVerdict}>{debrief.verdict}</p>
      </div>

      <div className={chat.scoreGrid}>
        {rubric.map((criterion) => {
          const score = debrief.scores[criterion.key] ?? 0;
          return (
            <div key={criterion.key} className={chat.scoreCell} title={criterion.help}>
              <div className={chat.scoreLabel}>{criterion.label}</div>
              <div className={chat.scoreValue}>
                {score}
                <small>/5</small>
              </div>
              <div className={chat.scoreBar}>
                <div className={chat.scoreBarFill} style={{ width: `${(score / 5) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className={chat.scoreLists}>
        <div>
          <div className={chat.scoreListHead}>What worked</div>
          <ul className={chat.scoreList}>
            {debrief.strengths.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className={chat.scoreListHead}>Fix before the real one</div>
          <ul className={chat.scoreList}>
            {debrief.improvements.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* The AI is a warm-up. The point of the product is the senior. */}
      <div className={chat.scoreActions}>
        <Link href="/sessions">
          <Button icon={<CalendarClock size={16} />}>Book a senior for the real thing</Button>
        </Link>
        {company && (
          <Link href={`/intel?company=${encodeURIComponent(company)}`}>
            <Button variant="secondary" icon={<BookOpen size={16} />}>
              See what was asked at {company}
            </Button>
          </Link>
        )}
        <Button variant="ghost" icon={<RotateCcw size={16} />} onClick={onReset}>
          Go again
        </Button>
      </div>
    </div>
  );
}
