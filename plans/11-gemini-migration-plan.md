# Replace Anthropic Claude with Google Gemini

## Context

The owner app's two publish-time AI steps currently call **Claude Sonnet 4.6** via `@anthropic-ai/sdk`, gated on `ANTHROPIC_API_KEY`. The user wants a **free** alternative with **maximum free-tier rate limits**, and has decided to swap to **Google Gemini 2.5 Flash-Lite** (free tier: ~15 RPM, ~1,000 RPD, ~250K TPM — comfortably more than the project needs at 8 calls per publish). The env var will be renamed to **`GOOGLE_API_KEY`** to match Gemini conventions.

Outcome: identical product behavior — `enhanceDescription` polishes the description, `generateAllVariants` produces 7 validated `CopyBundle` JSON blobs at publish — but driven by Gemini, paid for by Google's free tier, with no `@anthropic-ai/sdk` dependency left in the tree.

## Approach summary

1. **SDK swap.** Replace `@anthropic-ai/sdk` with `@google/genai` (the *new* official SDK — `GoogleGenAI` client, `ai.models.generateContent`). Not the legacy `@google/generative-ai`.
2. **Drop `cache_control`.** Gemini's free, implicit caching requires a prefix of **≥2,048 tokens**; the `BASE_COPY_PROMPT` (~2,500 chars ≈ ~600 tokens) doesn't clear the bar. Explicit caching has storage cost and a 60-minute TTL — not worth it for 8 calls per publish. Per-publish cost on the free tier is $0 either way; removing the API affordance simplifies the migration.
3. **Use Gemini's structured-output config** (`responseMimeType: 'application/json'` + `responseSchema`) on the variant call. This makes JSON-shape failures effectively impossible — schema-level validation moves to the SDK. We keep the existing **content-level validation** (`validateCopyBundle` from `@mizrahitality/contracts`: word counts, sentence counts, char limits — things JSON schema can't express) and the existing **retry-with-error-feedback loop** for those.
4. **Map system blocks to `systemInstruction`.** Gemini accepts `systemInstruction` as either a string or `{ parts: [...] }`. We pass both blocks (`BASE_COPY_PROMPT` + persona block) as two `parts` to preserve structure.
5. **Rename the env var** end-to-end: `ANTHROPIC_API_KEY` → `GOOGLE_API_KEY` in `lib/env.ts`, `.env.example`, every UI hint string, every error-message string, and inline comments.
6. **Rename the client module** `lib/ai/anthropic.ts` → `lib/ai/gemini.ts`. Keep `COPY_MODEL` as the exported constant name (value changes to `'gemini-2.5-flash-lite'`). Replace the `MessagesClient` test seam with a `GenAiClient` type (a thin `Pick` of the `@google/genai` client shape).
7. **Update tests** to fake the new `GenAiClient` shape. Test *behavior* is unchanged — same retry, mismatch, and not-configured cases.
8. **Update docs** (`CLAUDE.md`, `NOTES.md`, `README.md`) to replace "Anthropic Claude (Sonnet 4.6)" / `ANTHROPIC_API_KEY` references with the Gemini equivalents.

## Files to change

### New / replaced

- **`apps/owner/src/lib/ai/gemini.ts`** *(new — replaces `lib/ai/anthropic.ts`)*
  - Exports: `COPY_MODEL = 'gemini-2.5-flash-lite'`, `isAiConfigured()`, `getGenAi()`, `__resetGenAiForTests()`, `type GenAiClient`.
  - Lazy client: `_client = isAiConfigured() ? new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY }) : null`.
  - `GenAiClient` test seam: `{ models: Pick<GoogleGenAI['models'], 'generateContent'> }`.

