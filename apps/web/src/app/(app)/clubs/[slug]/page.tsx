'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, BadgeCheck, CalendarDays, CheckSquare, Hash, Globe, Plus, Square, Trash2, Users, Wallet, ClipboardList, Settings } from 'lucide-react';
import Button, { LinkButton } from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { Avatar, Banner, Chip, EmptyState, Segmented, Stat } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/useConfirm';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { formatDate, formatDateTime, toDateTimeLocalValue } from '@/lib/utils';
import RichText from '@/components/RichText';
import EventDialog from '@/components/campus/EventDialog';
import { ClubLogo, CLUB_CATEGORY_LABEL } from '@/components/campus/clubs';
import Morph from '@/components/motion/Morph';
import cs from '@/components/campus/campus.module.css';
import styles from '../../app.module.css';

type Tab = 'about' | 'members' | 'applications' | 'budget' | 'tasks';

interface ClubDetail {
  club: {
    _id: string; slug: string; name: string; tagline: string; description: string; category: string; logo: string; official: boolean;
    links: { instagram: string; linkedin: string; website: string }; memberCount: number; hubServer: string | null;
    recruitment: { open: boolean; deadline?: string; questions: string[]; note: string };
    members: Array<{ _id: string; name: string; image: string; batch: string; role: 'lead' | 'core' | 'member'; title: string }>;
    events: Array<{ _id: string; title: string; startAt: string; venue: string; goingCount: number }>;
    budget: { allocated: number; income: number; spent: number; balance: number; entries: Array<{ _id: string; label: string; amount: number; kind: 'income' | 'expense'; at: string }> } | null;
    tasks: Array<{ _id: string; title: string; done: boolean; due: string | null; assignee: { _id: string; name: string } | null }> | null;
  };
  me: { role: 'lead' | 'core' | 'member' | null; application: string | null; canManage: boolean; canLead: boolean; canAdmin: boolean };
  pendingApplications: number;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const ROLE_LABEL = { lead: 'Lead', core: 'Core team', member: 'Member' } as const;

export default function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, error, refetch } = useApiQuery<ClubDetail>(`/api/clubs/${slug}`);
  const [tab, setTab] = useState<Tab>((search.get('tab') as Tab) || 'about');
  const [modal, setModal] = useState<null | 'apply' | 'settings' | 'event'>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (error) return <EmptyState title="Club not found" body={error} action={<LinkButton href="/clubs">All clubs</LinkButton>} />;
  if (!data) return <div className="skeleton" style={{ height: 400 }} />;
  const { club, me } = data;

  const act = async (key: string, body: Record<string, unknown>, success?: string) => {
    setBusy(key);
    try {
      await api.post(`/api/clubs/${slug}`, body);
      if (success) toast.success(success);
      refetch();
      return true;
    } catch (caught) {
      toast.error('That did not work', errorMessage(caught));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const tabs: Array<{ value: Tab; label: string; count?: number }> = [
    { value: 'about', label: 'About' },
    { value: 'members', label: 'Members', count: club.memberCount },
    ...(me.canManage ? [{ value: 'applications' as Tab, label: 'Applications', count: data.pendingApplications || undefined }] : []),
    ...(club.budget ? [{ value: 'budget' as Tab, label: 'Budget' }] : []),
    ...(club.tasks ? [{ value: 'tasks' as Tab, label: 'Tasks', count: club.tasks.filter((t) => !t.done).length || undefined }] : []),
  ];

  return (
    <div className="stack gap-5">
      <Link href="/clubs" className="row gap-1 dim" style={{ fontSize: 'var(--t-sm)' }}><ArrowLeft size={14} /> Clubs</Link>
      <div className={styles.pageHead}>
        <div className={cs.head}>
          <Morph name={`club-logo-${club.slug}`}><ClubLogo name={club.name} logo={club.logo} size={64} /></Morph>
          <div className="stack gap-1">
            <h1 className={styles.pageTitle}>{club.name} {club.official && <BadgeCheck size={20} style={{ color: 'var(--accent)', verticalAlign: '-2px' }} aria-label="Official club" />}</h1>
            <span className="muted">{club.tagline}</span>
            <div className={cs.meta}>
              <Chip>{CLUB_CATEGORY_LABEL[club.category]}</Chip>
              <span><Users size={12} /> {club.memberCount} members</span>
              {club.links.instagram && <a href={club.links.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}
              {club.links.linkedin && <a href={club.links.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>}
              {club.links.website && <a href={club.links.website} target="_blank" rel="noopener noreferrer" className="row gap-1"><Globe size={12} /> Website</a>}
            </div>
          </div>
        </div>
        <div className="row gap-2 wrap">
          {me.role && club.hubServer && <LinkButton href={`/hub/${club.hubServer}`} variant="secondary" icon={<Hash size={15} />}>Club chat</LinkButton>}
          {!me.role && club.recruitment.open && (club.recruitment.questions.length > 0 ? (
            me.application === 'pending' ? <Button variant="secondary" loading={busy === 'withdraw'} onClick={() => act('withdraw', { action: 'withdraw' }, 'Application withdrawn')}>Applied — withdraw</Button>
              : <Button onClick={() => setModal('apply')}>Apply</Button>
          ) : (
            <Button loading={busy === 'join'} onClick={() => act('join', { action: 'join' }, `Welcome to ${club.name}!`)}>Join</Button>
          ))}
          {me.canManage && <Button variant="ghost" icon={<CalendarDays size={15} />} onClick={() => setModal('event')}>New event</Button>}
          {me.canManage && <Button variant="ghost" icon={<Settings size={15} />} onClick={() => setModal('settings')}>Settings</Button>}
        </div>
      </div>

      {!me.role && club.recruitment.open && (
        <Banner variant="info" title="Recruitment is open">{club.recruitment.note || 'They are taking new members.'}{club.recruitment.deadline ? ` Closes ${formatDateTime(club.recruitment.deadline)}.` : ''}</Banner>
      )}
      {me.application === 'declined' && !me.role && <Banner variant="info" title="Not this round">Your last application was not accepted. Watch for the next recruitment.</Banner>}

      <Segmented ariaLabel="Club sections" value={tab} onChange={setTab} options={tabs.map((t) => ({ value: t.value, label: t.label, count: t.count }))} />

      {tab === 'about' && (
        <div className="stack gap-5">
          {club.description ? <div className={cs.panel}><RichText text={club.description} /></div> : <p className="dim">No description yet.</p>}
          <section className={styles.section}>
            <div className={styles.sectionHead}><CalendarDays size={15} /> Upcoming events</div>
            {club.events.length === 0 ? <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>Nothing scheduled.</p> : club.events.map((e) => (
              <Link key={e._id} href={`/events/${e._id}`} className={cs.rowItem} style={{ color: 'inherit' }}>
                <CalendarDays size={16} /> <strong style={{ flex: 1 }}>{e.title}</strong>
                <span className="dim">{formatDateTime(e.startAt)}</span>
                <span className="dim">{e.goingCount} going</span>
              </Link>
            ))}
          </section>
          {me.role && me.role !== 'lead' && (
            <div><Button variant="ghost" size="sm" onClick={async () => { if (await confirm({ title: `Leave ${club.name}?`, confirmLabel: 'Leave', destructive: true })) void act('leave', { action: 'leave' }); }}>Leave club</Button></div>
          )}
        </div>
      )}

      {tab === 'members' && (
        <div className={cs.panel}>
          {club.members.map((m) => (
            <div key={m._id} className={cs.rowItem}>
              <Avatar name={m.name} image={m.image} seed={m._id} size={32} />
              <Link href={`/u/${m._id}`} className="stack" style={{ flex: 1, minWidth: 0, color: 'inherit' }}>
                <strong className="truncate">{m.name}</strong>
                <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{[m.title, m.batch].filter(Boolean).join(' · ')}</span>
              </Link>
              {me.canLead ? (
                <Select aria-label={`Role for ${m.name}`} value={m.role} onChange={(e) => act(`role-${m._id}`, { action: 'set_role', userId: m._id, role: e.target.value, title: m.title })}
                  options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))} />
              ) : (
                <Chip tone={m.role === 'lead' ? 'violet' : m.role === 'core' ? 'blue' : 'slate'}>{ROLE_LABEL[m.role]}</Chip>
              )}
              {me.canLead && m.role !== 'lead' && (
                <button className="dim" aria-label={`Remove ${m.name}`} onClick={async () => { if (await confirm({ title: `Remove ${m.name}?`, confirmLabel: 'Remove', destructive: true })) void act(`rm-${m._id}`, { action: 'remove_member', userId: m._id }); }}><Trash2 size={14} /></button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'applications' && me.canManage && <Applications slug={slug} onDecided={refetch} />}
      {tab === 'budget' && club.budget && <Budget budget={club.budget} canLead={me.canLead} onAction={act} busy={busy} />}
      {tab === 'tasks' && club.tasks && <Tasks tasks={club.tasks} members={club.members} canManage={me.canManage} onAction={act} />}

      {modal === 'apply' && <ApplyDialog questions={club.recruitment.questions} onClose={() => setModal(null)} onSubmit={async (answers) => { if (await act('apply', { action: 'apply', answers }, 'Application sent')) setModal(null); }} />}
      {modal === 'settings' && <SettingsDialog club={club} me={me} onClose={() => setModal(null)} onSaved={() => { setModal(null); refetch(); }} onArchived={() => router.push('/clubs')} />}
      {modal === 'event' && <EventDialog defaultClub={club._id} onClose={() => setModal(null)} onCreated={(id) => router.push(`/events/${id}`)} />}
      {dialog}
    </div>
  );
}

function Applications({ slug, onDecided }: { slug: string; onDecided: () => void }) {
  const toast = useToast();
  const { data, refetch } = useApiQuery<{ questions: string[]; applications: Array<{ _id: string; user: { _id: string; name: string; image: string; batch: string }; answers: string[]; createdAt: string }> }>(`/api/clubs/${slug}/applications`);
  const decide = async (applicationId: string, decision: 'accepted' | 'declined') => {
    try {
      await api.post(`/api/clubs/${slug}/applications`, { applicationId, decision });
      toast.success(decision === 'accepted' ? 'Accepted — they are in' : 'Declined');
      refetch();
      onDecided();
    } catch (caught) {
      toast.error('Could not decide', errorMessage(caught));
    }
  };
  if (!data) return <div className="skeleton" style={{ height: 160 }} />;
  if (data.applications.length === 0) return <EmptyState art={<ClipboardList size={32} strokeWidth={1.4} />} title="No pending applications" body="Open recruitment in Settings to start taking them." />;
  return (
    <div className="stack gap-3">
      {data.applications.map((a) => (
        <div key={a._id} className={cs.panel}>
          <div className="row gap-2">
            <Avatar name={a.user.name} image={a.user.image} seed={a.user._id} size={32} />
            <Link href={`/u/${a.user._id}`} className="stack" style={{ flex: 1, color: 'inherit' }}><strong>{a.user.name}</strong><span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{a.user.batch} · applied {formatDate(a.createdAt)}</span></Link>
          </div>
          {data.questions.map((q, i) => (
            <div key={i} className="stack gap-1"><span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{q}</span><span style={{ whiteSpace: 'pre-wrap' }}>{a.answers[i] || '—'}</span></div>
          ))}
          <div className="row gap-2"><Button size="sm" onClick={() => decide(a._id, 'accepted')}>Accept</Button><Button size="sm" variant="ghost" onClick={() => decide(a._id, 'declined')}>Decline</Button></div>
        </div>
      ))}
    </div>
  );
}

function Budget({ budget, canLead, onAction, busy }: { budget: NonNullable<ClubDetail['club']['budget']>; canLead: boolean; onAction: (key: string, body: Record<string, unknown>) => Promise<boolean>; busy: string | null }) {
  const [form, setForm] = useState({ label: '', amount: '', kind: 'expense' });
  const [allocation, setAllocation] = useState(String(budget.allocated || ''));
  return (
    <div className="stack gap-4">
      <div className="row gap-5 wrap">
        <Stat value={inr(budget.allocated)} label="Allocated" />
        <Stat value={inr(budget.income)} label="Raised" meta="sponsors, tickets" />
        <Stat value={inr(budget.spent)} label="Spent" />
        <Stat value={inr(budget.balance)} label="Balance" tone={budget.balance < 0 ? 'rose' : undefined} />
      </div>
      {canLead && (
        <form className="row gap-2 wrap" style={{ alignItems: 'flex-end' }} onSubmit={async (e) => { e.preventDefault(); await onAction('alloc', { action: 'budget_allocated', allocated: Number(allocation) || 0 }); }}>
          <div style={{ width: 180 }}><Input label="Allocated by the institute (₹)" type="number" min={0} value={allocation} onChange={(e) => setAllocation(e.target.value)} /></div>
          <Button size="sm" variant="ghost" type="submit" icon={<Wallet size={14} />} loading={busy === 'alloc'}>Update</Button>
        </form>
      )}
      <form className="row gap-2 wrap" style={{ alignItems: 'flex-end' }} onSubmit={async (e) => { e.preventDefault(); if (await onAction('entry', { action: 'budget_add', label: form.label, amount: Number(form.amount), kind: form.kind })) setForm({ label: '', amount: '', kind: form.kind }); }}>
        <div style={{ flex: '1 1 200px' }}><Input label="Item" placeholder="Speaker travel" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
        <div style={{ width: 120 }}><Input label="Amount (₹)" type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
        <Select label="Type" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
        <Button type="submit" icon={<Plus size={14} />} loading={busy === 'entry'} disabled={!form.label || !Number(form.amount)}>Add</Button>
      </form>
      <div className={cs.panel}>
        {budget.entries.length === 0 ? <p className="dim">No entries yet.</p> : budget.entries.map((e) => (
          <div key={e._id} className={cs.rowItem}>
            <span style={{ flex: 1 }}>{e.label}</span>
            <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{formatDate(e.at)}</span>
            <strong style={{ color: e.kind === 'income' ? 'var(--success)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{e.kind === 'income' ? '+' : '−'}{inr(e.amount)}</strong>
            <button className="dim" aria-label={`Remove ${e.label}`} onClick={() => onAction(`rm-${e._id}`, { action: 'budget_remove', entryId: e._id })}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tasks({ tasks, members, canManage, onAction }: { tasks: NonNullable<ClubDetail['club']['tasks']>; members: ClubDetail['club']['members']; canManage: boolean; onAction: (key: string, body: Record<string, unknown>) => Promise<boolean> }) {
  const [form, setForm] = useState({ title: '', assignee: '', due: '' });
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  return (
    <div className="stack gap-4">
      {canManage && (
        <form className="row gap-2 wrap" style={{ alignItems: 'flex-end' }} onSubmit={async (e) => { e.preventDefault(); if (await onAction('task', { action: 'task_add', title: form.title, assignee: form.assignee || undefined, due: form.due ? new Date(form.due).toISOString() : undefined })) setForm({ title: '', assignee: '', due: '' }); }}>
          <div style={{ flex: '1 1 220px' }}><Input label="Task" placeholder="Book the auditorium" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <Select label="Owner" value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} options={[{ value: '', label: 'Unassigned' }, ...members.map((m) => ({ value: m._id, label: m.name }))]} />
          <Input label="Due" type="datetime-local" value={form.due} min={toDateTimeLocalValue(new Date())} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          <Button type="submit" icon={<Plus size={14} />} disabled={form.title.trim().length < 2}>Add</Button>
        </form>
      )}
      <div className={cs.panel}>
        {tasks.length === 0 && <p className="dim">No tasks yet.</p>}
        {[...open, ...done].map((t) => (
          <div key={t._id} className={cs.rowItem}>
            <button aria-label={t.done ? 'Mark not done' : 'Mark done'} onClick={() => onAction(`t-${t._id}`, { action: 'task_toggle', taskId: t._id })}>
              {t.done ? <CheckSquare size={17} style={{ color: 'var(--success)' }} /> : <Square size={17} />}
            </button>
            <span style={{ flex: 1, textDecoration: t.done ? 'line-through' : undefined, color: t.done ? 'var(--text-muted)' : undefined }}>{t.title}</span>
            {t.assignee && <Chip outline>{t.assignee.name}</Chip>}
            {t.due && <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{formatDateTime(t.due)}</span>}
            {canManage && <button className="dim" aria-label="Delete task" onClick={() => onAction(`d-${t._id}`, { action: 'task_remove', taskId: t._id })}><Trash2 size={14} /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ApplyDialog({ questions, onClose, onSubmit }: { questions: string[]; onClose: () => void; onSubmit: (answers: string[]) => void }) {
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ''));
  return (
    <Dialog open onClose={onClose} title="Apply" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => onSubmit(answers)} disabled={answers.some((a) => !a.trim())}>Send application</Button></>}>
      {questions.map((q, i) => <Textarea key={i} label={q} rows={3} value={answers[i]} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} />)}
    </Dialog>
  );
}

function SettingsDialog({ club, me, onClose, onSaved, onArchived }: { club: ClubDetail['club']; me: ClubDetail['me']; onClose: () => void; onSaved: () => void; onArchived: () => void }) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState({
    tagline: club.tagline,
    description: club.description,
    links: club.links,
    recruitment: { open: club.recruitment.open, deadline: club.recruitment.deadline ? toDateTimeLocalValue(new Date(club.recruitment.deadline)) : '', questions: club.recruitment.questions.join('\n'), note: club.recruitment.note },
  });
  const save = async () => {
    try {
      await api.post(`/api/clubs/${club.slug}`, {
        action: 'update',
        tagline: form.tagline,
        description: form.description,
        links: form.links,
        recruitment: {
          open: form.recruitment.open,
          deadline: form.recruitment.deadline ? new Date(form.recruitment.deadline).toISOString() : null,
          questions: form.recruitment.questions.split('\n').map((q) => q.trim()).filter((q) => q.length >= 3),
          note: form.recruitment.note,
        },
      });
      onSaved();
    } catch (caught) {
      toast.error('Could not save', errorMessage(caught));
    }
  };
  return (
    <Dialog open onClose={onClose} title="Club settings" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></>}>
      <Input label="Tagline" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
      <Textarea label="About" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <div className="row gap-2 wrap">
        <Input label="Instagram" optional value={form.links.instagram} onChange={(e) => setForm({ ...form, links: { ...form.links, instagram: e.target.value } })} />
        <Input label="LinkedIn" optional value={form.links.linkedin} onChange={(e) => setForm({ ...form, links: { ...form.links, linkedin: e.target.value } })} />
        <Input label="Website" optional value={form.links.website} onChange={(e) => setForm({ ...form, links: { ...form.links, website: e.target.value } })} />
      </div>
      <Switch checked={form.recruitment.open} onChange={(open) => setForm({ ...form, recruitment: { ...form.recruitment, open } })} label="Recruitment open" hint="With no questions, people join instantly. With questions, they apply and you decide." />
      {form.recruitment.open && (
        <>
          <Input label="Closes" optional type="datetime-local" value={form.recruitment.deadline} onChange={(e) => setForm({ ...form, recruitment: { ...form.recruitment, deadline: e.target.value } })} />
          <Textarea label="Questions (one per line)" optional rows={3} value={form.recruitment.questions} onChange={(e) => setForm({ ...form, recruitment: { ...form.recruitment, questions: e.target.value } })} />
          <Input label="Note for applicants" optional value={form.recruitment.note} onChange={(e) => setForm({ ...form, recruitment: { ...form.recruitment, note: e.target.value } })} />
        </>
      )}
      <div className="row gap-2 wrap">
        {me.canAdmin && <Button size="sm" variant="ghost" onClick={async () => { await api.post(`/api/clubs/${club.slug}`, { action: 'official', official: !club.official }); onSaved(); }}>{club.official ? 'Remove official status' : 'Mark as official'}</Button>}
        {(me.canLead || me.canAdmin) && <Button size="sm" variant="ghost" onClick={async () => { if (await confirm({ title: 'Archive this club?', body: 'It disappears from the list. Its hub server stays for history.', confirmLabel: 'Archive', destructive: true })) { await api.post(`/api/clubs/${club.slug}`, { action: 'archive' }); onArchived(); } }}>Archive club</Button>}
      </div>
      {dialog}
    </Dialog>
  );
}
