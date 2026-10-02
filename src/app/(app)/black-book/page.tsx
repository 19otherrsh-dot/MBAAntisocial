'use client';

import { useState } from 'react';
import { BookUser, Plus, RefreshCw, Star, Flame, Snowflake, Edit3 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { EmptyState, Chip } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery, useAction, useNow } from '@/lib/client/hooks';
import { api } from '@/lib/client/api';
import { timeAgo } from '@/lib/utils';
import styles from '../app.module.css';

type ContactStatus = 'cold' | 'warm' | 'advocate';

interface Contact {
  _id: string;
  name: string;
  company: string;
  role: string;
  status: ContactStatus;
  lastContactedAt: string;
  notes: string;
}

export default function BlackBookPage() {
  const now = useNow();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const { data, loading, error, refetch } = useApiQuery<{ contacts: Contact[] }>('/api/network');
  const toast = useToast();

  const bumpAction = useAction(async (contactId: string) => {
    await api.patch('/api/network', { contactId, bumpLastContacted: true });
    toast.success('Logged interaction', 'Last contacted date bumped.');
    refetch();
  });

  const getStatusIcon = (status: string) => {
    if (status === 'cold') return <Snowflake size={14} />;
    if (status === 'warm') return <Flame size={14} />;
    if (status === 'advocate') return <Star size={14} />;
    return null;
  };

  // `now` comes from the clock hook rather than `Date.now()` during render, so
  // the staleness flag stays idempotent and re-evaluates on its own each minute.
  const isStale = (dateStr: string) =>
    now - new Date(dateStr).getTime() > 14 * 24 * 60 * 60 * 1000;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>The Black Book</h2>
          <p className={styles.pageSubtitle}>
            Your personal networking CRM. Track coffees, manage relationships, and follow up.
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setShowAdd(true)}>
          Add Contact
        </Button>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {loading ? (
        <div className="skeleton" style={{ height: 400 }} />
      ) : data?.contacts.length === 0 ? (
        <EmptyState
          art={<BookUser size={40} strokeWidth={1.4} />}
          title="Your network is empty"
          body="Start building your Black Book. Log your coffee chats here instead of a spreadsheet."
          action={<Button variant="primary" onClick={() => setShowAdd(true)}>Add your first contact</Button>}
        />
      ) : (
        <div className={styles.cardList}>
          {data?.contacts.map((contact) => (
            <article key={contact._id} className={styles.slotCard} style={{ borderLeft: isStale(contact.lastContactedAt) ? '2px solid var(--danger)' : 'none' }}>
              <div className={styles.slotMain}>
                <div className={styles.slotTop}>
                  <Chip tone={contact.status === 'advocate' ? 'teal' : contact.status === 'warm' ? 'amber' : 'slate'}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {getStatusIcon(contact.status)} {contact.status.charAt(0).toUpperCase() + contact.status.slice(1)}
                    </span>
                  </Chip>
                  {isStale(contact.lastContactedAt) && <Chip tone="rose">Needs Follow-up</Chip>}
                </div>

                <div className={styles.slotPerson} style={{ marginTop: 'var(--s-3)' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: 'var(--accent)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)'
                  }}>
                    {contact.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className={styles.slotName} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                      {contact.name}
                      <button className="icon-btn" onClick={() => setEditing(contact)}>
                         <Edit3 size={14} className="dim" />
                      </button>
                    </div>
                    <div className={styles.slotRole}>
                      {contact.role} @ {contact.company}
                    </div>
                  </div>
                </div>

                {contact.notes && <p className={styles.slotNote} style={{ marginTop: 'var(--s-3)' }}>{contact.notes}</p>}

                <div className={styles.slotActions} style={{ marginTop: 'var(--s-4)', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>
                    Last contacted {timeAgo(contact.lastContactedAt)}
                  </span>
                  <Button
                    size="sm"
                    variant="soft"
                    icon={<RefreshCw size={14} />}
                    loading={bumpAction.pending}
                    onClick={() => bumpAction.run(contact._id)}
                  >
                    Log Interaction
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {showAdd && (
        <ContactDialog onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); refetch(); }} />
      )}
      {editing && (
        <ContactDialog existing={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); refetch(); }} />
      )}
    </>
  );
}

function ContactDialog({ onClose, onDone, existing }: { onClose: () => void; onDone: () => void; existing?: Contact }) {
  const toast = useToast();
  const [name, setName] = useState(existing?.name || '');
  const [company, setCompany] = useState(existing?.company || '');
  const [role, setRole] = useState(existing?.role || '');
  const [status, setStatus] = useState<'cold' | 'warm' | 'advocate'>(existing?.status || 'cold');
  const [notes, setNotes] = useState(existing?.notes || '');

  const submit = useAction(async () => {
    if (existing) {
      await api.patch('/api/network', {
        contactId: existing._id,
        name: name.trim(),
        company: company.trim(),
        role: role.trim(),
        status,
        notes: notes.trim(),
      });
      toast.success('Contact updated');
    } else {
      await api.post('/api/network', {
        name: name.trim(),
        company: company.trim(),
        role: role.trim(),
        status,
        notes: notes.trim(),
      });
      toast.success('Contact added', 'Your Black Book is growing.');
    }
    onDone();
  });

  const canSubmit = name && company && role;

  return (
    <Dialog
      open
      onClose={onClose}
      title={existing ? "Edit Contact" : "Add to Black Book"}
      description={existing ? "Update details or upgrade their relationship status." : "Who did you just have coffee with?"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>Cancel</Button>
          <Button variant="primary" onClick={() => submit.run()} loading={submit.pending} disabled={!canSubmit}>
            {existing ? 'Save Changes' : 'Save Contact'}
          </Button>
        </>
      }
    >
      <Input label="Name" placeholder="Jane Doe" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      
      <div className={styles.checkGrid}>
        <Input label="Company" placeholder="Bain & Company" value={company} onChange={(e) => setCompany(e.target.value)} />
        <Input label="Role" placeholder="Partner" value={role} onChange={(e) => setRole(e.target.value)} />
      </div>

      <Select 
        label="Status" 
        value={status} 
        onChange={(e) => setStatus(e.target.value as ContactStatus)}
        options={[
          { value: 'cold', label: 'Cold (No response / First Outreach)' },
          { value: 'warm', label: 'Warm (Coffee Chat Done)' },
          { value: 'advocate', label: 'Advocate (Pushing my resume)' }
        ]} 
      />

      <Textarea
        label="Notes"
        placeholder="Spoke about their transition from tech. Follow up in two weeks."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        optional
      />
    </Dialog>
  );
}
