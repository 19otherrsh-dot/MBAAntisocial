import { AiUnavailableError, type AiProvider } from '../../ports/ai';

/** Wired when no API key is configured, so AI routes fail with a clear 503. */
export class DisabledAiProvider implements AiProvider {
  readonly id = 'disabled';
  readonly configured = false;

  async streamChat(): Promise<ReadableStream<Uint8Array>> {
    throw new AiUnavailableError();
  }

  async structured<T>(): Promise<T> {
    throw new AiUnavailableError();
  }
}
