'use client';

import { useState } from 'react';
import { ThumbsUp, Plus, Trash2, ClipboardList } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Banner, Chip, EmptyState } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery, useAction, useDebounced } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { ROUND_TYPES, ROUND_TYPE_META, SESSION_TYPES, SESSION_TYPE_META, type RoundType, type SessionType } from '@/lib/constants';
import styles from '../app.module.css';

export interface Template {
  _id: string;
  title: string;
  company: string;
  roundType: RoundType;
  sessionType: SessionType;
  prompts: string[];
  lookFor: string;
  upvoteCount: number;
  uses: number;
  upvoted: boolean;
  mine: boolean;
  author?: { name: string };
}

/**
 * Crowd-sourced mock templates (§6.1 V2). Written by people who sat the real
 * round; juniors attach one when booking so the senior knows what to run.
 */
export default function TemplatesPanel() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const query = useDebounced(q, 250);
  const { data, loading, refetch, mutate } = useApiQuery<{ templates: Template[] }>('/api/session-templates', { q: query || undefined });
  const [composeOpen, setComposeOpen] = useState(false);

  const vote = async (t: Template) => {
    mutate((current) => ({
      templates: current.templates.map((x) => (x._id === t._id ? { ...x, upvoted: !x.upvoted, upvoteCount: x.upvoteCount + (x.upvoted ? -1 : 1) } : x)),
    }));
    try {
      await api.post(`/api/session-templates/${t._id}`);
    } catch (caught) {
      toast.error('Could not vote', errorMessage(caught));
      refetch();
    }
  };

  const remove = async (t: Template) => {
    await api.delete(`/api/session-templates/${t._id}`);
    refetch();
  };

  return (
    <>
      <div className={styles.toolbar}>
        <Input aria-label="Search templates" placeholder="Search by company or round…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className={styles.toolbarPush}>
          <Button icon={<Plus size={16} />} onClick={() => setComposeOpen(true)}>Write a template</Button>
        </div>
      </div>
      {loading ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : (data?.templates ?? []).length === 0 ? (
        <EmptyState art={<ClipboardList size={36} strokeWidth={1.4} />} title="No templates yet" body="Sat a real round? Write down how it ran — the next batch will thank you." action={<Button onClick={() => setComposeOpen(true)}>Write the first one</Button>} />
      ) : (
        <div className={styles.cardList}>
          {data!.templates.map((t) => (
            <article key={t._id} className={styles.slotCard}>
              <div className={styles.slotMain}>
                <div className={styles.slotTop}>
                  <Chip tone={SESSION_TYPE_META[t.sessionType].tone}>{SESSION_TYPE_META[t.sessionType].label}</Chip>
                  <Chip tone={ROUND_TYPE_META[t.roundType].tone}>{ROUND_TYPE_META[t.roundType].label}</Chip>
                  {t.company && <Chip outline>{t.company}</Chip>}
                  <Chip outline>Used {t.uses}×</Chip>
                </div>
                <div className={styles.slotName} style={{ fontSize: 'var(--t-md)' }}>{t.title}</div>
                <ol className={styles.templatePrompts}>{t.prompts.map((p, i) => <li key={i}>{p}</li>)}</ol>
                {t.lookFor && <p className={styles.feedbackComment}><strong>Strong answers: </strong>{t.lookFor}</p>}
                <div className={styles.slotActions}>
                  <Button size="sm" variant={t.upvoted ? 'soft' : 'ghost'} icon={<ThumbsUp size={14} />} onClick={() => vote(t)} disabled={t.mine}>
                    {t.upvoteCount}
                  </Button>
                  {t.author && <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>by {t.author.name}</span>}
                  {t.mine && <Button size="sm" variant="dangerGhost" icon={<Trash2 size={14} />} onClick={() => remove(t)}>Delete</Button>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <ComposeDialog open={composeOpen} onClose={() => setComposeOpen(false)} onDone={() => { setComposeOpen(false); refetch(); toast.success('Template published', '+15 karma for sharing it.'); }} />
    </>
  );
}

function ComposeDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ title: '', company: '', roundType: 'case' as RoundType, sessionType: 'mock_interview' as SessionType, prompts: '', lookFor: '' });
  const save = useAction(async () => {
    await api.post('/api/session-templates', {
      ...form,
      prompts: form.prompts.split('\n').map((p) => p.trim()).filter(Boolean),
    });
    setForm({ ...form, title: '', company: '', prompts: '', lookFor: '' });
    onDone();
  });
  if (!open) return null;
  return (
    <Dialog open wide onClose={onClose} title="Write a mock template" description="How the real round ran, so a senior can recreate it."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => save.run()} loading={save.pending}>Publish</Button></>}>
      {save.error && <Banner variant="danger">{save.error}</Banner>}
      <Input label="Title" placeholder="Consulting case — profitability, MBB style" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <div className="row gap-3 wrap">
        <Input label="Company" optional placeholder="e.g. BCG" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        <Select label="Round" value={form.roundType} onChange={(e) => setForm({ ...form, roundType: e.target.value as RoundType })} options={ROUND_TYPES.map((r) => ({ value: r, label: ROUND_TYPE_META[r].label }))} />
        <Select label="Session type" value={form.sessionType} onChange={(e) => setForm({ ...form, sessionType: e.target.value as SessionType })} options={SESSION_TYPES.map((s) => ({ value: s, label: SESSION_TYPE_META[s].label }))} />
      </div>
      <Textarea label="Prompts, one per line" rows={6} value={form.prompts} onChange={(e) => setForm({ ...form, prompts: e.target.value })}
        placeholder={'Client: mid-size airline, profits down 20% YoY.\nAsk for a structure before giving data.\nPush on one bucket for depth.'} />
      <Textarea label="What strong answers look like" optional rows={3} value={form.lookFor} onChange={(e) => setForm({ ...form, lookFor: e.target.value })} />
    </Dialog>
  );
}
