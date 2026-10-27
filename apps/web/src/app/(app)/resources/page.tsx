'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Upload, Library, ArrowBigUp, Download, History, FileText } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Avatar, Banner, Chip, EmptyState } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery, useDebounced } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { api } from '@/lib/client/api';
import UploadDialog from './UploadDialog';
import {
  RESOURCE_KINDS,
  RESOURCE_KIND_META,
  type ResourceKind,
  type Tone,
} from '@/lib/constants';
import { cn, formatFileSize, timeAgo, pluralise } from '@/lib/utils';
import styles from '../app.module.css';

interface Resource {
  _id: string;
  title: string;
  description: string;
  course: string;
  professor: string;
  term: string;
  kind: ResourceKind;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  tags: string[];
  upvoteCount: number;
  downloads: number;
  version: number;
  hasUpvoted: boolean;
  isOwn: boolean;
  createdAt: string;
  author: { _id: string; name: string; image?: string; year?: 1 | 2 };
}

interface ResourceResponse {
  resources: Resource[];
  courses: string[];
}

/** File-type colour, so a PDF is recognisable before you read the label. */
const FILE_TONE: Record<string, Tone> = {
  pdf: 'rose',
  doc: 'blue',
  docx: 'blue',
  ppt: 'amber',
  pptx: 'amber',
  xlsx: 'teal',
  md: 'slate',
  txt: 'slate',
};