- **`apps/owner/src/lib/ai/copy.ts`** *(rewrite of the call sites; same exports, same signatures)*
  - `enhanceDescription(text, client?)`:
    ```ts
    const resp = await c.models.generateContent({
      model: COPY_MODEL,
      contents: text,
      config: {
        systemInstruction: ENHANCE_DESCRIPTION_PROMPT,
        maxOutputTokens: ENHANCE_MAX_TOKENS, // 1024
      },
    });
    const out = (resp.text ?? '').trim();
    ```
  - `generateVariantCopy(args, opts?)`:
    ```ts
    const resp = await c.models.generateContent({
      model: COPY_MODEL,
      contents: content, // existing userText, with retry feedback appended
      config: {
        systemInstruction: {
          parts: [{ text: BASE_COPY_PROMPT }, { text: entry.personaBlock }],
        },
        maxOutputTokens: COPY_MAX_TOKENS, // 1500
        responseMimeType: 'application/json',
        responseSchema: COPY_BUNDLE_RESPONSE_SCHEMA, // new — see below
      },
    });
    const result = parseCopyBundle(resp.text ?? '');
    ```
  - Keep `AiNotConfiguredError`, `AiCallError`, the retry loop, the variant-mismatch check, and `generateAllVariants` (no API change; just `getGenAi()` instead of `getAnthropic()`).
  - Remove `extractText` (Gemini exposes `resp.text` directly).
  - Update the file header comment: drop the "ephemeral-cache prefix" paragraph; mention Gemini 2.5 Flash-Lite + structured output.

- **`apps/owner/src/lib/ai/response-schema.ts`** *(new — small)*
  - Exports `COPY_BUNDLE_RESPONSE_SCHEMA` — a Gemini-shaped JSON schema mirroring `CopyBundle` from `packages/contracts/src/copy.ts:12-46`. Properties: `variant` (enum of `VISITOR_TYPES`), `tagline`, `heroTrustPrimer`, `story` (object with `hook`, `detail`, `detailBullets` (array of string), `nudge`), `highlightStripLine`, `closingHeading`, `closingTrustLine`. All required; `propertyOrdering` matches the contract.
  - Kept separate from `gemini.ts` so the contract author doesn't have to know SDK shape.

### Edited

- **`apps/owner/src/lib/ai/index.ts`** — change `export * from './anthropic'` → `export * from './gemini'`. Re-export `GenAiClient` in place of `MessagesClient`.

- **`apps/owner/src/lib/env.ts:21`** — replace the `ANTHROPIC_API_KEY` line with `GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ?? ''`. Update the comment on line 19-20.

- **`apps/owner/.env.example:11-14`** — replace the Anthropic block with:
  ```
  # Optional. Set this (a Google AI Studio API key — https://aistudio.google.com) to enable the
  # publish-time AI steps — the description "Enhance with AI" button and Publish (which generates
  # 7 audience-tailored pages). The app runs without it; those features show a "not configured"
  # hint until it's set.
  GOOGLE_API_KEY=""
  ```

- **`apps/owner/package.json:18`** — remove `"@anthropic-ai/sdk": "^0.95.2"`; add `"@google/genai": "^2.2.0"` (latest stable as of the search; pin to current `^` range when running `pnpm add`).

- **`apps/owner/src/lib/publish.ts`**
  - Line 18: import from `./ai` — change `type MessagesClient` → `type GenAiClient`.
  - Line 30: update `AI_NOT_CONFIGURED_MESSAGE` to reference `GOOGLE_API_KEY`.
  - Line 34: `opts?: { client?: GenAiClient; retries?: number }`.

- **`apps/owner/src/lib/builder-actions.ts`**
  - Line 266: `'AI is not configured — set GOOGLE_API_KEY to use this.'`.
  - Line 284: same swap.
  - Line 306: `'AI is not configured — set GOOGLE_API_KEY.'`.

- **`apps/owner/src/components/builder/publish-section.tsx:56-57`** — replace `ANTHROPIC_API_KEY` with `GOOGLE_API_KEY` in the hint text.

