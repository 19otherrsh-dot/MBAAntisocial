'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Plus, Trash2, Link2, ExternalLink } from 'lucide-react';
import { CHANNEL_KIND_META, PERMISSIONS, PERMISSION_META, SLOW_MODE_OPTIONS, type PermissionName } from '@mba/shared/hub';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { Avatar, Banner, Chip, Segmented } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/useConfirm';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { cn } from '@/lib/utils';
import type { HubChannelInfo, HubMemberView, HubRoleInfo, HubServerDetail } from './types';
import styles from './hub.module.css';

type Tab = 'overview' | 'channels' | 'roles' | 'members' | 'requests' | 'invites';

const has = (perms: number, name: PermissionName) => Boolean(perms & PERMISSIONS.ADMINISTRATOR) || (perms & PERMISSIONS[name]) === PERMISSIONS[name];

export default function ServerSettingsDialog({
  open,
  onClose,
  detail,
  members,
  onChanged,
  initialTab = 'overview',
}: {
  open: boolean;
  onClose: () => void;
  detail: HubServerDetail;
  members: HubMemberView[];
  onChanged: () => void;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  if (!open) return null;
  const perms = detail.permissions;
  const tabs: Array<{ value: Tab; label: string }> = [
    { value: 'overview', label: 'Overview' },
    ...(has(perms, 'MANAGE_CHANNELS') ? [{ value: 'channels' as Tab, label: 'Channels' }] : []),
    ...(has(perms, 'MANAGE_ROLES') ? [{ value: 'roles' as Tab, label: 'Roles' }] : []),
    ...(has(perms, 'MODERATE_MEMBERS') || has(perms, 'MANAGE_ROLES') ? [{ value: 'members' as Tab, label: 'Members' }] : []),
    ...(detail.server.visibility === 'request' && has(perms, 'KICK_MEMBERS') ? [{ value: 'requests' as Tab, label: 'Requests' }] : []),
    ...(has(perms, 'CREATE_INVITE') ? [{ value: 'invites' as Tab, label: 'Invites & Discord' }] : []),
  ];

  return (
    <Dialog open wide onClose={onClose} title={`${detail.server.name} settings`}>
      <Segmented ariaLabel="Settings section" value={tab} onChange={setTab} options={tabs} />
      <div className="stack gap-4 mt-4">
        {tab === 'overview' && <Overview detail={detail} onChanged={onChanged} onClose={onClose} />}
        {tab === 'channels' && <Channels detail={detail} onChanged={onChanged} />}
        {tab === 'roles' && <Roles detail={detail} onChanged={onChanged} />}
        {tab === 'members' && <Members detail={detail} members={members} onChanged={onChanged} />}
        {tab === 'requests' && <Requests serverId={detail.server._id} onChanged={onChanged} />}
        {tab === 'invites' && <Invites detail={detail} />}
      </div>
    </Dialog>
  );
}

function Overview({ detail, onChanged, onClose }: { detail: HubServerDetail; onChanged: () => void; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const canManage = has(detail.permissions, 'MANAGE_SERVER');
  const [form, setForm] = useState({
    name: detail.server.name,
    description: detail.server.description,
    visibility: detail.server.visibility,
    color: detail.server.color,
  });

  const save = async () => {
    try {
      await api.patch(`/api/hub/servers/${detail.server._id}`, detail.server.kind === 'campus' ? { description: form.description, color: form.color } : form);
      toast.success('Saved');
      onChanged();
    } catch (caught) {
      toast.error('Could not save', errorMessage(caught));
    }
  };

  const setNotify = async (notify: 'all' | 'mentions' | 'none') => {
    await api.post(`/api/hub/servers/${detail.server._id}/membership`, { action: 'join', notify });
    toast.success('Notification level updated');
    onChanged();
  };

  const leave = async () => {
    if (!(await confirm({ title: `Leave ${detail.server.name}?`, confirmLabel: 'Leave', destructive: true }))) return;
    try {
      await api.post(`/api/hub/servers/${detail.server._id}/membership`, { action: 'leave' });
      onClose();
      onChanged();
      router.push('/hub');
    } catch (caught) {
      toast.error('Could not leave', errorMessage(caught));
    }
  };

  const archive = async () => {
    if (!(await confirm({ title: 'Archive this server?', body: 'Nobody can post in it any more. Messages stay for moderation.', confirmLabel: 'Archive', destructive: true }))) return;
    try {
      await api.delete(`/api/hub/servers/${detail.server._id}`);
      onClose();
      onChanged();
      router.push('/hub');
    } catch (caught) {
      toast.error('Could not archive', errorMessage(caught));
    }
  };

  return (
    <>
      {canManage ? (
        <>
          <Input label="Name" value={form.name} disabled={detail.server.kind === 'campus'} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Textarea label="Description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          {detail.server.kind !== 'campus' && (
            <Select
              label="Who can join"
              value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value as typeof form.visibility })}
              options={[
                { value: 'public', label: 'Anyone on campus' },
                { value: 'request', label: 'Request to join' },
                { value: 'invite', label: 'Invite only (hidden from Explore)' },
              ]}
            />
          )}
          <Input label="Colour" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          <div><Button onClick={save}>Save changes</Button></div>
        </>
      ) : (
        <p className="muted">{detail.server.description || 'No description.'}</p>
      )}
      <Select
        label="Notify me about"
        value={detail.member?.notify ?? 'mentions'}
        onChange={(e) => setNotify(e.target.value as 'all' | 'mentions' | 'none')}
        options={[
          { value: 'mentions', label: 'Only @mentions (recommended)' },
          { value: 'all', label: 'All messages' },
          { value: 'none', label: 'Nothing (muted)' },
        ]}
      />
      <div className="row gap-2 wrap">
        {detail.server.kind !== 'campus' && !detail.isOwner && <Button variant="dangerGhost" onClick={leave}>Leave server</Button>}
        {detail.isOwner && detail.server.kind !== 'campus' && <Button variant="dangerGhost" onClick={archive}>Archive server</Button>}
      </div>
      {dialog}
    </>
  );
}

