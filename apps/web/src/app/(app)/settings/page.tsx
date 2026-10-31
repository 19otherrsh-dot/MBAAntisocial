'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { BellRing, CalendarCheck2, Download, Link2, LogOut, Moon, ShieldCheck, Sun, Laptop, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Input, Select, Switch } from '@/components/ui/Field';
import { Banner, Chip, Segmented } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery, useAction } from '@/lib/client/hooks';
import { useMe, type Me, type NotificationPrefs } from '@/lib/client/me';
import { api, errorMessage } from '@/lib/client/api';
import { useTheme } from '@/lib/client/theme';
import { enablePush, disablePush, pushState, type PushState } from '@/lib/client/push';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_META } from '@/lib/constants';
import styles from '../app.module.css';

interface Integration {
  provider: string;
  label: string;
  description: string;
  connected: boolean;
  accountEmail: string | null;
}

const STATUS_COPY: Record<string, { variant: 'success' | 'danger' | 'info'; text: string }> = {
  connected: { variant: 'success', text: 'Connected.' },
  cancelled: { variant: 'info', text: 'Connection cancelled — nothing changed.' },
  failed: { variant: 'danger', text: 'That connection failed. Try again in a moment.' },
  invalid: { variant: 'danger', text: 'That link expired. Start the connection again from here.' },
};

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney'];

export default function SettingsPage() {
  const { me, loading } = useMe();
  if (loading || !me) return <div className="skeleton" style={{ height: 420 }} />;
  return (
    <Suspense fallback={null}>
      <SettingsEditor key={me.id} me={me} />
    </Suspense>
  );
}

