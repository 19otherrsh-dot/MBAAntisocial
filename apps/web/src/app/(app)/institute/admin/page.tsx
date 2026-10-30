'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { CAMPUS_UNLOCK_MEMBERS, CAMPUS_UNLOCK_MENTORS, type CampusStatus } from '@mba/shared/campus';
import { Banner, EmptyState } from '@/components/ui/Display';
import { Input, Switch } from '@/components/ui/Field';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import MetricCards from '@/components/admin/MetricCards';
import PeoplePanel from '@/components/admin/PeoplePanel';
import AuditList from '@/components/admin/AuditList';
import type { SuccessMetrics } from '@/components/admin/types';
import { useApiQuery } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { api, errorMessage } from '@/lib/client/api';
import as from '@/components/admin/admin.module.css';
import styles from '../../app.module.css';

interface CampusProfile {
  _id: string;
  name: string;
  shortName: string;
  city: string;
  website: string;
  domains: string[];
  status: CampusStatus;
  settings: { crossCampusMentors: boolean; crossCampusFeed: boolean; whispers: boolean; games: boolean; discordGuildId: string };
  support: { counsellorName: string; counsellorContact: string; hours: string; bookingUrl: string; emergencyContact: string };
}
interface Density { members: number; mentors: number; memberPct: number; mentorPct: number; ready: boolean }

export default function CampusAdminPage() {
  const { me } = useMe();
  const { data, error, refetch } = useApiQuery<{ campus: CampusProfile; density: Density }>(me?.canAdminCampus ? '/api/institute/campus' : null);
  const metrics = useApiQuery<{ metrics: SuccessMetrics; computedAt: string }>(me?.canAdminCampus ? '/api/institute/metrics' : null);

  if (me && !me.canAdminCampus) {
    return <EmptyState art={<ShieldAlert size={22} />} title="Campus admins only" body="Ask your institute’s administrator, or the platform team, for access." />;
  }

  return (
    <div className="stack gap-5">
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Campus admin</h1>
          <p className={styles.pageSubtitle}>{me?.campus ?? 'Your campus'}: settings, support, roles, and how the batch is doing.</p>
        </div>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}
      {data?.campus.status === 'open' && <UnlockProgress density={data.density} />}
      {data?.campus.status === 'suspended' && (
        <Banner variant="danger" title="This campus is suspended">Members can sign in to export their data; nothing else works. Contact the platform team.</Banner>
      )}

      {data ? <ProfileForm key={data.campus._id} campus={data.campus} onSaved={refetch} /> : !error && <div className="skeleton" style={{ height: 320, borderRadius: 'var(--r-lg)' }} />}

      <section className={as.section}>
        <div className={as.sectionHead}>
          <h2 className={as.sectionTitle}>How the batch is doing</h2>
          <span className={as.note}>Last 120 days</span>
        </div>
        {metrics.data ? <MetricCards metrics={metrics.data.metrics} computedAt={metrics.data.computedAt} /> : <div className="skeleton" style={{ height: 200 }} />}
      </section>

      <section className={as.section}>
        <div className={as.sectionHead}>
          <h2 className={as.sectionTitle}>Roles</h2>
        </div>
        <p className={as.note}>Make seniors mentors, pick moderators, give the placement office its report. Campus admins are appointed by the platform team.</p>
        <PeoplePanel scope="campus" />
      </section>

      <section className={as.section}>
        <h2 className={as.sectionTitle}>Changes on this campus</h2>
        <AuditList source="/api/institute/audit" />
      </section>
    </div>
  );
}

