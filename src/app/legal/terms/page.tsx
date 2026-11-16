import Link from 'next/link';
import styles from '../../(app)/app.module.css';

export const metadata = { title: 'Terms of use' };

/**
 * Plain-language terms. A starting point written for a student product — have
 * it reviewed by counsel for the jurisdiction you operate in before launch.
 */
export default function TermsPage() {
  return (
    <div className={styles.prose}>
      <h1 className={styles.pageTitle} style={{ fontSize: 'var(--t-2xl)' }}>
        Terms of use
      </h1>
      <p className="muted">The deal, in plain words. By creating an account you agree to it.</p>

      <h2>Who can use it</h2>
      <ul>
        <li>Students, alumni, and staff of a participating institute, using their own account.</li>
        <li>One account per person. Do not share your password or sign in as someone else.</li>
      </ul>

      <h2>What you post</h2>
      <ul>
        <li>
          You own what you write and upload. You give us permission to store it and show it to the
          people it is meant for — your campus, or the people in a session — so the product works.
        </li>
        <li>
          Interview questions you contribute are given to your campus: they stay in the shared bank
          if you delete your account, without your name.
        </li>
        <li>
          Do not post other people&apos;s gradable work, private information about someone, harassment,
          or anything unlawful. The <Link href="/legal/honor-code">sharing policy</Link> has the
          details.
        </li>
      </ul>

      <h2>Moderation</h2>
      <p>
        Campus moderators can hide content and suspend accounts that break these terms. Hidden
        content is kept so the decision can be reviewed. If you think a call was wrong, contact your
        campus moderators or your institute&apos;s student affairs office.
      </p>

      <h2>AI features</h2>
      <p>
        The AI interviewer and resume roast send what you type or upload to an AI provider to
        generate a reply. Replies can be wrong; treat them as practice, not advice. Resumes are read
        once and not stored by us.
      </p>

      <h2>Mentoring</h2>
      <p>
        Mock sessions are run by students and alumni volunteering their time. They are not
        professional advice, and no outcome — a shortlist, an offer — is promised.
      </p>

      <h2>Points, levels, and rewards</h2>
      <p>
        XP, levels, streaks, and achievements have no monetary value and cannot be exchanged. We may
        rebalance them, and we remove anything earned by abusing a bug.
      </p>

      <h2>Your data</h2>
      <p>
        See the <Link href="/legal/privacy">privacy notice</Link>. You can download or delete your
        data at any time from your profile.
      </p>

      <h2>Availability and liability</h2>
      <p>
        We work to keep the service running and your data safe, but it is provided as is. To the
        extent the law allows, we are not liable for indirect losses arising from its use.
      </p>

      <h2>Changes</h2>
      <p>
        If these terms change materially, we will tell you in the app before the change applies.
      </p>
    </div>
  );
}
