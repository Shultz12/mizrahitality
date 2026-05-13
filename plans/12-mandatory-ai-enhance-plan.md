# Plan — fold AI enhancement into Publish (make it non-optional)

## Context

Today the venue builder has two AI surfaces: a stand-alone **Enhance with AI** button next to the description field, and the Publish flow that generates the 7 audience variants. The Enhance step is optional and the owner can ignore it — meaning published variants are sometimes built from a rough, unpolished description.

The user wants enhancement to become **mandatory and folded into Publish**. The owner types a description, sees an explainer telling them that on Publish the text will be polished by AI and turned into 7 audience-tailored pages (the 7 personas are listed), and clicks **Publish**. The pipeline then:

1. Polishes the description (one Gemini call),
2. Generates the 7 variants from the polished text (seven Gemini calls),
3. On success, **persists the polished text** back over `venue.description` (user-confirmed choice),
4. Commits the description overwrite + the 7 `PageVariant` rows + the publish-state flip in one transaction — all-or-nothing.

Side effects: the per-variant **Regenerate** button needs no code change — after the first publish, `venue.description` already holds the polished text, so regenerate is consistent with the other 6 variants by construction. The stand-alone `enhanceDescriptionAction` and its UI go away entirely.

## Files to modify

- `apps/owner/src/lib/publish.ts` — add enhance step + persist polished text inside the existing transaction.
- `apps/owner/src/lib/builder-actions.ts` — delete `enhanceDescriptionAction` and the now-unused imports.
- `apps/owner/src/components/builder/builder-form.tsx` — delete Enhance button + suggestion panel + their state; add a static info panel listing the 7 personas.
- `apps/owner/src/components/builder/publish-section.tsx` — small copy tweak on the helper paragraph.
- `apps/owner/src/__tests__/publish.integration.test.ts` — extend the fake client to handle the new enhance call; add assertions covering the persist + new failure paths.

The provider is Google Gemini via `@google/genai` (gated on `GOOGLE_API_KEY`); the publish pipeline reuses `enhanceDescription` (`apps/owner/src/lib/ai/copy.ts:60`) which already exists and is unit-tested.

## Implementation

### 1. `apps/owner/src/lib/publish.ts`

Insert the enhance step between the in-flight `publishState:'publishing'` flip (line 54) and the existing `generateAllVariants` block (line 56), mirroring the variant block's try/catch + `revert()` semantics:

```ts
let polishedDescription: string;
try {
  polishedDescription = await enhanceDescription(venue.description, opts?.client);
} catch (err) {
  await revert();
  return err instanceof AiNotConfiguredError
    ? { error: AI_NOT_CONFIGURED_MESSAGE }
    : { error: 'The AI service is unavailable right now — please try again in a minute.' };
}
```

Add `enhanceDescription` to the existing `'./ai'` import. Change the `generateAllVariants` call (line 58) to pass `description: polishedDescription` instead of `venue.description`. Inside the existing `$transaction` (line 85), add `description: polishedDescription` to the `tx.venue.update` data payload at line 102 so the description overwrite commits or rolls back atomically with the variant rows and the publish-state flip. `revert()` continues to touch only `publishState`; the original typed description survives any failure path.

Update the file header comment to note that enhance is now step 1 of the pipeline and the polished text is persisted transactionally.

### 2. `apps/owner/src/lib/builder-actions.ts`

- Delete lines 261–288 (the `enhanceDescriptionAction` function + its docstring).
- Remove `VENUE_DESCRIPTION_MAX_LENGTH` from the `./validation` import (line 26) — only used by the deleted action; the constant itself stays in `validation.ts`.
- Remove `enhanceDescription` from the `./ai` import (line 35) — same reason.
- Trim the file-header comment to drop the `enhanceDescriptionAction` reference.

`regenerateVariantAction` is unchanged. It reads `venue.description` (line 312) which, after publish, is the persisted polished text.

### 3. `apps/owner/src/components/builder/builder-form.tsx`

Delete:

- The `enhanceDescriptionAction` import (line 16) and `useTransition` from the `react` import (line 13 — only the enhance state used it).
- The three useState/useTransition hooks for `enhancing`/`suggestion`/`enhanceError` (lines 49–51).
- The `handleEnhance` function (lines 64–72).
- The "Enhance with AI" button + its `GOOGLE_API_KEY`-not-configured hint (lines 128–143). The same hint already appears in `publish-section.tsx`, so the owner doesn't lose the signal.
- The `enhanceError` alert paragraph (lines 145–149).
- The whole `{suggestion !== null && …}` suggestion-preview block (lines 151–174).

Add — a static info panel directly under the description textarea (insert after the description-error `<p>` at line 126):

- Lead sentence: *"On Publish, your description will be polished by AI and turned into 7 audience-tailored pages:"*
- A `<ul>` rendered from `allVisitorVariants().map(v => templateEntry(v).personaLabel)` — 7 items in canonical order (e.g. "Male, 18–30 — Digital-Native Pragmatist", … , "Neutral (Default) — Universal Baseline").
- A second short sentence: *"Your typed description will be replaced with the polished version on a successful publish."* (sets the expectation that the field updates after publish; `venue-preview.tsx` line 45 renders `venue.description` raw, so this avoids surprise).
- When `aiConfigured === false`, collapse the explainer to one substitute line: *"Set `GOOGLE_API_KEY` to publish — without it, your description can't be polished and the 7 audience pages can't be generated."*

