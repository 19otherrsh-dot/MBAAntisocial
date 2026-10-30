'use client';

import { Coins } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Chip } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { api, errorMessage } from '@/lib/client/api';
import { timeAgo } from '@/lib/utils';
import styles from '@/app/(app)/app.module.css';

interface CreditsResponse {
  balance: number;
  history: Array<{ _id: string; amount: number; reason: string; createdAt: string }>;
  earn: Record<string, number>;
  perks: Array<{ reason: string; label: string; blurb: string; cost: number }>;
}

const REASON_LABEL: Record<string, string> = {
  session_hosted: 'Hosted a mock',
  gd_moderated: 'Moderated a GD',
  referral_given: 'Gave a referral',
  admin_grant: 'Granted by an admin',
  referral_priority: 'Priority referral',
  listing_boost: 'Marketplace boost',
  priority_booking: 'Extra booking',
};

/** Credits: earned by giving time, spent on perks. A currency, never a ranking. */
export default function CreditsCard() {
  const toast = useToast();
  const { patch } = useMe();
  const { data, refetch } = useApiQuery<CreditsResponse>('/api/credits');
  if (!data) return <div className="skeleton" style={{ height: 120 }} />;

  const buy = async (reason: string) => {
    try {
      const { balance } = await api.post<{ balance: number }>('/api/credits', { reason });
      patch({ credits: balance });
      toast.success('Done', 'You can hold one extra booking this week.');
      refetch();
    } catch (caught) {
      toast.error('Could not use credits', errorMessage(caught));
    }
  };

  return (
    <section className={styles.settingsGroup}>
      <div className="between gap-3 wrap">
        <div>
          <h2 className={styles.settingsTitle}><Coins size={16} style={{ display: 'inline', marginRight: 6 }} />{data.balance} credits</h2>
          <p className={styles.settingsHint}>
            Earned by giving time — {data.earn.session_hosted} per mock hosted, {data.earn.gd_moderated} per GD moderated, {data.earn.referral_given} per referral.
          </p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--s-3)' }}>
        {data.perks.map((perk) => (
          <div key={perk.reason} className={styles.feedbackBlock}>
            <div className="between"><strong>{perk.label}</strong><Chip tone="amber">{perk.cost}</Chip></div>
            <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>{perk.blurb}</p>
            {perk.reason === 'priority_booking' && (
              <Button size="sm" variant="secondary" disabled={data.balance < perk.cost} onClick={() => buy(perk.reason)}>Use credits</Button>
            )}
          </div>
        ))}
      </div>
      {data.history.length > 0 && (
        <div className="stack gap-1">
          {data.history.slice(0, 6).map((h) => (
            <div key={h._id} className="between" style={{ fontSize: 'var(--t-sm)' }}>
              <span>{REASON_LABEL[h.reason] ?? h.reason}</span>
              <span className="row gap-3"><span className="dim">{timeAgo(h.createdAt)}</span><strong style={{ color: h.amount > 0 ? 'var(--teal-text)' : 'var(--rose-text)' }}>{h.amount > 0 ? '+' : ''}{h.amount}</strong></span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
