'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/client/api';

/** Six-character table codes, typed or pasted. */
export default function JoinByCode() {
  const router = useRouter();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const { roomId } = await api.post<{ roomId: string }>('/api/games/rooms/code', { code });
      router.push(`/games/room/${roomId}`);
    } catch (caught) {
      toast.error('No table found', errorMessage(caught));
      setBusy(false);
    }
  };
  return (
    <form className="row gap-2" onSubmit={(e) => { e.preventDefault(); void go(); }}>
      <Input
        aria-label="Table code"
        placeholder="Table code"
        value={code}
        maxLength={6}
        icon={<KeyRound size={15} />}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        style={{ width: 150, letterSpacing: '0.12em', fontWeight: 600 }}
      />
      <Button type="submit" variant="secondary" loading={busy} disabled={code.length !== 6}>Join</Button>
    </form>
  );
}