- **`apps/owner/src/components/builder/builder-form.tsx:140`** — replace `ANTHROPIC_API_KEY` with `GOOGLE_API_KEY` in the hint text.

- **`apps/owner/src/__tests__/ai-copy.test.ts`** — rewrite the fakes:
  - Replace `type FakeCreateParams` with a Gemini-shaped param type (`{ model, contents, config: { systemInstruction, ... } }`).
  - `FakeResp` becomes `{ text: string }` — Gemini's `generateContent` returns an object whose `.text` is the joined text (a getter on the real SDK; in fakes, just a string property is fine because we only read it).
  - `fakeClient()` returns `{ models: { generateContent: vi.fn(...) } }`.
  - `personaVariant` reads `params.config.systemInstruction.parts[1].text` (the persona block) instead of `params.system[1].text`.
  - `delete process.env.ANTHROPIC_API_KEY` → `delete process.env.GOOGLE_API_KEY` (two call sites).
  - `__resetAnthropicForTests` import → `__resetGenAiForTests`.
  - All test *cases* stay the same: enhance success, enhance empty reply, retry-with-feedback, give-up-after-N, generate-all-7, not-configured guards.

- **`apps/owner/src/__tests__/publish.integration.test.ts`** *(only the test-fake shape if it builds its own client; otherwise just the import name)* — same kind of swap.

### Docs (project memory — keep coherent)

