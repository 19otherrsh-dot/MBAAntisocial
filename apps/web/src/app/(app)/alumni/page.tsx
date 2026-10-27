'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ExternalLink, GraduationCap, Inbox, Rocket, Search, Send } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Switch, Textarea } from '@/components/ui/Field';
import { Avatar, Banner, Chip, EmptyState, Segmented } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery, useDebounced } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { useMe } from '@/lib/client/me';
import { timeAgo } from '@/lib/utils';
import { uploadFile } from '@/lib/client/upload';
import Spotlight from '@/components/motion/Spotlight';
import cs from '@/components/campus/campus.module.css';
import styles from '../app.module.css';

type Tab = 'directory' | 'sent' | 'inbox';
interface Alum { _id: string; name: string; image: string; company: string; designation: string; graduationYear: number | null; linkedinUrl: string; specializations: string[]; capacity: number; openThisMonth: number; referredThisMonth: number; available: boolean }
interface Sent { _id: string; alum: { _id: string; name: string; image: string }; company: string; role: string; status: string; response: string; priority: boolean; createdAt: string }
interface InboxItem { _id: string; requester: { _id: string; name: string; image: string; batch: string; specializations: string[] }; company: string; role: string; jobUrl: string; note: string; resumeUrl: string; priority: boolean; status: string; createdAt: string }

const STATUS_TONE: Record<string, 'slate' | 'teal' | 'amber' | 'rose' | 'violet'> = { pending: 'amber', accepted: 'violet', referred: 'teal', declined: 'rose', withdrawn: 'slate', expired: 'slate' };

export default function AlumniPage() {
  return <Suspense fallback={<div className="skeleton" style={{ height: 300 }} />}><Alumni /></Suspense>;
}

