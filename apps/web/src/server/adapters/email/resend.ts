import { Resend } from 'resend';
import type { EmailMessage, EmailSender } from '../../ports/email';

export class ResendEmailSender implements EmailSender {
  readonly id = 'resend';
  readonly delivers = true;
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string
  ) {
    this.client = new Resend(apiKey);
  }

  async send(message: EmailMessage) {
    const { error } = await this.client.emails.send(
      { from: this.from, to: message.to, subject: message.subject, html: message.html, text: message.text },
      message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : undefined
    );
    if (error) throw new Error(`Resend: ${error.message}`);
  }
}
