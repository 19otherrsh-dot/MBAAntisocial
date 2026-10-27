import type { EmailMessage, EmailSender } from '../../ports/email';

/**
 * Development fallback: prints the email instead of sending it, so a fresh
 * clone can complete verification and password reset with no mail provider.
 */
export class ConsoleEmailSender implements EmailSender {
  readonly id = 'console';
  readonly delivers = false;

  async send(message: EmailMessage) {
    console.info(
      `\n[email:console] to=${message.to}\n  subject: ${message.subject}\n  ${message.text.split('\n').join('\n  ')}\n`
    );
  }
}