function Channels({ detail, onChanged }: { detail: HubServerDetail; onChanged: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState<HubChannelInfo | 'new' | null>(null);
  const everyoneId = detail.roles.find((r) => r.isEveryone)?._id ?? '';

  const remove = async (channel: HubChannelInfo) => {
    try {
      await api.delete(`/api/hub/channels/${channel._id}`);
      onChanged();
    } catch (caught) {
      toast.error('Could not delete', errorMessage(caught));
    }
  };

  if (editing) {
    return <ChannelEditor channel={editing === 'new' ? null : editing} serverId={detail.server._id} everyoneId={everyoneId} roles={detail.roles} onDone={() => { setEditing(null); onChanged(); }} />;
  }

  return (
    <>
      <div><Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>New channel</Button></div>
      {detail.channels.map((c) => (
        <div key={c._id} className="between gap-3">
          <span className="row gap-2">
            <Chip outline>{CHANNEL_KIND_META[c.kind].label}</Chip>
            <strong>{c.kind === 'voice' ? '🔊' : '#'}{c.name}</strong>
            {c.category && <span className="dim">· {c.category}</span>}
            {c.discord && <Chip tone="violet">Discord {c.discord.direction}</Chip>}
          </span>
          <span className="row gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Edit</Button>
            <Button size="sm" variant="dangerGhost" icon={<Trash2 size={14} />} aria-label={`Delete ${c.name}`} onClick={() => remove(c)} />
          </span>
        </div>
      ))}
    </>
  );
}

function ChannelEditor({ channel, serverId, everyoneId, roles, onDone }: { channel: HubChannelInfo | null; serverId: string; everyoneId: string; roles: HubRoleInfo[]; onDone: () => void }) {
  const toast = useToast();
  const everyoneOverwrite = channel?.overwrites?.find((o) => o.target === everyoneId);
  const [form, setForm] = useState({
    name: channel?.name ?? '',
    kind: channel?.kind ?? 'text',
    topic: channel?.topic ?? '',
    category: channel?.category ?? '',
    slowModeSeconds: channel?.slowModeSeconds ?? 0,
    readOnly: Boolean(everyoneOverwrite && everyoneOverwrite.deny & PERMISSIONS.SEND_MESSAGES),
    private: Boolean(everyoneOverwrite && everyoneOverwrite.deny & PERMISSIONS.VIEW_CHANNEL),
    allowedRoles: (channel?.overwrites ?? []).filter((o) => o.kind === 'role' && o.target !== everyoneId && o.allow & PERMISSIONS.VIEW_CHANNEL).map((o) => o.target),
  });
  const [bridge, setBridge] = useState({ webhookUrl: '', discordChannelId: channel?.discord?.channelId ?? '', direction: channel?.discord?.direction ?? 'out' });

  const overwrites = () => {
    const list: Array<{ target: string; kind: 'role'; allow: number; deny: number }> = [];
    let deny = 0;
    if (form.readOnly) deny |= PERMISSIONS.SEND_MESSAGES | PERMISSIONS.CREATE_THREADS;
    if (form.private) deny |= PERMISSIONS.VIEW_CHANNEL;
    if (deny) list.push({ target: everyoneId, kind: 'role', allow: 0, deny });
    if (form.private) for (const role of form.allowedRoles) list.push({ target: role, kind: 'role', allow: PERMISSIONS.VIEW_CHANNEL | PERMISSIONS.SEND_MESSAGES, deny: 0 });
    return list;
  };

  const save = async () => {
    try {
      const body = { name: form.name, topic: form.topic, category: form.category, slowModeSeconds: form.slowModeSeconds, overwrites: overwrites() };
      if (channel) await api.patch(`/api/hub/channels/${channel._id}`, body);
      else await api.post(`/api/hub/servers/${serverId}/channels`, { ...body, kind: form.kind });
      toast.success(channel ? 'Channel updated' : 'Channel created');
      onDone();
    } catch (caught) {
      toast.error('Could not save', errorMessage(caught));
    }
  };

  const saveBridge = async (remove = false) => {
    if (!channel) return;
    try {
      if (remove) await api.delete(`/api/hub/channels/${channel._id}/discord`);
      else await fetch(`/api/hub/channels/${channel._id}/discord`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...bridge, webhookUrl: bridge.webhookUrl || undefined, discordChannelId: bridge.discordChannelId || undefined }) }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error?.message ?? 'Failed');
      });
      toast.success(remove ? 'Bridge removed' : 'Bridge saved');
      onDone();
    } catch (caught) {
      toast.error('Could not update the bridge', errorMessage(caught));
    }
  };

  return (
    <>
      <div className="row gap-3 wrap">
        <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="placement-prep" />
        {!channel && (
          <Select label="Type" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as typeof form.kind })}
            options={Object.entries(CHANNEL_KIND_META).map(([value, meta]) => ({ value, label: meta.label }))} />
        )}
        <Input label="Category" optional value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
      </div>
      <Input label="Topic" optional value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
      {form.kind !== 'voice' && (
        <>
          <Select label="Slow mode" value={String(form.slowModeSeconds)} onChange={(e) => setForm({ ...form, slowModeSeconds: Number(e.target.value) })}
            options={SLOW_MODE_OPTIONS.map((s) => ({ value: String(s), label: s === 0 ? 'Off' : s < 60 ? `${s} seconds` : `${s / 60} minutes` }))} />
          <Switch label="Read-only for everyone" hint="Only roles with Manage Messages can post — good for announcements." checked={form.readOnly} onChange={(readOnly) => setForm({ ...form, readOnly })} />
        </>
      )}
      <Switch label="Private" hint="Hidden from everyone except the roles you pick." checked={form.private} onChange={(p) => setForm({ ...form, private: p })} />
      {form.private && (
        <div className="row gap-2 wrap">
          {roles.filter((r) => !r.isEveryone).map((r) => {
            const on = form.allowedRoles.includes(r._id);
            return (
              <button key={r._id} type="button" aria-pressed={on} onClick={() => setForm({ ...form, allowedRoles: on ? form.allowedRoles.filter((x) => x !== r._id) : [...form.allowedRoles, r._id] })}>
                <Chip tone={on ? 'violet' : 'slate'}>{r.name}</Chip>
              </button>
            );
          })}
        </div>
      )}
      <div className="row gap-2"><Button onClick={save}>{channel ? 'Save channel' : 'Create channel'}</Button><Button variant="ghost" onClick={onDone}>Back</Button></div>

      {channel && channel.kind !== 'voice' && (
        <div className={styles.serverCard}>
          <strong className="row gap-2"><Link2 size={15} /> Discord bridge</strong>
          <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>
            Outbound mirrors this channel into Discord through a webhook (Discord → channel settings → Integrations → Webhooks). Inbound needs the bot in your Discord server and the Discord channel id.
          </p>
          <Select label="Direction" value={bridge.direction} onChange={(e) => setBridge({ ...bridge, direction: e.target.value as typeof bridge.direction })}
            options={[{ value: 'out', label: 'Hub → Discord' }, { value: 'in', label: 'Discord → Hub' }, { value: 'both', label: 'Both ways' }]} />
          {bridge.direction !== 'in' && <Input label="Discord webhook URL" placeholder={channel.discord?.hasWebhook ? '•••• saved — paste to replace' : 'https://discord.com/api/webhooks/…'} value={bridge.webhookUrl} onChange={(e) => setBridge({ ...bridge, webhookUrl: e.target.value })} />}
          {bridge.direction !== 'out' && <Input label="Discord channel id" placeholder="1234567890" value={bridge.discordChannelId} onChange={(e) => setBridge({ ...bridge, discordChannelId: e.target.value })} />}
          <div className="row gap-2"><Button variant="secondary" onClick={() => saveBridge()}>Save bridge</Button>{channel.discord && <Button variant="dangerGhost" onClick={() => saveBridge(true)}>Remove bridge</Button>}</div>
        </div>
      )}
    </>
  );
}

