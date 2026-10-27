'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, Check } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useAction } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { api } from '@/lib/client/api';
import {
  RESOURCE_KINDS,
  RESOURCE_KIND_META,
  ALLOWED_FILE_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  TERMS,
  type ResourceKind,
} from '@/lib/constants';
import { cn } from '@/lib/utils';
import styles from '../app.module.css';

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

    if (!file) {
      setFieldErrors({ file: 'Please select a file to upload.' });
      return;
    }

    setUploadingFile(true);
    let uploadedUrl = '';
    let finalSize = file.size;

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      const data = await response.json();
      uploadedUrl = data.url;
      finalSize = data.bytes;
    } catch (e) {
      setUploadingFile(false);
      toast.error(
        'Could not upload that file',
        e instanceof Error ? e.message : 'Check your connection and try again.'
      );
      return;
    }

    await api.post('/api/resources', {
      title: title.trim(),
      description: description.trim(),
      course: course.trim(),
      professor: professor.trim(),
      term,
      kind,
      fileUrl: uploadedUrl,
      fileName: file.name,
      fileType: detectedExt || 'pdf',
      fileSize: Math.min(Math.max(finalSize, 1), MAX_FILE_SIZE_BYTES),
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
    setTags('');
    setAffirmed(false);
    onDone();
  });

  if (!open) return null;

  const canSubmit =
    title.trim().length >= 3 && course.trim().length >= 2 && file !== null && affirmed;

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

      {/* Tokens here match the design system: --border-subtle, --radius-md,
          --bg-elevated and --accent-danger were from an earlier palette and
          resolve to nothing, so this control rendered unstyled. */}
      <div className="stack gap-2">
        <label htmlFor="resource-file" style={{ fontSize: 'var(--t-sm)', fontWeight: 560 }}>
          File
        </label>
        <input
          id="resource-file"
          type="file"
          accept={ALLOWED_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
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
          Up to {Math.round(MAX_FILE_SIZE_BYTES / 1_048_576)} MB ·{' '}
          {ALLOWED_FILE_EXTENSIONS.join(', ')}
          {file ? ` · ${file.name}` : ''}
        </span>
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
