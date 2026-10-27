'use client';

import { useState } from 'react';
import { Lock, Users, GraduationCap, Copy, Check } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Banner, Progress } from '@/components/ui/Display';
import { useMe } from '@/lib/client/me';
import type { NavItem } from './navigation';
import styles from './shell.module.css';

/**
 * Shown in place of a Campus-Edition page until the campus unlocks. Honest
 * about why (it needs density to be useful — PRD §15) and about how close the
 * campus is, with the one action that helps: inviting people.
 */
export default function CampusLocked({ item }: { item: NavItem }) {
  const { me, campusProgress } = useMe();
  const [copied, setCopied] = useState(false);
  const Icon = item.icon;
  const requested = me?.campusStatus === 'requested';

  const invite = async () => {
    const text = `I’m on MBAAntisocial — mock interviews with seniors, our batch’s notes, deadlines, and games. Sign up with your ${me?.campus ?? 'institute'} email: ${window.location.origin}/register`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* dismissed */
    }
  };

  return (
    <div className={styles.locked}>
      <div className={styles.lockedArt}>
        <Icon size={28} />
        <span className={styles.lockedBadge}><Lock size={12} /></span>
      </div>
      <h2 className={styles.lockedTitle}>{item.label} unlocks with your campus</h2>
      <p className={styles.lockedBody}>
        {item.description} It only works when enough of your batch and seniors are here — an empty mentor list helps nobody.
      </p>

      {requested ? (
        <Banner variant="info" className={styles.lockedBanner}>
          {me?.campus} is waiting for approval. Meanwhile the Open Edition — briefing, quizzes, AI practice, tasks, grades, games — is all yours.
        </Banner>
      ) : (
        campusProgress && (
          <div className={styles.lockedProgress}>
            <div className="between">
              <span className="row gap-2"><Users size={15} /> Members</span>
              <span className="dim">{campusProgress.members} joined</span>
            </div>
            <Progress value={Math.round(campusProgress.memberPct * 100)} max={100} tone="violet" label="Members progress" />
            <div className="between">
              <span className="row gap-2"><GraduationCap size={15} /> Seniors &amp; alumni</span>
              <span className="dim">{campusProgress.mentors} joined</span>
            </div>
            <Progress value={Math.round(campusProgress.mentorPct * 100)} max={100} tone="teal" label="Mentors progress" />
          </div>
        )
      )}

      <div className="row gap-3 wrap" style={{ justifyContent: 'center' }}>
        <Button icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={invite}>
          {copied ? 'Invite copied' : 'Invite your batch'}
        </Button>
      </div>
    </div>
  );
}