function Roles({ detail, onChanged }: { detail: HubServerDetail; onChanged: () => void }) {
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(detail.roles[0]?._id ?? null);
  const role = detail.roles.find((r) => r._id === selected);
  const [draft, setDraft] = useState<HubRoleInfo | null>(role ?? null);
  const current = draft && draft._id === selected ? draft : role ?? null;

  const create = async () => {
    try {
      await api.post(`/api/hub/servers/${detail.server._id}/roles`, { name: 'New role', permissions: detail.roles.find((r) => r.isEveryone)?.permissions ?? 0, color: '#4c6ef5' });
      onChanged();
    } catch (caught) {
      toast.error('Could not create role', errorMessage(caught));
    }
  };

  const save = async () => {
    if (!current) return;
    try {
      await api.patch(`/api/hub/roles/${current._id}`, { name: current.isEveryone ? undefined : current.name, color: current.color, permissions: current.permissions, hoist: current.hoist, mentionable: current.mentionable });
      toast.success('Role saved');
      onChanged();
    } catch (caught) {
      toast.error('Could not save role', errorMessage(caught));
    }
  };

  const remove = async () => {
    if (!current) return;
    try {
      await api.delete(`/api/hub/roles/${current._id}`);
      setSelected(null);
      onChanged();
    } catch (caught) {
      toast.error('Could not delete role', errorMessage(caught));
    }
  };

  const groups = [...new Set(Object.values(PERMISSION_META).map((m) => m.group))];

  return (
    <div className="row gap-4" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div className="stack gap-1" style={{ minWidth: 180 }}>
        {detail.roles.map((r) => (
          <button key={r._id} className={cn(styles.channel, r._id === selected && styles.channelActive)} onClick={() => { setSelected(r._id); setDraft(r); }}>
            <span className={styles.roleSwatch} style={{ background: r.color || 'var(--line-strong)' }} /> {r.name}
          </button>
        ))}
        <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={create}>Add role</Button>
      </div>
      {current && (
        <div className="stack gap-3" style={{ flex: 1, minWidth: 280 }}>
          <div className="row gap-3 wrap">
            <Input label="Name" value={current.name} disabled={current.isEveryone || Boolean(current.managedBy)} onChange={(e) => setDraft({ ...current, name: e.target.value })} />
            <Input label="Colour" type="color" value={current.color || '#999999'} onChange={(e) => setDraft({ ...current, color: e.target.value })} />
          </div>
          {current.managedBy && <Banner variant="info">Assigned automatically from campus roles.</Banner>}
          {!current.isEveryone && (
            <div className="row gap-4 wrap">
              <Switch label="Show separately in the member list" checked={current.hoist} onChange={(hoist) => setDraft({ ...current, hoist })} />
              <Switch label="Anyone can @mention" checked={current.mentionable} onChange={(mentionable) => setDraft({ ...current, mentionable })} />
            </div>
          )}
          <div className={styles.permGrid}>
            {groups.map((group) => (
              <PermissionGroup key={group} group={group} perms={current.permissions} onToggle={(bit) => setDraft({ ...current, permissions: current.permissions ^ bit })} />
            ))}
          </div>
          <div className="row gap-2"><Button onClick={save}>Save role</Button>{!current.isEveryone && !current.managedBy && <Button variant="dangerGhost" onClick={remove}>Delete role</Button>}</div>
        </div>
      )}
    </div>
  );
}

