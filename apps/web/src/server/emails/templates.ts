import { env } from '@/lib/env';

/**
 * Transactional email copy. Plain, short, and one action per email — the
 * product's tone (§5) without making anyone squint at a security email.
 */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function layout(title: string, bodyHtml: string, action?: { label: string; url: string }): string {
  const button = action
    ? `<p style="margin:28px 0"><a href="${escape(action.url)}" style="background:#5b4bdb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">${escape(action.label)}</a></p>
       <p style="color:#6b6880;font-size:13px">Or paste this link: <br/><span style="word-break:break-all">${escape(action.url)}</span></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#faf9f6;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1b1a22">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="font-weight:700;font-size:18px;margin-bottom:24px">MBA<span style="color:#5b4bdb">Antisocial</span></div>
    <h1 style="font-size:22px;margin:0 0 12px">${escape(title)}</h1>
    ${bodyHtml}
    ${button}
    <p style="color:#6b6880;font-size:12px;margin-top:40px">You are getting this because someone used this address on ${escape(env.APP_URL.replace(/^https?:\/\//, ''))}. If it was not you, ignore it — nothing happens.</p>
  </div></body></html>`;
}

export function verifyEmail(name: string, url: string): RenderedEmail {
  return {
    subject: 'Confirm your institute email',
    html: layout(`Hi ${name.split(' ')[0]}, one click and you are in`, '<p>Confirm this is your institute address so your batch knows you are actually you.</p>', {
      label: 'Confirm email',
      url,
    }),
    text: `Confirm your institute email for MBAAntisocial:\n${url}\n\nThe link expires in 24 hours.`,
  };
}

export function resetPassword(url: string): RenderedEmail {
  return {
    subject: 'Reset your password',
    html: layout('Reset your password', '<p>Choose a new password. This link works once and expires in 30 minutes.</p>', {
      label: 'Choose a new password',
      url,
    }),
    text: `Reset your MBAAntisocial password (expires in 30 minutes):\n${url}`,
  };
}

export function loginCode(code: string): RenderedEmail {
  return {
    subject: `${code} is your sign-in code`,
    html: layout(
      'Your sign-in code',
      `<p style="font-size:32px;letter-spacing:8px;font-weight:700;font-family:JetBrains Mono,monospace">${escape(code)}</p><p>It expires in 10 minutes. Never share it — we will never ask for it.</p>`
    ),
    text: `Your MBAAntisocial sign-in code is ${code}. It expires in 10 minutes.`,
  };
}

export function notificationEmail(title: string, body: string, url: string): RenderedEmail {
  return {
    subject: title,
    html: layout(title, body ? `<p>${escape(body)}</p>` : '', { label: 'Open MBAAntisocial', url }),
    text: `${title}\n\n${body}\n\n${url}`,
  };
}
