'use client';

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen, Flame, Sparkles, ChevronRight, Lock, Search } from 'lucide-react';
import { SECTIONS, canSee, isActive, sectionForPath, type NavSection } from './navigation';
import { Avatar } from '@/components/ui/Display';
import { LogoMark } from '@/components/brand/Logo';
import { useMe } from '@/lib/client/me';
import { usePersistentFlag } from '@/lib/client/hooks';
import { featureAvailable } from '@mba/shared/campus';
import { cn, formatCount } from '@/lib/utils';
import styles from './shell.module.css';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onOpenPalette: () => void;
}

/**
 * Sections collapse so ~40 destinations stay scannable: the section you are in
 * is open, the rest are one click away, and the choice is remembered.
 */
export default function Sidebar({ collapsed, onToggle, onOpenPalette }: SidebarProps) {
  const pathname = usePathname();
  const { me } = useMe();
  const current = sectionForPath(pathname);

  const sections = useMemo(
    () =>
      SECTIONS.map((section) => ({ ...section, items: section.items.filter((item) => canSee(item, me)) })).filter(
        (section) => section.items.length > 0
      ),
    [me]
  );

  return (
    <aside className={cn(styles.sidebar, collapsed && styles.collapsed)}>
      <div className={styles.brandRow}>
        <Link href="/home" className={styles.brand} aria-label="MBAAntisocial home">
          <LogoMark size={26} />
          {!collapsed && (
            <span className={styles.brandName} style={{ marginLeft: 8, fontWeight: 680, letterSpacing: '-0.035em', fontSize: 16 }}>
              MBA<span style={{ color: 'var(--accent)' }}>Antisocial</span>
            </span>
          )}
        </Link>
        <button className={styles.collapseBtn} onClick={onToggle} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      <button className={styles.searchTrigger} onClick={onOpenPalette} aria-label="Search everything" title="Search (Ctrl K)">
        <Search size={15} />
        <span className={styles.navLabel}>Search or jump to…</span>
        <kbd className={styles.kbd}>⌘K</kbd>
      </button>

      <nav className={styles.nav} aria-label="Main">
        {sections.map((section) =>
          section.id === 'today' ? (
            <NavLink key="today" href="/home" label="Today" icon={section.icon} active={pathname === '/home'} collapsed={collapsed} />
          ) : (
            <SidebarSection
              key={section.id}
              section={section}
              pathname={pathname}
              isCurrent={current?.id === section.id}
              collapsed={collapsed}
              edition={me ? me.edition : 'campus'}
            />
          )
        )}
      </nav>

      <div className={styles.sidebarFooter}>
        {me && (
          <div className={styles.streakCard} title={`${me.streak}-day streak · ${me.karma} karma`}>
            <div className="row gap-2">
              <Flame size={15} style={{ color: 'var(--amber)', flexShrink: 0 }} />
              <div className={styles.streakFigures}>
                <span className={styles.streakValue}>{me.streak}</span>
                <span className={styles.streakLabel}>day streak</span>
              </div>
            </div>
            <div className={styles.streakDivider} />
            <div className="row gap-2">
              <Sparkles size={15} style={{ color: 'var(--teal)', flexShrink: 0 }} />
              <div className={styles.streakFigures}>
                <span className={styles.streakValue}>{formatCount(me.karma)}</span>
                <span className={styles.streakLabel}>karma</span>
              </div>
            </div>
          </div>
        )}

        {me && (
          <Link href="/profile" className={styles.userRow}>
            <Avatar name={me.name} image={me.image} seed={me.id} size={30} />
            <span className={styles.userMeta}>
              <span className={cn(styles.userName, 'truncate')}>{me.name}</span>
              <span className={cn(styles.userSub, 'truncate')}>
                {me.role === 'alumni' ? 'Alumni' : me.year === 2 ? 'Second year' : 'First year'} · {me.batch}
              </span>
            </span>
          </Link>
        )}
      </div>
    </aside>
  );
}

function SidebarSection({
  section,
  pathname,
  isCurrent,
  collapsed,
  edition,
}: {
  section: NavSection;
  pathname: string;
  isCurrent: boolean;
  collapsed: boolean;
  edition: 'open' | 'campus' | 'none';
}) {
  // Remembered per section; the current section is always open.
  const [storedOpen, setStoredOpen] = usePersistentFlag(`nav-open-${section.id}`, section.id === 'prep');
  const open = isCurrent || storedOpen;
  const toggle = useCallback(() => setStoredOpen(!open), [open, setStoredOpen]);
  const SectionIcon = section.icon;

  if (collapsed) {
    return (
      <NavLink
        href={section.href}
        label={section.label}
        icon={SectionIcon}
        active={isCurrent}
        collapsed
      />
    );
  }

  return (
    <div className={styles.navSection}>
      <div className={styles.sectionRow}>
        <Link href={section.href} className={cn(styles.sectionLink, pathname === section.href && styles.sectionLinkActive)}>
          <SectionIcon size={15} />
          <span>{section.label}</span>
        </Link>
        <button
          className={cn(styles.sectionToggle, open && styles.sectionToggleOpen)}
          onClick={toggle}
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${section.label}`}
          disabled={isCurrent}
        >
          <ChevronRight size={14} />
        </button>
      </div>
      {open &&
        section.items.map((item) => {
          const locked = item.feature ? !featureAvailable(item.feature, edition) : false;
          return (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive(pathname, item.href)}
              collapsed={false}
              locked={locked}
            />
          );
        })}
    </div>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  locked,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  active: boolean;
  collapsed: boolean;
  locked?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(styles.navItem, active && styles.navItemActive, locked && styles.navItemLocked)}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : locked ? 'Unlocks when your campus reaches the Campus Edition' : undefined}
    >
      <span className={styles.navIcon}>
        <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
      </span>
      <span className={styles.navLabel}>{label}</span>
      {locked && !collapsed && <Lock size={12} className={styles.navLock} aria-label="Locked" />}
    </Link>
  );
}
