import {
  Home,
  CalendarClock,
  Bot,
  BookOpen,
  Target,
  FileText,
  Building,
  TrendingUp,
  GraduationCap,
  BookUser,
  ListChecks,
  CalendarDays,
  ClipboardCheck,
  Calculator,
  Library,
  MessageSquareQuote,
  Swords,
  UsersRound,
  MessagesSquare,
  Hash,
  PartyPopper,
  Flag,
  ShoppingBag,
  Handshake,
  Utensils,
  SearchX,
  Briefcase,
  Trophy,
  Gamepad2,
  Medal,
  Compass,
  Newspaper,
  Brain,
  BookA,
  LineChart,
  Wallet,
  HeartPulse,
  Settings,
  User,
  Building2,
  ShieldCheck,
  Shield,
  Landmark,
  Rocket,
  type LucideIcon,
} from 'lucide-react';
import type { FeatureKey } from '@mba/shared/campus';

/**
 * The single navigation definition. The sidebar, the mobile tab bar and menu,
 * the section landing pages, the command palette, and the edition gate all
 * read from here, so they can never disagree about what exists, where it
 * lives, or who may see it.
 */

export type NavAccess = 'moderator' | 'staff' | 'campusAdmin' | 'platformAdmin';

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for tight spaces. */
  short: string;
  /** One line for landing-page tiles and the command palette. */
  description: string;
  icon: LucideIcon;
  /** Edition-gated surface (PRD §15). Locked items stay visible, with a lock. */
  feature?: FeatureKey;
  access?: NavAccess;
  /** Extra words the command palette matches on. */
  keywords?: string[];
}

export interface NavSection {
  id: 'today' | 'prep' | 'academics' | 'campus' | 'play' | 'discover' | 'me' | 'institute';
  label: string;
  /** Section landing page; absent for single-page sections. */
  href: string;
  icon: LucideIcon;
  description: string;
  items: NavItem[];
}

