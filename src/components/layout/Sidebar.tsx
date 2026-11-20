'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen, Flame, Sparkles } from 'lucide-react';
import { NAV_GROUPS, canSee, isActive } from './navigation';
import { Avatar } from '@/components/ui/Display';
import { LogoMark } from '@/components/brand/Logo';
import { useMe } from '@/lib/client/me';
import { cn, formatCount } from '@/lib/utils';
import { MODERATOR_ROLES, ROLE_META, STAFF_ROLES } from '@/lib/constants';
import styles from './shell.module.css';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { me, unreadMessages } = useMe();

  const viewer = {
    canModerate: me ? MODERATOR_ROLES.includes(me.role) : false,
    isStaff: me ? STAFF_ROLES.includes(me.role) : false,
    isAdmin: me?.role === 'admin',
  };

  return (
    <aside className={cn(styles.sidebar, collapsed && styles.collapsed)}>
      <div className={styles.brandRow}>
        <Link href="/home" className={styles.brand} aria-label="MBAAntisocial home">
          <LogoMark size={26} />
          {!collapsed && (
            <span
              className={styles.brandName}
              style={{ marginLeft: 8, fontWeight: 680, letterSpacing: '-0.035em', fontSize: 16 }}
            >
              MBA<span style={{ color: 'var(--accent)' }}>Antisocial</span>
            </span>
          )}
        </Link>
        <button
          className={styles.collapseBtn}
          onClick={onToggle}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      <nav className={styles.nav} aria-label="Main">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => canSee(item, viewer));
          if (items.length === 0) return null;

          return (
            <div key={group.key}>
              {group.label && <div className={styles.navGroupLabel}>{group.label}</div>}
              {items.map((item) => {
                const active = isActive(pathname, item.href);
                const unread = item.showsUnreadMessages && unreadMessages > 0;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(styles.navItem, active && styles.navItemActive)}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className={styles.navIcon}>
                      <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                    </span>
                    <span className={styles.navLabel}>{item.label}</span>
                    {unread && (
                      <span className={styles.navCount} aria-label={`${unreadMessages} unread`}>
                        {unreadMessages > 9 ? '9+' : unreadMessages}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
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
                {me.role === 'admin' || me.role === 'placement_office'
                  ? ROLE_META[me.role].label
                  : `${me.year === 2 ? 'Second year' : 'First year'} · ${me.batch}`}
              </span>
            </span>
          </Link>
        )}
      </div>
    </aside>
  );
}
