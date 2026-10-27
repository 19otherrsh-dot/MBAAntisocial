'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Award, ShieldCheck, Star, Lock } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { Avatar, Banner, Chip, Stat } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useAction } from '@/lib/client/hooks';
import { useMe, type Me } from '@/lib/client/me';
import { api } from '@/lib/client/api';
import {
  BADGES,
  SESSION_TYPES,
  SESSION_TYPE_META,
  MAX_ACTIVE_BOOKINGS_PER_MENTEE,
  type SessionType,
} from '@/lib/constants';
import { cn, formatDate } from '@/lib/utils';
import styles from '../app.module.css';

export default function ProfilePage() {
  const { me, loading } = useMe();

  if (loading || !me) {
    return <div className="skeleton" style={{ height: 420 }} />;
  }

  /*
   * Keyed on the account id so the form's local state is seeded from `me` by
   * `useState` on first mount, rather than copied in with an effect. Seeding in
   * an effect means an extra render pass with an empty form and a cascading
   * setState; letting React remount the subtree does the same job with none of
   * that.
   */
  return <ProfileEditor key={me.id} me={me} />;
}

function ProfileEditor({ me }: { me: Me }) {
  const { patch } = useMe();
  const toast = useToast();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [draft, setDraft] = useState(() => ({
    name: me.name,
    bio: me.bio,
    leaderboardOptIn: me.leaderboardOptIn,
    notificationPrefs: { ...me.notificationPrefs },
    mentorProfile: { ...me.mentorProfile },
  }));

  const save = useAction(async (payload: Record<string, unknown>) => {
    await api.patch('/api/me', payload);
    patch(payload as Partial<Me>);
    toast.success('Saved');
  });

  const earned = new Set(me.badges);

  return (
    <>
      <section className={styles.profileHead}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <Avatar name={me.name} image={me.image} seed={me.id} size={64} />
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer', opacity: uploadingAvatar ? 0.5 : 1 }}>
            {uploadingAvatar ? 'Uploading...' : 'Change Avatar'}
            <input 
              type="file" 
              accept="image/*" 
              style={{ display: 'none' }} 
              disabled={uploadingAvatar}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadingAvatar(true);
                try {
                  const formData = new FormData();
                  formData.append('file', file);
                  const res = await fetch('/api/upload', { method: 'POST', body: formData });
                  if (!res.ok) throw new Error('Upload failed');
                  const data = await res.json();
                  await save.run({ image: data.url });
                } catch (error) {
                  toast.error(
                    'Could not upload that picture',
                    error instanceof Error ? error.message : undefined
                  );
                } finally {
                  setUploadingAvatar(false);
                }
              }}
            />
          </label>
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          <h2 className={styles.profileName}>{me.name}</h2>
          <p className={styles.profileSub}>
            {me.campus} · {me.batch} · {me.year === 2 ? 'Second year' : 'First year'}
            {me.canMentor && ' · Can host sessions'}
          </p>
          {me.bio && <p className={styles.profileBio}>{me.bio}</p>}
          {me.specializations.length > 0 && (
            <div className="row gap-2 wrap" style={{ marginTop: 'var(--s-3)' }}>
              {me.specializations.map((tag) => (
                <Chip key={tag} outline>
                  {tag}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className={styles.statStrip}>
        <Stat value={me.karma} label="Karma" meta="From helping others" tone="teal" />
        <Stat value={me.points} label="Points" meta="From your own work" tone="violet" />
        <Stat
          value={me.sessionsHosted}
          label="Hosted"
          meta={
            me.mentorRating
              ? `${me.mentorRating}/5 across ${me.mentorRatingCount}`
              : 'No ratings yet'
          }
        />
        <Stat
          value={me.sessionsAttended}
          label="Attended"
          meta={
            me.menteeRating
              ? `${me.menteeRating}/5 from hosts`
              : 'No ratings yet'
          }
        />
        <Stat value={me.longestStreak} label="Best streak" meta={`Now: ${me.streak}`} tone="amber" />
      </div>

      {/* ───── Public profile ───── */}
      <section className={styles.settingsGroup}>
        <div>
          <h3 className={styles.settingsTitle}>Your profile</h3>
          <p className={styles.settingsHint}>
            What juniors see when they are deciding whose slot to book.
          </p>
        </div>

        <Input
          label="Name"
          value={draft.name ?? ''}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          maxLength={80}
        />

        <Textarea
          label="Bio"
          placeholder="Second year, marketing major. Summers at a consumer goods firm. Happy to tear apart a resume."
          value={draft.bio ?? ''}
          onChange={(event) => setDraft({ ...draft, bio: event.target.value })}
          maxLength={500}
          showCount
          rows={3}
          optional
        />

        <div>
          <Button
            onClick={() => save.run({ name: draft.name, bio: draft.bio })}
            loading={save.pending}
            disabled={!draft.name?.trim()}
          >
            Save profile
          </Button>
        </div>
      </section>

      {/* ───── Hosting ───── */}
      {me.canMentor && (
        <section className={styles.settingsGroup}>
          <div>
            <h3 className={styles.settingsTitle}>Hosting</h3>
            <p className={styles.settingsHint}>
              You control the tap. Juniors can hold {MAX_ACTIVE_BOOKINGS_PER_MENTEE} live bookings
              each, and your weekly cap sits on top of that — so “available” never means “unlimited”.
            </p>
          </div>

          <Switch
            label="Accepting bookings"
            hint="Off means your published slots are not bookable. Flip it whenever the week gets heavy."
            checked={draft.mentorProfile?.acceptingBookings ?? false}
            onChange={(checked) =>
              setDraft({
                ...draft,
                mentorProfile: { ...draft.mentorProfile!, acceptingBookings: checked },
              })
            }
          />

          <div>
            <span className={cn(styles.settingsTitle)} style={{ fontSize: 'var(--t-sm)' }}>
              What you are willing to run
            </span>
            <div className={styles.checkGrid} style={{ marginTop: 'var(--s-2)' }}>
              {SESSION_TYPES.map((type) => {
                const selected = draft.mentorProfile?.offers?.includes(type) ?? false;
                return (
                  <button
                    key={type}
                    type="button"
                    className={cn(styles.checkTile, selected && styles.checkTileActive)}
                    aria-pressed={selected}
                    onClick={() => {
                      const current = draft.mentorProfile?.offers ?? [];
                      const next = selected
                        ? current.filter((value) => value !== type)
                        : [...current, type];
                      setDraft({
                        ...draft,
                        mentorProfile: { ...draft.mentorProfile!, offers: next as SessionType[] },
                      });
                    }}
                  >
                    {SESSION_TYPE_META[type].label}
                  </button>
                );
              })}
            </div>
          </div>

          <Input
            label="One-line headline"
            placeholder="Consulting summers · will be blunt about your resume"
            value={draft.mentorProfile?.headline ?? ''}
            onChange={(event) =>
              setDraft({
                ...draft,
                mentorProfile: { ...draft.mentorProfile!, headline: event.target.value },
              })
            }
            maxLength={160}
            optional
          />

          <Select
            label="Sessions per week you are happy to take"
            value={String(draft.mentorProfile?.weeklyCapacity ?? 3)}
            onChange={(event) =>
              setDraft({
                ...draft,
                mentorProfile: {
                  ...draft.mentorProfile!,
                  weeklyCapacity: Number(event.target.value),
                },
              })
            }
            options={[0, 1, 2, 3, 5, 8, 12].map((value) => ({
              value: String(value),
              label: value === 0 ? 'None right now' : `${value} per week`,
            }))}
          />

          <div>
            <Button
              onClick={() => save.run({ mentorProfile: draft.mentorProfile })}
              loading={save.pending}
            >
              Save hosting settings
            </Button>
          </div>
        </section>
      )}

      {/* ───── Visibility ───── */}
      <section className={styles.settingsGroup}>
        <div>
          <h3 className={styles.settingsTitle}>Visibility</h3>
          <p className={styles.settingsHint}>
            Ranking is opt-in and stays that way. Nobody is listed without choosing to be.
          </p>
        </div>

        <Switch
          label="Show me on the campus leaderboard"
          hint="Your name, karma, points, and streak become visible to your campus."
          checked={draft.leaderboardOptIn ?? false}
          onChange={(checked) => {
            setDraft({ ...draft, leaderboardOptIn: checked });
            void save.run({ leaderboardOptIn: checked });
          }}
        />
      </section>

      {/* ───── Notifications ───── */}
      <section className={styles.settingsGroup}>
        <div>
          <h3 className={styles.settingsTitle}>Notifications</h3>
          <p className={styles.settingsHint}>
            Everything here tells you something happened. Nothing tells you what you are missing.
          </p>
        </div>

        {(
          [
            ['sessionReminders', 'Session activity', 'Bookings, cancellations, and reschedules.'],
            ['deadlineReminders', 'Deadlines', 'Tasks and competition registrations closing soon.'],
            ['feedComments', 'Replies', 'When someone replies to something you posted.'],
            ['digest', 'Weekly summary', 'One email a week. Off by default.'],
          ] as const
        ).map(([key, label, hint]) => (
          <Switch
            key={key}
            label={label}
            hint={hint}
            checked={draft.notificationPrefs?.[key] ?? false}
            onChange={(checked) => {
              const next = { ...draft.notificationPrefs!, [key]: checked };
              setDraft({ ...draft, notificationPrefs: next });
              void save.run({ notificationPrefs: { [key]: checked } });
            }}
          />
        ))}
      </section>

      {/* ───── Badges ───── */}
      <section className={styles.settingsGroup}>
        <div>
          <h3 className={styles.settingsTitle}>Badges</h3>
          <p className={styles.settingsHint}>
            Mostly earned by doing things for other people. That is deliberate.
          </p>
        </div>

        <div className={styles.badgeGrid}>
          {BADGES.map((badge) => {
            const has = earned.has(badge.id);
            return (
              <div key={badge.id} className={cn(styles.badgeCard, !has && styles.badgeCardLocked)}>
                <span className={styles.badgeIcon}>
                  {has ? <Award size={16} /> : <Lock size={14} />}
                </span>
                <div>
                  <div className={styles.badgeName}>{badge.label}</div>
                  <p className={styles.badgeDesc}>{badge.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ───── Policy ───── */}
      <section className={styles.settingsGroup}>
        <div>
          <h3 className={styles.settingsTitle}>Sharing policy</h3>
          <p className={styles.settingsHint}>
            Required once before you can upload to the resource library.
          </p>
        </div>

        {me.honorCodeAcceptedAt ? (
          <Banner variant="success" icon={<ShieldCheck size={16} />}>
            Accepted on {formatDate(me.honorCodeAcceptedAt)}.{' '}
            <Link href="/legal/honor-code" style={{ textDecoration: 'underline' }}>
              Read it again
            </Link>
          </Banner>
        ) : (
          <Banner
            variant="warning"
            icon={<Star size={16} />}
            action={
              <Link href="/legal/honor-code">
                <Button size="sm" variant="soft">
                  Read and accept
                </Button>
              </Link>
            }
          >
            Not accepted yet — uploads are blocked until you do.
          </Banner>
        )}
      </section>

      {save.error && <div className={styles.errorBox}>{save.error}</div>}
    </>
  );
}