function PermissionGroup({ group, perms, onToggle }: { group: string; perms: number; onToggle: (bit: number) => void }) {
  const names = (Object.keys(PERMISSION_META) as PermissionName[]).filter((n) => PERMISSION_META[n].group === group);
  return (
    <>
      <div className={styles.permGroup}>{group}</div>
      {names.map((name) => (
        <div key={name} style={{ display: 'contents' }}>
          <span title={PERMISSION_META[name].help}>{PERMISSION_META[name].label}<br /><span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{PERMISSION_META[name].help}</span></span>
          <Switch label="" checked={(perms & PERMISSIONS[name]) !== 0} onChange={() => onToggle(PERMISSIONS[name])} />
        </div>
      ))}
    </>
  );
}

function Members({ detail, members, onChanged }: { detail: HubServerDetail; members: HubMemberView[]; onChanged: () => void }) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [q, setQ] = useState('');
  const assignable = detail.roles.filter((r) => !r.isEveryone && !r.managedBy);
  const canRoles = has(detail.permissions, 'MANAGE_ROLES');
  const canModerate = has(detail.permissions, 'MODERATE_MEMBERS');

  const update = async (userId: string, body: Record<string, unknown>, success: string) => {
    try {
      await api.patch(`/api/hub/servers/${detail.server._id}/members/${userId}`, body);
      toast.success(success);
      onChanged();
    } catch (caught) {
      toast.error('Could not update', errorMessage(caught));
    }
  };

  return (
    <>
      <Input aria-label="Search members" placeholder="Search members…" value={q} onChange={(e) => setQ(e.target.value)} />
      {members.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())).slice(0, 60).map((m) => (
        <div key={m.userId} className="between gap-3 wrap">
          <span className="row gap-2"><Avatar name={m.name} image={m.image} seed={m.userId} size={28} /><strong>{m.name}</strong><span className="dim">{m.batch}</span></span>
          <span className="row gap-1 wrap">
            {canRoles && assignable.map((r) => {
              const on = m.roles.includes(r._id);
              return (
                <button key={r._id} type="button" onClick={() => update(m.userId, { roles: on ? m.roles.filter((x) => x !== r._id) : [...m.roles.filter((x) => assignable.some((a) => a._id === x)), r._id] }, on ? `Removed ${r.name}` : `Gave ${r.name}`)}>
                  <Chip tone={on ? 'violet' : 'slate'} outline={!on}>{r.name}</Chip>
                </button>
              );
            })}
            {canModerate && (
              <Select aria-label={`Time out ${m.name}`} value="" onChange={(e) => update(m.userId, { timeoutMinutes: Number(e.target.value) }, Number(e.target.value) ? 'Timed out' : 'Timeout cleared')}
                options={[{ value: '', label: m.timedOutUntil ? 'Timed out' : 'Timeout…' }, { value: '10', label: '10 min' }, { value: '60', label: '1 hour' }, { value: '1440', label: '1 day' }, { value: '0', label: 'Clear' }]} />
            )}
            {has(detail.permissions, 'BAN_MEMBERS') && (
              <Button size="sm" variant="dangerGhost" onClick={async () => {
                if (await confirm({ title: `Ban ${m.name}?`, body: 'They are removed and cannot rejoin.', confirmLabel: 'Ban', destructive: true })) await update(m.userId, { action: 'ban' }, 'Banned');
              }}>Ban</Button>
            )}
          </span>
        </div>
      ))}
      {dialog}
    </>
  );
}