export const SECTIONS: NavSection[] = [
  {
    id: 'today',
    label: 'Today',
    href: '/home',
    icon: Home,
    description: 'What needs you today.',
    items: [
      { href: '/home', label: 'Today', short: 'Today', icon: Home, description: 'Deadlines, sessions, rounds, and your streak in one view.', keywords: ['dashboard', 'home'] },
    ],
  },
  {
    id: 'prep',
    label: 'Prep',
    href: '/prep',
    icon: Target,
    description: 'Interviews, applications, and the people who can help.',
    items: [
      { href: '/sessions', label: 'Mock sessions', short: 'Mocks', icon: CalendarClock, description: 'Book seniors and alumni for mock PIs, GDs, and resume reviews.', feature: 'cross_campus_mentors', keywords: ['mock', 'interview', 'gd', 'senior', 'book', 'slot'] },
      { href: '/practice', label: 'AI practice', short: 'AI', icon: Bot, description: 'An AI interviewer and GD group when no senior is free.', feature: 'ai_interview', keywords: ['ai', 'claude', 'interview', 'group discussion'] },
      { href: '/intel', label: 'Interview intel', short: 'Intel', icon: BookOpen, description: 'What panels actually asked at your campus, round by round.', feature: 'intel', keywords: ['questions', 'company'] },
      { href: '/pipeline', label: 'Applications', short: 'Pipeline', icon: Target, description: 'Every company, every round, every deadline.', feature: 'pipeline', keywords: ['placement', 'tracker', 'rounds'] },
      { href: '/resume', label: 'Resume studio', short: 'Resume', icon: FileText, description: 'Build a one-page resume and get it torn apart before a recruiter does.', feature: 'resume', keywords: ['cv', 'roast', 'builder'] },
      { href: '/companies', label: 'Company wiki', short: 'Wiki', icon: Building, description: 'Your campus’s shared notes on every recruiter.', feature: 'wiki', keywords: ['company', 'prep', 'wiki'] },
      { href: '/offers', label: 'Offer intel', short: 'Offers', icon: TrendingUp, description: 'Anonymous compensation data from your own campus.', feature: 'offers', keywords: ['salary', 'ctc', 'compensation'] },
      { href: '/alumni', label: 'Alumni & referrals', short: 'Alumni', icon: GraduationCap, description: 'Alumni who opted in to referrals, with boundaries built in.', feature: 'alumni', keywords: ['referral', 'alumni', 'mentor'] },
      { href: '/network', label: 'My network', short: 'Network', icon: BookUser, description: 'Your private CRM of recruiters, alumni, and contacts.', keywords: ['contacts', 'black book', 'crm'] },
    ],
  },
  {
    id: 'academics',
    label: 'Academics',
    href: '/academics',
    icon: GraduationCap,
    description: 'Classes, deadlines, grades, and notes.',
    items: [
      { href: '/tasks', label: 'Tasks & deadlines', short: 'Tasks', icon: ListChecks, description: 'Assignments, exams, and daily habits that feed your streak.', feature: 'tasks', keywords: ['todo', 'assignment', 'habit'] },
      { href: '/timetable', label: 'Timetable', short: 'Timetable', icon: CalendarDays, description: 'Your weekly class schedule, synced to your calendar.', feature: 'timetable', keywords: ['schedule', 'classes'] },
      { href: '/attendance', label: 'Attendance', short: 'Attendance', icon: ClipboardCheck, description: 'Track it per course — and know exactly how many you can skip.', feature: 'attendance', keywords: ['bunk', 'skip', 'present'] },
      { href: '/grades', label: 'Grades & CGPA', short: 'CGPA', icon: Calculator, description: 'Course grades, term GPA, and what you need on the final.', feature: 'cgpa', keywords: ['gpa', 'cgpa', 'grades', 'calculator'] },
      { href: '/resources', label: 'Notes & past papers', short: 'Notes', icon: Library, description: 'Your batch’s notes, summaries, and past exams — searchable, versioned.', feature: 'resources', keywords: ['notes', 'papers', 'slides'] },
      { href: '/reviews', label: 'Course & prof reviews', short: 'Reviews', icon: MessageSquareQuote, description: 'Candid, moderated reviews and “what this professor actually tests”.', feature: 'whispers', keywords: ['professor', 'course', 'whispers', 'tips'] },
      { href: '/comps', label: 'Competitions', short: 'Comps', icon: Swords, description: 'Case competitions and challenges, with deadline reminders.', feature: 'comps', keywords: ['case competition', 'hackathon'] },
      { href: '/teams', label: 'Teams', short: 'Teams', icon: UsersRound, description: 'Find teammates and run your team’s workspace.', feature: 'teams', keywords: ['team', 'teammates', 'workspace'] },
    ],
  },
  {
    id: 'campus',
    label: 'Campus',
    href: '/campus',
    icon: Landmark,
    description: 'Your batch, your clubs, your campus.',
    items: [
      { href: '/feed', label: 'Feed', short: 'Feed', icon: MessagesSquare, description: 'Your campus, chronological. No algorithm, no infinite scroll.', feature: 'feed', keywords: ['posts', 'memes'] },
      { href: '/hub', label: 'Hub', short: 'Hub', icon: Hash, description: 'Channels, DMs, and voice rooms for campus, clubs, and circles.', feature: 'hub', keywords: ['chat', 'discord', 'channels', 'messages', 'dm', 'voice'] },
      { href: '/events', label: 'Events', short: 'Events', icon: PartyPopper, description: 'Fests, talks, and club events — RSVP and add to calendar.', feature: 'events', keywords: ['rsvp', 'fest', 'talk'] },
      { href: '/clubs', label: 'Clubs', short: 'Clubs', icon: Flag, description: 'Clubs and committees: recruitment, budgets, and tasks.', feature: 'clubs', keywords: ['committee', 'club', 'recruitment'] },
      { href: '/opportunities', label: 'Campus opportunities', short: 'Roles', icon: Rocket, description: 'Club roles, TA positions, live projects, student ventures.', feature: 'opportunities_campus', keywords: ['jobs', 'ta', 'live project'] },
      { href: '/marketplace', label: 'Marketplace', short: 'Market', icon: ShoppingBag, description: 'Books, cycles, sublets — buy and sell within campus.', feature: 'marketplace', keywords: ['buy', 'sell', 'books'] },
      { href: '/splits', label: 'Split & share', short: 'Splits', icon: Handshake, description: 'Cab shares and cost splits for trips, subscriptions, and events.', feature: 'travel', keywords: ['cab', 'travel', 'split', 'syndicate'] },
      { href: '/mess', label: 'Mess menu', short: 'Mess', icon: Utensils, description: 'This week’s menu and ratings.', feature: 'mess', keywords: ['food', 'menu', 'canteen'] },
      { href: '/lost-found', label: 'Lost & found', short: 'Lost', icon: SearchX, description: 'Lost something? Found something?', feature: 'feed', keywords: ['lost', 'found'] },
      { href: '/leaderboard', label: 'Standings', short: 'Ranks', icon: Trophy, description: 'Opt-in karma standings for people who give back.', feature: 'leaderboard', keywords: ['leaderboard', 'karma', 'rank'] },
    ],
  },
  {
    id: 'play',
    label: 'Play',
    href: '/play',
    icon: Gamepad2,
    description: 'Board games, cards, and tournaments with your batch.',
    items: [
      { href: '/games', label: 'Games', short: 'Games', icon: Gamepad2, description: 'Ludo, chess, carrom, cards — online, vs bot, or pass-and-play.', feature: 'games', keywords: ['ludo', 'chess', 'carrom', 'uno', 'cards'] },
      { href: '/tournaments', label: 'Tournaments', short: 'Cups', icon: Medal, description: 'Rated brackets and round robins across your campus.', feature: 'games', keywords: ['tournament', 'bracket', 'elo'] },
    ],
  },
  {
    id: 'discover',
    label: 'Discover',
    href: '/discover',
    icon: Compass,
    description: 'Daily business briefing, quizzes, and career insights.',
    items: [
      { href: '/briefing', label: 'Daily briefing', short: 'Briefing', icon: Newspaper, description: 'The business news that matters for GDs and PIs, in five minutes.', feature: 'news', keywords: ['news', 'current affairs'] },
      { href: '/quiz', label: 'Daily quiz', short: 'Quiz', icon: Brain, description: 'Five questions a day on business and current affairs.', feature: 'quiz', keywords: ['gk', 'quiz', 'current affairs'] },
      { href: '/jargon', label: 'Jargon buster', short: 'Jargon', icon: BookA, description: 'Business terms in plain English, with interview tips.', feature: 'jargon', keywords: ['glossary', 'terms'] },
      { href: '/insights', label: 'Placement insights', short: 'Insights', icon: LineChart, description: 'Skills, roles, and outcomes — what actually moves the needle.', feature: 'opportunities', keywords: ['roi', 'placements', 'salary', 'skills'] },
    ],
  },
  {
    id: 'me',
    label: 'Me',
    href: '/me',
    icon: User,
    description: 'Your profile, money, wellbeing, and settings.',
    items: [
      { href: '/profile', label: 'Profile', short: 'Profile', icon: User, description: 'How your campus sees you, and your mentoring setup.' },
      { href: '/money', label: 'Money', short: 'Money', icon: Wallet, description: 'Loan EMIs, stipend budgets, and monthly spending.', feature: 'budget', keywords: ['emi', 'loan', 'budget', 'finance'] },
      { href: '/wellbeing', label: 'Wellbeing', short: 'Wellbeing', icon: HeartPulse, description: 'A private, light check-in — and real help when you need it.', feature: 'wellness', keywords: ['mood', 'stress', 'counselling', 'help'] },
      { href: '/settings', label: 'Settings', short: 'Settings', icon: Settings, description: 'Notifications, quiet hours, integrations, and privacy.', keywords: ['notifications', 'preferences', 'zoom', 'google', 'discord'] },
    ],
  },
  {
    id: 'institute',
    label: 'Institute',
    href: '/institute',
    icon: Building2,
    description: 'Tools for moderators, staff, and administrators.',
    items: [
      { href: '/institute/report', label: 'Campus report', short: 'Report', icon: Building2, description: 'Aggregate preparedness, privacy-floored.', access: 'staff' },
      { href: '/institute/moderation', label: 'Moderation', short: 'Mod', icon: ShieldCheck, description: 'Reports queue and hidden content.', access: 'moderator' },
      { href: '/institute/admin', label: 'Campus admin', short: 'Admin', icon: Shield, description: 'Campus settings, roles, clubs, and Discord link.', access: 'campusAdmin' },
      { href: '/admin', label: 'Platform admin', short: 'Platform', icon: Briefcase, description: 'Campuses, domains, curation, games, and metrics.', access: 'platformAdmin' },
    ],
  },
];

