'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/client/api';

/** Opens (or creates) a DM. Works wherever the other person opted in to contact. */
export default function MessageButton({ userId, label = 'Message', size = 'sm' }: { userId: string; label?: string; size?: 'sm' | 'md' }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button size={size} variant="secondary" icon={<MessageCircle size={14} />} loading={busy} onClick={async () => {
      setBusy(true);
      try {
        const { conversationId } = await api.post<{ conversationId: string }>('/api/hub/dm', { userIds: [userId] });
        router.push(`/hub/dm/${conversationId}`);
      } catch (caught) {
        toast.error('Cannot message them yet', errorMessage(caught));
        setBusy(false);
      }
    }}>{label}</Button>
  );
}