export default function ResourcesPage() {
  const toast = useToast();
  const { me, refresh } = useMe();

  const [search, setSearch] = useState('');
  const [course, setCourse] = useState('');
  const [kind, setKind] = useState<ResourceKind | ''>('');
  const [sort, setSort] = useState<'newest' | 'upvotes' | 'downloads'>('newest');
  const [uploadOpen, setUploadOpen] = useState(false);

  const debouncedSearch = useDebounced(search, 300);

  const query = useMemo(
    () => ({ search: debouncedSearch, course, kind, sort }),
    [debouncedSearch, course, kind, sort]
  );

  const { data, loading, error, refetch, mutate } = useApiQuery<ResourceResponse>(
    '/api/resources',
    query
  );

  const resources = data?.resources ?? [];
  const courses = data?.courses ?? [];

  const upvote = async (resource: Resource) => {
    const nextUpvoted = !resource.hasUpvoted;

    mutate((current) => ({
      ...current,
      resources: current.resources.map((row) =>
        row._id === resource._id
          ? {
              ...row,
              hasUpvoted: nextUpvoted,
              upvoteCount: row.upvoteCount + (nextUpvoted ? 1 : -1),
            }
          : row
      ),
    }));

    try {
      await api.patch('/api/resources', { action: 'upvote', resourceId: resource._id });
    } catch (caught) {
      mutate((current) => ({
        ...current,
        resources: current.resources.map((row) =>
          row._id === resource._id
            ? { ...row, hasUpvoted: resource.hasUpvoted, upvoteCount: resource.upvoteCount }
            : row
        ),
      }));
      toast.error('Could not vote', caught instanceof Error ? caught.message : undefined);
    }
  };

  const download = async (resource: Resource) => {
    try {
      // Counted server-side, which also returns the URL — so the tally reflects
      // real downloads rather than anyone who scrolled past the card.
      const result = await api.patch<{ fileUrl: string }>('/api/resources', {
        action: 'download',
        resourceId: resource._id,
      });
      window.open(result.fileUrl, '_blank', 'noopener,noreferrer');
      mutate((current) => ({
        ...current,
        resources: current.resources.map((row) =>
          row._id === resource._id ? { ...row, downloads: row.downloads + 1 } : row
        ),
      }));
    } catch (caught) {
      toast.error('Could not open that', caught instanceof Error ? caught.message : undefined);
    }
  };

  const needsHonorCode = me !== null && me.honorCodeAcceptedAt === null;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>Resources</h2>
          <p className={styles.pageSubtitle}>
            {me?.campus ?? 'Your campus'} — {pluralise(resources.length, 'result')}
            {courses.length > 0 && ` across ${pluralise(courses.length, 'course')}`}
          </p>
        </div>
        <Button icon={<Upload size={16} />} onClick={() => setUploadOpen(true)}>
          Share something
        </Button>
      </div>

      {needsHonorCode && (
        <Banner
          variant="warning"
          title="Read the sharing policy before uploading"
          action={
            <Link href="/legal/honor-code">
              <Button size="sm" variant="soft">
                Read it
              </Button>
            </Link>
          }
        >
          This library is for notes, summaries, and past papers — not work that is still being
          marked. One read, one click, and you are done.
        </Banner>
      )}

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Input
            aria-label="Search resources"
            placeholder="Search by title, course, or tag"
            icon={<Search size={15} />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <Select
          aria-label="Filter by course"
          value={course}
          onChange={(event) => setCourse(event.target.value)}
          options={[
            { value: '', label: 'All courses' },
            ...courses.map((name) => ({ value: name, label: name })),
          ]}
        />

        <Select
          aria-label="Filter by kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as ResourceKind | '')}
          options={[
            { value: '', label: 'All kinds' },
            ...RESOURCE_KINDS.map((value) => ({ value, label: RESOURCE_KIND_META[value].label })),
          ]}
        />

        <Select
          aria-label="Sort"
          value={sort}
          onChange={(event) => setSort(event.target.value as typeof sort)}
          options={[
            { value: 'newest', label: 'Newest' },
            { value: 'upvotes', label: 'Most useful' },
            { value: 'downloads', label: 'Most downloaded' },
          ]}
        />
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {loading ? (
        <div className={styles.cardGrid}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={cn('skeleton', styles.skeletonCard)} />
          ))}
        </div>
      ) : resources.length === 0 ? (
        <EmptyState
          art={<Library size={40} strokeWidth={1.4} />}
          title={search ? 'Nothing matched that' : 'The library is empty'}
          body={
            search
              ? 'Try a course code, a professor’s name, or a broader term.'
              : 'Somebody has to go first. Upload one set of notes and the whole batch stops asking in the group chat.'
          }
          action={
            !search && (
              <Button onClick={() => setUploadOpen(true)}>Share the first set</Button>
            )
          }
        />
      ) : (
        <div className={styles.cardGrid}>
          {resources.map((resource) => {
            const tone = FILE_TONE[resource.fileType] ?? 'slate';
            const kindMeta = RESOURCE_KIND_META[resource.kind];

            return (
              <article key={resource._id} className={styles.resourceCard}>
                <div className={styles.resourceTop}>
                  <span
                    className={styles.fileBadge}
                    style={{ background: `var(--${tone}-soft)`, color: `var(--${tone}-text)` }}
                  >
                    <FileText size={16} />
                    {resource.fileType.toUpperCase()}
                  </span>
                  <div className="stack gap-1" style={{ alignItems: 'flex-end' }}>
                    <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>
                      {formatFileSize(resource.fileSize)}
                    </span>
                    {resource.version > 1 && (
                      <Chip outline icon={<History size={10} />} title={`Version ${resource.version}`}>
                        v{resource.version}
                      </Chip>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className={styles.resourceTitle}>{resource.title}</h3>
                  {resource.description && (
                    <p className={cn(styles.resourceDesc, 'clamp-2')} style={{ marginTop: 4 }}>
                      {resource.description}
                    </p>
                  )}
                </div>

                <div className={styles.resourceMeta}>
                  <Chip tone={kindMeta.tone}>{kindMeta.label}</Chip>
                  <Chip outline>{resource.course}</Chip>
                  {resource.professor && <Chip outline>{resource.professor}</Chip>}
                  <Chip outline>{resource.term}</Chip>
                </div>

                <div className="row gap-2" style={{ minWidth: 0 }}>
                  <Avatar
                    name={resource.author?.name ?? '?'}
                    image={resource.author?.image}
                    seed={resource.author?._id}
                    size={22}
                  />
                  <span className="dim truncate" style={{ fontSize: 'var(--t-xs)' }}>
                    {resource.author?.name} · {timeAgo(resource.createdAt)}
                  </span>
                </div>

                <div className={styles.resourceFoot}>
                  <button
                    className={cn(styles.voteBtn, resource.hasUpvoted && styles.voteActive)}
                    onClick={() => upvote(resource)}
                    disabled={resource.isOwn}
                    title={
                      resource.isOwn
                        ? 'You cannot upvote your own upload'
                        : resource.hasUpvoted
                          ? 'Remove your vote'
                          : 'Mark as useful'
                    }
                    aria-pressed={resource.hasUpvoted}
                  >
                    <ArrowBigUp size={14} />
                    {resource.upvoteCount}
                  </button>

                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Download size={14} />}
                    onClick={() => download(resource)}
                  >
                    Open
                  </Button>

                  <span className="dim" style={{ fontSize: 'var(--t-xs)', marginLeft: 'auto' }}>
                    {resource.downloads} opened
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onDone={() => {
          setUploadOpen(false);
          refetch();
          void refresh();
        }}
      />
    </>
  );
}
