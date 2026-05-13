// The two text-only Gemini steps + the all-7 orchestrator. Server-only — only ever reached from
// Server Actions / Server Components. Both steps take an optional `client?: GenAiClient` (default
// `getGenAi()`) — that's the mock seam: tests inject a fake `{ models: { generateContent: vi.fn() } }`.
//
//   enhanceDescription   — polishes the owner's free-text description (text the owner reviews).
//   generateVariantCopy  — one persona variant: BASE_COPY_PROMPT + that persona block + the venue
//                          name/description → a JSON copy bundle. Gemini's structured-output config
//                          (`responseMimeType: 'application/json'` + `responseSchema`) makes
//                          JSON-shape failures effectively impossible — the SDK enforces shape.
//                          Content-level validation (`validateCopyBundle`: word counts, sentence
//                          counts, char limits — things JSON schema can't express) still runs, with
//                          ~2 retries on (validation failure | `variant` mismatch).
//   generateAllVariants  — the 7 variants, fanned out in parallel via Promise.all. The output is
//                          still in `allVisitorVariants()` order (Promise.all preserves input order
//                          regardless of completion order); `onProgress` fires as each variant
//                          settles, so the in-button "X / 7" still climbs monotonically — it just
//                          climbs in completion order, not in `allVisitorVariants()` order. Always
//                          returns length-7; the caller (lib/publish.ts) is all-or-nothing.
//
// Model: `gemini-2.5-flash-lite` — Google's lowest-latency structured-output-capable model
// (`responseSchema` / `responseMimeType: 'application/json'` so JSON-shape failures stay
// impossible). Billing is enabled on the key, so RPM/RPD ceilings no longer apply: there is no
// inter-call pacing and no rate-limit back-off scaffolding — calls fire back-to-back.

import {
  allVisitorVariants,
  parseCopyBundle,
  type CopyBundleResult,
  type VisitorType,
} from '@mizrahitality/contracts';
import { BASE_COPY_PROMPT, ENHANCE_DESCRIPTION_PROMPT, templateEntry } from '@/lib/templates';
import { COPY_MODEL, getGenAi, type GenAiClient } from './gemini';
import { COPY_BUNDLE_RESPONSE_SCHEMA } from './response-schema';

/** Thrown when no `GOOGLE_API_KEY` is configured and no test client was injected. */
export class AiNotConfiguredError extends Error {
  constructor(message = 'AI is not configured') {
    super(message);
    this.name = 'AiNotConfiguredError';
  }
}

/** Wraps an SDK / network failure. Messages are deliberately key-free. */
export class AiCallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiCallError';
  }
}

const ENHANCE_MAX_TOKENS = 1024;
const COPY_MAX_TOKENS = 1500; // a full bundle is well under ~1200 tokens
const DEFAULT_RETRIES = 2; // 1 + 2 = 3 tries total per variant

function wrapCallError(err: unknown): AiCallError {
  // Surface the real SDK failure in the server log — the action only returns a generic key-free
  // message to the client, so without this every "AI service is unavailable" looks identical.
  console.error('[ai/copy] Gemini call failed:', err);
  return new AiCallError(
    `AI request failed: ${err instanceof Error ? err.message : 'unknown error'}`,
  );
}

/**
 * Polish the owner's free-text description (text only — never the image). One non-streaming call;
 * no validation beyond non-empty (the owner reviews the result and accepts or keeps their own).
 */
export async function enhanceDescription(text: string, client?: GenAiClient): Promise<string> {
  const c = client ?? getGenAi();
  if (!c) throw new AiNotConfiguredError();
  try {
    const resp = await c.models.generateContent({
      model: COPY_MODEL,
      contents: text,
      config: {
        systemInstruction: ENHANCE_DESCRIPTION_PROMPT,
        maxOutputTokens: ENHANCE_MAX_TOKENS,
      },
    });
    const out = (resp.text ?? '').trim();
    if (out.length === 0) throw new AiCallError('AI returned an empty rewrite');
    return out;
  } catch (err) {
    if (err instanceof AiCallError) throw err;
    throw wrapCallError(err);
  }
}