function Alumni() {
  const params = useSearchParams();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'directory');
  const [q, setQ] = useState('');
  const query = useDebounced(q, 250);
  const [asking, setAsking] = useState<Alum | null>(null);
  const { data, refetch } = useApiQuery<{ alumni: Alum[]; sent: Sent[]; inbox: InboxItem[]; isAlum: boolean }>('/api/alumni', { q: query || undefined });

  const act = async (id: string, action: string, response = '') => {
    try {
      await api.post(`/api/alumni/referrals/${id}`, { action, response });
      toast.success(action === 'referred' ? 'Marked as referred — thank you' : 'Updated');
      refetch();
    } catch (caught) {
      toast.error('That did not work', errorMessage(caught));
    }
  };

  const tabs = [
    { value: 'directory' as Tab, label: 'Alumni' },
    { value: 'sent' as Tab, label: 'My requests', count: data?.sent.filter((s) => s.status === 'pending' || s.status === 'accepted').length || undefined },
    ...(data?.isAlum ? [{ value: 'inbox' as Tab, label: 'Inbox', count: data.inbox.length || undefined }] : []),
  ];

  return (
    <div className="stack gap-5">
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Alumni & referrals</h1>
          <p className={styles.pageSubtitle}>Alumni who opted in to refer, with the boundaries they set. Ask well — a few sentences on why you fit, the role, and the link.</p>
        </div>
      </div>
      <Segmented ariaLabel="Section" value={tab} onChange={setTab} options={tabs} />

      {tab === 'directory' && (
        <>
          <div style={{ maxWidth: 360 }}><Input aria-label="Search alumni" placeholder="Name, company, or role" icon={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {!data ? <div className="skeleton" style={{ height: 240 }} /> : data.alumni.length === 0 ? (
            <EmptyState art={<GraduationCap size={36} strokeWidth={1.4} />} title="No alumni taking referrals yet" body="When alumni turn on referrals in their profile, they show up here." />
          ) : (
            <Spotlight>
              <div className={cs.grid} data-reveal="">
                {data.alumni.map((a) => (
                  <div key={a._id} className={cs.card} data-spot="">
                    <div className={cs.cardBody} style={{ paddingTop: 'var(--s-4)' }}>
                      <div className={cs.head}>
                        <Avatar name={a.name} image={a.image} seed={a._id} size={44} />
                        <div className="stack" style={{ minWidth: 0 }}>
                          <Link href={`/u/${a._id}`} className={cs.cardTitle} style={{ color: 'inherit' }}>{a.name}</Link>
                          <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{[a.designation, a.company].filter(Boolean).join(' at ')}{a.graduationYear ? ` · ’${String(a.graduationYear).slice(2)}` : ''}</span>
                        </div>
                      </div>
                      {a.specializations.length > 0 && <div className="row gap-1 wrap">{a.specializations.slice(0, 3).map((s) => <Chip key={s} outline>{s}</Chip>)}</div>}
                      <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{a.available ? `${a.capacity - a.openThisMonth} of ${a.capacity} slots open this month` : 'Inbox full this month'}{a.referredThisMonth ? ` · referred ${a.referredThisMonth}` : ''}</span>
                      <div className="row gap-2 wrap">
                        <Button size="sm" icon={<Send size={13} />} disabled={!a.available} onClick={() => setAsking(a)}>Ask for a referral</Button>
                        {a.linkedinUrl && <a href={a.linkedinUrl} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="ghost" icon={<ExternalLink size={13} />}>LinkedIn</Button></a>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Spotlight>
          )}
        </>
      )}

      {tab === 'sent' && data && (
        data.sent.length === 0 ? <EmptyState art={<Send size={32} strokeWidth={1.4} />} title="No requests yet" body="Find an alum at a company you are applying to." /> : (
          <div className={cs.panel}>
            {data.sent.map((r) => (
              <div key={r._id} className={cs.rowItem} style={{ alignItems: 'flex-start' }}>
                <Avatar name={r.alum.name} image={r.alum.image} seed={r.alum._id} size={30} />
                <div className="stack gap-1" style={{ flex: 1, minWidth: 0 }}>
                  <strong>{r.role} at {r.company}</strong>
                  <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>to {r.alum.name} · {timeAgo(r.createdAt)}{r.priority ? ' · priority' : ''}</span>
                  {r.response && <span className="muted" style={{ fontSize: 'var(--t-sm)' }}>“{r.response}”</span>}
                </div>
                <Chip tone={STATUS_TONE[r.status]}>{r.status}</Chip>
                {(r.status === 'pending' || r.status === 'accepted') && <Button size="sm" variant="ghost" onClick={() => act(r._id, 'withdraw')}>Withdraw</Button>}
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'inbox' && data?.isAlum && (
        data.inbox.length === 0 ? <EmptyState art={<Inbox size={32} strokeWidth={1.4} />} title="Inbox zero" body="New requests show up here, priority ones first." /> : (
          <div className="stack gap-3">
            {data.inbox.map((r) => <InboxCard key={r._id} item={r} onAct={act} />)}
          </div>
        )
      )}

      {asking && <AskDialog alum={asking} onClose={() => setAsking(null)} onSent={() => { setAsking(null); setTab('sent'); refetch(); }} />}
    </div>
  );
}

function InboxCard({ item, onAct }: { item: InboxItem; onAct: (id: string, action: string, response?: string) => void }) {
  const [response, setResponse] = useState('');
  return (
    <div className={cs.panel} style={item.priority ? { borderColor: 'var(--amber)' } : undefined}>
      <div className="row gap-2">
        <Avatar name={item.requester.name} image={item.requester.image} seed={item.requester._id} size={32} />
        <Link href={`/u/${item.requester._id}`} className="stack" style={{ flex: 1, color: 'inherit' }}>
          <strong>{item.requester.name}</strong>
          <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{item.requester.batch} · {timeAgo(item.createdAt)}</span>
        </Link>
        {item.priority && <Chip tone="amber" icon={<Rocket size={11} />}>Priority</Chip>}
        <Chip tone={STATUS_TONE[item.status]}>{item.status}</Chip>
      </div>
      <strong>{item.role} at {item.company}</strong>
      <p style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--t-sm)' }}>{item.note}</p>
      <div className="row gap-2 wrap">
        {item.jobUrl && <a href={item.jobUrl} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="ghost" icon={<ExternalLink size={13} />}>Job posting</Button></a>}
        {item.resumeUrl && <a href={item.resumeUrl} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="ghost">Resume</Button></a>}
      </div>
      <Input aria-label="Reply" placeholder="A line back (optional)" value={response} onChange={(e) => setResponse(e.target.value)} />
      <div className="row gap-2 wrap">
        {item.status === 'pending' && <Button size="sm" variant="secondary" onClick={() => onAct(item._id, 'accept', response)}>I’ll look into it</Button>}
        <Button size="sm" onClick={() => onAct(item._id, 'referred', response)}>Referred</Button>
        <Button size="sm" variant="ghost" onClick={() => onAct(item._id, 'decline', response)}>Can’t this time</Button>
      </div>
    </div>
  );
}

function AskDialog({ alum, onClose, onSent }: { alum: Alum; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const { me } = useMe();
  const [form, setForm] = useState({ company: alum.company, role: '', jobUrl: '', note: '', resumeUrl: '', priority: false });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await api.post('/api/alumni/referrals', form);
      toast.success('Request sent', `${alum.name} will see it in their inbox.`);
      onSent();
    } catch (caught) {
      toast.error('Could not send', errorMessage(caught));
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title={`Ask ${alum.name} for a referral`} description="Respect their time: be specific about the role and why you are a fit."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={send} loading={busy} disabled={form.note.trim().length < 40 || form.role.trim().length < 2}>Send request</Button></>}>
      <div className="row gap-3 wrap">
        <div style={{ flex: 1, minWidth: 160 }}><Input label="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
        <div style={{ flex: 1, minWidth: 160 }}><Input label="Role" placeholder="Associate, Strategy" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
      </div>
      <Input label="Job link" optional placeholder="https://…" value={form.jobUrl} onChange={(e) => setForm({ ...form, jobUrl: e.target.value })} />
      <Textarea label="Why you fit" rows={5} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} hint={`${form.note.trim().length}/40 characters minimum`} />
      <div className="row gap-2">
        <label className="row gap-2" style={{ cursor: 'pointer' }}>
          <input type="file" hidden accept="application/pdf" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            try { setForm((f) => ({ ...f, resumeUrl: '' })); const { url } = await uploadFile(file, 'resumes'); setForm((f) => ({ ...f, resumeUrl: url })); } catch (caught) { toast.error('Upload failed', caught instanceof Error ? caught.message : undefined); } finally { setUploading(false); }
          }} />
          <span className="dim" style={{ fontSize: 'var(--t-sm)', textDecoration: 'underline' }}>{uploading ? 'Uploading…' : form.resumeUrl ? 'Resume attached ✓' : 'Attach resume (PDF)'}</span>
        </label>
      </div>
      <Switch checked={form.priority} onChange={(priority) => setForm({ ...form, priority })} label="Priority (15 credits)" hint={`Shows at the top of their inbox. You have ${me?.credits ?? 0} credits.`} />
      {form.priority && (me?.credits ?? 0) < 15 && <Banner variant="warning" title="Not enough credits">Host a mock session to earn some, or send without priority.</Banner>}
    </Dialog>
  );
}
