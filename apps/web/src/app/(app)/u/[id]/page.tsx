'use client';

import { use } from 'react';
import Link from 'next/link';
import { CalendarClock, MessageCircle, Star, Award, ExternalLink, GraduationCap, Sparkles } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Avatar, Chip, EmptyState, Stat } from '@/components/ui/Display';
import { useApiQuery } from '@/lib/client/hooks';
import { SESSION_TYPE_META, ROLE_META, type SessionType, type UserRole } from '@/lib/constants';
import styles from '../../app.module.css';

interface PublicProfile {
  user: {
    id: string;
    name: string;
    image: string;
    campus: string;
    batch: string;
    year: 1 | 2;
    role: UserRole;
    bio: string;
    specializations: string[];
    karma: number;
    streak: number | null;
    badges: Array<{ id: string; label: string; description: string }>;
    mentor: {
      acceptingBookings: boolean;
      headline: string;
      offers: SessionType[];
      companies: string[];
      rating: number | null;
      ratingCount: number;
      sessionsHosted: number;
      openSlots: number;
    } | null;
    alumni: { company: string; designation: string; graduationYear: number | null; referralsOpen: boolean; linkedinUrl: string } | null;
  };
  viewer: { isSelf: boolean; canMessage: boolean; sameCampus: boolean };
}

export default function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error } = useApiQuery<PublicProfile>(`/api/users/${id}`);

  if (loading) return <div className="skeleton" style={{ height: 320 }} />;
  if (error || !data) return <EmptyState title="Nobody here" body={error ?? 'That profile does not exist or is not visible to you.'} />;

  const { user, viewer } = data;
  return (
    <>
      <section className={styles.profileHead}>
        <Avatar name={user.name} image={user.image} seed={user.id} size={72} />
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 className={styles.profileName}>{user.name}</h1>
          <p className={styles.profileSub}>
            {ROLE_META[user.role].label} · {user.campus} · {user.batch}
          </p>
          {user.mentor?.headline && <p className={styles.profileBio} style={{ fontWeight: 550 }}>{user.mentor.headline}</p>}
          {user.bio && <p className={styles.profileBio}>{user.bio}</p>}
          {user.specializations.length > 0 && (
            <div className="row gap-2 wrap mt-3">
              {user.specializations.map((tag) => <Chip key={tag} outline>{tag}</Chip>)}
            </div>
          )}
          {!viewer.isSelf && (
            <div className="row gap-2 wrap mt-4">
              {user.mentor?.acceptingBookings && user.mentor.openSlots > 0 && (
                <Link href={`/sessions?mentor=${user.id}`}>
                  <Button icon={<CalendarClock size={16} />}>Book a session ({user.mentor.openSlots} open)</Button>
                </Link>
              )}
              {user.alumni?.referralsOpen && (
                <Link href={`/alumni?ask=${user.id}`}>
                  <Button variant="secondary" icon={<GraduationCap size={16} />}>Ask for a referral</Button>
                </Link>
              )}
              {viewer.canMessage && (
                <Link href={`/hub/dm?with=${user.id}`}>
                  <Button variant="secondary" icon={<MessageCircle size={16} />}>Message</Button>
                </Link>
              )}
              {user.alumni?.linkedinUrl && (
                <a href={user.alumni.linkedinUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" icon={<ExternalLink size={16} />}>LinkedIn</Button>
                </a>
              )}
            </div>
          )}
          {viewer.isSelf && (
            <Link href="/profile" className="mt-4" style={{ display: 'inline-block' }}>
              <Button variant="secondary">Edit your profile</Button>
            </Link>
          )}
        </div>
      </section>

      <div className={styles.statStrip}>
        <Stat value={user.karma} label="Karma" meta="From helping others" tone="teal" />
        {user.mentor && <Stat value={user.mentor.sessionsHosted} label="Sessions hosted" />}
        {user.mentor?.rating != null && (
          <Stat value={<span className="row gap-1"><Star size={16} />{user.mentor.rating}</span>} label="Mentor rating" meta={`${user.mentor.ratingCount} ratings`} tone="amber" />
        )}
        {user.streak != null && <Stat value={user.streak} label="Day streak" tone="amber" />}
      </div>

      {user.alumni && (user.alumni.company || user.alumni.designation) && (
        <section className={styles.settingsGroup}>
          <h2 className={styles.settingsTitle}><Sparkles size={16} style={{ display: 'inline', marginRight: 6 }} />Now</h2>
          <p>
            {user.alumni.designation}
            {user.alumni.company && ` at ${user.alumni.company}`}
            {user.alumni.graduationYear && <span className="dim"> · Class of {user.alumni.graduationYear}</span>}
          </p>
        </section>
      )}

      {user.mentor && user.mentor.offers.length > 0 && (
        <section className={styles.settingsGroup}>
          <h2 className={styles.settingsTitle}>Runs</h2>
          <div className="row gap-2 wrap">
            {user.mentor.offers.map((o) => <Chip key={o} tone={SESSION_TYPE_META[o].tone}>{SESSION_TYPE_META[o].label}</Chip>)}
            {user.mentor.companies.map((c) => <Chip key={c} outline>{c}</Chip>)}
          </div>
        </section>
      )}

      {user.badges.length > 0 && (
        <section className={styles.settingsGroup}>
          <h2 className={styles.settingsTitle}><Award size={16} style={{ display: 'inline', marginRight: 6 }} />Badges</h2>
          <div className="row gap-2 wrap">
            {user.badges.map((b) => <Chip key={b.id} tone="violet" title={b.description}>{b.label}</Chip>)}
          </div>
        </section>
      )}
    </>
  );
}
