'use client';

import { useState } from 'react';
import { Brain, Check, Flame, Newspaper, X } from 'lucide-react';
import Button, { LinkButton } from '@/components/ui/Button';
import { Avatar, Chip } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { useMe } from '@/lib/client/me';
import { cn } from '@/lib/utils';
import cs from '@/components/campus/campus.module.css';
import qs from './quiz.module.css';
import styles from '../app.module.css';

interface QuizData {
  day: string;
  source: 'ai' | 'bank';
  questions: Array<{ prompt: string; options: string[]; category: string; answerIndex?: number; explanation?: string }>;
  attempt: { answers: number[]; score: number } | null;
  leaderboard: Array<{ rank: number; user: { _id: string; name: string; image: string }; score: number }>;
  streak: number;
}

export default function QuizPage() {
  const toast = useToast();
  const { me } = useMe();
  const { data, refetch } = useApiQuery<QuizData>('/api/quiz');
  const [answers, setAnswers] = useState<number[]>([-1, -1, -1, -1, -1]);
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  if (!data) return <div className="skeleton" style={{ height: 420 }} />;
  const played = Boolean(data.attempt);
  const shown = played ? data.attempt!.answers : answers;

  const submit = async () => {
    setSubmitting(true);
    try {
      const { score } = await api.post<{ score: number }>('/api/quiz', { answers });
      toast.success(`${score} / 5`, score === 5 ? 'Perfect score!' : 'Explanations are below.');
      refetch();
    } catch (caught) {
      toast.error('Could not submit', errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stack gap-5" style={{ maxWidth: 760 }}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Daily quiz</h1>
          <p className={styles.pageSubtitle}>Five questions on business and current affairs. Same set for everyone today — one try.</p>
        </div>
        <div className="row gap-2">
          {data.streak > 0 && <Chip tone="amber" icon={<Flame size={12} />}>{data.streak}-day streak</Chip>}
          <LinkButton href="/briefing" variant="ghost" icon={<Newspaper size={15} />}>Briefing</LinkButton>
        </div>
      </div>

      {played && (
        <div className={qs.score}>
          <Brain size={22} />
          <strong>{data.attempt!.score} / 5</strong>
          <span className="muted">{data.attempt!.score === 5 ? 'Flawless.' : data.attempt!.score >= 3 ? 'Solid. Read the explanations for the rest.' : 'Tomorrow’s another one — the briefing helps.'}</span>
        </div>
      )}

      {!played && (
        <div className={qs.progress} aria-label={`Question ${current + 1} of 5`}>
          {data.questions.map((_, i) => <button key={i} className={cn(qs.dot, i === current && qs.dotCurrent, answers[i] >= 0 && qs.dotDone)} onClick={() => setCurrent(i)} aria-label={`Question ${i + 1}`} />)}
        </div>
      )}

      <div className="stack gap-4">
        {data.questions.map((q, i) => {
          if (!played && i !== current) return null;
          return (
            <section key={i} className={cn(cs.panel, qs.question)}>
              <div className="row gap-2"><span className="dim" style={{ fontWeight: 700 }}>Q{i + 1}</span><Chip>{q.category}</Chip></div>
              <h2 className={qs.prompt}>{q.prompt}</h2>
              <div className={qs.options} role="radiogroup" aria-label={`Answer to question ${i + 1}`}>
                {q.options.map((opt, j) => {
                  const chosen = shown[i] === j;
                  const correct = played && q.answerIndex === j;
                  const wrong = played && chosen && q.answerIndex !== j;
                  return (
                    <button key={j} role="radio" aria-checked={chosen} disabled={played}
                      className={cn(qs.option, chosen && !played && qs.optionChosen, correct && qs.optionCorrect, wrong && qs.optionWrong)}
                      onClick={() => {
                        setAnswers(answers.map((a, k) => (k === i ? j : a)));
                        if (i < 4) setTimeout(() => setCurrent(i + 1), 220);
                      }}>
                      <span className={qs.letter}>{'ABCD'[j]}</span>
                      <span style={{ flex: 1, textAlign: 'left' }}>{opt}</span>
                      {correct && <Check size={16} />}
                      {wrong && <X size={16} />}
                    </button>
                  );
                })}
              </div>
              {played && q.explanation && <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>{q.explanation}</p>}
            </section>
          );
        })}
      </div>

      {!played && (
        <div className="row gap-2">
          <Button variant="ghost" disabled={current === 0} onClick={() => setCurrent(current - 1)}>Back</Button>
          {current < 4 ? <Button variant="secondary" onClick={() => setCurrent(current + 1)}>Next</Button> : <Button onClick={submit} loading={submitting} disabled={answers.some((a) => a < 0)}>Submit answers</Button>}
          <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{answers.filter((a) => a >= 0).length}/5 answered</span>
        </div>
      )}

      {data.leaderboard.length > 0 && (
        <section className={cs.panel}>
          <strong>Today on campus</strong>
          {data.leaderboard.map((r) => (
            <div key={r.user._id} className={cs.rowItem} style={r.user._id === me?.id ? { fontWeight: 650 } : undefined}>
              <span style={{ width: 22 }} className="dim">{r.rank}</span>
              <Avatar name={r.user.name} image={r.user.image} seed={r.user._id} size={24} />
              <span style={{ flex: 1 }}>{r.user.name}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.score}/5</span>
            </div>
          ))}
        </section>
      )}
      <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{data.source === 'ai' ? 'Written from today’s briefing.' : 'From the evergreen question bank.'}</span>
    </div>
  );
}
