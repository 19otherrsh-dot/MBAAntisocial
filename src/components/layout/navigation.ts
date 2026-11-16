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
  LayoutGrid,
  Map as MapIcon,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** One line shown in the mobile "More" sheet, where there is room to explain. */
  hint?: string;
  /** Only rendered for moderators and admins. */
  moderatorOnly?: boolean;
  /** Only rendered for institute staff reading the campus report. */
  staffOnly?: boolean;
  /** Shows the unread-messages dot. */
  showsUnreadMessages?: boolean;
}

export type SectionKey = 'today' | 'placements' | 'prep' | 'campus' | 'institute';

export interface NavGroup {
  key: SectionKey;
  label: string;
  items: NavItem[];
}

/**
 * One navigation definition, consumed by the sidebar, the mobile tab bar, and
 * the "More" sheet, so they can never disagree about what exists.
 *
 * Grouped by what a student is trying to do rather than listed flat: eighteen
 * peers in a column is a menu nobody reads, and on a phone it was thirteen
 * tabs running off the edge of the screen, with four pages unreachable.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'today',
    label: '',
    items: [
      { href: '/home', label: 'Today', icon: Home },
      { href: '/path', label: 'Path', icon: MapIcon, hint: 'Quests, streak, level, achievements' },
    ],
  },
  {
    key: 'placements',
    label: 'Placements',
    items: [
      { href: '/pipeline', label: 'Pipeline', icon: Target, hint: 'Every process, round by round' },
      { href: '/intel', label: 'Interview Intel', icon: BookOpen, hint: 'What panels asked your campus' },
      { href: '/offer-intel', label: 'Offer Intel', icon: TrendingUp, hint: 'Anonymous pay benchmarks' },
      { href: '/black-book', label: 'Black Book', icon: BookUser, hint: 'Your private contact list' },
      { href: '/jobs', label: 'Opportunities', icon: Briefcase, hint: 'Clubs, TAs, live projects, referrals' },
    ],
  },
  {
    key: 'prep',
    label: 'Prep',
    items: [
      { href: '/sessions', label: 'Mock Prep', icon: CalendarClock, hint: 'Book a senior for a mock' },
      { href: '/ai-interview', label: 'AI Interview', icon: Bot, hint: 'Warm up against your campus’s questions' },
      { href: '/resume-roast', label: 'Resume Roast', icon: FileText, hint: 'A line-by-line teardown' },
      { href: '/tasks', label: 'Tasks', icon: ListChecks, hint: 'Deadlines and daily habits' },
      { href: '/comps', label: 'Competitions', icon: Swords, hint: 'Case comps worth entering' },
    ],
  },
  {
    key: 'campus',
    label: 'Campus',
    items: [
      { href: '/feed', label: 'Feed', icon: MessagesSquare, hint: 'Your campus, newest first' },
      { href: '/messages', label: 'Messages', icon: MessageCircle, hint: 'Threads after a session', showsUnreadMessages: true },
      { href: '/rooms', label: 'Study Rooms', icon: MessageSquare, hint: 'Live rooms that close by themselves' },
      { href: '/resources', label: 'Resources', icon: Library, hint: 'Notes your batch shared' },
      { href: '/whisper-network', label: 'Whispers', icon: VolumeX, hint: 'Anonymous course reviews' },
      { href: '/syndicate', label: 'The Syndicate', icon: Handshake, hint: 'Split a subscription or a cab' },
      { href: '/leaderboard', label: 'Standings', icon: Trophy, hint: 'Karma, if you opted in' },
    ],
  },
  {
    key: 'institute',
    label: 'Institute',
    items: [
      { href: '/campus', label: 'Campus Report', icon: Building2, staffOnly: true, hint: 'Is this batch prepared?' },
      { href: '/moderation', label: 'Moderation', icon: ShieldCheck, moderatorOnly: true, hint: 'The report queue' },
    ],
  },
];

export interface Tab {
  label: string;
  icon: LucideIcon;
  /** Where the tab goes. Null for "More", which opens a sheet instead. */
  href: string | null;
  /** The tab lights up for any page in these sections. */
  sections: SectionKey[];
}

/** The mobile tab bar: five targets, the most a thumb can reliably hit. */
export const TABS: Tab[] = [
  { label: 'Today', icon: Home, href: '/home', sections: [] },
  { label: 'Pipeline', icon: Target, href: '/pipeline', sections: ['placements'] },
  { label: 'Path', icon: MapIcon, href: '/path', sections: [] },
  { label: 'Prep', icon: CalendarClock, href: '/sessions', sections: ['prep'] },
  { label: 'More', icon: LayoutGrid, href: null, sections: ['campus', 'institute'] },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items.map((item) => ({ item, group })));

function matchPath(pathname: string) {
  return ALL_ITEMS.filter(
    ({ item }) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  ).sort((a, b) => b.item.href.length - a.item.href.length)[0];
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Which section the current page belongs to, for lighting up a tab. */
export function sectionForPath(pathname: string): SectionKey | null {
  return matchPath(pathname)?.group.key ?? null;
}

/** Whether a nav item is visible to this viewer. */
export function canSee(item: NavItem, viewer: { canModerate: boolean; isStaff: boolean }): boolean {
  return (!item.moderatorOnly || viewer.canModerate) && (!item.staffOnly || viewer.isStaff);
}

/** Page title for the top bar, matched longest-prefix-first. */
export function titleForPath(pathname: string): string {
  const match = matchPath(pathname);
  if (match) return match.item.label;
  if (pathname.startsWith('/profile')) return 'Profile';
  if (pathname.startsWith('/onboarding')) return 'Welcome';
  return 'MBAAntisocial';
}
