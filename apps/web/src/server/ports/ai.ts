import type { z } from 'zod';

/**
 * The language-model port. Features describe *what* they need — a streamed
 * persona chat, or a structured object matching a schema — and never which
 * vendor or model produces it.
 */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type AiEffort = 'low' | 'medium' | 'high';

export interface StreamChatInput {
  system: string;
  messages: ChatTurn[];
  /** Reasoning depth. Chat-like features should stay low; analysis can go higher. */
  effort?: AiEffort;
  maxTokens?: number;
  /** Who is spending — used for attribution in logs only. */
  userId: string;
  feature: string;
  /** A PDF attached to the final user turn, base64 without newlines. */
  pdfBase64?: string;
}

export interface StructuredInput<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  effort?: AiEffort;
  maxTokens?: number;
  userId: string;
  feature: string;
  /** Optional PDF attachment, base64 without newlines. */
  pdfBase64?: string;
}

export interface AiProvider {
  readonly id: string;
  readonly configured: boolean;
  /** A web ReadableStream of UTF-8 text deltas. */
  streamChat(input: StreamChatInput): Promise<ReadableStream<Uint8Array>>;
  /** One object matching `schema`, or throws `AiUnavailableError` / `AiRefusalError`. */
  structured<T>(input: StructuredInput<T>): Promise<T>;
}

export class AiUnavailableError extends Error {
  constructor(message = 'AI features are not configured on this deployment.') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export class AiRefusalError extends Error {
  constructor(message = 'The assistant declined that request.') {
    super(message);
    this.name = 'AiRefusalError';
  }
}
