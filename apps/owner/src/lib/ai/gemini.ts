// The Gemini client seam — the single place a `GoogleGenAI` instance is constructed, and the
// single mock seam for tests. Server-only: nothing client-side imports anything under lib/ai/.
//
// `GOOGLE_API_KEY` is optional (lib/env.ts) — the app boots without it. `getGenAi()` returns
// `null` when it's unset, and the callers (enhance / publish / regenerate) translate that `null`
// (or the equivalent `AiNotConfiguredError` from lib/ai/copy.ts) into a clear, key-free
// "set GOOGLE_API_KEY" message. The client is built lazily and memoised so a single process
// reuses one HTTP agent; tests call `__resetGenAiForTests()` after mutating the env.

import { GoogleGenAI } from '@google/genai';
import { env } from '@/lib/env';

/** The model used for both AI steps (description enhance + per-variant copy). */
export const COPY_MODEL = 'gemini-2.5-flash-lite';

let _client: GoogleGenAI | null | undefined; // undefined = not yet resolved; null = no key configured.

/** Is a Google AI Studio API key configured? Enhance & publish are gated on this. */
export function isAiConfigured(): boolean {
  return env.GOOGLE_API_KEY.length > 0;
}

/** The shared GoogleGenAI client, or `null` if no key is configured. The single mock seam. */
export function getGenAi(): GoogleGenAI | null {
  if (_client === undefined) {
    _client = isAiConfigured() ? new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY }) : null;
  }
  return _client;
}

/** Test helper: drop the memoised client so the next `getGenAi()` re-reads the env. */
export function __resetGenAiForTests(): void {
  _client = undefined;
}

/** Just enough of the SDK surface for the AI steps to depend on (and for tests to fake). */
export type GenAiClient = { models: Pick<GoogleGenAI['models'], 'generateContent'> };
