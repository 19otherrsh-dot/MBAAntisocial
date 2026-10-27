'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Sparkles } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Switch, Textarea } from '@/components/ui/Field';
import { Banner, Chip } from '@/components/ui/Display';
import { useAction } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { api } from '@/lib/client/api';
import { SESSION_TYPES, SESSION_TYPE_META, type SessionType } from '@/lib/constants';
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
  const { me, loading, patch } = useMe();

  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [wantsToHost, setWantsToHost] = useState(false);
  const [offers, setOffers] = useState<SessionType[]>([...SESSION_TYPES]);
  const [optIn, setOptIn] = useState(false);

  const finish = useAction(async () => {
    await api.patch('/api/me', {
      bio: bio.trim(),
      specializations: interests,
      leaderboardOptIn: optIn,
      ...(me?.canMentor
        ? { mentorProfile: { acceptingBookings: wantsToHost, offers } }
        : {}),
    });

    patch({ onboardedAt: new Date().toISOString() });
    router.push('/home');
  });

  if (loading || !me) {
    return <div className="skeleton" style={{ height: 380 }} />;
  }

  return (
    <>
      <div>
        <h2 className={styles.pageTitle}>One minute, then you are in</h2>
        <p className={styles.pageSubtitle}>
          All of this is editable later, and all of it is optional.
        </p>
      </div>

      {finish.error && <Banner variant="danger">{finish.error}</Banner>}

      <section className={styles.settingsGroup}>
        <div>
          <h3 className={styles.settingsTitle}>What are you aiming at?</h3>
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

      {me.canMentor && (
        <section className={styles.settingsGroup}>
          <div>
            <h3 className={styles.settingsTitle}>
              <Sparkles size={16} style={{ color: 'var(--teal)', marginRight: 6, display: 'inline' }} />
              Will you host?
            </h3>
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
          <h3 className={styles.settingsTitle}>Leaderboard</h3>
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
