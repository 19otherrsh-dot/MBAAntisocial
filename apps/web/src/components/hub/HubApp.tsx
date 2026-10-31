'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Hash, Volume2, Megaphone, MessagesSquare, Plus, Compass, Settings, Users, Pin, X, ChevronLeft, MessageCircle, ChevronDown, Lock, Mic,
} from 'lucide-react';
import { hasPermission } from '@mba/shared/hub';
import { topics } from '@mba/shared/realtime';
import Button, { LinkButton } from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Avatar, Banner, EmptyState } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { useMe } from '@/lib/client/me';
import { useTopic, isEvent } from '@/lib/client/realtime';
import { cn, getInitials, timeAgo } from '@/lib/utils';
import type { MentionResolver } from '@/components/RichText';
import Conversation, { type ConversationTarget } from './Conversation';
import ServerSettingsDialog from './ServerSettingsDialog';
import type { ConversationSummary, HubChannelInfo, HubMemberView, HubMessageView, HubServerDetail, HubServerSummary } from './types';
import styles from './hub.module.css';
import { backgroundForWhiteText } from '@/lib/color';

type Panel = { kind: 'thread'; message: HubMessageView } | { kind: 'pins' } | { kind: 'members' } | null;

interface Props {
  mode: 'server' | 'dm';
  serverId?: string;
  channelId?: string;
  conversationId?: string;
}

const CHANNEL_ICON = { text: Hash, announcement: Megaphone, voice: Volume2, forum: MessagesSquare } as const;

/**
 * The community hub: campus, clubs, circles, and DMs in one place. Layout and
 * routing live here; timelines live in `Conversation`.
 */
