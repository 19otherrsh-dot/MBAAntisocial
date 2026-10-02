import {
  Home,
  CalendarClock,
  ListChecks,
  Library,
  Trophy,
  MessagesSquare,
  MessageCircle,
  Briefcase,
  Target,
  BookOpen,
  Swords,
  ShieldCheck,
  Building2,
  MessageSquare,
  Bot,
  FileText,
  TrendingUp,
  BookUser,
  VolumeX,
  Handshake,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the mobile tab bar. */
  short: string;
  icon: LucideIcon;
  /** Only rendered for moderators and admins. */
  moderatorOnly?: boolean;
  /** Only rendered for institute staff reading the campus report. */
  staffOnly?: boolean;
  /** Appears in the mobile tab bar; the rest live in the sidebar only. */
  primary?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * One navigation definition, consumed by the sidebar and the mobile tab bar,
 * so the two can never disagree about what exists or where it points.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Work',
    items: [
      { href: '/home', label: 'Today', short: 'Today', icon: Home, primary: true },
      { href: '/pipeline', label: 'Pipeline', short: 'Pipeline', icon: Target, primary: true },
      { href: '/sessions', label: 'Mock Prep', short: 'Prep', icon: CalendarClock, primary: true },
      { href: '/intel', label: 'Interview Intel', short: 'Intel', icon: BookOpen },
      { href: '/tasks', label: 'Tasks', short: 'Tasks', icon: ListChecks, primary: true },
      { href: '/ai-interview', label: 'AI Interview', short: 'AI', icon: Bot, primary: true },
      { href: '/resume-roast', label: 'Resume Roast', short: 'Roast', icon: FileText, primary: true },
      { href: '/offer-intel', label: 'Offer Intel', short: 'Offers', icon: TrendingUp, primary: true },
      { href: '/whisper-network', label: 'Whispers', short: 'Whisper', icon: VolumeX, primary: true },
      { href: '/syndicate', label: 'The Syndicate', short: 'Syndicate', icon: Handshake, primary: true },
      { href: '/black-book', label: 'Black Book', short: 'Network', icon: BookUser, primary: true },
      { href: '/comps', label: 'Competitions', short: 'Comps', icon: Swords },
    ],
  },
  {
    label: 'Campus',
    items: [
      { href: '/resources', label: 'Resources', short: 'Notes', icon: Library, primary: true },
      { href: '/feed', label: 'Feed', short: 'Feed', icon: MessagesSquare, primary: true },
      { href: '/messages', label: 'Messages', short: 'DMs', icon: MessageCircle },
      { href: '/rooms', label: 'Study Rooms', short: 'Rooms', icon: MessageSquare, primary: true },
      { href: '/jobs', label: 'Job Board', short: 'Jobs', icon: Briefcase, primary: true },
      { href: '/leaderboard', label: 'Standings', short: 'Ranks', icon: Trophy },
    ],
  },
  {
    label: 'Institute',
    items: [
      { href: '/campus', label: 'Campus Report', short: 'Report', icon: Building2, staffOnly: true },
      { href: '/moderation', label: 'Moderation', short: 'Mod', icon: ShieldCheck, moderatorOnly: true },
    ],
  },
];

export const PRIMARY_NAV: NavItem[] = NAV_GROUPS.flatMap((group) => group.items).filter(
  (item) => item.primary
);

/** Page title for the top bar, matched longest-prefix-first. */
export function titleForPath(pathname: string): string {
  const all = NAV_GROUPS.flatMap((group) => group.items);
  const match = all
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  if (match) return match.label;
  if (pathname.startsWith('/profile')) return 'Profile';
  if (pathname.startsWith('/settings')) return 'Settings';
  return 'MBAAntisocial';
}