function SettingsEditor({ me }: { me: Me }) {
  const { patch } = useMe();
  const toast = useToast();
  const params = useSearchParams();
  const { preference: theme, setPreference: setTheme } = useTheme();
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => ({ ...me.notificationPrefs }));
  const [push, setPush] = useState<PushState | null>(null);
  const { data: integrations, refetch: refetchIntegrations } = useApiQuery<{ integrations: Integration[] }>('/api/integrations');

  const status = params.get('status');
  const statusCopy = status ? STATUS_COPY[status] : null;

  useEffect(() => {
    let alive = true;
    pushState()
      .then((s) => alive && setPush(s))
      .catch(() => alive && setPush('unsupported'));
    return () => {
      alive = false;
    };
  }, []);

  const save = useAction(async (payload: Record<string, unknown>) => {
    await api.patch('/api/me', payload);
    patch(payload as Partial<Me>);
    toast.success('Saved');
  });

  const setPref = <K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) => {
    setPrefs((current) => ({ ...current, [key]: value }));
    void save.run({ notificationPrefs: { [key]: value } });
  };

  const togglePush = async () => {
    try {
      setPush(push === 'on' ? await disablePush() : await enablePush());
    } catch (caught) {
      toast.error('Could not change push notifications', errorMessage(caught));
    }
  };

  const disconnect = async (provider: string) => {
    try {
      await api.delete(`/api/integrations/${provider}`);
      refetchIntegrations();
      toast.success('Disconnected');
    } catch (caught) {
      toast.error('Could not disconnect', errorMessage(caught));
    }
  };

  return (
    <>
      <div>
        <h1 className={styles.pageTitle}>Settings</h1>
        <p className={styles.pageSubtitle}>Everything here is about you being told less, at better times.</p>
      </div>

      {statusCopy && <Banner variant={statusCopy.variant}>{statusCopy.text}</Banner>}

      {/* ───── What you hear about ───── */}
      <section className={styles.settingsGroup}>
        <div>
          <h2 className={styles.settingsTitle}>
            <BellRing size={16} style={{ display: 'inline', marginRight: 6 }} />
            What you hear about
          </h2>
          <p className={styles.settingsHint}>Everything here tells you something happened. Nothing tells you what you are missing.</p>
        </div>
        {NOTIFICATION_CATEGORIES.map((key) => (
          <Switch
            key={key}
            label={NOTIFICATION_CATEGORY_META[key].label}
            hint={NOTIFICATION_CATEGORY_META[key].hint}
            checked={prefs[key] ?? true}
            onChange={(checked) => setPref(key, checked)}
          />
        ))}
        <Switch
          label="Weekly summary email"
          hint="One email a week with your campus’s best notes and open slots. Off by default."
          checked={prefs.digest}
          onChange={(checked) => setPref('digest', checked)}
        />
      </section>

      {/* ───── How and when ───── */}
      <section className={styles.settingsGroup}>
        <div>
          <h2 className={styles.settingsTitle}>How and when</h2>
          <p className={styles.settingsHint}>In-app notifications always land. These control what reaches you outside the app.</p>
        </div>
        <Switch
          label="Email for important things"
          hint="Bookings, cancellations, session reminders, referral and team updates."
          checked={prefs.email}
          onChange={(checked) => setPref('email', checked)}
        />
        <Switch
          label="Push notifications"
          hint="On your phone (via the app) and in browsers where you enable them below."
          checked={prefs.push}
          onChange={(checked) => setPref('push', checked)}
        />
        <div className="row gap-3 wrap">
          <Button variant="secondary" onClick={togglePush} disabled={!push || push === 'unsupported' || push === 'disabled' || push === 'denied'}>
            {push === 'on' ? 'Turn off push in this browser' : 'Enable push in this browser'}
          </Button>
          {push === 'denied' && <Chip tone="rose">Blocked in browser settings</Chip>}
          {push === 'unsupported' && <Chip>This browser doesn’t support push</Chip>}
          {push === 'disabled' && <Chip>Push isn’t configured on this server</Chip>}
          {push === 'on' && <Chip tone="teal">On for this browser</Chip>}
        </div>

        <Switch
          label="Quiet hours"
          hint="No push during these hours. Things still wait for you in the app."
          checked={prefs.quietHours.enabled}
          onChange={(enabled) => setPref('quietHours', { ...prefs.quietHours, enabled })}
        />
        {prefs.quietHours.enabled && (
          <div className="row gap-3 wrap">
            <Input
              type="time"
              label="From"
              value={prefs.quietHours.start}
              onChange={(e) => setPrefs({ ...prefs, quietHours: { ...prefs.quietHours, start: e.target.value } })}
              onBlur={() => void save.run({ notificationPrefs: { quietHours: prefs.quietHours } })}
            />
            <Input
              type="time"
              label="Until"
              value={prefs.quietHours.end}
              onChange={(e) => setPrefs({ ...prefs, quietHours: { ...prefs.quietHours, end: e.target.value } })}
              onBlur={() => void save.run({ notificationPrefs: { quietHours: prefs.quietHours } })}
            />
          </div>
        )}
        <Select
          label="Time zone"
          hint="Used for reminders, quiet hours, and what counts as “today”."
          value={me.timezone}
          onChange={(e) => void save.run({ timezone: e.target.value })}
          options={[...new Set([me.timezone, ...TIMEZONES])].map((tz) => ({ value: tz, label: tz.replace('_', ' ') }))}
        />
      </section>

      {/* ───── Integrations ───── */}
      <section className={styles.settingsGroup}>
        <div>
          <h2 className={styles.settingsTitle}>
            <Link2 size={16} style={{ display: 'inline', marginRight: 6 }} />
            Connected accounts
          </h2>
          <p className={styles.settingsHint}>For integrations only — signing in always uses your institute email.</p>
        </div>
        {(integrations?.integrations ?? []).length === 0 && (
          <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>No integrations are configured on this deployment yet.</p>
        )}
        {(integrations?.integrations ?? []).map((integration) => (
          <div key={integration.provider} className="between gap-3 wrap">
            <div style={{ minWidth: 0 }}>
              <div className="row gap-2" style={{ fontWeight: 560 }}>
                <CalendarCheck2 size={15} /> {integration.label}
                {integration.connected && <Chip tone="teal">Connected</Chip>}
              </div>
              <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>
                {integration.connected && integration.accountEmail ? `As ${integration.accountEmail}. ` : ''}
                {integration.description}
              </p>
            </div>
            {integration.connected ? (
              <Button variant="ghost" onClick={() => disconnect(integration.provider)}>Disconnect</Button>
            ) : (
              <a href={`/api/integrations/${integration.provider}/connect`}>
                <Button variant="secondary">Connect</Button>
              </a>
            )}
          </div>
        ))}
      </section>

      {/* ───── Visibility ───── */}
      <section className={styles.settingsGroup}>
        <div>
          <h2 className={styles.settingsTitle}>Visibility</h2>
          <p className={styles.settingsHint}>Ranking is opt-in and stays that way. Nobody is listed without choosing to be.</p>
        </div>
        <Switch
          label="Show me on the campus leaderboard"
          hint="Your name, karma, points, and streak become visible to your campus."
          checked={me.leaderboardOptIn}
          onChange={(checked) => void save.run({ leaderboardOptIn: checked })}
        />
      </section>

      {/* ───── Appearance ───── */}
      <section className={styles.settingsGroup}>
        <div>
          <h2 className={styles.settingsTitle}>Appearance</h2>
        </div>
        <Segmented
          ariaLabel="Theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light' as const, label: 'Light', icon: <Sun size={14} /> },
            { value: 'dark' as const, label: 'Dark', icon: <Moon size={14} /> },
            { value: 'system' as const, label: 'System', icon: <Laptop size={14} /> },
          ]}
        />
      </section>

      {/* ───── Account ───── */}
      <section className={styles.settingsGroup}>
        <div>
          <h2 className={styles.settingsTitle}>
            <ShieldCheck size={16} style={{ display: 'inline', marginRight: 6 }} />
            Account
          </h2>
          <p className={styles.settingsHint}>
            {me.email} · {me.verified ? 'verified' : 'not verified'} · {me.campus}
          </p>
        </div>
        <div className="row gap-2 wrap">
          {me.authProviders.map((p) => (
            <Chip key={p} outline>
              {p === 'password' ? 'Password' : p === 'otp' ? 'Email code' : p === 'microsoft-entra-id' ? 'Microsoft' : p.charAt(0).toUpperCase() + p.slice(1)}
            </Chip>
          ))}
        </div>
        <div className="row gap-3 wrap">
          <a href="/forgot-password">
            <Button variant="secondary">{me.authProviders.includes('password') ? 'Change password' : 'Set a password'}</Button>
          </a>
          <Button variant="dangerGhost" icon={<LogOut size={16} />} onClick={() => signOut({ callbackUrl: '/login' })}>
            Sign out
          </Button>
        </div>
      </section>

      <YourData email={me.email} />
    </>
  );
}

