'use client';

import { useCallback, useRef, useState } from 'react';
import { Flame, PenLine } from 'lucide-react';
import type { ResumeData } from '@mba/shared/resume';
import { Segmented } from '@/components/ui/Display';
import Builder, { type ResumeDoc } from '@/components/resume/Builder';
import Roaster from '@/components/resume/Roaster';
import { useApiQuery } from '@/lib/client/hooks';
import styles from '../app.module.css';

type Tab = 'build' | 'roast';

export default function ResumeStudioPage() {
  const [tab, setTab] = useState<Tab>('build');
  const { data, error } = useApiQuery<{ data: ResumeData; target: string }>('/api/resume');
  // The live draft lives in the builder; the roaster reads it on demand.
  const draft = useRef<ResumeDoc | null>(null);
  const trackDraft = useCallback((doc: ResumeDoc) => {
    draft.current = doc;
  }, []);

  return (
    <div className="stack gap-4">
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Resume studio</h1>
          <p className={styles.pageSubtitle}>Build a one-page resume that prints right, then get it torn apart before a recruiter does.</p>
        </div>
        <Segmented
          ariaLabel="Resume studio"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'build', label: 'Build', icon: <PenLine size={14} /> },
            { value: 'roast', label: 'Roast', icon: <Flame size={14} /> },
          ]}
        />
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {/* Both stay mounted, so switching tabs never loses a draft or a review. */}
      <div hidden={tab !== 'build'}>
        {data ? (
          <Builder initial={{ data: data.data, target: data.target }} onRoast={() => setTab('roast')} onDocChange={trackDraft} />
        ) : (
          !error && <div className={styles.skeletonWide} aria-busy="true" />
        )}
      </div>
      <div hidden={tab !== 'roast'}>
        {data && <Roaster initialTarget={data.target} getDraft={() => draft.current} onEdit={() => setTab('build')} />}
      </div>
    </div>
  );
}
