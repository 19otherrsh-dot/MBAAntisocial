'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Crown, Hash, Trash2 } from 'lucide-react';
import Button, { LinkButton } from '@/components/ui/Button';
import { Input, Switch, Textarea } from '@/components/ui/Field';
import { Avatar, Chip, EmptyState } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/useConfirm';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { timeAgo } from '@/lib/utils';
import cs from '@/components/campus/campus.module.css';
import styles from '../../app.module.css';

interface TeamDetail {
  team: {
    _id: string; name: string; purpose: string; captain: string; maxSize: number; openRoles: string[]; lookingForMembers: boolean;
    members: Array<{ _id: string; name: string; image: string; batch: string }>;
    requests: Array<{ _id: string; name: string; specializations: string[]; note: string; at: string }>;
    hubServer: string | null;
  };
  me: { member: boolean; captain: boolean; requested: boolean };
}

export default function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, error, refetch } = useApiQuery<TeamDetail>(`/api/teams/${id}`);
  const [draft, setDraft] = useState<{ purpose: string; openRoles: string; lookingForMembers: boolean } | null>(null);

  if (error) return <EmptyState title="Team not found" body={error} action={<LinkButton href="/teams">All teams</LinkButton>} />;
  if (!data) return <div className="skeleton" style={{ height: 320 }} />;
  const { team, me } = data;
  const form = draft ?? { purpose: team.purpose, openRoles: team.openRoles.join(', '), lookingForMembers: team.lookingForMembers };

  const act = async (body: Record<string, unknown>, success?: string) => {
    try {
      await api.post(`/api/teams/${id}`, body);
      if (success) toast.success(success);
      refetch();
      return true;
    } catch (caught) {
      toast.error('That did not work', errorMessage(caught));
      return false;
    }
  };

  return (
    <div className="stack gap-5" style={{ maxWidth: 760 }}>
      <Link href="/teams" className="row gap-1 dim" style={{ fontSize: 'var(--t-sm)' }}><ArrowLeft size={14} /> Teams</Link>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{team.name}</h1>
          <p className={styles.pageSubtitle}>{team.members.length}/{team.maxSize} members{team.lookingForMembers ? ' · looking for members' : ''}</p>
        </div>
        {team.hubServer && <LinkButton href={`/hub/${team.hubServer}`} icon={<Hash size={15} />}>Open workspace</LinkButton>}
      </div>

      {me.captain && team.requests.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>Requests to join</div>
          <div className={cs.panel}>
            {team.requests.map((r) => (
              <div key={r._id} className={cs.rowItem} style={{ alignItems: 'flex-start' }}>
                <div className="stack gap-1" style={{ flex: 1 }}>
                  <Link href={`/u/${r._id}`}><strong>{r.name}</strong></Link>
                  {r.specializations.length > 0 && <div className="row gap-1 wrap">{r.specializations.map((s) => <Chip key={s} outline>{s}</Chip>)}</div>}
                  {r.note && <span className="muted">{r.note}</span>}
                  <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{timeAgo(r.at)}</span>
                </div>
                <Button size="sm" onClick={() => act({ action: 'accept', userId: r._id }, `${r.name} joined`)}>Accept</Button>
                <Button size="sm" variant="ghost" onClick={() => act({ action: 'decline', userId: r._id })}>Decline</Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>Members</div>
        <div className={cs.panel}>
          {team.members.map((m) => (
            <div key={m._id} className={cs.rowItem}>
              <Avatar name={m.name} image={m.image} seed={m._id} size={30} />
              <Link href={`/u/${m._id}`} style={{ flex: 1, color: 'inherit' }}><strong>{m.name}</strong> <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{m.batch}</span></Link>
              {m._id === team.captain ? <Chip tone="amber" icon={<Crown size={11} />}>Captain</Chip> : me.captain && (
                <>
                  <Button size="sm" variant="ghost" onClick={async () => { if (await confirm({ title: `Make ${m.name} captain?`, body: 'You stay on the team as a member.', confirmLabel: 'Hand over' })) void act({ action: 'captain', userId: m._id }, 'Captain changed'); }}>Make captain</Button>
                  <button className="dim" aria-label={`Remove ${m.name}`} onClick={async () => { if (await confirm({ title: `Remove ${m.name}?`, confirmLabel: 'Remove', destructive: true })) void act({ action: 'remove', userId: m._id }); }}><Trash2 size={14} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {me.captain && (
        <section className={cs.panel}>
          <div className={styles.sectionHead}>Team settings</div>
          <Textarea label="About" rows={2} value={form.purpose} onChange={(e) => setDraft({ ...form, purpose: e.target.value })} />
          <Input label="Roles you need" hint="Comma-separated" value={form.openRoles} onChange={(e) => setDraft({ ...form, openRoles: e.target.value })} />
          <Switch checked={form.lookingForMembers} onChange={(lookingForMembers) => setDraft({ ...form, lookingForMembers })} label="Show in “looking for members”" />
          <div className="row gap-2">
            <Button size="sm" disabled={!draft} onClick={async () => { if (await act({ action: 'update', purpose: form.purpose, openRoles: form.openRoles.split(',').map((r) => r.trim()).filter((r) => r.length >= 2), lookingForMembers: form.lookingForMembers }, 'Saved')) setDraft(null); }}>Save</Button>
            <Button size="sm" variant="ghost" onClick={async () => { if (await confirm({ title: 'Archive the team?', body: 'It disappears from listings. The workspace stays for history.', confirmLabel: 'Archive', destructive: true })) { await act({ action: 'archive' }); router.push('/teams'); } }}>Archive team</Button>
          </div>
        </section>
      )}
      {me.member && !me.captain && (
        <div><Button variant="ghost" size="sm" onClick={async () => { if (await confirm({ title: `Leave ${team.name}?`, confirmLabel: 'Leave', destructive: true })) { await act({ action: 'leave' }); router.push('/teams'); } }}>Leave team</Button></div>
      )}
      {dialog}
    </div>
  );
}