export default function HubApp({ mode, serverId, channelId, conversationId }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { me } = useMe();
  const [panel, setPanel] = useState<Panel>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(Boolean(params.get('settings')));
  const [dmOpen, setDmOpen] = useState(false);

  const { data: serversData, refetch: refetchServers } = useApiQuery<{ servers: HubServerSummary[] }>('/api/hub/servers');
  const { data: unread, refetch: refetchUnread } = useApiQuery<{ servers: Record<string, { unread: boolean; mentions: number }>; unreadDms: number }>('/api/hub/unread');
  const servers = useMemo(() => serversData?.servers ?? [], [serversData]);
  const activeServerId = mode === 'server' ? serverId ?? servers[0]?._id : undefined;

  const { data: detail, refetch: refetchDetail, mutate: mutateDetail } = useApiQuery<HubServerDetail>(activeServerId ? `/api/hub/servers/${activeServerId}` : null);
  const { data: membersData, refetch: refetchMembers } = useApiQuery<{ members: HubMemberView[] }>(activeServerId ? `/api/hub/servers/${activeServerId}/members` : null);
  const { data: dmData, refetch: refetchDms, mutate: mutateDms } = useApiQuery<{ conversations: ConversationSummary[] }>(mode === 'dm' ? '/api/hub/dm' : null);
  const { data: dmDetail } = useApiQuery<{ conversation: { participants: Array<{ _id: string; name: string; image?: string }>; name: string; kind: string } }>(
    mode === 'dm' && conversationId ? `/api/hub/dm/${conversationId}` : null,
    { limit: 1 }
  );

  const members = useMemo(() => membersData?.members ?? [], [membersData]);
  const channels = useMemo(() => detail?.channels ?? [], [detail]);
  const activeChannel: HubChannelInfo | undefined =
    mode === 'server' ? channels.find((c) => c._id === channelId) ?? (channelId ? undefined : channels.find((c) => c.kind !== 'voice')) : undefined;

  // Sidebar unread dots and the rail badges, live.
  useTopic(activeServerId ? topics.hubServer(activeServerId) : null, (envelope) => {
    if (isEvent(envelope, 'hub.activity')) {
      const { channelId: cid, authorId } = envelope.data;
      if (cid !== activeChannel?._id && authorId !== me?.id) {
        mutateDetail((current) => ({ ...current, channels: current.channels.map((c) => (c._id === cid ? { ...c, unread: true } : c)) }));
      }
      refetchUnread();
    } else if (isEvent(envelope, 'hub.channel.updated') || isEvent(envelope, 'hub.channel.deleted')) {
      refetchDetail();
    }
  });
  useTopic(me?.id ? topics.user(me.id) : null, (envelope) => {
    if (isEvent(envelope, 'dm.message.created')) {
      if (mode === 'dm') {
        mutateDms((current) => ({
          conversations: current.conversations
            .map((c) => (c._id === envelope.data.conversationId ? { ...c, lastMessageAt: new Date().toISOString(), lastMessagePreview: (envelope.data.message as HubMessageView).content.slice(0, 140), unread: c._id !== conversationId } : c))
            .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')),
        }));
      }
      refetchUnread();
    }
  });

  const resolver = useMemo<MentionResolver>(() => {
    const names = new Map(members.map((m) => [m.userId, m.nickname || m.name]));
    for (const p of dmDetail?.conversation.participants ?? []) names.set(p._id, p.name);
    const roles = new Map((detail?.roles ?? []).map((r) => [r._id, { name: r.name, color: r.color }]));
    const chans = new Map(channels.map((c) => [c._id, c.name]));
    return { user: (id) => names.get(id), role: (id) => roles.get(id), channel: (id) => chans.get(id), selfId: me?.id };
  }, [members, detail, channels, dmDetail, me]);

  const perms = detail?.permissions ?? 0;
  const channelOpen = mode === 'server' ? Boolean(channelId) : Boolean(conversationId);

  const target: ConversationTarget | null = useMemo(() => {
    if (mode === 'dm' && conversationId) {
      const others = dmDetail?.conversation.participants.filter((p) => p._id !== me?.id) ?? [];
      const title = dmDetail?.conversation.name || others.map((p) => p.name).join(', ') || 'Direct message';
      return {
        endpoint: `/api/hub/dm/${conversationId}`,
        topic: topics.dm(conversationId),
        readTarget: { targetId: conversationId, kind: 'conversation' },
        kind: 'dm',
        title,
        canSend: true,
        placeholder: `Message ${title}`,
      };
    }
    if (mode === 'server' && activeChannel && activeChannel.kind !== 'voice') {
      return {
        endpoint: `/api/hub/channels/${activeChannel._id}/messages`,
        topic: topics.hubChannel(activeChannel._id),
        readTarget: { targetId: activeChannel._id, kind: 'channel' },
        kind: 'channel',
        title: `Welcome to #${activeChannel.name}`,
        label: `#${activeChannel.name}`,
        canSend: activeChannel.canSend && !detail?.member?.timedOutUntil,
        cannotSendReason: detail?.member?.timedOutUntil ? 'You are timed out for now. You can still read.' : activeChannel.kind === 'announcement' ? 'Only managers post announcements.' : undefined,
        forum: activeChannel.kind === 'forum',
        canModerate: hasPermission(perms, 'MANAGE_MESSAGES'),
        canPin: hasPermission(perms, 'PIN_MESSAGES'),
        slowModeSeconds: activeChannel.slowModeSeconds,
        placeholder: activeChannel.kind === 'forum' ? 'Describe your question…' : `Message #${activeChannel.name}`,
      };
    }
    return null;
  }, [mode, conversationId, dmDetail, me, activeChannel, detail, perms]);

  const openThread = (message: HubMessageView) => setPanel({ kind: 'thread', message });

  return (
    <div className={cn(styles.hub, channelOpen && styles.hubChannelOpen)}>
      {/* The layout is the heading visually; screen readers get it named. */}
      <h1 className="sr-only">{mode === 'dm' ? 'Direct messages' : `Hub${detail?.server.name ? ` · ${detail.server.name}` : ''}`}</h1>
      {/* ───── Server rail ───── */}
      <nav className={styles.rail} aria-label="Servers">
        <Link href="/hub/dm" className={cn(styles.railItem, styles.railItemGhost, mode === 'dm' && styles.railItemActive)} title="Direct messages" aria-label="Direct messages">
          <MessageCircle size={20} />
          {(unread?.unreadDms ?? 0) > 0 && <span className={styles.railBadge}>{unread!.unreadDms}</span>}
        </Link>
        <span className={styles.railDivider} />
        {servers.map((s) => {
          const u = unread?.servers[s._id];
          return (
            <Link key={s._id} href={`/hub/${s._id}`} className={cn(styles.railItem, s._id === activeServerId && styles.railItemActive)} style={{ background: backgroundForWhiteText(s.color) }} title={s.name} aria-label={s.name}>
              {s.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.icon} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                getInitials(s.name)
              )}
              {u?.unread && s._id !== activeServerId && !u.mentions && <span className={styles.railDot} />}
              {(u?.mentions ?? 0) > 0 && <span className={styles.railBadge}>{u!.mentions}</span>}
            </Link>
          );
        })}
        <button className={cn(styles.railItem, styles.railItemGhost)} onClick={() => setCreateOpen(true)} title="Create a server" aria-label="Create a server">
          <Plus size={20} />
        </button>
        <Link href="/hub/explore" className={cn(styles.railItem, styles.railItemGhost)} title="Explore servers" aria-label="Explore servers">
          <Compass size={20} />
        </Link>
      </nav>

      {/* ───── Sidebar ───── */}
      {mode === 'server' ? (
        <aside className={styles.sidebar} aria-label="Channels">
          <div className={styles.sidebarHead}>
            <span className="truncate">{detail?.server.name ?? 'Loading…'}</span>
            {detail && (
              <Button size="sm" variant="ghost" icon={<Settings size={15} />} aria-label="Server settings" onClick={() => setSettingsOpen(true)} />
            )}
          </div>
          <div className={styles.sidebarScroll}>
            {!detail ? (
              <div className="skeleton" style={{ height: 200 }} />
            ) : (
              <ChannelList
                channels={channels}
                activeId={activeChannel?._id}
                serverId={detail.server._id}
                canManage={hasPermission(perms, 'MANAGE_CHANNELS')}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            )}
          </div>
          {me && (
            <div className={styles.sidebarFoot}>
              <Avatar name={me.name} image={me.image} seed={me.id} size={28} />
              <span className="truncate" style={{ fontWeight: 560 }}>{me.name}</span>
            </div>
          )}
        </aside>
      ) : (
        <aside className={styles.sidebar} aria-label="Direct messages">
          <div className={styles.sidebarHead}>
            <span>Direct messages</span>
            <Button size="sm" variant="ghost" icon={<Plus size={15} />} aria-label="New message" onClick={() => setDmOpen(true)} />
          </div>
          <div className={styles.sidebarScroll}>
            {(dmData?.conversations ?? []).length === 0 && (
              <p className="dim" style={{ padding: 12, fontSize: 'var(--t-sm)' }}>
                DMs open once something real happened between you — a session together, or they wrote first. No cold DMs to seniors, by design.
              </p>
            )}
            {(dmData?.conversations ?? []).map((c) => {
              const title = c.name || c.participants.map((p) => p.name).join(', ') || 'Conversation';
              return (
                <Link key={c._id} href={`/hub/dm/${c._id}`} className={cn(styles.channel, c._id === conversationId && styles.channelActive, c.unread && styles.channelUnread)}>
                  <Avatar name={title} image={c.participants[0]?.image} seed={c.participants[0]?._id} size={28} />
                  <span className={styles.channelName}>
                    {title}
                    <br />
                    <span className="dim" style={{ fontSize: 'var(--t-xs)', fontWeight: 400 }}>{c.lastMessagePreview || 'No messages yet'}</span>
                  </span>
                  {c.lastMessageAt && <span className="dim" style={{ fontSize: 10 }}>{timeAgo(c.lastMessageAt)}</span>}
                </Link>
              );
            })}
          </div>
        </aside>
      )}

      {/* ───── Main ───── */}
      <section className={styles.main}>
        {mode === 'server' && activeChannel?.kind === 'voice' ? (
          <VoiceStage channel={activeChannel} serverId={activeServerId!} />
        ) : target ? (
          <>
            <header className={styles.mainHead}>
              <Link href={mode === 'dm' ? '/hub/dm' : `/hub/${activeServerId}`} className={cn(styles.headButton, styles.backButton)} aria-label="Back"><ChevronLeft size={18} /></Link>
              <span className={styles.mainTitle}>{mode === 'dm' ? target.title : `#${activeChannel?.name}`}</span>
              <span className={styles.mainTopic}>{mode === 'server' ? activeChannel?.topic : ''}</span>
              {mode === 'server' && (
                <>
                  <button className={cn(styles.headButton, panel?.kind === 'pins' && styles.headButtonOn)} onClick={() => setPanel(panel?.kind === 'pins' ? null : { kind: 'pins' })} aria-label="Pinned messages" title="Pins"><Pin size={17} /></button>
                  <button className={cn(styles.headButton, panel?.kind === 'members' && styles.headButtonOn)} onClick={() => setPanel(panel?.kind === 'members' ? null : { kind: 'members' })} aria-label="Members" title="Members"><Users size={17} /></button>
                </>
              )}
            </header>
            <Conversation
              key={target.endpoint}
              target={target}
              members={mode === 'dm' ? (dmDetail?.conversation.participants ?? []).filter((p) => p._id !== me?.id).map((p) => ({ userId: p._id, name: p.name, image: p.image ?? '', role: '', batch: '', nickname: '', roles: [], online: false })) : members}
              resolver={resolver}
              onOpenThread={mode === 'server' ? openThread : undefined}
              intro={mode === 'server' ? <p className="muted">{activeChannel?.topic || 'This is the start of the channel.'}</p> : <p className="muted">Only the people in this conversation can see it.</p>}
              onRead={() => {
                if (mode === 'dm') mutateDms((current) => ({ conversations: current.conversations.map((c) => (c._id === conversationId ? { ...c, unread: false } : c)) }));
                else mutateDetail((current) => ({ ...current, channels: current.channels.map((c) => (c._id === activeChannel?._id ? { ...c, unread: false } : c)) }));
                refetchUnread();
              }}
            />
          </>
        ) : (
          <EmptyState
            art={<MessageCircle size={36} strokeWidth={1.4} />}
            title={mode === 'dm' ? 'Pick a conversation' : 'Pick a channel'}
            body={mode === 'dm' ? 'Or start one with someone you have had a session with.' : 'Channels are on the left.'}
          />
        )}
      </section>

      {/* ───── Side panel ───── */}
      {panel && mode === 'server' && activeChannel && (
        <aside className={styles.side} aria-label={panel.kind === 'thread' ? 'Thread' : panel.kind === 'pins' ? 'Pinned messages' : 'Members'}>
          <div className={styles.sideHead}>
            {panel.kind === 'thread' ? 'Thread' : panel.kind === 'pins' ? 'Pinned' : `Members · ${members.length}`}
            <Button size="sm" variant="ghost" icon={<X size={15} />} aria-label="Close panel" onClick={() => setPanel(null)} />
          </div>
          {panel.kind === 'thread' && (
            <div className={styles.main} style={{ flex: 1 }}>
              <Conversation
                key={panel.message._id}
                target={{
                  endpoint: `/api/hub/channels/${activeChannel._id}/messages`,
                  topic: topics.hubChannel(activeChannel._id),
                  readTarget: { targetId: activeChannel._id, kind: 'channel' },
                  kind: 'channel',
                  title: 'Thread',
                  thread: panel.message._id,
                  canSend: activeChannel.canSend || hasPermission(perms, 'SEND_MESSAGES'),
                  canModerate: hasPermission(perms, 'MANAGE_MESSAGES'),
                  canPin: false,
                  placeholder: 'Reply in thread',
                }}
                members={members}
                resolver={resolver}
              />
            </div>
          )}
          {panel.kind === 'pins' && <PinsList channelId={activeChannel._id} resolver={resolver} />}
          {panel.kind === 'members' && <MemberList members={members} roles={detail?.roles ?? []} />}
        </aside>
      )}

      {detail && (
        <ServerSettingsDialog
          key={detail.server._id}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          detail={detail}
          members={members}
          initialTab={params.get('settings') === 'requests' ? 'requests' : 'overview'}
          onChanged={() => {
            refetchDetail();
            refetchMembers();
            refetchServers();
          }}
        />
      )}
      <CreateServerDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); refetchServers(); router.push(`/hub/${id}`); }} />
      <NewDmDialog
        open={dmOpen}
        onClose={() => setDmOpen(false)}
        onStarted={(id) => {
          setDmOpen(false);
          refetchDms();
          router.push(`/hub/dm/${id}`);
        }}
        onError={(m) => toast.error('Cannot start that conversation', m)}
      />
    </div>
  );
}

