import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailMessage, EmailSender } from '../../ports/email';

/** Any SMTP server — including Mailpit in the docker-compose dev stack. */
export class SmtpEmailSender implements EmailSender {
  readonly id = 'smtp';
  readonly delivers = true;
  private readonly transport: Transporter;

  constructor(
    url: string,
    private readonly from: string
  ) {
    this.transport = nodemailer.createTransport(url);
  }

  async send(message: EmailMessage) {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      headers: message.idempotencyKey ? { 'X-Entity-Ref-ID': message.idempotencyKey } : undefined,
    });
  }
}