/**
 * Generate + validate one audience's copy bundle. Returns a {@link CopyBundleResult}: `ok` after a
 * reply that parses, names the requested `variant`, and passes `validateCopyBundle`; otherwise
 * `{ ok:false, errors }` after `1 + retries` exhausted attempts (the retry turn appends the prior
 * errors and re-asks for corrected JSON only). A network / SDK failure throws `AiCallError`.
 */
export async function generateVariantCopy(
  args: { venueName: string; description: string; variant: VisitorType },
  opts?: { client?: GenAiClient; retries?: number },
): Promise<CopyBundleResult> {
  const c = opts?.client ?? getGenAi();
  if (!c) throw new AiNotConfiguredError();

  const entry = templateEntry(args.variant);
  const userText = `VENUE_NAME: ${args.venueName}\nVENUE_DESCRIPTION:\n${args.description}`;
  const maxTries = 1 + (opts?.retries ?? DEFAULT_RETRIES);
  let prevErrors: string[] = [];

  for (let attempt = 0; attempt < maxTries; attempt++) {
    const content =
      attempt === 0
        ? userText
        : `${userText}\n\nYOUR PREVIOUS REPLY FAILED VALIDATION:\n- ${prevErrors.join('\n- ')}\n\nReturn corrected JSON only — the exact shape from the output contract, nothing else.`;

    let result: CopyBundleResult;
    try {
      const resp = await c.models.generateContent({
        model: COPY_MODEL,
        contents: content,
        config: {
          systemInstruction: {
            parts: [{ text: BASE_COPY_PROMPT }, { text: entry.personaBlock }],
          },
          maxOutputTokens: COPY_MAX_TOKENS,
          responseMimeType: 'application/json',
          responseSchema: COPY_BUNDLE_RESPONSE_SCHEMA,
        },
      });
      result = parseCopyBundle(resp.text ?? '');
    } catch (err) {
      throw wrapCallError(err);
    }

    if (result.ok) {
      if (result.value.variant === args.variant) return result;
      prevErrors = [`variant must equal "${args.variant}"; got "${result.value.variant}"`];
    } else {
      prevErrors = result.errors;
    }
  }
  return { ok: false, errors: prevErrors };
}

/**
 * Generate all 7 variants in parallel — each call is independent (same enhanced source text, just
 * a different persona block), so there's no reason to serialise them. `Promise.all` returns
 * results in the input array's order, so the output stays in `allVisitorVariants()` order
 * regardless of completion order; the publish persistence layer iterates in that order. Always
 * returns length 7; `runPublishPipeline` (lib/publish.ts) decides all-or-nothing. `onProgress`
 * fires once per variant as it settles — `done` is incremented before the callback so the count
 * is always monotonic (JS is single-threaded; no race), but the *order* of `onProgress` calls
 * matches completion order, not variant order. The publish-job registry (lib/publish-jobs.ts)
 * relays `done`/`total` to the client for the in-button "X / 7" progress fill.
 */
export async function generateAllVariants(
  args: { venueName: string; description: string },
  opts?: {
    client?: GenAiClient;
    retries?: number;
    onProgress?: (
      done: number,
      total: number,
      variant: VisitorType,
      result: CopyBundleResult,
    ) => void;
  },
): Promise<{ variant: VisitorType; result: CopyBundleResult }[]> {
  const c = opts?.client ?? getGenAi();
  if (!c) throw new AiNotConfiguredError();

  const variants = allVisitorVariants();
  let done = 0;
  return await Promise.all(
    variants.map(async (variant) => {
      const result = await generateVariantCopy(
        { venueName: args.venueName, description: args.description, variant },
        { client: c, retries: opts?.retries },
      );
      done += 1;
      opts?.onProgress?.(done, variants.length, variant, result);
      return { variant, result };
    }),
  );
}
