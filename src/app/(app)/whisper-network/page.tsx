'use client';

import { useState } from 'react';
import { VolumeX, Plus, Star, Dumbbell, Clock, Flag, ShieldCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { EmptyState, Chip, Banner } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery, useAction } from '@/lib/client/hooks';
import { api } from '@/lib/client/api';
import { REPORT_REASONS, REPORT_REASON_META, type ReportReason } from '@/lib/constants';
import { timeAgo } from '@/lib/utils';
import styles from '../app.module.css';

interface WhisperStat {
  targetName: string;
  targetType: 'course' | 'professor';
  avgRating: string;
  avgDifficulty: string;
  avgWorkload: string;
  count: number;
}

interface Whisper {
  _id: string;
  targetName: string;
  targetType: 'course' | 'professor';
  rating: number;
  difficulty: number;
  workload: number;
  content: string;
  createdAt: string;
}

/** Takedown route for a review that names someone and crosses a line. */
function ReportWhisperDialog({
  whisperId,
  onClose,
  onDone,
}: {
  whisperId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [detail, setDetail] = useState('');

  const submit = useAction(async () => {
    await api.post('/api/reports', {
      targetType: 'whisper',
      target: whisperId,
      reason,
      detail: detail.trim(),
    });
    onDone();
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Report this review"
      description="A moderator on your campus reviews it. Reviews that name someone and cross into abuse get taken down."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => submit.run()} loading={submit.pending}>
            Send report
          </Button>
        </>
      }
    >
      {submit.error && <Banner variant="danger">{submit.error}</Banner>}

      <Select
        label="What is wrong with it"
        value={reason}
        onChange={(e) => setReason(e.target.value as ReportReason)}
        options={REPORT_REASONS.map((value) => ({
          value,
          label: REPORT_REASON_META[value].label,
        }))}
      />

      <Textarea
        label="Anything else"
        placeholder="Context helps a moderator make the right call."
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        maxLength={1000}
        rows={3}
        optional
      />
    </Dialog>
  );
}

interface WhisperResponse {
  stats: WhisperStat[];
  recent: Whisper[];
  minReviews: number;
}

