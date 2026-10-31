import { useState } from 'react';
import { Stack } from 'expo-router';
import { Body, Button, Card, ErrorNote, Input, Loading, Muted, Row, Screen } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@/lib/query';
import { openWeb } from '@/lib/web';

/** Deleting the account from inside the app, as the stores require. Same rules as the web. */
export default function DeleteAccount() {
  const { user, signOut } = useAuth();
  const { data, loading } = useQuery<{ blockers: string[] }>('/api/me/deletion');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = user?.email ?? '';
  const blockers = data?.blockers ?? [];

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.delete('/api/me', { confirmEmail: typed.trim() });
      await signOut();
    } catch (caught) {
      setError(errorText(caught));
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Delete account' }} />
      <Screen edges={['bottom']}>
        <Card title="This can’t be undone">
          <Row>
            <Body>
              Your private records go: tasks, classes and attendance, grades, money, check-ins, your resume and applications. Things other people rely on stay but are credited to “Deleted user”: messages, posts, shared notes, interview intel, match results.
            </Body>
          </Row>
          <Row onPress={() => openWeb('/settings', 'Settings')}>
            <Muted>Want a copy first? Download your data from Settings on the web →</Muted>
          </Row>
        </Card>
        {loading ? (
          <Loading />
        ) : blockers.length > 0 ? (
          <Card title="Sort these out first">
            {blockers.map((b) => (
              <Row key={b}>
                <Body>{b}</Body>
              </Row>
            ))}
          </Card>
        ) : (
          <>
            <Input label={`Type ${email} to confirm`} value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
            {error && <ErrorNote message={error} />}
            <Button variant="danger" loading={busy} disabled={typed.trim().toLowerCase() !== email.toLowerCase()} onPress={remove}>
              Delete my account
            </Button>
          </>
        )}
      </Screen>
    </>
  );
}
