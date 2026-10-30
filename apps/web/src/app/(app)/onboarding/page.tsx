'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowRight, Sparkles } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Select, Switch, Textarea } from '@/components/ui/Field';
import { Banner, Chip } from '@/components/ui/Display';
import { useAction } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { api } from '@/lib/client/api';
import { SESSION_TYPES, SESSION_TYPE_META, getBatchOptions, type SessionType } from '@/lib/constants';
import { cn } from '@/lib/utils';
import styles from '../app.module.css';

const INTEREST_TAGS = [
  'Consulting',
  'Product',
  'Marketing',
  'Finance',
  'Operations',
  'Analytics',
  'Sustainability',
  'General Management',
];

/**
 * A single short step after sign-up.
 *
 * Deliberately skippable and deliberately short. The only thing genuinely worth
 * asking a second-year up front is whether they want to host, because that is
 * the side of the marketplace that has to exist first.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { update } = useSession();
  const { me, loading, patch } = useMe();
  const batches = useMemo(() => getBatchOptions(), []);

  // Batch and year can only be set here; SSO sign-ups arrive without them.
  const [batch, setBatch] = useState<string | null>(null);
  const [year, setYear] = useState<1 | 2 | null>(null);
  const [isAlumni, setIsAlumni] = useState<boolean | null>(null);

  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [wantsToHost, setWantsToHost] = useState(false);
  const [offers, setOffers] = useState<SessionType[]>([...SESSION_TYPES]);
  const [optIn, setOptIn] = useState(false);

  const effectiveYear = year ?? me?.year ?? 1;
  const effectiveAlumni = isAlumni ?? me?.role === 'alumni';
  const willMentor = me?.canMentor || effectiveYear === 2 || effectiveAlumni;

  const finish = useAction(async () => {
    const result = await api.patch<{ user: { role: string; batch: string; year: 1 | 2; onboardedAt: string } }>('/api/me', {
      bio: bio.trim(),
      specializations: interests,
      leaderboardOptIn: optIn,
      ...(me?.onboardedAt ? {} : { batch: batch ?? me?.batch, year: effectiveYear, isAlumni: effectiveAlumni }),
      ...(willMentor ? { mentorProfile: { acceptingBookings: wantsToHost, offers } } : {}),
    });

    // The session token carries role and batch, so refresh it in place.
    await update({
      batch: result.user.batch,
      year: result.user.year,
      role: result.user.role,
      onboardedAt: result.user.onboardedAt,
    });
    patch({ onboardedAt: result.user.onboardedAt, batch: result.user.batch, year: result.user.year });
    router.refresh();
    router.push('/home');
  });

  if (loading || !me) {
    return <div className="skeleton" style={{ height: 380 }} />;
  }

  return (
    <>
      <div>
        <h1 className={styles.pageTitle}>One minute, then you are in</h1>
        <p className={styles.pageSubtitle}>
          All of this is editable later, and all of it is optional.
        </p>
      </div>

      {finish.error && <Banner variant="danger">{finish.error}</Banner>}

      {!me.onboardedAt && (
        <section className={styles.settingsGroup}>
          <div>
            <h2 className={styles.settingsTitle}>Your batch at {me.campus}</h2>
            <p className={styles.settingsHint}>
              This decides whose slots you see and who can book you. It’s fixed once you finish here, so check it.
            </p>
          </div>
          <div className="row gap-3 wrap">
            <Select
              label="Batch"
              value={batch ?? me.batch}
              onChange={(event) => setBatch(event.target.value)}
              options={[...new Set([me.batch, ...batches])].map((b) => ({ value: b, label: b }))}
            />
            <Select
              label="Year"
              value={String(effectiveYear)}
              onChange={(event) => setYear(Number(event.target.value) as 1 | 2)}
              options={[
                { value: '1', label: 'First year' },
                { value: '2', label: 'Second year' },
              ]}
            />
          </div>
          <Switch
            label="I’ve graduated (alumni)"
            hint="Alumni can mentor and take referral requests on their own terms."
            checked={effectiveAlumni}
            onChange={setIsAlumni}
          />
        </section>
      )}

      <section className={styles.settingsGroup}>
        <div>
          <h2 className={styles.settingsTitle}>What are you aiming at?</h2>
          <p className={styles.settingsHint}>
            Helps seniors know what to prepare for. Pick as many as apply.
          </p>
        </div>

        <div className={styles.checkGrid}>
          {INTEREST_TAGS.map((tag) => {
            const selected = interests.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={selected}
                className={cn(styles.checkTile, selected && styles.checkTileActive)}
                onClick={() =>
                  setInterests((current) =>
                    selected ? current.filter((value) => value !== tag) : [...current, tag]
                  )
                }
              >
                {tag}
              </button>
            );
          })}
        </div>

        <Textarea
          label="A line about you"
          placeholder={
            me.year === 2
              ? 'Second year, finance major. Summers at a bank. Will be honest about your resume.'
              : 'First year, engineering background, trying to work out whether consulting is for me.'
          }
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          maxLength={500}
          showCount
          rows={3}
          optional
        />
      </section>

      {willMentor && (
        <section className={styles.settingsGroup}>
          <div>
            <h2 className={styles.settingsTitle}>
              <Sparkles size={16} style={{ color: 'var(--teal)', marginRight: 6, display: 'inline' }} />
              Will you host?
            </h2>
            <p className={styles.settingsHint}>
              You publish specific windows — nobody gets your number, and nothing arrives outside
              the slots you choose. This is the part juniors cannot do without.
            </p>
          </div>

          <Switch
            label="Yes, I will take mock sessions"
            hint="You can turn this off any week you need to."
            checked={wantsToHost}
            onChange={setWantsToHost}
          />

          {wantsToHost && (
            <div>
              <span className={styles.settingsTitle} style={{ fontSize: 'var(--t-sm)' }}>
                What you are up for
              </span>
              <div className={styles.checkGrid} style={{ marginTop: 'var(--s-2)' }}>
                {SESSION_TYPES.map((type) => {
                  const selected = offers.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={selected}
                      className={cn(styles.checkTile, selected && styles.checkTileActive)}
                      onClick={() =>
                        setOffers((current) =>
                          selected ? current.filter((value) => value !== type) : [...current, type]
                        )
                      }
                    >
                      {SESSION_TYPE_META[type].label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      <section className={styles.settingsGroup}>
        <div>
          <h2 className={styles.settingsTitle}>Leaderboard</h2>
          <p className={styles.settingsHint}>
            Off unless you say otherwise. Public ranking is a known stressor for this crowd, so it is
            never switched on for you.
          </p>
        </div>

        <Switch
          label="List me on the campus leaderboard"
          hint="Karma, points, and streak become visible to people at your school."
          checked={optIn}
          onChange={setOptIn}
        />
      </section>

      <div className="row gap-3 wrap">
        <Button
          size="lg"
          iconAfter={<ArrowRight size={16} />}
          onClick={() => finish.run()}
          loading={finish.pending}
        >
          Finish setup
        </Button>
        <Button size="lg" variant="ghost" onClick={() => router.push('/home')}>
          Skip for now
        </Button>
        <Chip outline>Everything here is editable in your profile</Chip>
      </div>
    </>
  );
}
