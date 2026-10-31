import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { CANCELLATION_NOTICE_HOURS, SESSION_TYPE_META, type SessionType } from '@mba/shared/constants';
import { Body, Button, Card, Chip, ErrorNote, Input, Muted, Row, Screen } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useQuery } from '@/lib/query';
import { space, useTheme } from '@/theme';
import type { Slot } from '@/types';

interface Template {
  _id: string;
  title: string;
  company?: string;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Booking a mock: what you want out of it, an optional real-round template, and recording consent. */
export default function Book() {
  const t = useTheme();
  const params = useLocalSearchParams<{ id: string; slot: string }>();
  const [slot] = useState<Slot | null>(() => {
    try {
      return JSON.parse(params.slot) as Slot;
    } catch {
      return null;
    }
  });
  const templates = useQuery<{ templates: Template[] }>(slot ? `/api/session-templates?sessionType=${encodeURIComponent(slot.sessionType)}` : null);
  const [note, setNote] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!slot) return <Screen><ErrorNote message="That slot could not be opened. Go back and pick it again." /></Screen>;
  const label = SESSION_TYPE_META[slot.sessionType as SessionType]?.label ?? 'Session';

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/sessions/${params.id}`, { action: 'book', bookingNote: note.trim(), consentToRecording: consent, ...(templateId ? { templateId } : {}) });
      router.replace({ pathname: '/prep', params: { view: 'bookings' } });
    } catch (caught) {
      setError(errorText(caught));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: `Book ${label.toLowerCase()}` }} />
      <Screen edges={['bottom']}>
        <Card>
          <Row>
            <View style={{ flex: 1, gap: 4 }}>
              <Body style={{ fontWeight: '600' }}>{slot.mentor?.name ?? 'A mentor'}</Body>
              <Muted>{when(slot.startAt)}</Muted>
              {slot.mentor?.mentorProfile?.headline ? <Muted>{slot.mentor.mentorProfile.headline}</Muted> : null}
            </View>
            <Chip tone="accent">{label}</Chip>
          </Row>
          {slot.notes ? (
            <Row>
              <Muted>{slot.notes}</Muted>
            </Row>
          ) : null}
        </Card>

        <Input
          label="What do you want out of this?"
          hint="Only your mentor sees this. A specific ask gets you a much better session."
          placeholder="Targeting consulting. Struggle with structuring guesstimates."
          value={note}
          onChangeText={setNote}
          maxLength={500}
          multiline
          style={{ minHeight: 96, paddingTop: space.md, textAlignVertical: 'top' }}
        />

        {(templates.data?.templates.length ?? 0) > 0 && (
          <Card title="Run it like a real round">
            {[{ _id: '', title: 'No template — free-form' } as Template, ...templates.data!.templates].map((template) => {
              const selected = (templateId ?? '') === template._id;
              return (
                <Pressable
                  key={template._id || 'none'}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setTemplateId(template._id || null)}
                  style={({ pressed }) => [styles.option, pressed && { backgroundColor: t.surfaceHover }]}
                >
                  <View style={[styles.radio, { borderColor: selected ? t.accent : t.lineStrong }]}>{selected && <View style={[styles.radioDot, { backgroundColor: t.accent }]} />}</View>
                  <Body style={{ flex: 1 }} numberOfLines={2}>
                    {template.title}
                    {template.company ? ` · ${template.company}` : ''}
                  </Body>
                </Pressable>
              );
            })}
            <Row>
              <Muted>Templates are written by people who sat the actual round.</Muted>
            </Row>
          </Card>
        )}

        <Card>
          <Row>
            <View style={{ flex: 1, gap: 4 }}>
              <Body>I’m happy for this to be recorded</Body>
              <Muted>Only for self-review, and only if your mentor also agrees. Either of you can change your mind before it starts.</Muted>
            </View>
            <Switch value={consent} onValueChange={setConsent} trackColor={{ true: t.accent }} accessibilityLabel="Agree to recording" />
          </Row>
        </Card>

        <Muted>
          Cancelling within {CANCELLATION_NOTICE_HOURS} hours is recorded as a late cancellation. Not a punishment — just so hosts can see who reliably turns up.
        </Muted>
        {error && <ErrorNote message={error} />}
        <Button loading={busy} onPress={confirm}>
          Confirm booking
        </Button>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 48 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
