// The two text-only Claude steps + the all-7 orchestrator. Server-only — only ever reached from
// Server Actions / Server Components. Both steps take an optional `client?: MessagesClient` (default
// `getAnthropic()`) — that's the mock seam: tests inject a fake `{ messages: { create: vi.fn() } }`.
//
//   enhanceDescription   — polishes the owner's free-text description (text the owner reviews).
//   generateVariantCopy  — one persona variant: BASE_COPY_PROMPT + that persona block + the venue
//                          name/description → a JSON copy bundle, parsed + structurally validated
//                          deterministically (no second LLM call to route text), with ~2 retries
//                          on (JSON parse failure | `variant` mismatch | validation failure).
//   generateAllVariants  — the 7 variants, sequentially in allVisitorVariants() order so the
//                          BASE_COPY_PROMPT ephemeral-cache prefix stays warm across the batch.
//                          Always returns length-7; the caller (lib/publish.ts) is all-or-nothing.
//
// Prompt-caching: only the BASE_COPY_PROMPT system block is `cache_control: { type: 'ephemeral' }`
// — it's identical across all 7 calls and well over the 1024-token minimum; the persona block and
// the venue data are small and left uncached (tagging them would just churn cache entries).

import type Anthropic from '@anthropic-ai/sdk';
import {
  allVisitorVariants,
  parseCopyBundle,
  type CopyBundleResult,
  type VisitorType,
} from '@mizrahitality/contracts';
import { BASE_COPY_PROMPT, ENHANCE_DESCRIPTION_PROMPT, templateEntry } from '@/lib/templates';
import { COPY_MODEL, getAnthropic, type MessagesClient } from './anthropic';

/** Thrown when no `ANTHROPIC_API_KEY` is configured and no test client was injected. */
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

/** Concatenate the text of every `type:'text'` content block of a non-streaming Messages reply. */
function extractText(resp: Anthropic.Message): string {
  let out = '';
  for (const block of resp.content) {
    if (block.type === 'text') out += block.text;
  }
  return out.trim();
}

function wrapCallError(err: unknown): AiCallError {
  return new AiCallError(
    `AI request failed: ${err instanceof Error ? err.message : 'unknown error'}`,
  );
}

/**
 * Polish the owner's free-text description (text only — never the image). One non-streaming call;
 * no validation beyond non-empty (the owner reviews the result and accepts or keeps their own).
 */
export async function enhanceDescription(text: string, client?: MessagesClient): Promise<string> {
  const c = client ?? getAnthropic();
  if (!c) throw new AiNotConfiguredError();
  try {
    const resp = await c.messages.create({
      model: COPY_MODEL,
      max_tokens: ENHANCE_MAX_TOKENS,
      system: [
        { type: 'text', text: ENHANCE_DESCRIPTION_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: text }],
    });
    const out = extractText(resp);
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
  opts?: { client?: MessagesClient; retries?: number },
): Promise<CopyBundleResult> {
  const c = opts?.client ?? getAnthropic();
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
      const resp = await c.messages.create({
        model: COPY_MODEL,
        max_tokens: COPY_MAX_TOKENS,
        system: [
          { type: 'text', text: BASE_COPY_PROMPT, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: entry.personaBlock },
        ],
        messages: [{ role: 'user', content }],
      });
      result = parseCopyBundle(extractText(resp));
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
 * Generate all 7 variants, sequentially in `allVisitorVariants()` order. Always returns length 7;
 * `runPublishPipeline` (lib/publish.ts) decides all-or-nothing. `onProgress` is wired for logs /
 * the seed — the Server-Action transport can't stream it mid-action, so the UI shows a generic
 * pending state.
 */
export async function generateAllVariants(
  args: { venueName: string; description: string },
  opts?: {
    client?: MessagesClient;
    retries?: number;
    onProgress?: (done: number, total: number, variant: VisitorType) => void;
  },
): Promise<{ variant: VisitorType; result: CopyBundleResult }[]> {
  const c = opts?.client ?? getAnthropic();
  if (!c) throw new AiNotConfiguredError();

  const variants = allVisitorVariants();
  const out: { variant: VisitorType; result: CopyBundleResult }[] = [];
  for (const variant of variants) {
    const result = await generateVariantCopy(
      { venueName: args.venueName, description: args.description, variant },
      { client: c, retries: opts?.retries },
    );
    out.push({ variant, result });
    opts?.onProgress?.(out.length, variants.length, variant);
  }
  return out;
}
