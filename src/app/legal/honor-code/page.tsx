import { RESOURCE_KIND_META, RESOURCE_KINDS } from '@/lib/constants';
import AcceptButton from './AcceptButton';
import styles from '../../(app)/app.module.css';

export const metadata = {
  title: 'Sharing policy',
};

/**
 * The academic-integrity guardrail from §6.5, written out.
 *
 * Kept as a real page rather than a checkbox label because the distinction —
 * notes and past papers yes, work that is still being marked no — is the whole
 * point, and it needs stating once in plain language.
 */
export default function HonorCodePage() {
  return (
    <div className={styles.prose}>
      <h1 className={styles.pageTitle} style={{ fontSize: 'var(--t-2xl)' }}>
        Sharing policy
      </h1>

      <p className="muted">
        One page, no legalese. You accept this once before uploading anything to the resource
        library.
      </p>

      <h2>What this library is for</h2>
      <p>
        Material that helps someone learn a subject they are already enrolled in. In practice that
        means:
      </p>
      <ul>
        {RESOURCE_KINDS.map((kind) => (
          <li key={kind}>
            <strong>{RESOURCE_KIND_META[kind].label}</strong> — your own notes, summaries you wrote,
            past papers that have already been sat, reading lists, and slides your institute has
            circulated.
          </li>
        ))}
      </ul>

      <h2>What it is not for</h2>
      <p>
        Anything that is currently being graded. Not your submission, not a friend&apos;s
        submission, not a draft of either. There is deliberately no category for it, so if you find
        yourself trying to squeeze an assignment into &ldquo;class notes&rdquo;, that is the answer.
      </p>
      <p>
        This is not us being precious. Handing someone a gradable submission is how a person loses a
        term, and neither of you will enjoy explaining it to a committee.
      </p>

      <h2>Copyright and third-party material</h2>
      <ul>
        <li>
          Do not upload textbooks, purchased case studies, or paywalled material. Case houses do
          pursue this, and it lands on your institute.
        </li>
        <li>
          If a professor has asked for their material not to circulate, that request holds here too.
        </li>
        <li>Link to the source where one exists rather than re-hosting it.</li>
      </ul>

      <h2>What we do about it</h2>
      <ul>
        <li>
          Every upload is attributed. Nothing here is anonymous, and that is on purpose — it is what
          makes a note from your own batch worth more than a stranger&apos;s.
        </li>
        <li>
          Anyone can report an upload. A campus moderator reviews it, and content that breaches this
          policy is hidden rather than deleted, so the decision stays reviewable.
        </li>
        <li>
          Repeated breaches cost you upload access. Nobody is going to be surprised when it happens.
        </li>
      </ul>

      <h2>Your own work</h2>
      <p>
        You keep ownership of anything you upload. Sharing it here grants other students at your
        campus permission to read it — nothing more. Delete it whenever you like and it goes.
      </p>

      <AcceptButton />
    </div>
  );
}
