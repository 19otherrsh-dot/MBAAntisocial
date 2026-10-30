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
          <h1 className={styles.profileName}>{me.name}</h1>
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
          <h2 className={styles.settingsTitle}>Your profile</h2>
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
            <h2 className={styles.settingsTitle}>Hosting</h2>
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

          <Select
            label="Where sessions happen"
            hint={
              draft.mentorProfile?.meetingProvider === 'google_meet' || draft.mentorProfile?.meetingProvider === 'zoom'
                ? 'Each booking creates its own meeting. Connect the account in Settings first.'
                : draft.mentorProfile?.meetingProvider === 'livekit'
                  ? 'A private in-app video room per booking — nothing to install.'
                  : 'Your standing room link is shared with whoever books.'
            }
            value={draft.mentorProfile?.meetingProvider ?? 'manual'}
            onChange={(event) =>
              setDraft({
                ...draft,
                mentorProfile: { ...draft.mentorProfile!, meetingProvider: event.target.value as Me['mentorProfile']['meetingProvider'] },
              })
            }
            options={me.meetingProviders.map((provider) => ({
              value: provider.id,
              label:
                provider.requiresConnection && !me.connections.some((c) => c.provider === (provider.id === 'google_meet' ? 'google_calendar' : provider.id))
                  ? `${provider.label} (connect in Settings)`
                  : provider.label,
            }))}
          />

          {(draft.mentorProfile?.meetingProvider ?? 'manual') === 'manual' && (
            <Input
              label="Standing meeting link"
              placeholder="https://meet.google.com/abc-defg-hij"
              value={draft.mentorProfile?.meetingLink ?? ''}
              onChange={(event) =>
                setDraft({ ...draft, mentorProfile: { ...draft.mentorProfile!, meetingLink: event.target.value } })
              }
              hint="Bookings without a link are flagged so nobody turns up to nothing."
              optional
            />
          )}

          <Switch
            label="Let students from other campuses book me"
            hint="Only campuses that allow cross-campus mentors can see you, and your weekly cap still applies."
            checked={draft.mentorProfile?.crossCampus ?? false}
            onChange={(checked) =>
              setDraft({ ...draft, mentorProfile: { ...draft.mentorProfile!, crossCampus: checked } })
            }
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

      {/* ───── Alumni ───── */}
      {me.role === 'alumni' && <AlumniSection me={me} onSave={(payload) => save.run(payload)} saving={save.pending} />}

      <section className={styles.settingsGroup}>
        <div className="between gap-3 wrap">
          <div>
            <h2 className={styles.settingsTitle}>Notifications, privacy & integrations</h2>
            <p className={styles.settingsHint}>Quiet hours, push, email, leaderboard visibility, Google/Zoom/Discord.</p>
          </div>
          <Link href="/settings"><Button variant="secondary">Open settings</Button></Link>
        </div>
      </section>

      {/* ───── Badges ───── */}
      <section className={styles.settingsGroup}>
        <div>
          <h2 className={styles.settingsTitle}>Badges</h2>
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
          <h2 className={styles.settingsTitle}>Sharing policy</h2>
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

function AlumniSection({
  me,
  onSave,
  saving,
}: {
  me: Me;
  onSave: (payload: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [profile, setProfile] = useState(() => ({ ...me.alumniProfile }));
  return (
    <section className={styles.settingsGroup}>
      <div>
        <h2 className={styles.settingsTitle}>Alumni & referrals</h2>
        <p className={styles.settingsHint}>
          Boundaried by design: juniors can only request a referral when you switch it on, and never beyond your cap.
        </p>
      </div>
      <div className="row gap-3 wrap">
        <Input label="Company" value={profile.company} onChange={(e) => setProfile({ ...profile, company: e.target.value })} />
        <Input label="Role" value={profile.designation} onChange={(e) => setProfile({ ...profile, designation: e.target.value })} />
        <Input
          label="Graduated"
          type="number"
          value={profile.graduationYear ?? ''}
          onChange={(e) => setProfile({ ...profile, graduationYear: e.target.value ? Number(e.target.value) : undefined })}
        />
      </div>
      <Input
        label="LinkedIn profile"
        placeholder="https://www.linkedin.com/in/…"
        value={profile.linkedinUrl}
        onChange={(e) => setProfile({ ...profile, linkedinUrl: e.target.value })}
        optional
      />
      <Switch
        label="Open to referral requests"
        hint="You can pause this any time; open requests stay until you respond."
        checked={profile.referralsOpen}
        onChange={(checked) => setProfile({ ...profile, referralsOpen: checked })}
      />
      {profile.referralsOpen && (
        <Select
          label="Open requests at once"
          value={String(profile.referralCapacity)}
          onChange={(e) => setProfile({ ...profile, referralCapacity: Number(e.target.value) })}
          options={[1, 2, 3, 5, 8, 10].map((n) => ({ value: String(n), label: `${n}` }))}
        />
      )}
      <div>
        <Button onClick={() => onSave({ alumniProfile: profile })} loading={saving}>
          Save alumni profile
        </Button>
      </div>
    </section>
  );
}