/**
 * The rights of access and erasure: a download of everything stored about you,
 * and deleting the account. What deletion removes, keeps anonymised, or leaves
 * is decided per collection in server/modules/account/registry.ts.
 */
function YourData({ email }: { email: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const { data } = useApiQuery<{ blockers: string[] }>(open ? '/api/me/deletion' : null);
  const blockers = data?.blockers ?? [];

  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete('/api/me', undefined, { confirmEmail: typed });
      await signOut({ callbackUrl: '/login?error=account_deleted' });
    } catch (caught) {
      toast.error('Could not delete the account', errorMessage(caught));
      setDeleting(false);
    }
  };

  return (
    <section className={styles.settingsGroup}>
      <div>
        <h2 className={styles.settingsTitle}>Your data</h2>
        <p className={styles.settingsHint}>Download everything we store about you, or delete your account.</p>
      </div>
      <div className="row gap-3 wrap">
        <a href="/api/me/export" download>
          <Button variant="secondary" icon={<Download size={16} />}>Download my data</Button>
        </a>
        {!open && (
          <Button variant="dangerGhost" icon={<Trash2 size={16} />} onClick={() => setOpen(true)}>
            Delete my account…
          </Button>
        )}
      </div>
      {open && (
        <div className="stack gap-3">
          <Banner variant="danger" title="Deleting your account can’t be undone">
            Your private records go: tasks, classes and attendance, grades, money, check-ins, your resume and applications. Things other people rely on stay but are credited to “Deleted user”: messages, posts, shared notes, interview intel, match results. You’re removed from servers, clubs, teams and events.
          </Banner>
          {blockers.length > 0 && (
            <Banner variant="warning" title="Sort these out first">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {blockers.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </Banner>
          )}
          <Input label={`Type ${email} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          <div className="row gap-2 wrap">
            <Button variant="danger" loading={deleting} disabled={typed.trim().toLowerCase() !== email.toLowerCase() || blockers.length > 0} onClick={remove}>
              Delete my account
            </Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setTyped(''); }}>Cancel</Button>
          </div>
        </div>
      )}
    </section>
  );
}
