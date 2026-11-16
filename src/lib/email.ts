import { Resend } from 'resend';
import { env } from './env';

/**
 * Transactional email.
 *
 * One function, so every message leaves through the same door. When no
 * provider is configured the message is not silently dropped: in development
 * it is printed to the server log, link and all, so the verification and reset
 * flows can be exercised on a laptop with no email account.
 */
interface OutgoingEmail {
  to: string;
  subject: string;
  /** Plain-text lead paragraph. */
  intro: string;
  action: { label: string; url: string };
  /** Plain-text footnote, e.g. how long the link lasts. */
  footnote: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function render(message: OutgoingEmail): { html: string; text: string } {
  const text = `${message.intro}\n\n${message.action.label}: ${message.action.url}\n\n${message.footnote}`;
  const html = `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f6f5f1;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1c1b19">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e1d8;border-radius:14px;padding:28px">
    <p style="margin:0 0 20px;font-weight:700;font-size:16px">MBA<span style="color:#5b47f5">Antisocial</span></p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.55">${escapeHtml(message.intro)}</p>
    <p style="margin:0 0 24px"><a href="${escapeHtml(message.action.url)}" style="display:inline-block;background:#5b47f5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 20px;border-radius:9px">${escapeHtml(message.action.label)}</a></p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#6f6c64">${escapeHtml(message.footnote)}</p>
  </div>
</body></html>`;
  return { html, text };
}

/** Sends one email. Returns false when it could not be delivered. */
export async function sendEmail(message: OutgoingEmail): Promise<boolean> {
  const { html, text } = render(message);

  if (!env.RESEND_API_KEY) {
    if (!env.isProduction) {
      console.info(`[email] (not sent — RESEND_API_KEY is unset)\n  to: ${message.to}\n  ${message.subject}\n  ${message.action.url}`);
    } else {
      console.warn(`[email] dropped "${message.subject}": RESEND_API_KEY is not configured.`);
    }
    return false;
  }

  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html,
      text,
    });
    if (error) {
      console.error('[email] provider rejected the message:', error);
      return false;
    }
    return true;
  } catch (error) {
    // A mail outage must not fail the request that triggered the email.
    console.error('[email] delivery failed:', error);
    return false;
  }
}

export function sendVerificationEmail(to: string, name: string, rawToken: string): Promise<boolean> {
  const url = `${env.APP_URL}/verify-email?token=${encodeURIComponent(rawToken)}`;
  return sendEmail({
    to,
    subject: 'Confirm your MBAAntisocial account',
    intro: `Hi ${name.split(' ')[0]} — confirm this is your address and your account is ready.`,
    action: { label: 'Confirm email', url },
    footnote: 'This link works for 48 hours. If you did not create an account, ignore this email and nothing happens.',
  });
}

export function sendPasswordResetEmail(to: string, name: string, rawToken: string): Promise<boolean> {
  const url = `${env.APP_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
  return sendEmail({
    to,
    subject: 'Reset your MBAAntisocial password',
    intro: `Hi ${name.split(' ')[0]} — someone asked to reset the password on this account. If that was you, choose a new one below.`,
    action: { label: 'Choose a new password', url },
    footnote: 'This link works for one hour and only once. If you did not ask for it, ignore this email — your password has not changed.',
  });
}
