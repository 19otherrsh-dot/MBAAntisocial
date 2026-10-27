import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import {
  AiRefusalError,
  AiUnavailableError,
  type AiProvider,
  type StreamChatInput,
  type StructuredInput,
} from '../../ports/ai';

/**
 * Claude, through the official SDK.
 *
 * Every request opts into server-side refusal fallbacks (`fallbacks: "default"`):
 * a classifier false positive on an innocuous interview answer is retried on
 * the model Anthropic recommends for that category instead of surfacing as an
 * outage. Thinking is left adaptive (the model's default); depth is steered
 * with `effort` per feature.
 */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export class ClaudeAiProvider implements AiProvider {
  readonly id = 'claude';
  readonly configured = true;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  async streamChat(input: StreamChatInput): Promise<ReadableStream<Uint8Array>> {
    const stream = this.client.beta.messages.stream({
      model: this.model,
      max_tokens: input.maxTokens ?? 4000,
      system: input.system,
      messages: toMessages(input.messages, input.pdfBase64),
      output_config: { effort: input.effort ?? 'low' },
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
    });

    const encoder = new TextEncoder();
    const feature = input.feature;
    const userId = input.userId;

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          const final = await stream.finalMessage();
          if (final.stop_reason === 'refusal') {
            controller.enqueue(
              encoder.encode('\n\n_(The assistant stopped here. Try rephrasing, or start a fresh session.)_')
            );
          }
          console.info(
            `[ai] ${feature} user=${userId} in=${final.usage.input_tokens} out=${final.usage.output_tokens}`
          );
          controller.close();
        } catch (error) {
          console.error(`[ai] ${feature} stream failed:`, describe(error));
          controller.enqueue(encoder.encode('\n\n_(Connection to the assistant dropped. Try again in a moment.)_'));
          controller.close();
        }
      },
      cancel() {
        stream.abort();
      },
    });
  }

  async structured<T>(input: StructuredInput<T>): Promise<T> {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (input.pdfBase64) {
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: input.pdfBase64 },
      });
    }
    content.push({ type: 'text', text: input.prompt });

    try {
      const response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: input.maxTokens ?? 16000,
        system: input.system,
        messages: [{ role: 'user', content }],
        output_config: { effort: input.effort ?? 'medium', format: betaZodOutputFormat(input.schema) },
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
      });

      if (response.stop_reason === 'refusal') throw new AiRefusalError();
      if (response.parsed_output == null) {
        throw new AiUnavailableError('The assistant returned something unreadable. Try again.');
      }
      console.info(
        `[ai] ${input.feature} user=${input.userId} in=${response.usage.input_tokens} out=${response.usage.output_tokens}`
      );
      return response.parsed_output as T;
    } catch (error) {
      if (error instanceof AiRefusalError || error instanceof AiUnavailableError) throw error;
      if (error instanceof Anthropic.RateLimitError) {
        throw new AiUnavailableError('The assistant is busy right now. Try again in a minute.');
      }
      if (error instanceof Anthropic.APIError) {
        console.error(`[ai] ${input.feature} failed (${error.status}):`, error.message);
        throw new AiUnavailableError('The assistant could not be reached. Try again shortly.');
      }
      throw error;
    }
  }
}

function toMessages(turns: StreamChatInput['messages'], pdfBase64?: string): Anthropic.Beta.BetaMessageParam[] {
  return turns.map((turn, index) => {
    const isLast = index === turns.length - 1;
    if (!pdfBase64 || !isLast || turn.role !== 'user') return { role: turn.role, content: turn.content };
    return {
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
        { type: 'text', text: turn.content },
      ],
    };
  });
}

function describe(error: unknown): string {
  if (error instanceof Anthropic.APIError) return `${error.status} ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}
