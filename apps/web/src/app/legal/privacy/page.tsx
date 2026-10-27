import styles from '../../(app)/app.module.css';

export const metadata = {
  title: 'Privacy',
};

export default function PrivacyPage() {
  return (
    <div className={styles.prose}>
      <h1 className={styles.pageTitle} style={{ fontSize: 'var(--t-2xl)' }}>
        Privacy
      </h1>

      <p className="muted">
        What is stored, who can see it, and what leaves the platform. Short, because there is not
        much to say.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>Your name, institute email, campus, batch, and year.</li>
        <li>What you post, upload, and book, plus the feedback you write and receive.</li>
        <li>Your points, karma, streak, and badges.</li>
      </ul>

      <h2>Who can see what</h2>
      <ul>
        <li>
          <strong>Your campus.</strong> Feed posts, resource uploads, and published slots are visible
          to signed-in students at your institute. Nothing crosses to another campus.
        </li>
        <li>
          <strong>Only the two of you.</strong> Session feedback and the note you write when booking
          are visible to the two people in that session and nobody else.
        </li>
        <li>
          <strong>Nobody, unless you say so.</strong> Leaderboard placement is off until you turn it
          on. Your email address is never shown to other students.
        </li>
      </ul>

      <h2>What we do not do</h2>
      <ul>
        <li>No advertising on the feed, and no selling anything about you to anyone.</li>
        <li>No third-party trackers or analytics pixels.</li>
        <li>
          No engagement ranking. The feed is chronological, so nothing is being optimised against
          your attention.
        </li>
      </ul>

      <h2>Deleting things</h2>
      <p>
        You can delete your own posts and uploads at any time, and they go. Content hidden by a
        moderator is retained so the decision can be reviewed. Notifications are discarded
        automatically after ninety days.
      </p>

      <h2>Security</h2>
      <p>
        Passwords are stored as bcrypt hashes and are never readable, including by us. Sessions are
        signed tokens that expire after thirty days.
      </p>

      <h2>Reaching a person</h2>
      <p>
        Every campus has moderators who can act on reports. For anything they cannot resolve,
        contact your institute&apos;s placement or student affairs office, who hold the relationship
        with us.
      </p>
    </div>
  );
}