New imports needed at the top of the file (both already used elsewhere in the app):

```ts
import { allVisitorVariants } from '@mizrahitality/contracts';
import { templateEntry } from '@/lib/templates';
```

Rewrite the second half of the file-header comment to drop the Enhance affordance and state that Publish now handles the polishing.

### 4. `apps/owner/src/components/builder/publish-section.tsx`

One-line copy tweak on the helper paragraph (around lines 42–45): replace whatever currently describes the Publish behaviour with something like *"Publishing polishes your description with AI and generates a tailored version for each of the 7 audiences. Your page address is also frozen."* No structural changes; the `!hasDescription` warning (lines 60–63) stays — it's a present-tense gate that complements the future-tense explainer in the form.

### 5. `apps/owner/src/__tests__/publish.integration.test.ts`

Extend the `fakeClient` (lines 55–62) to handle the new N+1 call pattern. Detect the enhance call by the `systemInstruction` shape — enhance uses a plain string (`ENHANCE_DESCRIPTION_PROMPT`) while variant calls use `{ parts: [BASE_COPY_PROMPT, personaBlock] }`:

```ts
const generateContent = vi.fn(async (params: FakeGenerateContentParams): Promise<FakeResp> => {
  if (typeof params.config?.systemInstruction === 'string') {
    return textResp('Polished description for tests.');
  }
  const variant = personaVariant(params);
  if (garbageFor && variant === garbageFor) return textResp('this is not json');
  return textResp(JSON.stringify(validBundleFor(variant)));
});
```

The `FakeGenerateContentParams` type at line 14–16 already allows both `string` and `{ parts: FakePart[] }` for `systemInstruction` — no type change.

Assertions to add:

- **Happy path** (test at line 99): after `runPublishPipeline` succeeds, `venue.description` equals `'Polished description for tests.'` (was `'A cosy place by the sea, with reliable Wi-Fi and good coffee.'`).
- **One variant invalid** (test at line 125): after the failed publish, `venue.description` is **unchanged** from the original — proves the transactional rollback covers the description overwrite alongside `publishState`.
- **Failed re-publish leaves prior state intact** (test at line 143): assert the description after the failed second publish equals `'Polished description for tests.'` (the persisted text from the first successful publish), not the original raw text.
- **New test — "AI enhancement fails → publish aborts, no state change"**: build a fake whose `generateContent` throws for the string-`systemInstruction` branch; assert the result is the generic AI-unavailable error, `publishState` is back to `'draft'`, `venue.description` is unchanged, and `pageVariant.count` is 0.

The "blocks an empty description" and "blocks when AI is not configured" tests (lines 170–186) need no changes — they short-circuit before any AI call.

`apps/owner/src/__tests__/ai-copy.test.ts` is unaffected — it targets the lib-level `enhanceDescription` directly. `apps/owner/src/__tests__/venue-validation.test.ts` is unaffected — `VENUE_DESCRIPTION_MAX_LENGTH` and `validateVenueDescription` are untouched.

## Pitfalls / notes

- **`priorState` capture is correct.** It's snapshotted at line 47 from the in-memory `venue.publishState` before any DB write, with a defensive collapse of `'publishing' → 'draft'`. Enhance failing after the in-flight flip still reverts to the correct state.
- **Description overwrite + `revert()` don't interact.** `revert()` only writes `publishState`; the description update lives inside `$transaction`, which Prisma rolls back atomically on the outer `catch` (line 109). The owner's typed text is preserved on any failure.
- **`venue-preview.tsx` line 45** renders `venue.description` raw — after a successful publish, the preview pane will show the polished text. This is intended (consistent with the persist choice) and is foreshadowed in the new info-panel copy.
- **No collateral impact** on `/preview`, the customer app, the demo seed, or alt text (alt text uses `venue.name`; customer reads `PageVariant.content`; the seed writes its own description string and is not affected by runtime publishing).
- **First-publish trade-off accepted.** Once the first publish succeeds the original raw description is gone (overwritten). This was the explicit user choice (no schema change).

## Verification

1. `pnpm typecheck` — clean (removed imports + new ones resolve; `GenAiClient` and the `responseSchema` shape stay compatible).
2. `pnpm lint` — clean (no unused imports, no `any`).
3. `pnpm --filter mizrahitality-owner test -- publish.integration` — all four existing tests pass plus the new "enhancement fails" case; new assertions on `venue.description` pass.
4. `pnpm --filter mizrahitality-owner test` — full owner suite green; `ai-copy.test.ts` and `venue-validation.test.ts` unchanged.
5. Manual E2E with `pnpm dev`:
   - With `GOOGLE_API_KEY` set: builder shows the new info panel listing the 7 personas; no Enhance button; Publish runs and (a) the description field shows the polished text on refresh, (b) `/preview` renders all 7 variants, (c) the customer site at `/<slug>` renders the correct variant per the `miz_visitor_type` cookie.
   - With `GOOGLE_API_KEY` unset: info panel collapses to the substitute "Set GOOGLE_API_KEY" line; Publish stays disabled with the existing hint; nothing else regresses.
   - Regenerate one variant after a successful publish: the regenerated variant uses the (already-polished) `venue.description` and matches the voice of the other 6.
