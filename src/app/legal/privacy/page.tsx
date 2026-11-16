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

      <h2>Services that process data for us</h2>
      <ul>
        <li><strong>Database hosting</strong> — stores your account and activity.</li>
        <li><strong>Cloudinary</strong> — stores files you upload as resources or profile pictures.</li>
        <li><strong>Resend</strong> — sends account emails (confirmation, password reset, digest).</li>
        <li><strong>Pusher</strong> — delivers messages and notifications in real time.</li>
        <li>
          <strong>Google Gemini</strong> — generates AI interview replies and resume feedback from
          what you type or upload there. Resumes are not stored by us.
        </li>
      </ul>
      <p>Each processes data only to provide its part of the service.</p>

      <h2>Your rights</h2>
      <ul>
        <li>
          <strong>Download everything.</strong> Profile → Your data → Download my data gives you a
          copy of everything stored about you.
        </li>
        <li>
          <strong>Delete your account.</strong> Profile → Your data → Delete account removes your
          records. Interview questions you logged stay in the campus bank without your name.
        </li>
        <li>
          You can delete individual posts and uploads at any time. Content hidden by a moderator is
          retained so the decision can be reviewed.
        </li>
      </ul>

      <h2>Security</h2>
      <p>
        Passwords are stored as bcrypt hashes and are never readable, including by us. Sessions are
        signed tokens that expire after thirty days, and changing your password signs out every
        other device.
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
