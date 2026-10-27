'use client';

import { useMemo, useState } from 'react';
import { BookA, Lightbulb, Search, Sparkles } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Chip, EmptyState, Segmented } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery, useDebounced } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import cs from '@/components/campus/campus.module.css';
import styles from '../app.module.css';

interface Term { _id: string; term: string; plainEnglish: string; example: string; interviewTip: string; related: string[]; category: string; source: string }
const CATEGORIES = ['all', 'finance', 'strategy', 'marketing', 'operations', 'economics', 'tech', 'hr', 'general'] as const;

function TermCard({ t, onRelated }: { t: Pick<Term, 'term' | 'plainEnglish' | 'example' | 'interviewTip' | 'related'> & { category?: string; source?: string }; onRelated: (term: string) => void }) {
  return (
    <article className={cs.panel}>
      <div className="row gap-2 wrap" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 'var(--t-lg)', fontWeight: 700 }}>{t.term}</h2>
        <div className="row gap-1">{t.category && <Chip>{t.category}</Chip>}{t.source === 'ai' && <Chip tone="violet" icon={<Sparkles size={11} />}>AI</Chip>}</div>
      </div>
      <p>{t.plainEnglish}</p>
      {t.example && <p className="muted" style={{ fontSize: 'var(--t-sm)' }}><strong>Example · </strong>{t.example}</p>}
      {t.interviewTip && <p className="row gap-2" style={{ fontSize: 'var(--t-sm)', alignItems: 'flex-start' }}><Lightbulb size={15} style={{ color: 'var(--amber)', flex: 'none', marginTop: 2 }} /><span><strong>In an interview · </strong>{t.interviewTip}</span></p>}
      {t.related.length > 0 && <div className="row gap-1 wrap">{t.related.map((r) => <button key={r} onClick={() => onRelated(r)}><Chip outline>{r}</Chip></button>)}</div>}
    </article>
  );
}

export default function JargonPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 200);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('all');
  const [asking, setAsking] = useState(false);
  const [aiTerm, setAiTerm] = useState<Term | null>(null);
  const { data, refetch } = useApiQuery<{ terms: Term[]; featured: Term | null; total: number }>('/api/jargon', { q: query || undefined, category: category === 'all' ? undefined : category });
  const exact = useMemo(() => data?.terms.find((t) => t.term.toLowerCase() === query.toLowerCase()), [data, query]);

  const ask = async () => {
    setAsking(true);
    try {
      const { explanation } = await api.post<{ explanation: Omit<Term, '_id' | 'category' | 'source'> }>('/api/ai/jargon', { term: query });
      setAiTerm({ ...explanation, _id: 'ai', category: 'general', source: 'ai' });
      refetch();
    } catch (caught) {
      toast.error('Could not explain that', errorMessage(caught));
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="stack gap-5" style={{ maxWidth: 860 }}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Jargon buster</h1>
          <p className={styles.pageSubtitle}>Business terms in plain English, with an example and how to use them in an interview without sounding like a buzzword machine.</p>
        </div>
      </div>
      <Input aria-label="Look up a term" placeholder="EBITDA, moat, repo rate…" icon={<Search size={16} />} value={q} onChange={(e) => { setQ(e.target.value); setAiTerm(null); }} autoFocus />
      {!query && <Segmented ariaLabel="Category" value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c, label: c === 'all' ? 'All' : c[0].toUpperCase() + c.slice(1) }))} />}

      {!data ? <div className="skeleton" style={{ height: 300 }} /> : (
        <>
          {!query && category === 'all' && data.featured && (
            <div className="stack gap-2"><span className="dim" style={{ fontSize: 'var(--t-xs)', fontWeight: 650, textTransform: 'uppercase', letterSpacing: '.05em' }}>Term of the day</span><TermCard t={data.featured} onRelated={setQ} /></div>
          )}
          {aiTerm && <TermCard t={aiTerm} onRelated={setQ} />}
          {query && !exact && !aiTerm && query.length >= 2 && (
            <div className={cs.panel} style={{ alignItems: 'flex-start' }}>
              <span className="muted">{data.terms.length ? `Not quite “${query}”?` : `“${query}” is not in the glossary yet.`}</span>
              <Button icon={<Sparkles size={15} />} loading={asking} onClick={ask}>Explain “{query}”</Button>
            </div>
          )}
          {data.terms.length === 0 && !query ? <EmptyState art={<BookA size={36} strokeWidth={1.4} />} title="The glossary is empty" body="Look up a term to start it." /> : (
            <div className="stack gap-3" data-reveal="">
              {data.terms.filter((t) => !(category === 'all' && !query && t._id === data.featured?._id)).map((t) => <TermCard key={t._id} t={t} onRelated={setQ} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