function ChannelList({ channels, activeId, serverId, canManage, onOpenSettings }: { channels: HubChannelInfo[]; activeId?: string; serverId: string; canManage: boolean; onOpenSettings: () => void }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    const map = new Map<string, HubChannelInfo[]>();
    for (const c of channels) {
      const key = c.category || '';
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return [...map.entries()];
  }, [channels]);

  return (
    <>
      {groups.map(([category, list]) => (
        <div key={category || '_'}>
          {category && (
            <button className={styles.category} onClick={() => setCollapsed({ ...collapsed, [category]: !collapsed[category] })} aria-expanded={!collapsed[category]}>
              <ChevronDown size={12} style={{ transform: collapsed[category] ? 'rotate(-90deg)' : undefined }} /> {category}
            </button>
          )}
          {!collapsed[category] &&
            list.map((c) => {
              const Icon = CHANNEL_ICON[c.kind];
              return (
                <Link key={c._id} href={`/hub/${serverId}/${c._id}`} className={cn(styles.channel, c._id === activeId && styles.channelActive, c.unread && c._id !== activeId && styles.channelUnread)}>
                  <Icon size={16} />
                  <span className={styles.channelName}>{c.name}</span>
                  {!c.canSend && c.kind !== 'voice' && <Lock size={12} aria-label="Read only" />}
                </Link>
              );
            })}
        </div>
      ))}
      {canManage && (
        <button className={styles.channel} onClick={onOpenSettings}>
          <Plus size={16} /> Add a channel
        </button>
      )}
    </>
  );
}

