'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Crown, Hash, Plus, UsersRound } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Avatar, Chip, EmptyState, Segmented } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { useMe } from '@/lib/client/me';
import cs from '@/components/campus/campus.module.css';
import styles from '../app.module.css';

interface TeamRow {
  _id: string; name: string; purpose: string; comp: { _id: string; title: string } | null; captain: string;
  members: Array<{ _id: string; name: string; image: string; specializations: string[] }>; maxSize: number; openRoles: string[]; lookingForMembers: boolean; isMember: boolean; requested: boolean; hubServer: string | null;
}

export default function TeamsPage() {
  return <Suspense fallback={<div className="skeleton" style={{ height: 300 }} />}><Teams /></Suspense>;
}

function Teams() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [scope, setScope] = useState<'looking' | 'mine'>(params.get('team') ? 'mine' : 'looking');
  const [creating, setCreating] = useState(false);
  const [requesting, setRequesting] = useState<TeamRow | null>(null);
  const { data, refetch } = useApiQuery<{ teams: TeamRow[] }>('/api/teams', { scope });
  const openTeam = params.get('team');

  const act = async (team: string, body: Record<string, unknown>, success?: string) => {
    try {
      await api.post(`/api/teams/${team}`, body);
      if (success) toast.success(success);
      refetch();
      return true;
    } catch (caught) {
      toast.error('That did not work', errorMessage(caught));
      return false;
    }
  };

  return (
    <div className="stack gap-5">
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Teams</h1>
          <p className={styles.pageSubtitle}>Find teammates for case comps and projects. Every team gets a private workspace in the hub.</p>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setCreating(true)}>Form a team</Button>
      </div>
      <Segmented ariaLabel="Which teams" value={scope} onChange={setScope} options={[{ value: 'looking', label: 'Looking for members' }, { value: 'mine', label: 'My teams' }]} />
      {!data ? <div className="skeleton" style={{ height: 240 }} /> : data.teams.length === 0 ? (
        <EmptyState art={<UsersRound size={36} strokeWidth={1.4} />} title={scope === 'mine' ? 'You are not on a team yet' : 'No teams looking right now'} body="Form one and list the roles you need — people can ask to join." action={<Button onClick={() => setCreating(true)}>Form a team</Button>} />
      ) : (
        <div className={cs.grid} data-reveal="">
          {data.teams.map((t) => (
            <div key={t._id} className={cs.card} style={openTeam === t._id ? { borderColor: 'var(--accent)' } : undefined}>
              <div className={cs.cardBody} style={{ paddingTop: 'var(--s-4)' }}>
                <span className={cs.cardTitle}>{t.name}</span>
                {t.comp && <Chip tone="violet">{t.comp.title}</Chip>}
                {t.purpose && <span className="muted" style={{ fontSize: 'var(--t-sm)' }}>{t.purpose}</span>}
                <div className="row gap-1 wrap">
                  {t.members.map((m) => (
                    <Link key={m._id} href={`/u/${m._id}`} title={m.name} style={{ position: 'relative' }}>
                      <Avatar name={m.name} image={m.image} seed={m._id} size={30} />
                      {m._id === t.captain && <Crown size={11} style={{ position: 'absolute', top: -4, right: -4, color: 'var(--amber)' }} aria-label="Captain" />}
                    </Link>
                  ))}
                  <span className="dim" style={{ fontSize: 'var(--t-xs)', marginLeft: 4 }}>{t.members.length}/{t.maxSize}</span>
                </div>
                {t.openRoles.length > 0 && t.lookingForMembers && (
                  <div className="row gap-1 wrap"><span className="dim" style={{ fontSize: 'var(--t-xs)' }}>Needs:</span>{t.openRoles.map((r) => <Chip key={r} outline>{r}</Chip>)}</div>
                )}
                <div className="row gap-2 wrap" style={{ marginTop: 4 }}>
                  {t.isMember ? (
                    <>
                      {t.hubServer && <Link href={`/hub/${t.hubServer}`}><Button size="sm" icon={<Hash size={13} />}>Workspace</Button></Link>}
                      <Button size="sm" variant="ghost" onClick={() => router.push(`/teams/${t._id}`)}>Manage</Button>
                    </>
                  ) : t.requested ? (
                    <Button size="sm" variant="secondary" onClick={() => act(t._id, { action: 'withdraw' })}>Requested — withdraw</Button>
                  ) : (
                    <Button size="sm" onClick={() => setRequesting(t)}>Ask to join</Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {creating && <CreateTeamDialog onClose={() => setCreating(false)} onCreated={() => { setCreating(false); setScope('mine'); refetch(); }} />}
      {requesting && <RequestDialog team={requesting} onClose={() => setRequesting(null)} onSend={async (note) => { if (await act(requesting._id, { action: 'request', note }, 'Request sent to the captain')) setRequesting(null); }} />}
    </div>
  );
}

function CreateTeamDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const { data: comps } = useApiQuery<{ comps: Array<{ _id: string; title: string }> }>('/api/comps', { limit: 50 });
  const [form, setForm] = useState({ name: '', purpose: '', comp: '', maxSize: '4', openRoles: '' });
  const save = async () => {
    try {
      await api.post('/api/teams', { name: form.name, purpose: form.purpose, comp: form.comp || undefined, maxSize: Number(form.maxSize), openRoles: form.openRoles.split(',').map((r) => r.trim()).filter((r) => r.length >= 2) });
      onCreated();
    } catch (caught) {
      toast.error('Could not create the team', errorMessage(caught));
    }
  };
  return (
    <Dialog open onClose={onClose} title="Form a team" description="You are the captain. A private hub server is created for the team."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={form.name.trim().length < 2}>Create</Button></>}>
      <Input label="Team name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <div className="row gap-3 wrap">
        {comps && comps.comps.length > 0 && <Select label="For a competition" value={form.comp} onChange={(e) => setForm({ ...form, comp: e.target.value })} options={[{ value: '', label: 'None' }, ...comps.comps.map((c) => ({ value: c._id, label: c.title }))]} />}
        <Select label="Team size" value={form.maxSize} onChange={(e) => setForm({ ...form, maxSize: e.target.value })} options={[2, 3, 4, 5, 6, 8].map((n) => ({ value: String(n), label: String(n) }))} />
      </div>
      <Input label="Roles you need" optional placeholder="Finance, Design, Research" hint="Comma-separated" value={form.openRoles} onChange={(e) => setForm({ ...form, openRoles: e.target.value })} />
      <Textarea label="About the team" optional rows={3} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
    </Dialog>
  );
}

function RequestDialog({ team, onClose, onSend }: { team: TeamRow; onClose: () => void; onSend: (note: string) => void }) {
  const { me } = useMe();
  const [note, setNote] = useState(me?.specializations?.length ? `I’m into ${me.specializations.join(', ')}.` : '');
  return (
    <Dialog open onClose={onClose} title={`Join ${team.name}`} description="The captain sees your note and your profile."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => onSend(note)}>Send request</Button></>}>
      <Textarea label="Why you’d be a good fit" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
    </Dialog>
  );
}