- **`CLAUDE.md`**
  - "Tech stack → AI": replace the Claude Sonnet 4.6 + `cache_control` paragraph with Gemini 2.5 Flash-Lite via `@google/genai`, `responseMimeType: 'application/json'` + `responseSchema`, no caching.
  - "Build / run / test": replace mentions of `ANTHROPIC_API_KEY` with `GOOGLE_API_KEY`.
  - "Conventions → owner-app routes": replace the `claude-api skill` line (already says there isn't one) and the `Anthropic client` mention with the Gemini equivalents.
  - The feature-history paragraph for #4 mentions "Anthropic / Claude" — leave that prose as-is (it's a historical record of what *landed*), but add a parenthetical at the end of the paragraph noting the post-#9 swap. *(Optional — the user can decide.)*

- **`NOTES.md`** — find/replace `ANTHROPIC_API_KEY` → `GOOGLE_API_KEY`; replace any "Claude Sonnet 4.6" with "Gemini 2.5 Flash-Lite".

- **`README.md`** — same find/replace; update any "Get an Anthropic key" copy to point at https://aistudio.google.com.

### Files that do NOT change

- `packages/contracts/src/copy.ts` — `CopyBundle` shape, `validateCopyBundle`, `parseCopyBundle`, `SLOT_SCHEMA_VERSION` all stay as-is. Persisted variants on disk stay readable.
- `apps/owner/src/lib/templates.ts` — `BASE_COPY_PROMPT`, `ENHANCE_DESCRIPTION_PROMPT`, persona blocks, `templateEntry` all stay.
- `apps/owner/src/lib/page-variant.ts` — `parsePageVariantContent` unchanged.
- `apps/owner/src/components/published-page/*` and the customer app — no path here touches AI.
- `scripts/seed.mjs` and `scripts/seed-data/*` — the seed never called the live AI; nothing to do.
- Prisma schema and migrations — unchanged.

## Reuse / what to lean on

- `validateCopyBundle` (`packages/contracts/src/copy.ts:106-247`) and `parseCopyBundle` (same file, ~line 255) — the structural validators stay in the loop. Gemini's `responseSchema` constrains shape; these enforce content rules (word counts, sentence counts) that JSON schema can't.
- `templateEntry(variant)` (`apps/owner/src/lib/templates.ts:261-304`) — used unchanged to look up the persona block per variant.
- `allVisitorVariants()` / `VISITOR_TYPES` (`@mizrahitality/contracts`) — feeds both the orchestrator order and the `variant` enum in the new response schema.
- `runPublishPipeline` (`apps/owner/src/lib/publish.ts:32-115`) — keep its all-or-nothing transaction unchanged; it sees only the typed seam.

## What we lose vs. the current design

- **Prompt caching.** Currently `BASE_COPY_PROMPT` is `cache_control: ephemeral` across all 7 variant calls. On the free tier this saved money on Anthropic — Gemini's free tier already has no cost, and the prefix doesn't meet the 2,048-token implicit-caching threshold. Net effect: zero — but worth naming so the design intent is documented.
- **`claude-sonnet-4-6` prose quality.** Flash-Lite is a smaller model. For "polish prose" and "fill structured JSON template" the difference is small; `validateCopyBundle` will catch egregious drift. Mitigation if it bites: bump to `gemini-2.5-flash` (change one constant in `lib/ai/gemini.ts`).

## Verification

After implementation, in order:

1. **Static checks**
   ```
   pnpm --filter mizrahitality-owner typecheck
   pnpm --filter mizrahitality-owner lint
   ```
   Both must pass cleanly.

2. **Unit + integration tests**
   ```
   pnpm --filter mizrahitality-owner test
   ```
   Specifically watch `ai-copy.test.ts` (the rewritten fakes) and `publish.integration.test.ts` (the publish pipeline against the typed seam).

3. **No-key path — runs without any external call**
   - Leave `GOOGLE_API_KEY=""` in `apps/owner/.env`.
   - `pnpm --filter mizrahitality-owner dev`, sign in, open `/builder`.
   - Verify: "Enhance with AI" disabled with the new `GOOGLE_API_KEY` hint; Publish disabled with the new hint; the rest of the app works.
   - `pnpm seed && pnpm --filter mizrahitality-owner dev`, open `/dashboard` and `/preview` — confirm the seeded demo still renders end-to-end (no AI involved).

4. **Live key path — the actual swap**
   - Get a key at https://aistudio.google.com → "Get API key" → copy.
   - Put it in `apps/owner/.env` as `GOOGLE_API_KEY=...`. Restart `pnpm dev` (env is read at module load).
   - In `/builder`: write a short description, click **Enhance with AI** — verify a polished suggestion comes back.
   - Click **Publish** — verify the action returns success and 7 `PageVariant` rows appear (check at `/preview?type=male-18-30`, `/preview?type=female-50+`, etc., or via `pnpm db:studio`).
   - Visit `/preview` and 6 typed variants via `?type=...` — every page should render with the new Gemini-authored copy.
   - Visit the customer site at `http://localhost:5112/<your-slug>` — confirm SSR renders the new copy and analytics events still flow (no customer-app change, but worth a smoke test).

5. **Dependency check**
   ```
   pnpm --filter mizrahitality-owner why @anthropic-ai/sdk
   ```
   Should report "not found".

6. **No regressions in unrelated tests** — full `pnpm test` clean across all packages.

## Risk notes

- **`@google/genai` is the *new* SDK** (named `@google/genai`, not `@google/generative-ai`). The older package is deprecated and uses a different shape (`GoogleGenerativeAI` + `getGenerativeModel()`). Make sure `pnpm add` picks the right one.
- **`responseSchema` shape.** The new SDK accepts standard JSON Schema via `responseJsonSchema` *or* the older Google `Schema` shape via `responseSchema`. Both work on `gemini-2.5-flash-lite`. We use the simpler `responseSchema` form (it's well-documented and avoids a `zod-to-json-schema` dep). If a complexity error surfaces at runtime, flatten optional fields per Google's guidance.
- **Free-tier RPM = ~15.** A back-to-back publish (8 calls in ~10 seconds) fits comfortably; running two publishes in the same minute could rate-limit. The existing retry loop won't recover from 429s — *if* it bites, add a small per-call backoff. Not preemptively building it.
- **The `text` getter.** In the real `@google/genai` SDK, `response.text` is a getter on a complex response object; in tests we fake it as a plain string property. Both work because we only read it.
