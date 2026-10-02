import Link from 'next/link';
import { CalendarClock, Library, ShieldCheck } from 'lucide-react';
import { Wordmark } from '@/components/brand/Logo';
import styles from './auth.module.css';

const PROOF = [
  {
    icon: CalendarClock,
    title: 'Real availability, not a cold DM',
    body: 'Seniors publish slots. You book one, and both sides fill in a rubric afterwards.',
  },
  {
    icon: Library,
    title: 'Notes from people you know',
    body: 'Search your own batch’s material by course, professor, and term — with version history.',
  },
  {
    icon: ShieldCheck,
    title: 'Scoped to your campus',
    body: 'Your feed, your seniors, your deadlines. Nothing leaks across schools.',
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.formSide}>
        <div className={styles.formHeader}>
          <Link href="/" aria-label="MBAAntisocial home">
            <Wordmark size={26} />
          </Link>
        </div>
        {children}
      </div>

      <aside className={styles.aside}>
        <h2 className={styles.asideTitle}>
          The tools your batch is already using, minus eight of them
        </h2>

        <div className={styles.proofList}>
          {PROOF.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className={styles.proof}>
                <span className={styles.proofIcon}>
                  <Icon size={16} />
                </span>
                <div>
                  <div className={styles.proofTitle}>{item.title}</div>
                  <p className={styles.proofBody}>{item.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
