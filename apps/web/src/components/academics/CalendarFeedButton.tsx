'use client';

import { useState } from 'react';
import { CalendarSync, Copy, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';

/** Subscribe Google/Apple/Outlook to classes, sessions, deadlines, and RSVPs. */
export default function CalendarFeedButton({ label = 'Sync to calendar' }: { label?: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const { data, mutate } = useApiQuery<{ url: string }>(open ? '/api/calendar/token' : null);
  const webcal = data?.url.replace(/^https?:/, 'webcal:');

  const rotate = async () => {
    try {
      const fresh = await api.post<{ url: string }>('/api/calendar/token');
      mutate(() => fresh);
      toast.success('New link issued', 'The old link has stopped working. Re-subscribe with this one.');
    } catch (caught) {
      toast.error('Could not reset the link', errorMessage(caught));
    }
  };

  return (
    <>
      <Button variant="ghost" icon={<CalendarSync size={15} />} onClick={() => setOpen(true)}>{label}</Button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Sync to your calendar" description="Classes, mock sessions, task deadlines, and events you RSVP to — kept up to date automatically.">
          {!data ? (
            <div className="skeleton" style={{ height: 80 }} />
          ) : (
            <div className="stack gap-3">
              <div className="row gap-2 wrap">
                <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal!)}`} target="_blank" rel="noopener noreferrer"><Button>Add to Google Calendar</Button></a>
                <a href={webcal}><Button variant="secondary">Apple / Outlook</Button></a>
              </div>
              <Input label="Private link" readOnly value={data.url} onFocus={(e) => e.currentTarget.select()} />
              <div className="row gap-2">
                <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => { void navigator.clipboard?.writeText(data.url); toast.success('Link copied'); }}>Copy</Button>
                <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={rotate}>Reset link</Button>
              </div>
              <p className="dim" style={{ fontSize: 'var(--t-xs)' }}>Anyone with this link can see your schedule. Reset it if you shared it by mistake.</p>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