function VoiceStage({ channel, serverId }: { channel: HubChannelInfo; serverId: string }) {
  const { data } = useApiQuery<{ participants: Array<{ userId: string; name: string }>; available: boolean }>(`/api/hub/channels/${channel._id}/voice`);
  return (
    <>
      <header className={styles.mainHead}>
        <Link href={`/hub/${serverId}`} className={cn(styles.headButton, styles.backButton)} aria-label="Back"><ChevronLeft size={18} /></Link>
        <span className={styles.mainTitle}>🔊 {channel.name}</span>
        <span className={styles.mainTopic}>{channel.topic}</span>
      </header>
      <div className={styles.voiceStage}>
        <Mic size={40} style={{ color: 'var(--accent)' }} />
        <h3 className={styles.timelineStartTitle}>{channel.name}</h3>
        {data && !data.available ? (
          <Banner variant="info">Voice rooms need LiveKit configured on this deployment.</Banner>
        ) : (
          <>
            <div className={styles.voiceGrid}>
              {(data?.participants ?? []).map((p) => <span key={p.userId} className="row gap-2"><Avatar name={p.name} seed={p.userId} size={32} />{p.name}</span>)}
              {data && data.participants.length === 0 && <span className="dim">Nobody here yet.</span>}
            </div>
            <LinkButton href={`/meet/hub-${channel._id}`} size="lg" icon={<Volume2 size={16} />}>Join voice</LinkButton>
          </>
        )}
      </div>
    </>
  );
}

