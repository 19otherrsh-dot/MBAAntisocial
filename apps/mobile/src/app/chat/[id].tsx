import { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { topics } from '@mba/shared/realtime';
import { Button, ErrorNote, Loading, Muted } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTopic } from '@/lib/realtime';
import { radius, space, useTheme } from '@/theme';
import type { ChatMessage } from '@/types';

/** A channel or DM: newest at the bottom, live over the socket, mark-read on open. */
export default function Chat() {
  const { id, kind = 'channel', title = 'Chat', canSend = '1' } = useLocalSearchParams<{ id: string; kind?: 'channel' | 'dm'; title?: string; canSend?: string }>();
  const t = useTheme();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = kind === 'dm' ? `/api/hub/dm/${id}` : `/api/hub/channels/${id}/messages`;

  // Bumped to reload: on open, and when a message is edited or deleted.
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ messages: ChatMessage[] }>(base)
      .then((result) => {
        if (cancelled) return;
        setMessages(result.messages);
        setError(null);
        void api.post('/api/hub/read', { targetId: id, kind: kind === 'dm' ? 'conversation' : 'channel' }).catch(() => undefined);
      })
      .catch((caught) => !cancelled && setError(errorText(caught)));
    return () => {
      cancelled = true;
    };
  }, [base, id, kind, nonce]);

  // New messages arrive over the socket; edits and deletions just reload.
  useTopic(kind === 'dm' ? topics.dm(id) : topics.hubChannel(id), (envelope) => {
    if (envelope.event === 'hub.message.created' || envelope.event === 'dm.message.created') {
      const message = (envelope.data as { message: ChatMessage }).message;
      setMessages((current) => (current && !current.some((m) => m._id === message._id) ? [...current, message] : current));
    } else if (envelope.event.endsWith('updated') || envelope.event.endsWith('deleted')) {
      setNonce((n) => n + 1);
    }
  });

  const send = async () => {
    const content = draft.trim();
    if (!content) return;
    setSending(true);
    try {
      const result = await api.post<{ message: ChatMessage }>(base, { content });
      setDraft('');
      setMessages((current) => (current && !current.some((m) => m._id === result.message._id) ? [...current, result.message] : current));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        {error && (
          <View style={{ padding: space.md }}>
            <ErrorNote message={error} />
          </View>
        )}
        {!messages ? (
          <Loading />
        ) : (
          <FlatList
            inverted
            data={[...messages].reverse()}
            keyExtractor={(m) => m._id}
            contentContainerStyle={{ padding: space.md, gap: space.sm }}
            ListEmptyComponent={<Muted style={{ textAlign: 'center', padding: space.xl }}>No messages yet. Say something useful.</Muted>}
            renderItem={({ item }) => {
              const mine = item.author?._id === user?.id;
              return (
                <View style={[styles.bubble, mine ? { alignSelf: 'flex-end', backgroundColor: t.accent } : { alignSelf: 'flex-start', backgroundColor: t.surface, borderColor: t.line, borderWidth: StyleSheet.hairlineWidth }]}>
                  {!mine && <Text style={{ fontSize: 12, fontWeight: '700', color: t.accentText, marginBottom: 2 }}>{item.author?.name ?? 'Someone'}</Text>}
                  <Text style={{ fontSize: 15, lineHeight: 20, color: mine ? t.onAccent : t.text }}>{item.content || 'Message removed'}</Text>
                  <Text style={{ fontSize: 11, marginTop: 4, color: mine ? t.onAccent : t.textMuted, opacity: 0.8 }}>
                    {new Date(item.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
              );
            }}
          />
        )}
        {canSend === '0' ? (
          <View style={[styles.composer, { borderTopColor: t.line, backgroundColor: t.surface, justifyContent: 'center' }]}>
            <Muted>Announcements only. You can read this channel but not post in it.</Muted>
          </View>
        ) : (
        <View style={[styles.composer, { borderTopColor: t.line, backgroundColor: t.surface }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={t.textMuted}
            multiline
            style={[styles.input, { color: t.text, backgroundColor: t.bg, borderColor: t.lineStrong }]}
          />
          <Button small loading={sending} disabled={!draft.trim()} onPress={send}>
            Send
          </Button>
        </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '82%', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.lg },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 38, maxHeight: 120, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 8, fontSize: 15 },
});
