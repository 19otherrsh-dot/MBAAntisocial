'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building, BookOpen, Plus, Search, Target, TrendingUp } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Field';
import { Chip, EmptyState } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery, useDebounced } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { timeAgo } from '@/lib/utils';
import Spotlight from '@/components/motion/Spotlight';
import cs from '@/components/campus/campus.module.css';
import styles from '../app.module.css';

interface CompanyRow { key: string; name: string; sector: string; hasPage: boolean; questions: number; applicants: number; offers: number; updatedAt?: string; editors: number }

export default function CompaniesPage() {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState('');
  const query = useDebounced(q, 250);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const { data } = useApiQuery<{ companies: CompanyRow[] }>('/api/companies', { q: query || undefined });

  const create = async () => {
    try {
      const { key } = await api.post<{ key: string }>('/api/companies', { name });
      router.push(`/companies/${key}`);
    } catch (caught) {
      toast.error('Could not create the page', errorMessage(caught));
    }
  };

  return (
    <div className="stack gap-5">
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Company wiki</h1>
          <p className={styles.pageSubtitle}>Your campus’s shared notes on every recruiter — process, roles, prep, and what it’s really like. Anyone can improve a page.</p>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setAdding(true)}>Add a company</Button>
      </div>
      <div style={{ maxWidth: 360 }}><Input aria-label="Search companies" placeholder="Search companies" icon={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!data ? <div className="skeleton" style={{ height: 260 }} /> : data.companies.length === 0 ? (
        <EmptyState art={<Building size={36} strokeWidth={1.4} />} title="No companies yet" body="Start a page for a recruiter you know — the next batch will thank you." action={<Button onClick={() => setAdding(true)}>Add a company</Button>} />
      ) : (
        <Spotlight>
          <div className={cs.grid} data-reveal="">
            {data.companies.map((c) => (
              <Link key={c.key} href={`/companies/${c.key}`} className={cs.card} data-spot="">
                <div className={cs.cardBody} style={{ paddingTop: 'var(--s-4)' }}>
                  <div className="row gap-2" style={{ justifyContent: 'space-between' }}>
                    <span className={cs.cardTitle}>{c.name}</span>
                    {!c.hasPage && <Chip tone="amber">No page yet</Chip>}
                  </div>
                  {c.sector && <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{c.sector}</span>}
                  <div className={cs.meta}>
                    {c.questions > 0 && <span><BookOpen size={12} /> {c.questions} questions</span>}
                    {c.applicants > 0 && <span><Target size={12} /> {c.applicants} applied</span>}
                    {c.offers > 0 && <span><TrendingUp size={12} /> {c.offers} offers</span>}
                  </div>
                  {c.updatedAt && <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>Updated {timeAgo(c.updatedAt)}{c.editors ? ` · ${c.editors} contributor${c.editors > 1 ? 's' : ''}` : ''}</span>}
                </div>
              </Link>
            ))}
          </div>
        </Spotlight>
      )}
      {adding && (
        <Dialog open onClose={() => setAdding(false)} title="Add a company" footer={<><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={create} disabled={name.trim().length < 2}>Create page</Button></>}>
          <Input label="Company name" placeholder="McKinsey & Company" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Dialog>
      )}
    </div>
  );
}