export default function WhisperNetworkPage() {
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const { data, loading, error, refetch } = useApiQuery<WhisperResponse>('/api/whispers');

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>The Whisper Network</h2>
          <p className={styles.pageSubtitle}>
            Anonymous course and professor reviews. Honest, not a pile-on.
          </p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setShowAdd(true)}>
          Write a review
        </Button>
      </div>

      <Banner variant="warning" icon={<ShieldCheck size={16} />} title="These name real people">
        Your name is never shown, but it <em>is</em> recorded — so a review that
        crosses into abuse can be taken down and acted on. Anonymity without that is
        just an unaccountable channel pointed at named staff. One review each per
        course or professor, and an average only appears once{' '}
        {data?.minReviews ?? 3} people have written one.
      </Banner>

      {error && <div className={styles.errorBox}>{error}</div>}

      {loading ? (
        <div className="skeleton" style={{ height: 400 }} />
      ) : (
        <>
          <section className={styles.section} style={{ marginTop: 'var(--s-6)' }}>
            <h3 className={styles.sectionHead}>Elective cheat sheet</h3>
            <div className={styles.cardList}>
              {data?.stats.map((stat) => (
                <article key={`${stat.targetType}-${stat.targetName}`} className={styles.slotCard}>
                  <div className={styles.slotMain}>
                    <div className={styles.slotTop}>
                      <Chip outline>{stat.targetType === 'course' ? 'Course' : 'Professor'}</Chip>
                      <Chip tone="slate">{stat.count} Reviews</Chip>
                    </div>
                    <div className={styles.slotName} style={{ marginTop: 'var(--s-3)' }}>
                      {stat.targetName}
                    </div>
                    
                    <div className={styles.statStrip} style={{ background: 'var(--bg)', padding: 'var(--s-3)', borderRadius: 'var(--r-md)', marginTop: 'var(--s-4)' }}>
                      <div>
                         <div className="dim" style={{ fontSize: 'var(--t-xs)', display: 'flex', alignItems: 'center', gap: 4 }}><Star size={12}/> Rating</div>
                         <div style={{ fontSize: 'var(--t-lg)', fontWeight: 600 }}>{stat.avgRating}/5</div>
                      </div>
                      <div>
                         <div className="dim" style={{ fontSize: 'var(--t-xs)', display: 'flex', alignItems: 'center', gap: 4 }}><Dumbbell size={12}/> Difficulty</div>
                         <div style={{ fontSize: 'var(--t-lg)', fontWeight: 600 }}>{stat.avgDifficulty}/5</div>
                      </div>
                      <div>
                         <div className="dim" style={{ fontSize: 'var(--t-xs)', display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12}/> Workload</div>
                         <div style={{ fontSize: 'var(--t-lg)', fontWeight: 600 }}>{stat.avgWorkload}/5</div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
              {data?.stats.length === 0 && (
                <p className="dim">No reviews reported yet.</p>
              )}
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionHead}>Recent Whispers</h3>
            {data?.recent.length === 0 ? (
              <EmptyState
                art={<VolumeX size={40} strokeWidth={1.4} />}
                title="Silence"
                body="Nobody has dropped any intel yet. Be the first to warn the batch."
                action={<Button variant="primary" onClick={() => setShowAdd(true)}>Drop a Whisper</Button>}
              />
            ) : (
              <div className={styles.cardList}>
                {data?.recent.map((whisper) => (
                  <article key={whisper._id} className={styles.slotCard}>
                    <div className={styles.slotMain}>
                      <div className={styles.slotTop}>
                        <Chip outline>{whisper.targetType === 'course' ? 'Course' : 'Professor'}</Chip>
                        <Chip outline>{timeAgo(whisper.createdAt)}</Chip>
                      </div>

                      <div className={styles.slotName} style={{ marginTop: 'var(--s-3)' }}>
                        {whisper.targetName}
                      </div>

                      <div className={styles.checkGrid} style={{ marginTop: 'var(--s-3)', gap: 'var(--s-3)' }}>
                         <Chip tone={whisper.rating >= 4 ? 'teal' : whisper.rating <= 2 ? 'rose' : 'amber'}>Rating: {whisper.rating}/5</Chip>
                         <Chip tone={whisper.difficulty >= 4 ? 'rose' : whisper.difficulty <= 2 ? 'teal' : 'amber'}>Difficulty: {whisper.difficulty}/5</Chip>
                         <Chip tone={whisper.workload >= 4 ? 'rose' : whisper.workload <= 2 ? 'teal' : 'amber'}>Workload: {whisper.workload}/5</Chip>
                      </div>

                      <p className={styles.slotNote} style={{ marginTop: 'var(--s-4)', fontStyle: 'italic' }}>
                        &ldquo;{whisper.content}&rdquo;
                      </p>

                      {/* These name real people. A takedown route has to be one
                          click away, not buried, or anonymity has no counterweight. */}
                      <div className={styles.slotActions}>
                        <button
                          className={styles.commentAction}
                          onClick={() => setReporting(whisper._id)}
                        >
                          <Flag size={12} style={{ display: 'inline', marginRight: 4 }} />
                          Report this
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {showAdd && (
        <AddWhisperDialog onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); refetch(); }} />
      )}

      {reporting && (
        <ReportWhisperDialog
          whisperId={reporting}
          onClose={() => setReporting(null)}
          onDone={() => {
            setReporting(null);
            toast.success('Reported', 'A campus moderator will review it.');
          }}
        />
      )}
    </>
  );
}

function AddWhisperDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [targetName, setTargetName] = useState('');
  const [targetType, setTargetType] = useState<'course' | 'professor'>('course');
  const [rating, setRating] = useState('3');
  const [difficulty, setDifficulty] = useState('3');
  const [workload, setWorkload] = useState('3');
  const [content, setContent] = useState('');

  const submit = useAction(async () => {
    await api.post('/api/whispers', {
      targetName: targetName.trim(),
      targetType,
      rating: parseInt(rating, 10),
      difficulty: parseInt(difficulty, 10),
      workload: parseInt(workload, 10),
      content: content.trim(),
    });
    toast.success('Whisper dropped', 'Your secret is safe with the network.');
    onDone();
  });

  const canSubmit = targetName && content.length >= 10;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Drop a Whisper"
      description="Tell the truth about this course or professor. No userId is stored. This is 100% untraceable."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>Cancel</Button>
          <Button variant="danger" onClick={() => submit.run()} loading={submit.pending} disabled={!canSubmit}>
            Drop Anonymously
          </Button>
        </>
      }
    >
      <div className={styles.checkGrid}>
        <Input label="Name" placeholder="Corporate Finance" value={targetName} onChange={(e) => setTargetName(e.target.value)} autoFocus />
        <Select
          label="Type"
          value={targetType}
          onChange={(e) => setTargetType(e.target.value as 'course' | 'professor')}
          options={[
            { value: 'course', label: 'Course' },
            { value: 'professor', label: 'Professor' },
          ]}
        />
      </div>

      <div className={styles.checkGrid}>
        <Select label="Overall Rating (1-5)" value={rating} onChange={(e) => setRating(e.target.value)} options={['1','2','3','4','5'].map(v => ({ value: v, label: v }))} />
        <Select label="Difficulty (1-5)" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} options={['1','2','3','4','5'].map(v => ({ value: v, label: v }))} />
        <Select label="Workload (1-5)" value={workload} onChange={(e) => setWorkload(e.target.value)} options={['1','2','3','4','5'].map(v => ({ value: v, label: v }))} />
      </div>

      <Textarea
        label="The Brutal Truth"
        placeholder="Easy A if you just memorize the past papers. The professor literally just reads off the slides. Do not take this if you actually want to learn modelling."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
      />
    </Dialog>
  );
}
