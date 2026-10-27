'use client';

import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { uploadFile } from '@/lib/client/upload';
import cs from './campus.module.css';

/** Uploads photos as they are picked; the parent only ever holds URLs. */
export default function PhotoPicker({ value, onChange, folder, max = 6 }: { value: string[]; onChange: (urls: string[]) => void; folder: string; max?: number }) {
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const next = [...value];
    try {
      for (const file of Array.from(files).slice(0, max - value.length)) next.push((await uploadFile(file, folder)).url);
      onChange(next);
    } catch (caught) {
      toast.error('Upload failed', caught instanceof Error ? caught.message : undefined);
      onChange(next);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  return (
    <div className="stack gap-2">
      {value.length > 0 && (
        <div className={cs.thumbRow}>
          {value.map((url) => (
            <div key={url} className={cs.thumb}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" />
              <button type="button" aria-label="Remove photo" onClick={() => onChange(value.filter((u) => u !== url))}><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
      <input ref={ref} type="file" hidden multiple={max > 1} accept="image/*" onChange={(e) => pick(e.target.files)} />
      {value.length < max && <div><Button type="button" size="sm" variant="ghost" icon={<ImagePlus size={14} />} loading={busy} onClick={() => ref.current?.click()}>{value.length ? 'Add more' : 'Add photos'}</Button></div>}
    </div>
  );
}
