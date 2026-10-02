import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  ListChecks,
  Library,
  MessagesSquare,
  Swords,
  Sparkles,
  ShieldCheck,
  EyeOff,
  Scale,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { Wordmark } from '@/components/brand/Logo';
import type { Tone } from '@/lib/constants';
import styles from './landing.module.css';

export const metadata = {
  title: 'MBAAntisocial — the operating layer for B-school',
};

const FEATURES: Array<{
  icon: typeof CalendarClock;
  tone: Tone;
  title: string;
  body: string;
}> = [
  {
    icon: CalendarClock,
    tone: 'violet',
    title: 'Mock prep with a calendar, not a cold DM',
    body: 'Seniors publish real availability. You book a slot, both sides fill in a rubric afterwards, and the rating goes both ways — so quality stays honest in both directions.',
  },
  {
    icon: ListChecks,
    tone: 'teal',
    title: 'Every deadline in one column',
    body: 'Assignments, competition registrations, and daily habits in a single list. Recurring tasks generate real instances, so a habit has a history instead of a checkbox.',
  },
  {
    icon: Library,
    tone: 'blue',
    title: 'Your batch’s notes, actually searchable',
    body: 'Full-text search by course, professor, and term, with version history. Scoped to notes and past papers — not gradable work that is still being marked.',
  },
  {
    icon: Swords,
    tone: 'amber',
    title: 'Competitions that land on your list',
    body: 'A curated calendar of case comps and hackathons. Track one and the registration deadline becomes a task, instead of a tab you meant to revisit.',
  },
  {
    icon: MessagesSquare,
    tone: 'rose',
    title: 'A feed the size of your campus',
    body: 'Your school, your batch, in chronological order. No engagement ranking, no infinite scroll, no strangers — and reporting and moderation from day one.',
  },
  {
    icon: Sparkles,
    tone: 'slate',
    title: 'Karma, kept separate from points',
    body: 'Points track looking after yourself. Karma tracks looking after everyone else. Only karma earns you standing — and the leaderboard is opt-in.',
  },
];

const REPLACES = [
  'Six WhatsApp groups',
  'A deadline spreadsheet',
  'Google Forms',
  'Calendly',
  'Scattered Drive links',
  'Ten comp websites',
  'A notes app',
  'Instagram',
];

const PRINCIPLES: Array<{ icon: typeof ShieldCheck; title: string; body: string }> = [
  {
    icon: EyeOff,
    title: 'No performance feed',
    body: 'Chronological, campus-only, and finite. This is not another place to build a personal brand at people you sit next to.',
  },
  {
    icon: Scale,
    title: 'No guilt mechanics',
    body: 'Streaks forgive a missed day. Leaderboards are opt-in. Notifications tell you what happened, not what you are missing out on.',
  },
  {
    icon: ShieldCheck,
    title: 'Guardrails first',
    body: 'Booking caps protect seniors from being flooded. Sharing is scoped to notes and past papers. Reporting tools shipped in version one.',
  },
];

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" aria-label="MBAAntisocial home">
          <Wordmark size={26} />
        </Link>
        <div className={styles.navActions}>
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </nav>

      <header className={styles.hero}>
        <span className={styles.eyebrowPill}>
          <span className={styles.pulseDot} aria-hidden />
          Campus edition — rolling out school by school
        </span>

        <h1 className={styles.title}>
          Two years of B-school, <span className={styles.titleAccent}>one app</span>
        </h1>

        <p className={styles.subtitle}>
          Book mock interviews with actual seniors. Track every deadline in one place. Find the
          notes your batch already wrote. Everything a PGDM currently runs on nine group chats and a
          spreadsheet — without the LinkedIn voice.
        </p>

        <div className={styles.heroActions}>
          <Link href="/register">
            <Button size="lg" iconAfter={<ArrowRight size={17} />}>
              Join your campus
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="secondary">
              I already have an account
            </Button>
          </Link>
        </div>

        <p className={styles.heroNote}>Free for students. No ads on the feed — not now, not later.</p>
      </header>

      <section className={styles.replaces} aria-labelledby="replaces-heading">
        <div className={styles.replacesInner}>
          <h2 id="replaces-heading" className="eyebrow">
            What it replaces
          </h2>
          <div className={styles.replacesList}>
            {REPLACES.map((item) => (
              <span key={item} className={styles.replacedItem}>
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="features-heading">
        <div className={styles.sectionHead}>
          <h2 id="features-heading" className={styles.sectionTitle}>
            Built around the things that actually take up your week
          </h2>
          <p className={styles.sectionBody}>
            Not a forum, not an aggregator, not another mentor marketplace that has never heard of
            your college. A day-to-day operating layer that knows who your seniors are.
          </p>
        </div>

        <div className={styles.grid}>
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className={styles.featureCard}>
                <span
                  className={styles.featureIcon}
                  style={{
                    background: `var(--${feature.tone}-soft)`,
                    color: `var(--${feature.tone}-text)`,
                  }}
                >
                  <Icon size={19} />
                </span>
                <h3 className={styles.featureTitle}>{feature.title}</h3>
                <p className={styles.featureBody}>{feature.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="principles-heading">
        <div className={styles.sectionHead}>
          <h2 id="principles-heading" className={styles.sectionTitle}>
            The name is a promise, not a joke
          </h2>
          <p className={styles.sectionBody}>
            Students already carry enough comparison pressure from the apps they have. This one is
            built to be useful and then get out of the way.
          </p>
        </div>

        <div className={styles.principles}>
          {PRINCIPLES.map((principle) => {
            const Icon = principle.icon;
            return (
              <div key={principle.title} className={styles.principle}>
                <h3 className={styles.principleTitle}>
                  <Icon size={17} style={{ color: 'var(--accent)' }} />
                  {principle.title}
                </h3>
                <p className={styles.principleBody}>{principle.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.cta}>
        <div className={styles.ctaInner}>
          <h2 className={styles.ctaTitle}>Your seniors are one booking away</h2>
          <p className={styles.ctaBody}>
            Set up an account with your institute email, tell us your batch, and you are in. If your
            campus is not live yet, you will be first through the door when it is.
          </p>
          <Link href="/register" className={styles.ctaButton}>
            Create your account
            <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>© {new Date().getFullYear()} MBAAntisocial</span>
          <div className={styles.footerLinks}>
            <Link href="/legal/honor-code">Sharing policy</Link>
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