export const ALL_ITEMS: NavItem[] = SECTIONS.flatMap((section) => section.items);

/** Bottom tab bar on phones. "Menu" opens every section. */
export const MOBILE_TABS: Array<{ id: string; label: string; href: string; icon: LucideIcon; match: string[] }> = [
  { id: 'today', label: 'Today', href: '/home', icon: Home, match: ['/home'] },
  { id: 'prep', label: 'Prep', href: '/prep', icon: Target, match: sectionPaths('prep') },
  { id: 'campus', label: 'Campus', href: '/campus', icon: Landmark, match: sectionPaths('campus') },
  { id: 'play', label: 'Play', href: '/play', icon: Gamepad2, match: sectionPaths('play') },
];

function sectionPaths(id: NavSection['id']): string[] {
  const section = SECTIONS.find((s) => s.id === id);
  return section ? [section.href, ...section.items.map((i) => i.href)] : [];
}

export interface Viewer {
  canModerate: boolean;
  canReadReport: boolean;
  canAdminCampus: boolean;
  isPlatformAdmin: boolean;
}

export function canSee(item: NavItem, viewer: Viewer | null): boolean {
  if (!item.access) return true;
  if (!viewer) return false;
  switch (item.access) {
    case 'moderator':
      return viewer.canModerate;
    case 'staff':
      return viewer.canReadReport;
    case 'campusAdmin':
      return viewer.canAdminCampus;
    case 'platformAdmin':
      return viewer.isPlatformAdmin;
  }
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The nav item a path belongs to, longest prefix first. */
export function itemForPath(pathname: string): NavItem | undefined {
  return ALL_ITEMS.filter((item) => isActive(pathname, item.href)).sort((a, b) => b.href.length - a.href.length)[0];
}

export function sectionForPath(pathname: string): NavSection | undefined {
  return (
    SECTIONS.find((s) => s.href !== '/home' && pathname === s.href) ??
    SECTIONS.find((s) => s.items.some((item) => isActive(pathname, item.href)))
  );
}

/** Page title for the top bar. */
export function titleForPath(pathname: string): string {
  const exactSection = SECTIONS.find((s) => s.href === pathname);
  if (exactSection) return exactSection.label;
  const item = itemForPath(pathname);
  if (item) return item.label;
  if (pathname.startsWith('/play/')) return 'Play';
  if (pathname.startsWith('/meet/')) return 'Video room';
  if (pathname.startsWith('/u/')) return 'Profile';
  if (pathname.startsWith('/onboarding')) return 'Welcome';
  return 'MBAAntisocial';
}
