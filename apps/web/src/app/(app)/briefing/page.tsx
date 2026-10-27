'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Brain, CheckCircle2, ExternalLink, MessagesSquare, Newspaper } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Chip, EmptyState } from '@/components/ui/Display';
import { Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api } from '@/lib/client/api';
import { formatDate, timeAgo } from '@/lib/utils';
import cs from '@/components/campus/campus.module.css';
import styles from '../app.module.css';

interface Story { _id: string; title: string; url: string; source: string; publishedAt: string; summary: string; whyItMatters: string; gdAngle: string; category: string; tags: string[] }

export default function BriefingPage() {
  const toast = useToast();
  const [day, setDay] = useState<string | undefined>(undefined);
  const [done, setDone] = useState(false);
  const { data } = useApiQuery<{ day: string; today: string; days: string[]; items: Story[] }>('/api/briefing', { day });

  const finish = async () => {
    const { points } = await api.post<{ points: number }>('/api/briefing').catch(() => ({ points: 0 }));
    setDone(true);
    toast.success('Briefing done', points ? `+${points} points` : 'See you tomorrow.');
  };

  return (
    <div className="stack gap-5" style={{ maxWidth: 820 }}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Daily briefing</h1>
          <p className={styles.pageSubtitle}>The business news worth knowing for GDs and interviews, in five minutes — with why it matters and a debate to rehearse.</p>
        </div>
        <div className="row gap-2">
          {data && data.days.length > 1 && <Select aria-label="Day" value={data.day} onChange={(e) => setDay(e.target.value)} options={data.days.map((d) => ({ value: d, label: d === data.today ? 'Today' : formatDate(d) }))} />}
          <Link href="/quiz"><Button variant="secondary" icon={<Brain size={15} />}>Today’s quiz</Button></Link>
        </div>
      </div>
      {!data ? <div className="skeleton" style={{ height: 360 }} /> : data.items.length === 0 ? (
        <EmptyState art={<Newspaper size={36} strokeWidth={1.4} />} title="The briefing is on its way" body="Stories are pulled in through the day. Try the quiz in the meantime." action={<Link href="/quiz"><Button>Play the quiz</Button></Link>} />
      ) : (
        <>
          <div className="stack gap-4" data-reveal="">
            {data.items.map((s, i) => (
              <article key={s._id} className={cs.panel}>
                <div className="row gap-2 wrap"><span className="dim" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{String(i + 1).padStart(2, '0')}</span><Chip>{s.category}</Chip><span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{s.source} · {timeAgo(s.publishedAt)}</span></div>
                <h2 style={{ fontSize: 'var(--t-lg)', fontWeight: 650, lineHeight: 1.3 }}>{s.title}</h2>
                {s.summary && <p className="muted">{s.summary}</p>}
                {s.whyItMatters && <p style={{ fontSize: 'var(--t-sm)' }}><strong>Why it matters · </strong>{s.whyItMatters}</p>}
                {s.gdAngle && <p className="row gap-2" style={{ fontSize: 'var(--t-sm)', alignItems: 'flex-start' }}><MessagesSquare size={15} style={{ marginTop: 2, color: 'var(--accent)', flex: 'none' }} /> <span><strong>GD angle · </strong>{s.gdAngle}</span></p>}
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="row gap-1" style={{ fontSize: 'var(--t-sm)' }}>Read the full story <ExternalLink size={12} /></a>
              </article>
            ))}
          </div>
          {data.day === data.today && (
            <div className="row gap-2">
              <Button icon={<CheckCircle2 size={15} />} onClick={finish} disabled={done}>{done ? 'Done for today' : 'I’ve read today’s briefing'}</Button>
              <Link href="/quiz"><Button variant="ghost" icon={<Brain size={15} />}>Test yourself</Button></Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
