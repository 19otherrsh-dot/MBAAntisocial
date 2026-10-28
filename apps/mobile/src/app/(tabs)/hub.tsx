import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Body, Card, Chip, Empty, ErrorNote, Loading, Muted, Row, Screen, Segmented, Title } from '@/components/ui';
import { useQuery } from '@/lib/query';
import { openWeb } from '@/lib/web';
import type { Conversation, HubChannel, HubServer } from '@/types';

type Pane = 'channels' | 'dms';

/** Servers and their text channels, and direct messages. Voice and settings open on the web. */
export default function Hub() {
  const [pane, setPane] = useState<Pane>('channels');
  const servers = useQuery<{ servers: HubServer[] }>('/api/hub/servers');
  const [serverId, setServerId] = useState<string | null>(null);
  const active = serverId ?? servers.data?.servers[0]?._id ?? null;
  const server = useQuery<{ channels: HubChannel[] }>(active && pane === 'channels' ? `/api/hub/servers/${active}` : null);
  const dms = useQuery<{ conversations: Conversation[] }>(pane === 'dms' ? '/api/hub/dm' : null);

  const locked = servers.error?.toLowerCase().includes('campus');
  const refresh = async () => {
    await Promise.all([servers.refetch(), pane === 'channels' ? server.refetch() : dms.refetch()]);
  };

  return (
    <Screen refreshing={servers.refreshing || server.refreshing || dms.refreshing} onRefresh={refresh}>
      <Title>Hub</Title>
      {locked ? (
        <Empty title="The hub opens with your campus" body="Channels, DMs and voice rooms switch on once enough of your batch is here." />
      ) : (
        <>
          <Segmented
            options={[
              { value: 'channels', label: 'Channels' },
              { value: 'dms', label: 'Messages' },
            ]}
            value={pane}
            onChange={setPane}
          />
          {servers.error && <ErrorNote message={servers.error} />}

          {pane === 'channels' ? (
            <>
              {servers.data && servers.data.servers.length > 1 && (
                <Card title="Servers">
                  {servers.data.servers.map((s) => (
                    <Row key={s._id} onPress={() => setServerId(s._id)}>
                      <Body style={{ flex: 1, fontWeight: s._id === active ? '700' : '400' }}>{s.name}</Body>
                      {s._id === active && <Chip tone="accent">Open</Chip>}
                    </Row>
                  ))}
                </Card>
              )}
              {server.loading && !server.data ? (
                <Loading />
              ) : server.data ? (
                <Card title="Channels">
                  {server.data.channels
                    .filter((c) => c.kind !== 'voice')
                    .map((c) => (
                      <Row key={c._id} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c._id, kind: 'channel', title: `#${c.name}`, canSend: c.canSend ? '1' : '0' } })}>
                        <Body style={{ flex: 1, fontWeight: c.unread ? '700' : '400' }}># {c.name}</Body>
                        {c.unread && <Chip tone="accent">New</Chip>}
                      </Row>
                    ))}
                  {server.data.channels.some((c) => c.kind === 'voice') && (
                    <Row onPress={() => openWeb(`/hub/${active}`, 'Hub')}>
                      <Muted>Voice rooms open on the web view →</Muted>
                    </Row>
                  )}
                </Card>
              ) : null}
            </>
          ) : dms.loading && !dms.data ? (
            <Loading />
          ) : !dms.data?.conversations.length ? (
            <Empty title="No messages yet" body="You can message people you share a session, team, club or listing with." />
          ) : (
            <Card>
              {dms.data.conversations.map((c) => {
                const title = c.name || c.participants.map((p) => p.name).join(', ') || 'Conversation';
                return (
                  <Row key={c._id} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c._id, kind: 'dm', title } })}>
                    <View style={{ flex: 1 }}>
                      <Body numberOfLines={1} style={{ fontWeight: c.unread ? '700' : '400' }}>
                        {title}
                      </Body>
                      {c.lastMessagePreview ? <Muted numberOfLines={1}>{c.lastMessagePreview}</Muted> : null}
                    </View>
                    {c.unread && <Chip tone="accent">New</Chip>}
                  </Row>
                );
              })}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
