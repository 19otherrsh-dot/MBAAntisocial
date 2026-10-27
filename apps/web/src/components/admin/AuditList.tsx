'use client';

import { History } from 'lucide-react';
import { EmptyState } from '@/components/ui/Display';
import { useApiQuery } from '@/lib/client/hooks';
import { formatDateTime } from '@/lib/utils';
import type { AuditEntry } from './types';
import styles from './admin.module.css';

const ACTION_LABEL: Record<string, string> = {
  'campus.update': 'edited',
  'campus.open': 'approved',
  'campus.campus': 'unlocked the Campus Edition for',
  'campus.suspended': 'suspended',
  'campus.requested': 'moved back to requested',
  'user.role': 'changed the role of',
  'user.suspend': 'suspended',
  'user.reinstate': 'reinstated',
  'game.publish': 'published',
  'game.rollback': 'rolled back',
  'game.activate': 're-activated',
};

const show = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

/** Who changed what, newest first. Before/after only for the fields that moved. */
export default function AuditList({ source }: { source: '/api/admin/audit' | '/api/institute/audit' }) {
  const { data, loading } = useApiQuery<{ entries: AuditEntry[] }>(source);
  if (loading && !data) return <div className="skeleton" style={{ height: 200, borderRadius: 'var(--r-lg)' }} />;
  if (!data?.entries.length) return <EmptyState art={<History size={22} />} title="Nothing yet" body="Role changes, suspensions, campus and game changes appear here." />;
  return (
    <ol className={styles.audit}>
      {data.entries.map((entry) => (
        <li key={entry._id} className={styles.auditRow}>
          <div>
            <strong>{entry.actor?.name ?? 'Someone'}</strong> {ACTION_LABEL[entry.action] ?? entry.action} <strong>{entry.targetLabel}</strong>
          </div>
          {Object.keys(entry.after).length > 0 && entry.targetType !== 'game_release' && (
            <div className={styles.auditDiff}>
              {Object.keys(entry.after).map((key) => (
                <span key={key}>
                  {key.replace(/^(settings|support)\./, '')}: <s>{show(entry.before[key])}</s> → {show(entry.after[key])}
                </span>
              ))}
            </div>
          )}
          {entry.reason && <div className={styles.auditReason}>“{entry.reason}”</div>}
          <time className={styles.auditTime}>{formatDateTime(entry.createdAt)}{entry.campus ? ` · ${entry.campus}` : ''}</time>
        </li>
      ))}
    </ol>
  );
}
