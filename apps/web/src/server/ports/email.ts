export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Collapses retries of the same logical email. */
  idempotencyKey?: string;
}

export interface EmailSender {
  readonly id: string;
  /** False for the console fallback: callers may choose to surface the link in dev. */
  readonly delivers: boolean;
  send(message: EmailMessage): Promise<void>;
}
