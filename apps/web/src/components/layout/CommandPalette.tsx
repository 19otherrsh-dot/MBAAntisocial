'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft, User, Library, MessagesSquare, Building, Swords, Hash, Gamepad2, PartyPopper, Flag, ShoppingBag, ArrowRight } from 'lucide-react';
import { ALL_ITEMS, SECTIONS, canSee } from './navigation';
import { useMe } from '@/lib/client/me';
import { useApiQuery, useDebounced } from '@/lib/client/hooks';
import { cn } from '@/lib/utils';
import styles from './shell.module.css';

interface SearchGroup {
  type: string;
  label: string;
  results: Array<{ id: string; type: string; title: string; subtitle?: string; href: string }>;
}

const TYPE_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  person: User,
  resource: Library,
  post: MessagesSquare,
  company: Building,
  comp: Swords,
  channel: Hash,
  server: Hash,
  game: Gamepad2,
  event: PartyPopper,
  club: Flag,
  listing: ShoppingBag,
};

interface Row {
  key: string;
  title: string;
  subtitle?: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  group: string;
}

/** 0 = no match; higher is better. Label beats keywords beats description. */
function score(query: string, label: string, keywords: string[], description: string): number {
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  if (l.startsWith(q)) return 4;
  if (l.split(/\s+/).some((word) => word.startsWith(q))) return 3;
  if (keywords.some((k) => k.toLowerCase().startsWith(q))) return 2;
  if (l.includes(q) || keywords.some((k) => k.toLowerCase().includes(q))) return 1.5;
  return description.toLowerCase().includes(q) ? 1 : 0;
}

/**
 * ⌘K / Ctrl+K: jump to any page or find anything on campus. Pages match
 * instantly on the client; people, notes, companies, and the rest come from
 * the search API as you type.
 */
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { me } = useMe();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounced(query.trim(), 200);

  const { data, loading } = useApiQuery<{ groups: SearchGroup[] }>(
    open && debounced.length >= 2 ? '/api/search' : null,
    { q: debounced }
  );

  const rows = useMemo<Row[]>(() => {
    const q = query.trim();
    const visible = ALL_ITEMS.filter((item) => canSee(item, me));
    const pages = (q
      ? visible
          .map((item) => ({ item, s: score(q, item.label, item.keywords ?? [], item.description) }))
          .filter((entry) => entry.s > 0)
          .sort((a, b) => b.s - a.s)
          .map((entry) => entry.item)
      : [...SECTIONS.filter((s) => s.id !== 'today').map((s) => ({ href: s.href, label: s.label, description: s.description, icon: s.icon })), ...visible.slice(0, 6)]
    )
      .slice(0, 8)
      .map((item) => ({ key: `page:${item.href}`, title: item.label, subtitle: item.description, href: item.href, icon: item.icon, group: 'Go to' }));

    const remote = (q.length >= 2 ? (data?.groups ?? []) : []).flatMap((group) =>
      group.results.map((result) => ({
        key: `${group.type}:${result.id}`,
        title: result.title,
        subtitle: result.subtitle,
        href: result.href,
        icon: TYPE_ICON[group.type] ?? ArrowRight,
        group: group.label,
      }))
    );
    return [...pages, ...remote];
  }, [query, data, me]);

  const safeCursor = Math.min(cursor, Math.max(0, rows.length - 1));

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const go = (row: Row | undefined) => {
    if (!row) return;
    onClose();
    setQuery('');
    router.push(row.href);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
    else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => Math.min(rows.length - 1, c + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(rows[safeCursor]);
    }
  };

  let lastGroup = '';

  return createPortal(
    <div className={styles.paletteBackdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.palette} role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKeyDown}>
        <div className={styles.paletteInputRow}>
          <Search size={17} />
          <input
            ref={inputRef}
            className={styles.paletteInput}
            placeholder="Search people, notes, companies, or jump to a page…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={rows[safeCursor]?.key}
          />
          <kbd className={styles.kbd}>Esc</kbd>
        </div>
        <div className={styles.paletteResults} id="palette-results" role="listbox">
          {rows.map((row, index) => {
            const header = row.group !== lastGroup ? row.group : null;
            lastGroup = row.group;
            const Icon = row.icon;
            return (
              <div key={row.key}>
                {header && <div className={styles.paletteGroup}>{header}</div>}
                <button
                  id={row.key}
                  role="option"
                  aria-selected={index === safeCursor}
                  className={cn(styles.paletteRow, index === safeCursor && styles.paletteRowActive)}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => go(row)}
                >
                  <Icon size={16} />
                  <span className={styles.paletteText}>
                    <span className="truncate">{row.title}</span>
                    {row.subtitle && <span className={cn(styles.paletteSub, 'truncate')}>{row.subtitle}</span>}
                  </span>
                  {index === safeCursor && <CornerDownLeft size={14} className="dim" />}
                </button>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className={styles.panelEmpty}>{loading ? 'Searching…' : `Nothing matches “${query}”.`}</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
