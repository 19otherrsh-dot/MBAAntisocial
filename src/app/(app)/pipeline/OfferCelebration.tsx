'use client';

import Link from 'next/link';
import { BookOpen, HeartHandshake, TrendingUp } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import Confetti from '@/components/ui/Confetti';
import type { Application } from './types';
import styles from '../app.module.css';

/**
 * The moment an offer lands.
 *
 * Moving a card to "Offer" used to be a dropdown change like any other — the
 * single best thing that happens in placement season, acknowledged with a
 * re-render. This marks it, then points at the three things that make the next
 * batch's season easier: the pay benchmark, the questions, and the seniors who
 * helped. None of them are required; all of them are one tap.
 */
export default function OfferCelebration({
  application,
  onClose,
}: {
  application: Application;
  onClose: () => void;
}) {
  const params = new URLSearchParams({
    report: '1',
    company: application.company,
    role: application.role,
    track: application.track,
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${application.company}. You did it.`}
      description="That is the offer. Take a minute with it before anything else."
      footer={
        <Button variant="ghost" onClick={onClose}>
          Back to the pipeline
        </Button>
      }
    >
      <Confetti />
      <p style={{ lineHeight: 1.6 }}>
        When you are ready, three things would make next year&apos;s batch&apos;s season a little
        easier. Each takes a minute.
      </p>
      <div className={styles.celebrateActions}>
        <Link href={`/offer-intel?${params.toString()}`} className={styles.celebrateAction} onClick={onClose}>
          <TrendingUp size={18} />
          <span>
            <strong>Add it to Offer Intel</strong>
            <span>Anonymous, banded, and capped — nobody can trace it back.</span>
          </span>
        </Link>
        <Link
          href={`/intel?company=${encodeURIComponent(application.company)}`}
          className={styles.celebrateAction}
          onClick={onClose}
        >
          <BookOpen size={18} />
          <span>
            <strong>Log what the panel asked</strong>
            <span>The most valuable thing you can leave behind.</span>
          </span>
        </Link>
        <Link href="/sessions?view=bookings" className={styles.celebrateAction} onClick={onClose}>
          <HeartHandshake size={18} />
          <span>
            <strong>Thank the seniors who prepped you</strong>
            <span>Find your past mocks and send a note.</span>
          </span>
        </Link>
      </div>
    </Dialog>
  );
}