function UnlockProgress({ density }: { density: Density }) {
  return (
    <section className={as.section}>
      <div className={as.sectionHead}>
        <h2 className={as.sectionTitle}>On the way to the Campus Edition</h2>
      </div>
      <p className={as.note}>
        Mocks with your own seniors, the batch’s notes, the feed and hub switch on by themselves once enough of the campus is here. Seniors are usually the slower half —
        ask the second years to sign up and switch on hosting.
      </p>
      {[
        { label: 'Members', value: density.members, of: CAMPUS_UNLOCK_MEMBERS, pct: density.memberPct },
        { label: 'Mentors', value: density.mentors, of: CAMPUS_UNLOCK_MENTORS, pct: density.mentorPct },
      ].map((row) => (
        <div key={row.label} className={as.progressRow}>
          <span>{row.label}</span>
          <div className={as.meter} role="meter" aria-valuemin={0} aria-valuemax={row.of} aria-valuenow={row.value} aria-label={row.label}>
            <span className={as.meterFill} style={{ width: `${Math.max(2, Math.round(row.pct * 100))}%` }} />
          </div>
          <span className={as.progressValue}>{row.value} / {row.of}</span>
        </div>
      ))}
    </section>
  );
}

function ProfileForm({ campus, onSaved }: { campus: CampusProfile; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ shortName: campus.shortName, city: campus.city, website: campus.website });
  const [settings, setSettings] = useState(campus.settings);
  const [support, setSupport] = useState(campus.support);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/api/institute/campus', { ...form, settings, support });
      toast.success('Saved');
      onSaved();
    } catch (caught) {
      toast.error('Could not save', errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className={as.section}>
        <h2 className={as.sectionTitle}>Campus</h2>
        <div className={as.grid2}>
          <Input label="Short name" value={form.shortName} maxLength={30} onChange={(e) => setForm({ ...form, shortName: e.target.value })} />
          <Input label="City" value={form.city} maxLength={80} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <Input label="Website" optional type="url" placeholder="https://" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
        <p className={as.note}>Sign-ups are limited to {campus.domains.join(', ')}. The platform team changes domains.</p>
        <div className="stack gap-3">
          <Switch checked={settings.crossCampusMentors} onChange={(v) => setSettings({ ...settings, crossCampusMentors: v })} label="Cross-campus mentoring" hint="Your students can book opted-in mentors from other campuses, and your seniors can choose to help theirs." />
          <Switch checked={settings.whispers} onChange={(v) => setSettings({ ...settings, whispers: v })} label="Course & professor reviews" hint="Moderated. Turn off if your institute has its own feedback process it would rather students use." />
          <Switch checked={settings.games} onChange={(v) => setSettings({ ...settings, games: v })} label="Games" />
        </div>
        <Input
          label="Discord server id"
          optional
          hint="Links the campus hub to your Discord server for the bridge. Right-click the server in Discord → Copy Server ID."
          value={settings.discordGuildId}
          onChange={(e) => setSettings({ ...settings, discordGuildId: e.target.value.replace(/\D/g, '') })}
        />
      </section>

      <section className={as.section}>
        <h2 className={as.sectionTitle}>Counselling and support</h2>
        <p className={as.note}>Shown on every student’s wellbeing page next to the national helplines. Leave blank what you do not have; do not list a personal number.</p>
        <div className={as.grid2}>
          <Input label="Counsellor or service" value={support.counsellorName} maxLength={100} onChange={(e) => setSupport({ ...support, counsellorName: e.target.value })} />
          <Input label="How to reach them" placeholder="Email or office phone" value={support.counsellorContact} maxLength={200} onChange={(e) => setSupport({ ...support, counsellorContact: e.target.value })} />
          <Input label="Hours" placeholder="Mon–Fri, 10am–6pm" value={support.hours} maxLength={100} onChange={(e) => setSupport({ ...support, hours: e.target.value })} />
          <Input label="Booking link" optional type="url" value={support.bookingUrl} onChange={(e) => setSupport({ ...support, bookingUrl: e.target.value })} />
        </div>
        <Input label="Campus emergency contact" placeholder="Security desk, 24×7" value={support.emergencyContact} maxLength={200} onChange={(e) => setSupport({ ...support, emergencyContact: e.target.value })} />
      </section>

      <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
        <Button loading={saving} onClick={save}>Save changes</Button>
      </div>
    </>
  );
}
