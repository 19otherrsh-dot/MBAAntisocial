'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, Check } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Banner, Segmented } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useAction } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { api } from '@/lib/client/api';
import {
  RESOURCE_KINDS,
  RESOURCE_KIND_META,
  ALLOWED_FILE_EXTENSIONS,
  MAX_DIRECT_UPLOAD_BYTES,
  TERMS,
  type ResourceKind,
} from '@/lib/constants';
import { cn, hostnameOf } from '@/lib/utils';
import styles from '../app.module.css';

const maxMb = Math.round(MAX_DIRECT_UPLOAD_BYTES / 1_048_576);

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export default function UploadDialog({ open, onClose, onDone }: UploadDialogProps) {
  const toast = useToast();
  const { me, patch } = useMe();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [course, setCourse] = useState('');
  const [professor, setProfessor] = useState('');
  const [term, setTerm] = useState<string>(TERMS[0]);
  const [kind, setKind] = useState<ResourceKind>('class_notes');
  // A file up to the direct-upload cap, or a link to one hosted elsewhere.
  const [source, setSource] = useState<'file' | 'link'>('file');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [tags, setTags] = useState('');
  const [affirmed, setAffirmed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const needsHonorCode = me !== null && me.honorCodeAcceptedAt === null;
  const detectedExt = file ? file.name.split('.').pop()?.toLowerCase() ?? '' : '';

  const acceptPolicy = useAction(async () => {
    const result = await api.post<{ honorCodeAcceptedAt: string }>('/api/me/honor-code', {
      accepted: true,
    });
    patch({ honorCodeAcceptedAt: result.honorCodeAcceptedAt });
    toast.success('Policy accepted');
  });

  const upload = useAction(async () => {
    setFieldErrors({});

    let uploadedUrl = '';
    let fileName = '';
    let fileType = 'link';
    let finalSize = 0;

    if (source === 'link') {
      const url = link.trim();
      if (!/^https:\/\/\S+\.\S+/.test(url)) {
        setFieldErrors({ file: 'Paste a full https:// link.' });
        return;
      }
      uploadedUrl = url;
      fileName = hostnameOf(url);
    } else {
      if (!file) {
        setFieldErrors({ file: 'Choose a file to upload.' });
        return;
      }
      if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
        setFieldErrors({
          file: `That file is over ${maxMb} MB. Put it on Drive and share the link instead.`,
        });
        return;
      }

      setUploadingFile(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'resources');

        const response = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          // The server's own reason — size, type, uploads not configured.
          throw new Error(data?.error?.message ?? 'Upload failed.');
        }

        uploadedUrl = data.url;
        finalSize = data.bytes;
        fileName = file.name;
        fileType = detectedExt || 'pdf';
      } catch (e) {
        setUploadingFile(false);
        setFieldErrors({ file: e instanceof Error ? e.message : 'Upload failed.' });
        return;
      }
    }

    await api.post('/api/resources', {
      title: title.trim(),
      description: description.trim(),
      course: course.trim(),
      professor: professor.trim(),
      term,
      kind,
      fileUrl: uploadedUrl,
      fileName,
      fileType,
      fileSize: finalSize,
      tags: tags
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8),
      honorCodeAffirmed: true,
    });

    setUploadingFile(false);
    toast.success('Shared with your campus', 'Karma credited.');
    setTitle('');
    setDescription('');
    setFile(null);
    setLink('');
    setTags('');
    setAffirmed(false);
    onDone();
  });

  if (!open) return null;

  const canSubmit =
    title.trim().length >= 3 &&
    course.trim().length >= 2 &&
    (source === 'file' ? file !== null : link.trim().length > 8) &&
    affirmed;

  return (
    <Dialog
      open
      onClose={onClose}
      wide
      title="Share a resource"
      description="Notes, summaries, and past papers. Your batch will find it by course, professor, or term."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={upload.pending || uploadingFile}>
            Cancel
          </Button>
          <Button
            onClick={() => upload.run()}
            loading={upload.pending || uploadingFile}
            disabled={!canSubmit || needsHonorCode}
          >
            {uploadingFile ? 'Uploading...' : 'Publish'}
          </Button>
        </>
      }
    >
      {upload.error && <Banner variant="danger">{upload.error}</Banner>}

      {needsHonorCode && (
        <Banner
          variant="warning"
          icon={<ShieldCheck size={16} />}
          title="Accept the sharing policy first"
          action={
            <Button size="sm" variant="soft" onClick={() => acceptPolicy.run()} loading={acceptPolicy.pending}>
              I accept
            </Button>
          }
        >
          Notes and past papers, yes. Work that is still being marked, no.{' '}
          <Link href="/legal/honor-code" style={{ textDecoration: 'underline' }}>
            Read the full policy
          </Link>
          .
        </Banner>
      )}

      <Input
        label="Title"
        placeholder="Marketing Management — full course notes"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={200}
        error={fieldErrors.title}
        autoFocus
      />

      <div className={styles.checkGrid}>
        <Input
          label="Course"
          placeholder="Marketing Management"
          value={course}
          onChange={(event) => setCourse(event.target.value)}
          maxLength={100}
          error={fieldErrors.course}
        />
        <Input
          label="Professor"
          placeholder="Prof. Iyer"
          value={professor}
          onChange={(event) => setProfessor(event.target.value)}
          maxLength={100}
          optional
        />
      </div>

      <div className={styles.checkGrid}>
        <Select
          label="Term"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          options={TERMS.map((value) => ({ value, label: value }))}
        />
        <Select
          label="Kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as ResourceKind)}
          options={RESOURCE_KINDS.map((value) => ({
            value,
            label: RESOURCE_KIND_META[value].label,
          }))}
        />
      </div>

      <div className="stack gap-2">
        <Segmented
          ariaLabel="How to share it"
          value={source}
          onChange={(value) => {
            setSource(value);
            setFieldErrors({});
          }}
          options={[
            { value: 'file' as const, label: 'Upload a file' },
            { value: 'link' as const, label: 'Share a link' },
          ]}
        />

        {source === 'file' ? (
          <>
            <input
              id="resource-file"
              type="file"
              aria-label="File"
              accept={ALLOWED_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setFieldErrors({});
              }}
              style={{
                padding: 'var(--s-3)',
                border: '1px dashed var(--line-strong)',
                borderRadius: 'var(--r-md)',
                background: 'var(--bg-sunken)',
                color: 'var(--text-secondary)',
                fontSize: 'var(--t-sm)',
                width: '100%',
              }}
            />
            <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>
              Up to {maxMb} MB · {ALLOWED_FILE_EXTENSIONS.join(', ')}
              {file ? ` · ${file.name}` : ''}. Bigger than that? Share a link.
            </span>
          </>
        ) : (
          <Input
            label="Link"
            type="url"
            inputMode="url"
            placeholder="https://drive.google.com/…"
            hint="Make sure anyone at your campus with the link can open it."
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setFieldErrors({});
            }}
          />
        )}
        {fieldErrors.file && (
          <span style={{ color: 'var(--danger)', fontSize: 'var(--t-xs)' }}>
            {fieldErrors.file}
          </span>
        )}
      </div>

      <div className={styles.checkGrid}>
        <Input
          label="Tags"
          placeholder="midterm, frameworks, cases"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          optional
          hint="Comma-separated, up to eight."
        />
      </div>

      <Textarea
        label="What is in it?"
        placeholder="Covers everything up to the midterm, including the two cases she actually tested."
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={1000}
        rows={3}
        optional
      />

      <button
        type="button"
        className={cn(styles.checkTile, affirmed && styles.checkTileActive)}
        onClick={() => setAffirmed((value) => !value)}
        aria-pressed={affirmed}
        disabled={needsHonorCode}
      >
        <Check size={15} style={{ opacity: affirmed ? 1 : 0.3 }} />
        This is my own material or shareable course content — not someone&apos;s graded work.
      </button>
    </Dialog>
  );
}