function Requests({ serverId, onChanged }: { serverId: string; onChanged: () => void }) {
  const { data, refetch } = useApiQuery<{ requests: Array<{ _id: string; note: string; user: { _id: string; name: string; image?: string; batch: string } }> }>(`/api/hub/servers/${serverId}/requests`);
  const handle = async (userId: string, approve: boolean) => {
    await api.patch(`/api/hub/servers/${serverId}/requests`, { userId, approve });
    refetch();
    onChanged();
  };
  if (!data) return <div className="skeleton" style={{ height: 80 }} />;
  if (data.requests.length === 0) return <p className="dim">No pending requests.</p>;
  return (
    <>
      {data.requests.map((r) => (
        <div key={r._id} className="between gap-3 wrap">
          <span className="row gap-2"><Avatar name={r.user.name} image={r.user.image} seed={r.user._id} size={28} /><strong>{r.user.name}</strong><span className="dim">{r.note}</span></span>
          <span className="row gap-2"><Button size="sm" onClick={() => handle(r.user._id, true)}>Approve</Button><Button size="sm" variant="ghost" onClick={() => handle(r.user._id, false)}>Decline</Button></span>
        </div>
      ))}
    </>
  );
}

function Invites({ detail }: { detail: HubServerDetail }) {
  const toast = useToast();
  const [link, setLink] = useState<string | null>(null);
  const create = async () => {
    try {
      const { url } = await api.post<{ url: string }>(`/api/hub/servers/${detail.server._id}/invites`, { maxUses: 0, expiresInHours: 168 });
      setLink(url);
    } catch (caught) {
      toast.error('Could not create invite', errorMessage(caught));
    }
  };
  return (
    <>
      <p className="muted">Invite links work only for people at your campus, and expire after a week.</p>
      <div className="row gap-2 wrap">
        <Button onClick={create}>Create invite link</Button>
        {link && (
          <>
            <code className="rt-code">{link}</code>
            <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => { void navigator.clipboard.writeText(link); toast.success('Copied'); }}>Copy</Button>
          </>
        )}
      </div>
      {detail.discordBotInviteUrl && (
        <div className={styles.serverCard}>
          <strong>Connect a Discord server</strong>
          <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>Add the bot to your club’s Discord, then bridge individual channels from Channels → Edit → Discord bridge.</p>
          <a href={detail.discordBotInviteUrl} target="_blank" rel="noopener noreferrer"><Button variant="secondary" icon={<ExternalLink size={14} />}>Add bot to Discord</Button></a>
        </div>
      )}
    </>
  );
}
