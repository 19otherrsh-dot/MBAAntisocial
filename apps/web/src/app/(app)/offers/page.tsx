'use client';

import { useState } from 'react';
import { Plus, Ghost, ShieldCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState, Chip, Stat, Banner } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery, useAction } from '@/lib/client/hooks';
import { api } from '@/lib/client/api';
import { ROLE_TRACKS, ROLE_TRACK_META, type RoleTrack } from '@/lib/constants';
import styles from '../app.module.css';

interface OfferStat {
  track: RoleTrack;
  offerType: 'internship' | 'full_time';
  avgBase: number;
  maxBase: number;
  avgBonus: number;
  count: number;
}

interface Offer {
  _id: string;
  company: string;
  role: string;
  location: string;
  /** A band, not the exact figure — see the API for why. */
  baseBand: { low: number; high: number };
  hasBonus: boolean;
  offerType: 'internship' | 'full_time';
  track: RoleTrack;
  reportedMonth: string;
}

interface OffersResponse {
  stats: OfferStat[];
  recent: Offer[];
  totalReports: number;
  minCohort: number;
  suppressedTracks: boolean;
}

/** Compact money, e.g. 1250000 → "1.25M", 85000 → "85k". */
function money(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

export default function OfferIntelPage() {
  const [showModal, setShowModal] = useState(false);
  const { data, loading, error, refetch } = useApiQuery<OffersResponse>('/api/offers');

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>Offer intel</h2>
          <p className={styles.pageSubtitle}>
            What your campus is actually being paid, reported anonymously.
          </p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setShowModal(true)}>
          Report an offer
        </Button>
      </div>

      <Banner variant="info" icon={<ShieldCheck size={16} />} title="How the anonymity works">
        Nothing here stores who submitted what — there is no user field on the record at all. On
        top of that, individual reports show a <strong>band rather than an exact figure</strong> and
        only the month, and a track benchmark is withheld until{' '}
        {data?.minCohort ?? 5} people have reported. Storage anonymity alone would not be enough:
        one exact salary at a named firm identifies a person on a campus this size.
      </Banner>

      {error && <div className={styles.errorBox}>{error}</div>}

      {loading ? (
        <div className="skeleton" style={{ height: 400 }} />
      ) : (
        <>
          <section className={styles.section} style={{ marginTop: 'var(--s-6)' }}>
            <h3 className={styles.sectionHead}>Benchmarks — full-time</h3>
            <div className={styles.statStrip}>
              {data?.stats
                .filter((s) => s.offerType === 'full_time')
                .map((stat) => (
                  <Stat
                    key={stat.track}
                    label={ROLE_TRACK_META[stat.track].label}
                    value={money(stat.avgBase)}
                    meta={`Top ${money(stat.maxBase)} · ${stat.count} reports`}
                  />
                ))}
              {data?.stats.filter((s) => s.offerType === 'full_time').length === 0 && (
                <p className="dim">
                  {data?.suppressedTracks
                    ? `Not enough reports yet — a benchmark appears once ${data.minCohort} people have reported for a track, so that no single figure is identifiable.`
                    : 'No full-time offers reported yet.'}
                </p>
              )}
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionHead}>Recent Reports</h3>
            {data?.recent.length === 0 ? (
              <EmptyState
                art={<Ghost size={40} strokeWidth={1.4} />}
                title="It's quiet in here"
                body="Be the first to break the taboo and drop an offer anonymously."
                action={<Button variant="primary" onClick={() => setShowModal(true)}>Drop an Offer</Button>}
              />
            ) : (
              <div className={styles.cardList}>
                {data?.recent.map((offer) => (
                  <article key={offer._id} className={styles.slotCard}>
                    <div className={styles.slotMain}>
                      <div className={styles.slotTop}>
                        <Chip tone={offer.offerType === 'full_time' ? 'teal' : 'amber'}>
                          {offer.offerType === 'full_time' ? 'Full-Time' : 'Internship'}
                        </Chip>
                        <Chip outline>{ROLE_TRACK_META[offer.track].label}</Chip>
                        <Chip outline>{offer.reportedMonth}</Chip>
                      </div>

                      <div className={styles.slotPerson}>
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            background: 'var(--bg-sunken)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <Ghost size={20} />
                        </div>
                        <div>
                          <div className={styles.slotName}>
                            {offer.role} · {offer.company}
                          </div>
                          <div className={styles.slotRole}>{offer.location}</div>
                        </div>
                      </div>

                      <div className="row gap-5 wrap" style={{ marginTop: 'var(--s-3)' }}>
                        <div>
                          <div className="dim" style={{ fontSize: 'var(--t-xs)' }}>
                            Base
                          </div>
                          <div
                            style={{ fontSize: 'var(--t-lg)', fontWeight: 620 }}
                            data-numeric
                          >
                            {money(offer.baseBand.low)} – {money(offer.baseBand.high)}
                          </div>
                        </div>
                        {offer.hasBonus && (
                          <div>
                            <div className="dim" style={{ fontSize: 'var(--t-xs)' }}>
                              Signing bonus
                            </div>
                            <div style={{ fontSize: 'var(--t-lg)', fontWeight: 620 }}>Yes</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {showModal && (
        <DropOfferDialog onClose={() => setShowModal(false)} onDone={() => { setShowModal(false); refetch(); }} />
      )}
    </>
  );
}

function DropOfferDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [baseSalary, setBaseSalary] = useState('');
  const [signingBonus, setSigningBonus] = useState('');
  const [offerType, setOfferType] = useState<'internship' | 'full_time'>('full_time');
  const [track, setTrack] = useState<RoleTrack>('consulting');

  const submit = useAction(async () => {
    await api.post('/api/offers', {
      company: company.trim(),
      role: role.trim(),
      location: location.trim(),
      baseSalary: parseInt(baseSalary, 10),
      signingBonus: parseInt(signingBonus, 10) || 0,
      offerType,
      track,
    });
    toast.success('Offer dropped', 'Thanks for paying it forward. Stay rich.');
    onDone();
  });

  const canSubmit = company && role && location && baseSalary && !isNaN(Number(baseSalary));

  return (
    <Dialog
      open
      onClose={onClose}
      title="Report an offer"
      description="Your account is never recorded against this. It publishes as a band, not an exact figure, so it cannot be traced back to you by elimination either."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>Cancel</Button>
          <Button variant="primary" onClick={() => submit.run()} loading={submit.pending} disabled={!canSubmit}>
            Drop it anonymously
          </Button>
        </>
      }
    >
      <div className={styles.checkGrid}>
        <Input label="Company" placeholder="McKinsey & Company" value={company} onChange={(e) => setCompany(e.target.value)} autoFocus />
        <Input label="Role" placeholder="Associate" value={role} onChange={(e) => setRole(e.target.value)} />
      </div>

      <div className={styles.checkGrid}>
        <Select
          label="Type"
          value={offerType}
          onChange={(e) => setOfferType(e.target.value as 'internship' | 'full_time')}
          options={[
            { value: 'full_time', label: 'Full-Time' },
            { value: 'internship', label: 'Internship' },
          ]}
        />
        <Select
          label="Track"
          value={track}
          onChange={(e) => setTrack(e.target.value as RoleTrack)}
          options={ROLE_TRACKS.map((t) => ({ value: t, label: ROLE_TRACK_META[t].label }))}
        />
      </div>

      <Input label="Location" placeholder="New York, NY" value={location} onChange={(e) => setLocation(e.target.value)} />

      <div className={styles.checkGrid}>
        <Input label="Base Salary (USD)" type="number" placeholder="175000" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} />
        <Input label="Signing Bonus (USD)" type="number" placeholder="30000" value={signingBonus} onChange={(e) => setSigningBonus(e.target.value)} optional />
      </div>
    </Dialog>
  );
}