function PinsList({ channelId, resolver }: { channelId: string; resolver: MentionResolver }) {
  const { data } = useApiQuery<{ messages: HubMessageView[] }>(`/api/hub/channels/${channelId}/messages`, { pinned: true, limit: 50 });
  if (!data) return <div className="skeleton" style={{ height: 120, margin: 12 }} />;
  return (
    <div className={styles.sideScroll}>
      {data.messages.length === 0 && <p className="dim" style={{ padding: 8 }}>Nothing pinned yet.</p>}
      {data.messages.map((m) => (
        <div key={m._id} className={styles.serverCard} style={{ marginBottom: 8 }}>
          <strong style={{ fontSize: 'var(--t-sm)' }}>{m.author?.name}</strong>
          <span style={{ fontSize: 'var(--t-sm)' }}>{m.content ? <RichTextLite text={m.content} resolver={resolver} /> : 'Attachment'}</span>
        </div>
      ))}
    </div>
  );
}

function RichTextLite({ text, resolver }: { text: string; resolver: MentionResolver }) {
  return <>{text.replace(/<@([a-f0-9]{24})>/g, (_, id) => `@${resolver.user?.(id) ?? 'member'}`)}</>;
}

function MemberList({ members, roles }: { members: HubMemberView[]; roles: HubServerDetail['roles'] }) {
  const hoisted = roles.filter((r) => r.hoist && !r.isEveryone).sort((a, b) => b.position - a.position);
  const placed = new Set<string>();
  const sections = hoisted
    .map((role) => {
      const list = members.filter((m) => !placed.has(m.userId) && m.roles.includes(role._id));
      list.forEach((m) => placed.add(m.userId));
      return { label: role.name, color: role.color, list };
    })
    .filter((s) => s.list.length > 0);
  const rest = members.filter((m) => !placed.has(m.userId));
  const online = rest.filter((m) => m.online);
  const offline = rest.filter((m) => !m.online);
  return (
    <div className={styles.sideScroll}>
      {[...sections, { label: `Online — ${online.length}`, color: '', list: online }, { label: `Offline — ${offline.length}`, color: '', list: offline }].map((section) =>
        section.list.length === 0 ? null : (
          <div key={section.label}>
            <div className={styles.memberGroup} style={section.color ? { color: section.color } : undefined}>{section.label}</div>
            {section.list.map((m) => (
              <Link key={m.userId} href={`/u/${m.userId}`} className={cn(styles.memberRow, !m.online && styles.memberOffline)}>
                <span className={styles.presence}>
                  <Avatar name={m.name} image={m.image} seed={m.userId} size={28} />
                  {m.online && <span className={styles.presenceDot} />}
                </span>
                <span className="truncate">{m.nickname || m.name}</span>
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function CreateServerDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', description: '', kind: 'circle', visibility: 'public' });
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const create = async () => {
    setBusy(true);
    try {
      const { server } = await api.post<{ server: { _id: string } }>('/api/hub/servers', form);
      setForm({ name: '', description: '', kind: 'circle', visibility: 'public' });
      onCreated(server._id);
    } catch (caught) {
      toast.error('Could not create the server', errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Create a server" description="A circle for an interest, a course section, or anything else. Clubs and comp teams get theirs automatically."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={create} loading={busy} disabled={form.name.trim().length < 2}>Create</Button></>}>
      <Input label="Name" placeholder="Sunday cricket, Startup circle, Marketing elective…" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Textarea label="What it’s for" optional rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <div className="row gap-3 wrap">
        <Select label="Kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} options={[{ value: 'circle', label: 'Interest circle' }, { value: 'course', label: 'Course section' }, { value: 'custom', label: 'Something else' }]} />
        <Select label="Who can join" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })} options={[{ value: 'public', label: 'Anyone on campus' }, { value: 'request', label: 'Request to join' }, { value: 'invite', label: 'Invite only' }]} />
      </div>
    </Dialog>
  );
}

function NewDmDialog({ open, onClose, onStarted, onError }: { open: boolean; onClose: () => void; onStarted: (id: string) => void; onError: (message: string) => void }) {
  const [q, setQ] = useState('');
  const { data } = useApiQuery<{ groups: Array<{ type: string; results: Array<{ id: string; title: string; subtitle?: string }> }> }>(open && q.trim().length >= 2 ? '/api/search' : null, { q: q.trim() });
  const people = data?.groups.find((g) => g.type === 'person')?.results ?? [];
  if (!open) return null;
  const start = async (userId: string) => {
    try {
      const { conversationId } = await api.post<{ conversationId: string }>('/api/hub/dm', { userIds: [userId] });
      onStarted(conversationId);
    } catch (caught) {
      onError(errorMessage(caught));
    }
  };
  return (
    <Dialog open onClose={onClose} title="New message" description="You can message people you have had a session with, who wrote to you first, or who posted something inviting contact.">
      <Input autoFocus aria-label="Search people" placeholder="Search your campus…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="stack gap-1">
        {people.map((p) => (
          <button key={p.id} className={styles.memberRow} onClick={() => start(p.id)}>
            <Avatar name={p.title} seed={p.id} size={28} /> {p.title} <span className="dim">{p.subtitle}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
