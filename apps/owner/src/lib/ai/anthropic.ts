// The Anthropic client seam — the single place an `Anthropic` instance is constructed, and the
// single mock seam for tests. Server-only: nothing client-side imports anything under lib/ai/.
//
// `ANTHROPIC_API_KEY` is optional (lib/env.ts) — the app boots without it. `getAnthropic()`
// returns `null` when it's unset, and the callers (enhance / publish / regenerate) translate that
// `null` (or the equivalent `AiNotConfiguredError` from lib/ai/copy.ts) into a clear, key-free
// "set ANTHROPIC_API_KEY" message. The client is built lazily and memoised so a single process
// reuses one HTTP agent; tests call `__resetAnthropicForTests()` after mutating the env.

import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';

/** The model used for both AI steps (description enhance + per-variant copy). */
export const COPY_MODEL = 'claude-sonnet-4-6';

let _client: Anthropic | null | undefined; // undefined = not yet resolved; null = no key configured.

/** Is an Anthropic API key configured? Enhance & publish are gated on this. */
export function isAiConfigured(): boolean {
  return env.ANTHROPIC_API_KEY.length > 0;
}

/** The shared Anthropic client, or `null` if no key is configured. The single mock seam. */
export function getAnthropic(): Anthropic | null {
  if (_client === undefined) {
    _client = isAiConfigured() ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
  }
  return _client;
}

/** Test helper: drop the memoised client so the next `getAnthropic()` re-reads the env. */
export function __resetAnthropicForTests(): void {
  _client = undefined;
}

/** Just enough of the SDK surface for the AI steps to depend on (and for tests to fake). */
export type MessagesClient = Pick<Anthropic, 'messages'>;
