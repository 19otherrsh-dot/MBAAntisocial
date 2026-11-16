import { z } from 'zod';
import { streamText, generateObject } from 'ai';
import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { requireModel, streamAsText } from '@/lib/ai';
import InterviewQuestion from '@/models/InterviewQuestion';
import { companyKeyOf } from '@/models/Application';
import {
  MENTOR_RUBRIC,
  ROLE_TRACKS,
  ROLE_TRACK_META,
  ROUND_TYPE_META,
  RATING_MIN,
  RATING_MAX,
} from '@/lib/constants';

/**
 * The AI mock interviewer.
 *
 * What makes this more than a chatbot with a persona is the grounding: when
 * the candidate names a company, the interviewer is handed the questions this
 * campus's own students were actually asked there, straight from the intel
 * bank. A national tool cannot do that — it has no idea what the panel asked
 * *here* — and it is the same loop as the rest of the product: what one batch
 * logs after a round is what the next one practises against.
 */

/**
 * Bounds on what reaches the model.
 *
 * The conversation is supplied by the client on every turn, so without a cap
 * the prompt — and the per-call cost — is whatever the caller decides to send.
 * Rate limiting alone does not fix that: forty calls with a megabyte of context
 * each is still a bill nobody authorised.
 */
const MAX_TURNS = 40;
const MAX_CHARS_PER_TURN = 4_000;
const MAX_TOTAL_CHARS = 24_000;
const MAX_GROUNDING_QUESTIONS = 8;
/** Answers needed before a scorecard means anything. */
const MIN_ANSWERS_FOR_DEBRIEF = 3;

const bodySchema = z
  .object({
    mode: z.enum(['interview', 'debrief']).default('interview'),
    track: z.enum(ROLE_TRACKS).default('general_management'),
    company: z.string().trim().max(120).default(''),
    messages: z
      .array(
        z.object({
          // Only these two roles. A client-supplied `system` turn would let the
          // caller rewrite the interviewer's instructions.
          role: z.enum(['user', 'assistant']),
          content: z.string().max(MAX_CHARS_PER_TURN, 'Keep each answer under a few paragraphs.'),
        })
      )
      .max(MAX_TURNS, 'That interview has run long. Start a fresh one to keep the questions sharp.'),
  })
  .refine(
    (body) => body.messages.reduce((sum, message) => sum + message.content.length, 0) <= MAX_TOTAL_CHARS,
    { message: 'That conversation is too long to continue. Start a fresh one.', path: ['messages'] }
  );

const debriefSchema = z.object({
  scores: z.object(
    Object.fromEntries(
      MENTOR_RUBRIC.map((criterion) => [criterion.key, z.number().int().min(RATING_MIN).max(RATING_MAX)])
    ) as Record<string, z.ZodNumber>
  ),
  strengths: z.array(z.string().max(240)).min(1).max(3),
  improvements: z.array(z.string().max(240)).min(1).max(3),
  verdict: z.string().max(400),
});

/** Real questions from this campus for the company, most useful first. */
async function loadGrounding(campus: string, company: string) {
  const key = company ? companyKeyOf(company) : '';
  if (!key) return [];
  return InterviewQuestion.find({ campus, companyKey: key, hiddenAt: { $exists: false } })
    .sort({ upvoteCount: -1, askedAt: -1 })
    .limit(MAX_GROUNDING_QUESTIONS)
    .select('question roundType difficulty')
    .lean();
}

export const POST = route({ body: bodySchema, rateLimit: 'ai' }, async ({ actor, body }) => {
  const model = requireModel();
  const trackLabel = ROLE_TRACK_META[body.track].label;
  const candidate = `${actor.name}, a ${actor.year === 2 ? 'second' : 'first'}-year MBA at ${actor.campus}`;
  const target = body.company ? `a ${trackLabel} role at ${body.company}` : `a ${trackLabel} role`;

  if (body.mode === 'debrief') {
    const answers = body.messages.filter((message) => message.role === 'user' && message.content.trim());
    if (answers.length < MIN_ANSWERS_FOR_DEBRIEF) {
      throw ApiError.unprocessable(
        `Answer at least ${MIN_ANSWERS_FOR_DEBRIEF} questions first — there is not enough here to score yet.`
      );
    }

    const transcript = body.messages
      .map((message) => `${message.role === 'user' ? 'CANDIDATE' : 'INTERVIEWER'}: ${message.content}`)
      .join('\n\n');

    try {
      const { object } = await generateObject({
        model,
        schema: debriefSchema,
        system: `You are an experienced alumni interviewer writing a debrief after a mock interview for ${target}. The candidate is ${candidate}.

Score the candidate from ${RATING_MIN} (weak) to ${RATING_MAX} (excellent) on each criterion:
${MENTOR_RUBRIC.map((criterion) => `- ${criterion.key}: ${criterion.label} — ${criterion.help}`).join('\n')}

Be honest and specific. Quote or point to what they actually said. Do not inflate scores to be kind: a 3 is a normal, respectable answer. "strengths" and "improvements" are short, concrete sentences the candidate can act on before a real interview. "verdict" is two sentences at most.`,
        prompt: `Transcript:\n\n${transcript}`,
      });
      return ok({ debrief: object, rubric: MENTOR_RUBRIC });
    } catch (error) {
      console.error('[ai] debrief failed:', error);
      throw new ApiError(502, 'ai_unavailable', 'Could not write the debrief. Try again in a moment.');
    }
  }

  const grounding = await loadGrounding(actor.campus, body.company);

  const groundingBlock =
    grounding.length > 0
      ? `
Candidates from ${actor.campus} were actually asked the questions below at ${body.company}. Treat them as your question bank: work through them in your own words, one at a time, adapting and following up as a real panel would. Do not read them out as a list and do not mention that you were given them.
${grounding
  .map((entry, index) => `${index + 1}. [${ROUND_TYPE_META[entry.roundType].label}, ${entry.difficulty}] ${entry.question}`)
  .join('\n')}
`
      : '';

  const system = `You are the "Antisocial MBA Bot", a sharp, slightly dry, and honest alumni interviewer.
You are running a mock interview for ${candidate}, who is preparing for ${target}.

Rules of engagement:
1. Do not spoon-feed answers. If the candidate struggles, push them to think harder before you help.
2. Be critical but constructive — a busy, high-performing professional giving up a weekend to help. Dry wit is welcome; contempt is not. Criticise the answer, never the person.
3. Stay in character.
4. Lead the interview. Open with one challenging question suited to the role. Ask one question at a time.
5. When an answer is good, say so briefly. When it is weak, say exactly what was missing.
6. Keep each reply under 150 words. This is a fast-paced conversation.
${groundingBlock}`;

  const result = streamText({
    model,
    system,
    // An empty history means "begin": the model needs one user turn to answer.
    messages:
      body.messages.length > 0
        ? body.messages
        : [{ role: 'user' as const, content: 'I am ready. Start the interview.' }],
    // Reported by `streamAsText`; this only stops the SDK logging it twice.
    onError: () => {},
  });

  return streamAsText(result, { 'X-Grounded-Questions': String(grounding.length) });
});
