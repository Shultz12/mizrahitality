# Plan 04 — ai-copy-and-variants

Build step #4 of the master plan (`plans/00-master-plan.md`). Source of truth for *what/why*: `VISION.md` + `PRD.md`. Cross-cutting decisions every feature inherits: `NOTES.md` → "Foundation decisions" — referenced, not restated.

> **First execution step:** copy this plan to `plans/04-ai-copy-and-variants-plan.md` (so `plans/` lists in build order), then implement from there.

---

## 1. Context

**Why this feature.** Site-builder (#3) gave the owner their three inputs (name → derived slug, free-text description, one image) and a publish *skeleton*: `Venue.publishState` (`'draft' | 'publishing' | 'published'`) / `slugLockedAt` / `publishedAt`, and an empty `PageVariant` model (`venueId`, `visitorType`, `content Json`, `@@unique([venueId, visitorType])`, `@@index([venueId])`) that is created but never written. `publishAction()` is currently a `void` Server Action that just flips `publishState` to `'published'`, sets `publishedAt`, freezes `slugLockedAt`, `redirect()`s, and has a `// TODO(feature #4 ai-copy-and-variants): generate + structurally validate the 7 PageVariant rows here…`. The product promise — *AI writes the copy and tailors it per audience* (VISION; PRD REQ-5, REQ-6) — is the missing half. Feature #4 delivers it: the two text-only Claude steps, ending in 7 stored, validated copy bundles at publish.

**What it builds:** (1) an **enhance** action that polishes the owner's free-text description (owner accepts the suggestion or keeps their own — non-destructive); (2) at publish, for each of the 7 visitor variants, an **author-into-template** Claude call that turns the approved description into a structured "copy bundle" JSON following the supplied shared base prompt + that variant's persona block, **deterministic code-side parsing** of the reply into the populated slots (no second LLM call to route text), **structural + length validation** against the slot schema, and storing the 7 results as `PageVariant.content` blobs — **all-or-nothing**, with retries. It adds the **copy-bundle schema + validator** to `@mizrahitality/contracts`, a templates/copy-rules registry inside the owner app, an `@anthropic-ai/sdk` dependency, the Anthropic client + AI-step module, the rewritten stateful `publishAction`, an `enhanceDescriptionAction`, a per-variant `regenerateVariantAction`, and the builder UI hooks (an "Enhance with AI" panel, a `<PublishSection>`, a read-only "Generated pages" list). It does **not** build the 5-zone page render components — those are #5 (`published-page-ssr`). It unblocks #5 (renders the stored variants) and #6 (serves them over the API).

**Intended outcome:** a signed-in owner with a saved venue + a real `ANTHROPIC_API_KEY` clicks "Enhance with AI" → reviews/accepts polished copy → clicks **Publish** → after ~tens of seconds the venue is `published` with **7 `PageVariant` rows**, each holding a per-audience copy bundle that passed structural validation; a failed generation changes nothing (a failed re-publish leaves the previously-published page intact). A reviewer *without* a key sees the whole owner app working, the Enhance/Publish affordances disabled with a clear hint, and the full test suite green (it mocks the client).

**Supplied assets — all in hand**, under `plans/`:
- `plans/copy-rules/_BASE-PROMPT.md` — the shared half of the publish-time prompt; pins the **copy-bundle JSON contract exactly** (the output shape + the per-field constraints).
- `plans/copy-rules/_TEMPLATE-STYLING.md` — the hardcoded 5-zone map + which copy field lands in which zone + the **per-variant body-typography table** + the persona labels.
- The 7 persona files — `plans/copy-rules/{Male,Female}_{18-30,31-50,50_Plus}_Rules.md` + `Neutral_Default_Rules.md`; each has a `<!-- variant: X -->` marker, a `Set "variant": "X" in your reply.` line, and per-zone tone direction.
- `plans/site-design/DESIGN.md` (the "Warm Minimalist System" tokens/scale), `plans/site-design/code.html` (a Tailwind-v3-CDN reference page with the 5-zone layout and `[placeholders]`), `plans/landing-page/Mizrahitality_Landing_Page_Blueprint.md` (the 5-zone conversion structure with its length constraints). These last three are reference material for **#5's renderer**; #4 only records the body-typography rows in its registry.

These files **stay in `plans/`** as the human-readable source of truth; #4 transcribes the two prompt halves (`_BASE-PROMPT.md` + the 7 `*_Rules.md`) into a typed TS module in the owner app (see §2.2).

**Decisions pinned with the user (2026-05-12):**
- **Scope = data layer only** — the copy-bundle/slot schema in contracts; a templates/copy-rules registry the AI step consumes; the two Claude steps; deterministic code-side parsing of the AI's JSON into populated slots; structural+length validation against the slot schema; the publish gate (blocks unless all 7 generate and validate); per-variant review + regenerate; storing the 7 `PageVariant.content` blobs at publish. The per-audience React render (the 5-zone page from `code.html`/`DESIGN.md`, translated to Tailwind v4) is **#5**; #4 leaves `PageVariant.content` in a shape #5/#8 can render directly.
- **Publish failure handling = stateful action + retry, all-or-nothing.** `publishAction` becomes a `useActionState`-style action: sets `publishState='publishing'`, generates all 7 with ~2 retries per variant on (JSON parse failure | `variant` mismatch | structural/length validation failure), and only commits transactionally (replace the venue's `PageVariant` rows + set `publishState='published'`, `publishedAt`, `slugLockedAt = existing ?? now`) if all 7 validate. On any failure: do **not** touch existing variants or the published state — revert `publishState` to its prior value — and report which variants failed and why.
- **`ANTHROPIC_API_KEY` stays optional in `lib/env.ts`** (app boots without it). Enhance & publish are gated on `isAiConfigured()`; when unset they return a clear `"set ANTHROPIC_API_KEY…"` message, no state change, no crash. `.env.example` keeps the empty value with a note. Tests mock the Anthropic client.
- **Block publish when the description is empty** — `validateVenueDescription` still allows an empty description to be *saved*, but Publish returns `"Write a venue description before publishing."` if `venue.description.trim()` is empty.
- **Per-variant regenerate is included** (`regenerateVariantAction` — re-validates before swapping), alongside full Re-publish.
- **Validation bounds are lenient by design** — the blueprint's *hard* rules are enforced exactly (tagline 10–20 words; `detailBullets` `[]` or 3–4; story = 3 non-empty paragraphs, hook 2–3 sentences, nudge 1–2); everything else gets generous char caps so a good-faith Claude reply passes first try.
- The `claude-api` skill referenced in `CLAUDE.md` **does not exist on disk** — proceed with `@anthropic-ai/sdk` directly (Messages API, `cache_control: { type: 'ephemeral' }` for prompt caching). Model id: `claude-sonnet-4-6`.

---

## 2. Scope

### 2.1 Contracts additions — `@mizrahitality/contracts`

New file `packages/contracts/src/copy.ts`, re-exported from `index.ts`. Zero runtime deps — types, plain constants, pure functions only (the package already ships `allVisitorVariants()` / `isVisitorType()` — pure functions are fine). Tests in `packages/contracts/src/copy.test.ts`.

- **`SLOT_SCHEMA_VERSION = 1 as const`** — versions the copy-bundle/slot contract and the stored `PageVariant.content` blob; bump if the bundle shape changes (lets #5/#9 detect stale stored content).
- **`CopyStory` / `CopyBundle`** — the exact `_BASE-PROMPT.md` output contract:
  ```ts
  export interface CopyStory {
    hook: string;            // Zone 2 ¶1 — 2–3 sentences; acknowledges this audience's desires
    detail: string;          // Zone 2 ¶2 prose — what makes the venue special
    detailBullets: string[]; // [] or 3–4 short bullet points (inside ¶2)
    nudge: string;           // Zone 2 ¶3 — 1–2 sentences; emotional appeal to act
  }
  export interface CopyBundle {
    variant: VisitorType;       // must equal the persona block's variant id
    tagline: string;            // Zone 1 H2 — strictly 10–20 words; the audience's "Dream Outcome"
    heroTrustPrimer: string;    // micro-copy under the hero "Book Now" (friction-reducer)
    story: CopyStory;           // Zone 2 — exactly 3 paragraphs
    highlightStripLine: string; // Zone 3 highlight band — one punchy line
    closingHeading: string;     // Zone 4 H3 above the closing "Book Now"
    closingTrustLine: string;   // micro-copy under the closing "Book Now"
  }
  ```
- **`COPY_BUNDLE_CONSTRAINTS`** — a frozen constant with every length/word/count rule, concrete numbers chosen **lenient** (hard rules exact, the rest generous):
  ```ts
  export const COPY_BUNDLE_CONSTRAINTS = {
    schemaVersion: SLOT_SCHEMA_VERSION,
    tagline:         { minWords: 10, maxWords: 20, maxChars: 200 },          // blueprint hard rule: "strictly 10–20 words"
    heroTrustPrimer: { minChars: 1, maxChars: 120 },
    story: {
      hook:   { minChars: 20, maxChars: 600, minSentences: 2, maxSentences: 3 },  // "2–3 sentences"
      detail: { minChars: 40, maxChars: 1400 },
      nudge:  { minChars: 15, maxChars: 400, minSentences: 1, maxSentences: 2 },   // "1–2 sentences"
      detailBullets: { allowEmpty: true, minItems: 3, maxItems: 4, itemMinChars: 1, itemMaxChars: 160 }, // "[] or 3–4"
    },
    highlightStripLine: { minChars: 8, maxChars: 200 },
    closingHeading:     { minChars: 3, maxChars: 80 },
    closingTrustLine:   { minChars: 1, maxChars: 120 },
  } as const;
  ```
  - The story `minChars` enforce "exactly three paragraphs" (all non-empty). `detailBullets` length must be `0` **or** in `[3,4]`. H1 = the venue name (owner input, already `^[A-Za-z]+( [A-Za-z]+)*$` / 1–60 chars in `lib/validation.ts`) — *not* in the bundle; `validateCopyBundle` never sees the name. Doc-comment the leniency principle: "these bounds catch overflow/underfill and structural breaks; they are deliberately wider than the persona guidance so a good-faith reply passes on the first try — tighten only if real generations consistently overflow."
- Private pure helpers in `copy.ts`: `countWords(s)` = `s.trim().split(/\s+/).filter(Boolean).length`; `countSentences(s)` = matches of `/[.!?]+(\s|$)/` on the trimmed string, floored at 1 for a non-empty string with no terminal punctuation. Crude but deterministic — for catching gross violations, not grading prose.
- **`type CopyBundleResult = { ok: true; value: CopyBundle } | { ok: false; errors: string[] }`.**
- **`validateCopyBundle(value: unknown): CopyBundleResult`** — pure, zero-dep. (a) `value` is a plain object; (b) `variant` satisfies `isVisitorType` (else a specific error); (c) every top-level string field present & a string, `story` a plain object, `story.hook/detail/nudge` strings, `story.detailBullets` an array of strings — each miss → a specific message; (d) the `COPY_BUNDLE_CONSTRAINTS` length/word/count rules, each violation a useful message (`'tagline must be 10–20 words; got 7'`, `'story.hook must be 2–3 sentences; got 1'`, `'story.detailBullets must be empty or have 3–4 items; got 2'`, `'story.detailBullets[1] is too long (max 160 characters)'`, …). **Collect all errors** (don't bail on the first — the retry nudge wants the full list). On success: `.trim()` the ends of every string field and each bullet (drop a bullet only if that still leaves a valid count — if trimming would make the count invalid, that's an error), then return `{ ok: true, value }` with the trimmed `CopyBundle`. (No internal-whitespace normalisation; the base prompt already forbids markdown/HTML/emoji.)
- **`parseCopyBundle(rawText: string): CopyBundleResult`** — defensive: strip a leading/trailing ```` ```json ```` / ```` ``` ```` fence if present; if the trimmed text doesn't start with `{`, take the substring from the first `{` to the last `}` (missing either → `{ ok: false, errors: ['reply did not contain a JSON object'] }`); `JSON.parse` in a try/catch (`SyntaxError` → `{ ok: false, errors: ['reply was not valid JSON: …'] }`); then `return validateCopyBundle(parsed)`.
- **`index.ts`** — add `export * from './copy';`.
- **Decision — what goes in contracts vs. owner-internal:** `CopyBundle` / `CopyStory` / `COPY_BUNDLE_CONSTRAINTS` / `SLOT_SCHEMA_VERSION` / `CopyBundleResult` / `validateCopyBundle` / `parseCopyBundle` → **contracts** (the shared copy-bundle/slot contract — #5 and #6 need the type and the validator). The *wrapper* stored in `PageVariant.content` — `PageVariantContent = { schemaVersion: typeof SLOT_SCHEMA_VERSION; copy: CopyBundle }` — stays **owner-internal** (`apps/owner/src/lib/page-variant.ts`), plus a tiny `parsePageVariantContent(value: unknown)` helper there (checks `schemaVersion === SLOT_SCHEMA_VERSION` then `validateCopyBundle(value.copy)`). Rationale: the master plan reserves the *rendered-page DTO* for #5 — that DTO folds in the image URL + body-typography + the fixed strings; #5 should shape it with the renderer in hand. The image lives on `Venue` (not in the bundle — all 7 variants share it); body-typography is static per variant id (looked up at render). So #4 stores only `{ schemaVersion, copy }`.

### 2.2 The templates / copy-rules registry — `apps/owner/src/lib/templates.ts` (new)

**Decision: transcribe the supplied prompt assets into a typed TS module** (not `fs`-read from `plans/` or a copied dir). `apps/owner` already makes one cwd assumption (`lib/uploads.ts`); reading `plans/copy-rules/*.md` would add a second one pointing *outside* the app — fragile across `next dev` / `build` / `start` / Vitest, and Next's output-tracing doesn't reliably pick up non-imported files. The prompt text is small (~3 KB base + 7 × ~1 KB persona blocks) — as string literals it's bundled, typechecked, importable from a Server Action, and mockable. The `plans/copy-rules/*.md` files **stay** as the source of truth; `templates.ts` carries a header comment: *"Verbatim transcription of `plans/copy-rules/_BASE-PROMPT.md` + the 7 `*_Rules.md` persona blocks + the body-typography rows from `_TEMPLATE-STYLING.md`. Edit the `plans/` files first, then re-sync here. Tests assert every `VisitorType` has an entry and each persona block keeps its `<!-- variant: X -->` marker."* (Trade-off: the literals can drift from `plans/`; mitigation is the coverage test + low stakes.)

Module shape:
```ts
import type { VisitorType } from '@mizrahitality/contracts';

/** Verbatim copy of plans/copy-rules/_BASE-PROMPT.md (the shared half of the publish prompt). */
export const BASE_COPY_PROMPT: string = `…`;

export interface VariantTypography { bodyFontSizePx: number; bodyLineHeight: number }
export interface TemplateEntry {
  variant: VisitorType;     // matches the persona file's <!-- variant: X --> marker
  personaLabel: string;     // e.g. "Male, 18–30 — Digital-Native Pragmatist"
  personaBlock: string;     // verbatim copy of the matching plans/copy-rules/*_Rules.md
  typography: VariantTypography;  // from _TEMPLATE-STYLING.md — consumed at render time (#5)
}
export const TEMPLATE_REGISTRY: Readonly<Record<VisitorType, TemplateEntry>> = { … } as const;
export function allTemplateEntries(): TemplateEntry[];  // in allVisitorVariants() order
export function templateEntry(variant: VisitorType): TemplateEntry;  // total — VisitorType is closed

/** The small enhance-step prompt — NOT in the supplied files; authored here. */
export const ENHANCE_DESCRIPTION_PROMPT: string = `You are an editor for Mizrahitality, a tool that turns a hospitality venue into one landing page. You receive the owner's rough, free-text description of their venue. Rewrite it into clear, warm, hype-free prose: tighten it, fix grammar and flow, keep it in plain English. Hard rules: (1) use ONLY facts present in the input — never invent amenities, locations, distances, prices, hours, awards, ratings, reviews, or numbers; if the input is thin, write tighter, don't pad; (2) plain text out — no Markdown, no headings, no bullet lists, no emoji; (3) don't add a title or the venue's name as a heading; (4) keep it roughly the same length or shorter (a few short paragraphs at most). Reply with ONLY the rewritten description text — nothing before it, nothing after it.`;
```

Body-typography picks (the concrete value within each `_TEMPLATE-STYLING.md` range, respecting the 16px mobile minimum): `male-18-30` → 16/1.5; `male-31-50` → 17/1.5; `male-50+` → 18/1.7; `female-18-30` → 16/1.5; `female-31-50` → 17/1.5; `female-50+` → 18/1.7; `neutral` → 18/1.5. `personaLabel`s from `_TEMPLATE-STYLING.md`'s table. `personaBlock` = the verbatim contents of each `*_Rules.md` (keep its `<!-- variant: X -->` line and `Set "variant": "X"…` instruction — so as the 2nd `system` block it reminds Claude of the exact id). Map: `male-18-30 ← Male_18-30_Rules.md`, `male-31-50 ← Male_31-50_Rules.md`, `male-50+ ← Male_50_Plus_Rules.md`, `female-18-30 ← Female_18-30_Rules.md`, `female-31-50 ← Female_31-50_Rules.md`, `female-50+ ← Female_50_Plus_Rules.md`, `neutral ← Neutral_Default_Rules.md`.

**Composition note (`_BASE-PROMPT.md` says "venue NAME + DESCRIPTION as the user turn"):** our Messages-API mapping is `system = [{type:'text', text: BASE_COPY_PROMPT, cache_control:{type:'ephemeral'}}, {type:'text', text: personaBlock}]`, `messages = [{role:'user', content: "VENUE_NAME: <name>\nVENUE_DESCRIPTION:\n<description>"}]` — same three pieces, same order, just base+persona moved into `system` blocks so the base is a cacheable prefix and the persona is the varying tail. Recorded in `templates.ts`'s header comment and in NOTES.md.

### 2.3 The Anthropic client + the two AI steps — `apps/owner/src/lib/ai/` (new)

`lib/ai/anthropic.ts` (the client seam) + `lib/ai/copy.ts` (the steps + the all-7 orchestrator) + `lib/ai/index.ts` (re-exports). Server-only — only ever reached from Server Actions / Server Components; nothing client-side imports it.

**`lib/ai/anthropic.ts`:**
```ts
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';
export const COPY_MODEL = 'claude-sonnet-4-6';
let _client: Anthropic | null | undefined;                       // undefined = unresolved
export function isAiConfigured(): boolean { return env.ANTHROPIC_API_KEY.length > 0; }
export function getAnthropic(): Anthropic | null {               // the single mock seam
  if (_client === undefined) _client = isAiConfigured() ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
  return _client;
}
export function __resetAnthropicForTests(): void { _client = undefined; }
export type MessagesClient = Pick<Anthropic, 'messages'>;        // just enough of the SDK to mock
```

**`lib/ai/copy.ts`:**
- `class AiNotConfiguredError extends Error` and `class AiCallError extends Error` (wraps SDK/network failures; messages stay key-free).
- private `extractText(resp): string` — concat the `text` of all `type:'text'` content blocks of a non-streaming Messages response, then `.trim()`.
- **`enhanceDescription(text: string, client?: MessagesClient): Promise<string>`** — `const c = client ?? getAnthropic(); if (!c) throw new AiNotConfiguredError();` → one `c.messages.create({ model: COPY_MODEL, max_tokens: 1024, system: [{ type:'text', text: ENHANCE_DESCRIPTION_PROMPT, cache_control:{ type:'ephemeral' } }], messages: [{ role:'user', content: text }] })` in a try/catch (failures → `AiCallError`) → `return extractText(resp)`; empty after trim → `throw new AiCallError('AI returned an empty rewrite')`. Non-streaming; no validation beyond non-empty (it's text the owner reviews).
- **`generateVariantCopy({ venueName, description, variant }, opts?: { client?: MessagesClient; retries?: number }): Promise<CopyBundleResult>`** — `const c = opts?.client ?? getAnthropic(); if (!c) throw new AiNotConfiguredError();`; `const entry = templateEntry(variant);`; `system = [{ type:'text', text: BASE_COPY_PROMPT, cache_control:{ type:'ephemeral' } }, { type:'text', text: entry.personaBlock }]`; `userText = \`VENUE_NAME: ${venueName}\nVENUE_DESCRIPTION:\n${description}\``. Loop `1 + (opts?.retries ?? 2)` tries: build `messages = [{ role:'user', content: attempt === 0 ? userText : userText + '\n\nYOUR PREVIOUS REPLY FAILED VALIDATION:\n- ' + prevErrors.join('\n- ') + '\n\nReturn corrected JSON only — the exact shape from the output contract, nothing else.' }]`; `resp = await c.messages.create({ model: COPY_MODEL, max_tokens: 1500, system, messages })` (try/catch → `AiCallError`); `result = parseCopyBundle(extractText(resp))`; if `result.ok` **and** `result.value.variant === variant` → return it (else treat the mismatch as a validation failure with `errors = ['variant must equal "<variant>"; got "<got>"']` and continue); if not ok → `prevErrors = result.errors` and loop. After exhaustion → `return { ok: false, errors: prevErrors }`. (`max_tokens` 1500: a full bundle is well under ~1200 tokens.)
- **`generateAllVariants({ venueName, description }, opts?: { client?: MessagesClient; retries?: number; onProgress?: (done, total, variant) => void }): Promise<{ variant: VisitorType; result: CopyBundleResult }[]>`** — guard `const c = opts?.client ?? getAnthropic(); if (!c) throw new AiNotConfiguredError();`; then **sequentially**, in `allVisitorVariants()` order, call `generateVariantCopy({ venueName, description, variant }, { client: c, retries: opts?.retries })`, push `{ variant, result }`, call `opts?.onProgress?.(out.length, 7, variant)`. Sequential (not parallel) because the `BASE_COPY_PROMPT` `system` prefix (~3 KB, well over the 1024-token cache minimum) is identical across all 7 calls — running them back-to-back keeps the ephemeral cache warm (5-min TTL spans a 7-call batch easily), avoids a burst of 7 concurrent requests / rate-limit pressure, and gives deterministic progress. The `personaBlock` and the venue data are **not** cache-tagged (small; tagging them just churns cache entries). Returns always-length-7; the **caller** (`runPublishPipeline`) decides all-or-nothing. (`onProgress` is wired but the Server-Action transport can't stream it mid-action — it's there for logs / the seed; the UI shows a generic "Generating…" pending state.)
- `lib/ai/index.ts` re-exports `isAiConfigured`, `getAnthropic`, `__resetAnthropicForTests`, `enhanceDescription`, `generateVariantCopy`, `generateAllVariants`, `AiNotConfiguredError`, `AiCallError`, `COPY_MODEL`, `MessagesClient`.

**Mock seam:** the generation functions take an optional `client` and default to `getAnthropic()`. Tests inject a fake `MessagesClient` (`{ messages: { create: vi.fn(async () => fakeResp) } }`). `publishAction` can't take a client arg (it's a `'use server'` form action), so it delegates to a plain (non-`'use server'`) `runPublishPipeline(owner, opts?: { client?: MessagesClient })` — the integration test calls *that* with a fake client + a real DB owner row.

### 2.4 `publishAction` rewrite + `enhanceDescriptionAction` + `regenerateVariantAction` — `apps/owner/src/lib/builder-actions.ts`

**`publishAction`** — replace the `void` action with a stateful `useActionState` action. Types:
```ts
export type PublishState = {
  ok?: boolean;                                              // true after a successful (re-)publish
  error?: string;                                            // AI not configured / no venue / empty description / unexpected
  variantErrors?: { variant: VisitorType; errors: string[] }[]; // per-variant generation errors when publish failed mid-generation
};
export async function publishAction(_prev: PublishState, _formData: FormData): Promise<PublishState> {
  return runPublishPipeline(await requireOwner());
}
```
**`runPublishPipeline(owner: OwnerWithVenue, opts?: { client?: MessagesClient }): Promise<PublishState>`** — the state machine:
1. `if (!owner.venue) return { error: 'Create your venue before publishing.' };`  `const venue = owner.venue;`
2. `if (!isAiConfigured() && !opts?.client) return { error: 'AI is not configured — set ANTHROPIC_API_KEY to publish.' };` — **no state change**. (A passed `client` counts as configured — for tests.)
3. `if (venue.description.trim().length === 0) return { error: 'Write a venue description before publishing.' };` — **no state change**. *(Pinned: block on empty description.)*
4. `const priorState = venue.publishState === 'publishing' ? 'draft' : venue.publishState;` (revert target — `'draft'` first publish, `'published'` re-publish, defensively `'draft'` if a prior attempt crashed at `'publishing'`).
5. **Mark in-flight:** `await prisma.venue.update({ where:{id:venue.id}, data:{ publishState:'publishing' } });` — a separate non-transactional write (the "I'm working" flag; a crash here leaves `'publishing'` which the next publish reverts / a re-publish overwrites). Existing `PageVariant` rows untouched — a re-publish keeps serving the old page until commit.
6. **Generate:** `let results; try { results = await generateAllVariants({ venueName: venue.name, description: venue.description }, { client: opts?.client }); } catch (err) { await revert(); return err instanceof AiNotConfiguredError ? { error: 'AI is not configured — set ANTHROPIC_API_KEY to publish.' } : { error: 'The AI service is unavailable right now — please try again in a minute.' }; }` — `revert()` = `prisma.venue.update({ where:{id:venue.id}, data:{ publishState: priorState } }).catch(()=>{})` (never throw out of the catch).
7. **Validate the set:** `const failures = results.filter(r => !r.result.ok); if (failures.length) { await revert(); return { variantErrors: failures.map(f => ({ variant: f.variant, errors: f.result.ok ? [] : f.result.errors })), error: \`Couldn't generate ${failures.length} of 7 audience pages — please try again. Nothing was changed.\` }; }` — `PageVariant` rows / `publishedAt` / `slugLockedAt` untouched.
8. **Commit (transactional, all-or-nothing):**
   ```ts
   const now = new Date();
   await prisma.$transaction(async (tx) => {
     await tx.pageVariant.deleteMany({ where: { venueId: venue.id } });
     for (const { variant, result } of results) {
       if (!result.ok) throw new Error('unreachable');
       await tx.pageVariant.create({ data: {
         venueId: venue.id, visitorType: variant,
         content: { schemaVersion: SLOT_SCHEMA_VERSION, copy: result.value } as Prisma.InputJsonValue,
       }});
     }
     await tx.venue.update({ where:{id:venue.id}, data:{ publishState:'published', publishedAt: now, slugLockedAt: venue.slugLockedAt ?? now } });
   });
   ```
   (Explicit 7-row loop inside `$transaction` rather than `createMany` — `Json` columns are awkward with `createMany`; 7 rows is fine. `deleteMany`-then-create inside the transaction is the safe replace: a rolled-back commit leaves the *old* 7 rows intact — the "failed re-publish leaves the live page intact" requirement.) If the transaction throws → `await revert(); return { error: 'Saving the generated pages failed — please try again.' };`
9. On success: `revalidatePath('/dashboard');`  `return { ok: true };` — **no `redirect`** (the `<PublishSection>` shows "✓ Published…" and `router.refresh()`es the builder Server Component). `redirect()` is not used here, so the redirect-outside-try/catch rule is moot.

Also: delete the old `// TODO(feature #4 …)` comment; update `builder-actions.ts`'s header comment to mention the publish pipeline + the AI steps.

**`enhanceDescriptionAction(text: string): Promise<{ ok: true; enhanced: string } | { ok: false; error: string }>`** — `'use server'`, called *directly* from a client component (takes an arg, returns data, mutates nothing). `await requireOwner();` (signed-in gate; no venue required — works pre-create). `if (!isAiConfigured()) return { ok:false, error:'AI is not configured — set ANTHROPIC_API_KEY to use this.' };` `const trimmed = text.trim(); if (!trimmed) return { ok:false, error:'Write a few words first, then enhance.' }; if (trimmed.length > VENUE_DESCRIPTION_MAX_LENGTH) return { ok:false, error:\`Description is too long (max ${VENUE_DESCRIPTION_MAX_LENGTH} characters).\` };` `try { return { ok:true, enhanced: await enhanceDescription(trimmed) }; } catch (err) { return { ok:false, error: err instanceof AiNotConfiguredError ? 'AI is not configured — set ANTHROPIC_API_KEY to use this.' : 'The AI service is unavailable right now — please try again.' }; }`. **Persists nothing** — accept/reject is client-side; the owner still clicks "Save changes" (→ `saveVenueAction` → `validateVenueDescription`) to persist.

**`regenerateVariantAction(visitorType: string): Promise<{ ok: true } | { ok: false; error: string; errors?: string[] }>`** — `'use server'`, called directly from `<RegenerateButton>`. `const owner = await requireOwner(); if (!owner.venue) return { ok:false, error:'Create your venue first.' }; if (owner.venue.publishState !== 'published') return { ok:false, error:'Publish first — then you can regenerate individual pages.' }; if (!isVisitorType(visitorType)) return { ok:false, error:'Unknown audience.' }; if (!isAiConfigured()) return { ok:false, error:'AI is not configured — set ANTHROPIC_API_KEY.' };` then `let result; try { result = await generateVariantCopy({ venueName: owner.venue.name, description: owner.venue.description, variant: visitorType }); } catch { return { ok:false, error:'The AI service is unavailable right now — please try again.' }; } if (!result.ok) return { ok:false, error:'The regenerated copy failed validation — please try again.', errors: result.errors };` then `await prisma.pageVariant.update({ where:{ venueId_visitorType:{ venueId: owner.venue.id, visitorType } }, data:{ content:{ schemaVersion: SLOT_SCHEMA_VERSION, copy: result.value } as Prisma.InputJsonValue } }).catch(() => { throw … });` — wrap a `P2025` (row missing) into `{ ok:false, error:'That page is missing — re-publish to regenerate all of them.' }`; `revalidatePath('/builder'); revalidatePath('/dashboard'); return { ok: true };`. (Re-validates before the swap — the master-plan caveat. Operates only on a published venue.)

### 2.5 UI changes

- **`apps/owner/src/components/builder/builder-form.tsx`** (modify) — new prop `aiConfigured: boolean`. Make the description `<Textarea>` controlled (a `description` state seeded from `state.values?.description ?? venue?.description ?? ''`, keep `name="description"` so it still posts) — consistent with the existing local `typedName`. Below it: a `<Button type="button" variant="outline" size="sm" disabled={!aiConfigured || enhancing || description.trim().length === 0}>{enhancing ? 'Enhancing…' : 'Enhance with AI'}</Button>`; when `!aiConfigured`, a `<p className="text-xs text-muted-foreground">Set ANTHROPIC_API_KEY to use AI enhancement.</p>`. On click: `startTransition(async () => { const r = await enhanceDescriptionAction(description); if (r.ok) setSuggestion(r.enhanced); else setEnhanceError(r.error); })`. When `suggestion != null`: a bordered panel showing the suggested text (`whitespace-pre-wrap`) + **"Use this"** (`setDescription(suggestion); setSuggestion(null)` — populates the textarea client-side; owner still clicks Save) + **"Keep mine"** (`setSuggestion(null)` — dismiss; original untouched). `enhanceError` → `<p role="alert" className="text-sm text-destructive">`. Existing submit / `router.refresh()` unchanged.
- **`apps/owner/src/components/builder/publish-section.tsx`** (new, `'use client'`) — replaces the inline `<form action={publishAction}>` in `builder/page.tsx`. Props `{ hasVenue: boolean; aiConfigured: boolean; published: boolean; hasDescription: boolean }`. `const [state, formAction, pending] = useActionState(publishAction, {} as PublishState); const router = useRouter(); useEffect(() => { if (state.ok) router.refresh(); }, [state.ok, router]);`. Render `<form action={formAction}><Button type="submit" disabled={!hasVenue || !aiConfigured || pending}>{pending ? 'Generating 7 audience pages…' : (published ? 'Re-publish' : 'Publish')}</Button></form>` plus, below: `!hasVenue` → "Save your venue first."; `!aiConfigured` → "Publishing generates 7 audience-tailored pages with AI — set ANTHROPIC_API_KEY in apps/owner/.env to enable it."; `aiConfigured && !hasDescription` → "Write a venue description first — that's what the AI tailors."; `pending` → `<p role="status">Writing copy for each audience — this takes a moment…</p>`; `state.ok` → `<p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm">✓ Published — 7 audience-tailored pages generated.</p>`; `state.variantErrors?.length` → `<p role="alert" className="text-sm text-destructive">Couldn't generate {n} of 7 pages:</p>` + a `<ul>` of `{templateEntry(variant).personaLabel}: {errors.join('; ')}` + "Nothing was changed — your previous page (if any) is still live."; else `state.error` → `<p role="alert">{state.error}</p>`.
- **`apps/owner/src/components/builder/generated-pages.tsx`** (new, Server Component) — props `{ variants: { visitorType: string; content: unknown; updatedAt: Date }[]; published: boolean }`. A `Card` "Generated pages": `variants.length === 0` → "No audience pages yet — click Publish to generate them." Else, for each variant from `allVisitorVariants()` in order: `templateEntry(variant).personaLabel`; run `parsePageVariantContent(row.content)` → show the bundle's `tagline` (the most representative one-liner) + a small "valid" mark, or "(stored content is unreadable — re-publish to regenerate)" on a parse failure, or "(missing — re-publish)" if no row; when `published`, a `<RegenerateButton visitorType={variant} />`.
- **`apps/owner/src/components/builder/regenerate-button.tsx`** (new, `'use client'`) — a tiny button: `useTransition` + `await regenerateVariantAction(visitorType)` + `router.refresh()` on `ok`; "Regenerating…" while pending; an inline `<p role="alert">` on error.
- **`apps/owner/src/app/(authed)/builder/page.tsx`** (modify) — `import { isAiConfigured } from '@/lib/ai';`. After `requireOwner()`, load the venue *with variants*: `const venue = owner.venue ? await prisma.venue.findUnique({ where:{ id: owner.venue.id }, include:{ variants: true } }) : null;`. Pass `venue` (the form & preview don't need `variants`) to `<BuilderForm venue={venue} aiConfigured={isAiConfigured()} />` and `<VenuePreview venue={venue} />`; replace the inline publish `<form>` block with `<PublishSection hasVenue={!!venue} aiConfigured={isAiConfigured()} published={venue?.publishState === 'published'} hasDescription={!!venue && venue.description.trim().length > 0} />`; add `<GeneratedPages variants={venue?.variants ?? []} published={venue?.publishState === 'published'} />` below it. Remove the now-dead `searchParams.published` banner (the stateful action shows "✓ Published…" inline; the `?published=1` redirect is gone) and drop the `searchParams` param.
- **`apps/owner/src/components/builder/venue-preview.tsx`** (modify, minor) — change the "your AI-generated, audience-tailored page arrives with feature #4" note to e.g. "This is a plain preview of your inputs. When you Publish, AI writes a tailored version of this copy for each audience; the public page (feature #5) renders the full design."
- **`apps/owner/src/app/(authed)/dashboard/page.tsx`** — **unchanged** (it's `requireOwner()`-driven; `revalidatePath('/dashboard')` from publish flips `Status:` to `published` on the next load). (Adding a "7 pages generated" line would need `include: { variants: true }` there — out of scope; trivial follow-up.)

No-JS limitation carries over (known, from #2/#3): the publish `<form action>` posts without JS, but `useActionState`'s returned `variantErrors` / "✓ Published" and the Enhance panel need hydration.

### 2.6 `lib/auth.ts` — no change

`requireOwner()` stays as is (`include: { venue: true }`, returns `OwnerWithVenue = Owner & { venue: Venue | null }`). Only the builder page needs `variants`, and only after publish — it does one extra scoped `findUnique` rather than widening the hot `resolveOwnerByToken` to load 7 JSON blobs on every authed page render.

### 2.7 Schema changes — none

`PageVariant` (with `content Json`, `@@unique([venueId, visitorType])`, `@@index([venueId])`) already exists from #3; the publish-lifecycle fields (`publishState` / `publishedAt` / `slugLockedAt`) already exist on `Venue`. The `content` shape is now pinned **in code** (owner-internal `PageVariantContent = { schemaVersion: 1; copy: CopyBundle }`; `CopyBundle` + validator in contracts) — Prisma still sees `Json`; the schema version lives inside the blob (`SLOT_SCHEMA_VERSION`), not as a column. → **No Prisma migration, no `update-database` run, no `apps/owner/prisma/CHANGELOG.md` entry.** (Considered and rejected: a `Venue.variantsGeneratedFrom…` column to power a "your draft is ahead of your published page" hint — not needed by any #4 requirement; a column means a migration for marginal value. If wanted later, it's a small follow-up.)

### 2.8 Dependency + env + `.env.example`

- **`apps/owner/package.json`** — add `"@anthropic-ai/sdk"` to `dependencies` (latest stable that `pnpm add @anthropic-ai/sdk` resolves; the Messages API + `cache_control: { type:'ephemeral' }` are long-stable; the SDK ships its own types). `pnpm install` updates the lockfile. Not a workspace package — `transpilePackages` doesn't apply. Server-only — only imported under `lib/ai/`.
- **`apps/owner/src/lib/env.ts`** — keep `ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? ''` (still **optional**); replace the `// TODO(feature #4 …)` comment with: `// Optional — the app boots without it; enhance & publish are gated on isAiConfigured() and return a clear "set ANTHROPIC_API_KEY" message when empty.`
- **`apps/owner/.env.example`** — keep `ANTHROPIC_API_KEY=""`; update the comment to: `# Optional. Set this (an Anthropic API key) to enable the publish-time AI steps — the description "Enhance with AI" button and Publish (which generates 7 audience-tailored pages). The app runs without it; those features show a "not configured" hint until it's set.`
- **`apps/owner/vitest.config.ts`** — no change needed (`ANTHROPIC_API_KEY` stays optional, so `env` doesn't throw without it). The "happy path" tests set `process.env.ANTHROPIC_API_KEY = 'test-key'` + call `__resetAnthropicForTests()` *and* inject a fake `client` (the gate passes; no network); the "not configured" test does `delete process.env.ANTHROPIC_API_KEY; __resetAnthropicForTests();` first.

### 2.9 Tests

- **`packages/contracts/src/copy.test.ts`** (pure) — `validateCopyBundle`: a fully-valid bundle (tagline 12 words, hook 2 sentences, nudge 1, `detailBullets: []`) → `ok`; valid with `detailBullets` of length 3 and 4 → `ok`; each violation → `{ ok:false }` with a field-naming message: tagline 7 words / 25 words / >200 chars; `detailBullets` length 1, 2, 5 → fail; missing `tagline`; `story` not an object; `story.hook` empty; `story.hook` a 1-sentence fragment; `story.nudge` a 3-sentence run; `variant:'alien'`; `variant:'male-99'`; a 200-char bullet; a non-object (string / array / null); assert *all* violations reported when several apply (errors length > 1). `parseCopyBundle`: a bare valid JSON object → `ok`; the same in a ```` ```json ``` ```` fence → `ok`; the same with leading prose → `ok`; `"not json"` → `{ ok:false }`; `'{"foo":1}'` → `{ ok:false }` (structural errors); `'{ bad json'` → `{ ok:false }`. Plus `SLOT_SCHEMA_VERSION === 1` and `COPY_BUNDLE_CONSTRAINTS.schemaVersion === SLOT_SCHEMA_VERSION`.
- **`apps/owner/src/__tests__/templates.test.ts`** (pure) — `allTemplateEntries()` length 7; `TEMPLATE_REGISTRY` keys (as a set) equal `allVisitorVariants()` and `templateEntry(v)` is defined for every `v`; each entry's `personaBlock` contains `` `<!-- variant: ${entry.variant} -->` `` and the literal `Set "variant": "${entry.variant}"`; `BASE_COPY_PROMPT` non-empty and contains `"variant"` + `"detailBullets"` (smoke check the output contract survived transcription); `ENHANCE_DESCRIPTION_PROMPT` non-empty; every `typography.bodyFontSizePx >= 16`.
- **`apps/owner/src/__tests__/ai-copy.test.ts`** (mocked client, no DB, no network) — a fake `MessagesClient` whose `messages.create` returns canned `{ content:[{ type:'text', text: JSON.stringify(bundle) }] }`. `enhanceDescription('rough', fakeClient)` → trimmed text; empty reply → throws `AiCallError`. `generateVariantCopy({ venueName:'Blue Lagoon', description:'…', variant:'male-18-30' }, { client: fakeClient })` → `{ ok:true }` with `value.variant === 'male-18-30'`. Retry path: garbage on call 1, valid on call 2 → `ok` after 2 calls, and call 2's `messages[0].content` includes "FAILED VALIDATION". Exhaustion: always-garbage → `{ ok:false, errors:[...] }` after `1 + retries` calls. `generateAllVariants({...}, { client: fakeClient })` → length 7, all `result.ok`, 7 calls in `allVisitorVariants()` order (the fake reads `system[1].text` to echo back the matching `variant`). Not-configured: `getAnthropic()` → `null` (no key, no client) → throws `AiNotConfiguredError`.
- **`apps/owner/src/__tests__/publish.integration.test.ts`** (temp SQLite via `vitest.global-setup.ts`, which already provisions `page_variants`) — exercises `runPublishPipeline(owner, { client })` with a fake `MessagesClient` + a real `Owner` + `Venue` row (`publishState:'draft'`, a stock image, a non-empty description). **All-7-valid → published:** `{ ok:true }`; `pageVariant.findMany({ where:{venueId} })` has 7 rows, `visitorType` set == `allVisitorVariants()`, each `content` `parsePageVariantContent`s to `{ schemaVersion:1, copy:{ variant:<matching>, … } }`; `venue.publishState === 'published'`, `publishedAt` & `slugLockedAt` set (equal on a first publish). **One variant invalid twice → fails, nothing committed:** a fake that returns garbage for `female-31-50` always, valid for the other 6, `retries:1` → `{ variantErrors:[{ variant:'female-31-50', errors:[…] }], error:… }`; `pageVariant.count({ where:{venueId} }) === 0`; `venue.publishState` back to `'draft'`, `publishedAt` null. **Re-publish failure leaves the old page intact:** publish once (7 rows, `published`), then re-publish with a one-variant-failing fake → fails; the original 7 rows untouched; `publishState` back to `'published'`. **Empty description → blocked:** a venue with `description:''` → `runPublishPipeline` → `{ error:'Write a venue description before publishing.' }`, no state change, 0 rows. **AI-not-configured → blocked:** `delete process.env.ANTHROPIC_API_KEY; __resetAnthropicForTests();` then `runPublishPipeline(owner)` (no client) → `{ error:'AI is not configured — set ANTHROPIC_API_KEY to publish.' }`, no state change. `afterEach`: `deleteMany` on `pageVariant` / `session` / `venue` / `owner` (matching `builder.integration.test.ts`).

(Server Actions stay thin — `publishAction` / `enhanceDescriptionAction` / `regenerateVariantAction` are `'use server'` wrappers exercised by the manual click-through, same as `auth-actions.ts` / the existing `builder-actions.ts` actions; the integration test targets `runPublishPipeline`, the unit test targets the AI steps directly.)

### 2.10 Doc upkeep (part of this feature)

- **`NOTES.md`** — "Build order": tick row #4 `ai-copy-and-variants ✅` (+ `plans/04-ai-copy-and-variants-plan.md`). "Open / pending": replace the "#4 next" expectations with a "landed" note recording the resolved decisions (see §7). "Foundation decisions": amend the `ANTHROPIC_API_KEY` placeholder note ("a placeholder until #4" → "optional; enhance & publish gated on it"); optionally append to the contracts-surface bullet that `copy.ts` (the `CopyBundle` + constraints + validator) landed in #4. Note: **the `claude-api` skill referenced in `CLAUDE.md` doesn't exist on disk — #4 uses `@anthropic-ai/sdk` directly.**
- **`CLAUDE.md`** — extend the "Landed so far" blurb with feature #4. In the **"AI:"** tech-stack bullet, **replace "See the `claude-api` skill."** with "Use `@anthropic-ai/sdk` directly (Messages API, `cache_control: { type: 'ephemeral' }` for prompt caching); there is no `claude-api` skill on disk." In "Owner side:" architecture, after "The 7 page variants are generated eagerly at publish and stored" add "(as `PageVariant.content = { schemaVersion, copy }` blobs; the copy bundle's shape + validator live in `@mizrahitality/contracts` (`copy.ts`))". In "Conventions" → "Owner-app routes": note `lib/builder-actions.ts` now has the stateful `publishAction` (generates+validates the 7 variants, all-or-nothing, with retries), `enhanceDescriptionAction`, `regenerateVariantAction`; AI lives in `lib/ai/` (lazily-constructed Anthropic client + the two steps); the prompt assets are transcribed in `lib/templates.ts`; `ANTHROPIC_API_KEY` is optional (the app boots without it).
- **`README.md`** — status blurb: add feature #4 (AI description enhancement + audience-tailored variant generation at publish). The Anthropic-key line: change "not needed to run the skeleton" → "not needed to install/build/run/test the app, but needed to use 'Enhance with AI' and to Publish (which generates the 7 audience-tailored pages)."
- **`apps/owner/prisma/CHANGELOG.md`** — **no new entry** (no migration).
- **`packages/contracts`** has no changelog — `copy.ts`'s header comment is its documentation. `apps/owner/src/lib/templates.ts`'s header records the `_BASE-PROMPT.md` "user-turn" composition vs. our `system`-blocks structure.
- Copy this plan to `plans/04-ai-copy-and-variants-plan.md`.

---

## 3. Out of scope

- **No 5-zone React render components** — #4 is the data layer; the per-audience page render (translating `code.html` / `DESIGN.md` to Tailwind v4) is #5; the customer-side render is #8.
- **No rendered-page DTO in contracts** — #4 adds the *copy bundle* (`CopyBundle` + constraints + validator); the *rendered-page* DTO (image URL + body-typography + fixed strings folded in) is #5's. `PageVariant.content` stays the owner-internal `{ schemaVersion, copy }` wrapper.
- **No second LLM call to route text into slots** — the AI emits the structured copy bundle; code deterministically parses + validates it.
- **No AI at request time** — generation is eager at publish; #5/#6 read precomputed `PageVariant.content`.
- **AI never touches the image, layout, styling, or templates** — text only; the Image slot is the owner's `Venue.imageKind`/`imageValue`, untouched; the per-variant body-typography is the supplied `_TEMPLATE-STYLING.md` data.
- **No Prisma migration** — the schema is unchanged from #3.
- **No "alien"/extra visitor type** — exactly the 7 from `allVisitorVariants()`.
- **`ANTHROPIC_API_KEY` is not made required** — it stays optional; the rest of the app works without it.
- **No live AI in tests or in the seed** — tests mock the client; #9's seed will use canned JSON (out of scope here — just don't preclude it).
- **No analytics / dashboard / customer-site work** — #6/#7/#8.
- **No "draft is ahead of published" hint** / no tracking of which description the current variants came from — deliberately not added (would need a column → a migration).
- **No no-JS fallback** for the publish-result panel / Enhance panel — known limitation, carried from #2/#3.
- **No streaming progress** — the publish button shows a generic "Generating…" state, not a live "3/7" counter (the Server-Action transport can't stream it).

---

## 4. Dependencies

- *Build-order:* feature #3 (site-builder) — landed (the `Venue` content columns + the publish skeleton + the empty `PageVariant` model).
- *Supplied assets — all in hand:* `plans/copy-rules/_BASE-PROMPT.md`, `plans/copy-rules/_TEMPLATE-STYLING.md`, the 7 `plans/copy-rules/{Male,Female}_{18-30,31-50,50_Plus}_Rules.md` + `Neutral_Default_Rules.md`, `plans/site-design/DESIGN.md`, `plans/site-design/code.html`, `plans/landing-page/Mizrahitality_Landing_Page_Blueprint.md`. #4 transcribes the two prompt halves into `lib/templates.ts`; the design/blueprint/`code.html` are #5's renderer reference (and #4 records the body-typography rows).
- *External:* an `ANTHROPIC_API_KEY` (Anthropic Console) is needed to *use* enhance/publish — **not** to install, build, lint, typecheck, run, or test the app (gated; tests mock).
- *New npm deps:* **`@anthropic-ai/sdk`** in `apps/owner` (server-only; ships its own types). Nothing else — the contracts package stays zero-runtime-dep (the validator is hand-written, no `zod`).

---

## 5. Contracts additions

`packages/contracts/src/copy.ts` (re-exported from `index.ts`): `SLOT_SCHEMA_VERSION = 1 as const`; `CopyStory` / `CopyBundle` interfaces (the exact `_BASE-PROMPT.md` output contract); `COPY_BUNDLE_CONSTRAINTS` (frozen — every length/word/count rule, lenient concrete numbers); `type CopyBundleResult = { ok: true; value: CopyBundle } | { ok: false; errors: string[] }`; `validateCopyBundle(value: unknown): CopyBundleResult` (pure, zero-dep, collects all errors, trims string fields on success); `parseCopyBundle(rawText: string): CopyBundleResult` (defensive JSON extraction → `validateCopyBundle`). Private pure helpers `countWords` / `countSentences`. The owner-internal `PageVariantContent = { schemaVersion: typeof SLOT_SCHEMA_VERSION; copy: CopyBundle }` wrapper + a `parsePageVariantContent` helper live in `apps/owner/src/lib/page-variant.ts`, **not** contracts.

---

## 6. PRD requirements satisfied

- **REQ-5** (AI description enhancement) — `enhanceDescriptionAction` + `enhanceDescription`: rewrites the owner's free-text description (text only); the owner sees the suggestion and clicks "Use this" (populates the textarea; still Saves) or "Keep mine" (dismiss; original untouched) — non-destructive.
- **REQ-6** (AI audience-targeted templates) — `generateAllVariants` produces the 7 copy bundles (one per `VisitorType`) following `BASE_COPY_PROMPT` + each persona block; deterministic code parses each reply into the populated bundle and structurally validates it against `COPY_BUNDLE_CONSTRAINTS` (the slot schema); the owner's chosen image fills the Image slot deterministically (stays on `Venue`, AI never sees it); the 7 are stored as `PageVariant.content`; `publishAction` is the publish gate (blocks unless all 7 generate and validate); the owner reviews per type (the "Generated pages" list) and regenerates (`regenerateVariantAction`, re-validates before swapping); no AI call in the serve path. *(Note: "all 7 render distinctly" / "the neutral one is coherent" is fully visible only with #5's renderer + a real key — #4 stores correct, validated, per-persona-distinct copy bundles, the data-layer half of REQ-6.)*
- **REQ-12** (edit and re-publish) — *partial*: re-publishing regenerates the whole variant set (all-or-nothing); a failed re-publish leaves the previously-published page intact; per-variant regenerate replaces one row. (Editing inputs/image persists via #3's `saveVenueAction`; "re-publish updates what the API serves" fully lands once #6's API exists.)
- **REQ-11** (friendly owner UI) — *partial*: the Enhance panel + the publish section + the generated-pages list in plain Tailwind + shadcn with clear states (disabled + hint when AI isn't configured / no description; "Generating…" pending; "✓ Published — 7 pages"; a per-variant error list); refined when supplied owner-UI designs land.
- **REQ-7** (SSR published page) — *not* delivered by #4 (it's #5); #4 leaves `PageVariant.content` in a shape #5 can render directly.

---

## 7. Open questions to pin (resolved)

- **Concrete slot schema** = the `CopyBundle` shape from `_BASE-PROMPT.md` + the `COPY_BUNDLE_CONSTRAINTS` numbers in §2.1 — blueprint hard rules exact (tagline 10–20 words; `detailBullets` `[]` or 3–4; story = 3 non-empty paragraphs, hook 2–3 sentences, nudge 1–2), everything else generous char caps. **Lenient by design** so a good-faith Claude reply passes first try. *(Confirmed with the user.)*
- **Copy-rules format the author step consumes** = the verbatim persona blocks (`plans/copy-rules/*_Rules.md`) transcribed into `lib/templates.ts`'s `TEMPLATE_REGISTRY`, sent as the 2nd `system` text block; the 1st `system` block is `BASE_COPY_PROMPT` (verbatim `_BASE-PROMPT.md`), `cache_control: ephemeral`.
- **Where the prompt assets live** = transcribed into `apps/owner/src/lib/templates.ts` (not `fs`-read); `plans/copy-rules/` stays the human source of truth; a test asserts coverage.
- **Prompt-caching strategy** = cache the `BASE_COPY_PROMPT` system block (`{ type: 'ephemeral' }`); persona block + venue data uncached; the 7 publish calls run **sequentially** in `allVisitorVariants()` order so the ephemeral cache stays warm across the batch.
- **Validation/regenerate retry behaviour** = ~2 retries per variant (3 tries total) on (JSON parse failure | `variant` ≠ requested | structural/length validation failure); the retry prompt appends the prior errors and re-asks for corrected JSON only. After exhaustion the variant's result is `{ ok: false, errors }` and publish fails all-or-nothing.
- **How variants are stored** = `PageVariant` rows (one per visitor type, `@@unique([venueId, visitorType])`), `content` = the JSON blob `{ schemaVersion: 1, copy: CopyBundle }`; published transactionally as `deleteMany` then re-create the 7 then `venue.update`.
- **`PageVariant.content` DTO — contracts or owner-internal?** = `CopyBundle` + constraints + validator in **contracts**; the `{ schemaVersion, copy }` wrapper **owner-internal** (the rendered-page DTO is #5's).
- **Publish failure handling** = stateful `useActionState` action, `publishState:'publishing'` while in flight, revert-on-any-failure, all-or-nothing commit, `variantErrors` reported; a failed re-publish leaves the live page intact. *(Confirmed with the user.)*
- **Empty description at publish** = **block** ("Write a venue description before publishing."); an empty description can still be *saved* (per #3). *(Confirmed with the user.)*
- **Regenerate surface** = a per-variant `regenerateVariantAction` (re-validates before swapping) **and** full Re-publish. *(Confirmed with the user.)*
- **`ANTHROPIC_API_KEY`** = optional in `lib/env.ts`; enhance & publish gated on `isAiConfigured()` with a clear message; tests mock. *(Confirmed with the user.)*
- **Model / params** = `claude-sonnet-4-6`; `max_tokens` 1024 (enhance) / 1500 (variant copy); non-streaming.
- **`claude-api` skill** = doesn't exist on disk; use `@anthropic-ai/sdk` directly. (Noted in `CLAUDE.md` / `NOTES.md`.)

---

## 8. Verification

**Build / static (from repo root):**
1. `pnpm install` — adds `@anthropic-ai/sdk` to `apps/owner`; `apps/owner` `postinstall` `prisma generate` is unchanged (no schema change); lockfile updated.
2. `pnpm typecheck` — green (strict, no `any`, `noUncheckedIndexedAccess`); the `Prisma.InputJsonValue` cast on `content` typechecks; `@anthropic-ai/sdk` types resolve; `Pick<Anthropic,'messages'>` is the SDK seam (no `any`).
3. `pnpm lint` — green (`'use server'` files, `lib/ai/*`, the new client components).
4. `pnpm test` — green; includes `packages/contracts/src/copy.test.ts`, `apps/owner/src/__tests__/templates.test.ts`, `ai-copy.test.ts`, `publish.integration.test.ts`. None touch `apps/owner/prisma/dev.db`, the real `uploads/` dir, or the network.
5. `pnpm build` — both apps build; the owner build compiles `lib/templates.ts`, `lib/ai/*`, `lib/page-variant.ts`, the rewritten `lib/builder-actions.ts`, `components/builder/{publish-section,generated-pages,regenerate-button}.tsx`; `@anthropic-ai/sdk` is server-only (not in the client bundle).
6. `pnpm db:migrate` — a no-op (no new migration); the existing two migrations apply cleanly.

**Manual click-through (`pnpm dev`, owner on `http://localhost:5111`):**

*Without `ANTHROPIC_API_KEY` (the reviewer's default):*
7. Sign in; `/builder` with a saved venue. The description's "Enhance with AI" button is **disabled** with "Set ANTHROPIC_API_KEY to use AI enhancement." The Publish button is **disabled** with "Publishing generates 7 audience-tailored pages with AI — set ANTHROPIC_API_KEY in apps/owner/.env to enable it." "Generated pages" says "No audience pages yet — click Publish to generate them." `pnpm db:studio` → `page_variants` empty; `publishState` unchanged. (If the publish form is posted via no-JS anyway → `{ error: 'AI is not configured — set ANTHROPIC_API_KEY to publish.' }`, no state change.)

*With `ANTHROPIC_API_KEY` set in `apps/owner/.env` (restart `pnpm dev`):*
8. `/builder`: with a non-empty description, click "Enhance with AI" → a panel shows the polished suggestion. **"Use this"** → the textarea is populated (no save yet). **"Save changes"** → "Saved.", the preview re-renders with the new description. "Enhance with AI" again, then **"Keep mine"** → the panel closes, the textarea unchanged. (Empty description → "Enhance with AI" is disabled; Publish shows "Write a venue description first…".)
9. Click **Publish** → the button shows "Generating 7 audience pages…" / "Writing copy for each audience — this takes a moment…" for ~tens of seconds → "✓ Published — 7 audience-tailored pages generated." The page refreshes; "Generated pages" lists all 7 audiences (persona label + each one's `tagline`). `pnpm db:studio` → `venues`: `publishState='published'`, `publishedAt` set, `slugLockedAt` set; `page_variants`: **7 rows** for that venue, `visitorType` = the 7 values, each `content` a JSON `{ "schemaVersion":1, "copy":{ "variant":"…", "tagline":"…", … } }` with **distinct copy per `visitorType`** (eyeball: the `male-50+` one short/linear/trust-heavy, the `female-18-30` one experiential, the `neutral` one balanced).
10. Edit the description, **Re-publish** → "Generating…" → "✓ Published — 7 pages"; `page_variants` shows the 7 rows **replaced** (new `updatedAt`s, copy reflects the edit); `publishState` stays `published`, `slugLockedAt` unchanged.
11. In "Generated pages", click **Regenerate** on one audience → "Regenerating…" → that row's `tagline` changes; the other 6 untouched.
12. Rename the venue + Save → the slug **does not** change (frozen at first publish, from #3).
13. `/builder` while signed out → redirected to `/sign-in`.

*Simulating a generation failure* is hard to do manually — covered by `publish.integration.test.ts` (one variant invalid twice → publish fails, nothing committed, `variantErrors` reports the bad variant, the previously-published page intact).

**Docs:** `NOTES.md` "Build order" #4 ticked + resolved decisions recorded; `CLAUDE.md` / `README.md` status blurbs updated and the `claude-api`-skill-missing note added to `CLAUDE.md`; `apps/owner/prisma/CHANGELOG.md` unchanged (no migration); `apps/owner/.env.example` + `lib/env.ts` comments tidied; this plan copied to `plans/04-ai-copy-and-variants-plan.md`.

---

## Critical files

- `packages/contracts/src/copy.ts` *(new)* + `packages/contracts/src/index.ts` (re-export) — `CopyBundle` / `COPY_BUNDLE_CONSTRAINTS` / `SLOT_SCHEMA_VERSION` / `validateCopyBundle` / `parseCopyBundle`; the shared copy-bundle contract everything hangs off. Tests: `packages/contracts/src/copy.test.ts` *(new)*.
- `apps/owner/src/lib/templates.ts` *(new)* — the transcribed `BASE_COPY_PROMPT` + 7 persona blocks + body-typography registry + `ENHANCE_DESCRIPTION_PROMPT`. Test: `apps/owner/src/__tests__/templates.test.ts` *(new)*.
- `apps/owner/src/lib/ai/{anthropic,copy,index}.ts` *(new)* — the lazily-constructed Anthropic client seam (`getAnthropic` / `isAiConfigured`), `enhanceDescription`, `generateVariantCopy` (with retries), `generateAllVariants` (sequential, cache-friendly); the mockable surface. Test: `apps/owner/src/__tests__/ai-copy.test.ts` *(new)*.
- `apps/owner/src/lib/page-variant.ts` *(new)* — `PageVariantContent` + `parsePageVariantContent`.
- `apps/owner/src/lib/builder-actions.ts` *(modify)* — the rewritten stateful `publishAction` + `runPublishPipeline` (the publish state machine), `enhanceDescriptionAction`, `regenerateVariantAction`. Test: `apps/owner/src/__tests__/publish.integration.test.ts` *(new)*.
- `apps/owner/src/app/(authed)/builder/page.tsx` *(modify)* — loads the venue `+ variants`, passes `aiConfigured` / `hasDescription`, renders `<PublishSection>` + `<GeneratedPages>`; drops the `?published=1` banner.
- `apps/owner/src/components/builder/builder-form.tsx` *(modify — Enhance panel)*; `publish-section.tsx`, `generated-pages.tsx`, `regenerate-button.tsx` *(new)*; `venue-preview.tsx` *(modify, minor wording)*.
- `apps/owner/package.json` *(+ `@anthropic-ai/sdk`)*; `apps/owner/src/lib/env.ts` + `apps/owner/.env.example` *(comment tidy; key stays optional)*.
- Docs: `NOTES.md`, `CLAUDE.md`, `README.md`. **Not touched:** `apps/owner/prisma/schema.prisma`, `apps/owner/prisma/CHANGELOG.md` (no migration), `apps/owner/src/lib/auth.ts`, `apps/owner/vitest.config.ts`.

Mirror the existing patterns: `lib/auth-actions.ts` (Server Action + `useActionState` — `publishAction` follows it, no success redirect), `lib/builder-actions.ts`'s `saveVenueAction` (the `useActionState` state shape, `router.refresh()` after success), `lib/uploads.ts` (server-only module with an explicit error class + a test seam — `lib/ai/*` follows it), `apps/owner/src/__tests__/builder.integration.test.ts` (temp-SQLite integration test + `afterEach` cleanup), `packages/contracts/src/index.test.ts` (pure contracts test), `apps/owner/vitest.{config,global-setup}.ts` (test DB provisioning — already picks up `page_variants`, no change).
