import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Body, Button, ErrorNote, Input, Muted, Screen, Segmented, Title, type TextInputRef } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorText, request } from '@/lib/api';
import { space, useTheme } from '@/theme';

type Mode = 'password' | 'code';

/** Official institute accounts only — the server enforces it on every path. */
export default function SignIn() {
  const t = useTheme();
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const secondField = useRef<TextInputRef>(null);

  useEffect(() => {
    request<{ providers: { id: string; name: string }[] }>('/api/auth/sso-providers', { auth: false })
      .then((r) => setProviders(r.providers))
      .catch(() => setProviders([]));
  }, []);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  };

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen edges={['top', 'bottom']}>
        <View style={styles.brand}>
          <Text style={[styles.logo, { color: t.text }]}>
            MBA<Text style={{ color: t.accent }}>Antisocial</Text>
          </Text>
          <Muted>The operating layer for B-school. Sign in with your institute email.</Muted>
        </View>

        <Title>Sign in</Title>
        <Segmented
          options={[
            { value: 'password', label: 'Password' },
            { value: 'code', label: 'Email code' },
          ]}
          value={mode}
          onChange={(next) => {
            setMode(next);
            setError(null);
          }}
        />

        <Input
          label="Institute email"
          placeholder="you@iima.ac.in"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={() => secondField.current?.focus()}
        />

        {mode === 'password' ? (
          <>
            <Input
              ref={secondField}
              label="Password"
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={() => emailOk && password && run('password', () => auth.signInWithPassword(email, password))}
            />
            <Button loading={busy === 'password'} disabled={!emailOk || !password} onPress={() => run('password', () => auth.signInWithPassword(email, password))}>
              Sign in
            </Button>
          </>
        ) : codeSent ? (
          <>
            <Input
              ref={secondField}
              label="6-digit code"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
              hint={notice ?? 'Check your institute inbox.'}
            />
            <Button loading={busy === 'code'} disabled={code.length !== 6} onPress={() => run('code', () => auth.signInWithCode(email, code))}>
              Sign in
            </Button>
            <Button variant="ghost" onPress={() => setCodeSent(false)}>
              Use a different email
            </Button>
          </>
        ) : (
          <Button
            loading={busy === 'send'}
            disabled={!emailOk}
            onPress={() =>
              run('send', async () => {
                const result = await auth.requestCode(email);
                setCodeSent(true);
                // Development servers return the code instead of emailing it.
                setNotice(result.devCode ? `Development code: ${result.devCode}` : null);
              })
            }
          >
            Email me a code
          </Button>
        )}

        {error && <ErrorNote message={error} />}

        {providers.length > 0 && (
          <View style={{ gap: space.sm }}>
            <Muted style={{ textAlign: 'center' }}>or continue with your institute account</Muted>
            {providers.map((p) => (
              <Button key={p.id} variant="secondary" loading={busy === p.id} onPress={() => run(p.id, () => auth.signInWithProvider(p.id))}>
                {p.name}
              </Button>
            ))}
          </View>
        )}

        <Body style={{ color: t.textMuted, fontSize: 13, textAlign: 'center' }}>New here? Create your account on the web first; it takes a minute.</Body>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  brand: { gap: 6, marginTop: space.xl, marginBottom: space.md },
  logo: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
});
