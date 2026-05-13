// The publish pipeline — the state machine behind `startPublishAction` (lib/builder-actions.ts).
// Kept out of that `'use server'` module so it can take an injected `GenAiClient` for the
// integration test. Step 1 resolves the *source text* for variant copy — `venue.enhancedDescription`
// if the owner has clicked **Enhance** (post-#9 separate Enhance step), else (only with
// `allowWithoutEnhanced`) the typed `venue.description` as-is. The pipeline never overwrites
// `venue.description` — that column is strictly the owner's typed text. Step 2 generates the 7
// audience copy bundles from that source text and validates the whole set; step 3 commits
// transactionally — the 7 `PageVariant` rows replace the prior ones, and `publishState` flips.
// ALL-OR-NOTHING: on any failure (network error, or a single variant that won't validate after
// retries) it touches neither the existing `PageVariant` rows nor the published state, reverting
// `publishState` to its prior value; a failed re-publish leaves the live page intact. The
// "in-flight" marker (`publishState:'publishing'`) is a separate non-transactional write; the next
// publish reverts it / a re-publish overwrites it.

import { Prisma } from '@prisma/client';
import { SLOT_SCHEMA_VERSION, allVisitorVariants, type VisitorType } from '@mizrahitality/contracts';
import { prisma } from './prisma';
import type { OwnerWithVenue } from './auth';
import {
  AiNotConfiguredError,
  generateAllVariants,
  isAiConfigured,
  type GenAiClient,
} from './ai';

export type PublishState = {
  /** `true` after a successful (re-)publish. */
  ok?: boolean;
  /** AI not configured / no venue / empty description / unexpected failure. */
  error?: string;
  /** Per-variant generation errors when publish failed mid-generation. */
  variantErrors?: { variant: VisitorType; errors: string[] }[];
};

const AI_NOT_CONFIGURED_MESSAGE = 'AI is not configured — set GOOGLE_API_KEY to publish.';

export async function runPublishPipeline(
  owner: OwnerWithVenue,
  opts?: {
    client?: GenAiClient;
    retries?: number;
    /** When true, fall back to `venue.description` if `enhancedDescription` is null/empty. The
     *  caller (`startPublishAction`) sets this after the owner confirmed the "no enhanced text"
     *  modal. Without it, an empty `enhancedDescription` short-circuits with an error — the
     *  action guards this in practice, but the pipeline keeps the defensive check. */
    allowWithoutEnhanced?: boolean;
    /** Called after each variant completes, plus once with 0/total at the start. */
    onProgress?: (done: number, total: number) => void;
  },
): Promise<PublishState> {
  if (!owner.venue) return { error: 'Create your venue before publishing.' };
  const venue = owner.venue;

  // A passed `client` counts as configured (for tests). No state change on these guards.
  if (!isAiConfigured() && !opts?.client) return { error: AI_NOT_CONFIGURED_MESSAGE };
  if (venue.description.trim().length === 0) {
    return { error: 'Write a venue description before publishing.' };
  }

  // Resolve the source text for variant generation. Prefer the polished version if present;
  // otherwise the typed description (only with explicit `allowWithoutEnhanced`).
  const enhanced = venue.enhancedDescription?.trim() ?? '';
  let sourceText: string;
  if (enhanced.length > 0) {
    sourceText = enhanced;
  } else if (opts?.allowWithoutEnhanced) {
    sourceText = venue.description;
  } else {
    return {
      error:
        'No enhanced description yet — click Enhance first, or confirm to publish from your typed text.',
    };
  }

  const total = allVisitorVariants().length;
  opts?.onProgress?.(0, total);

  // Revert target: 'draft' on a first publish, 'published' on a re-publish, defensively 'draft'
  // if a prior attempt crashed at 'publishing'.
  const priorState = venue.publishState === 'publishing' ? 'draft' : venue.publishState;
  const revert = (): Promise<unknown> =>
    prisma.venue
      .update({ where: { id: venue.id }, data: { publishState: priorState } })
      .catch(() => undefined);

  // Mark in-flight. Existing PageVariant rows stay live until the transactional commit below.
  await prisma.venue.update({ where: { id: venue.id }, data: { publishState: 'publishing' } });

  let results: Awaited<ReturnType<typeof generateAllVariants>>;
  try {
    results = await generateAllVariants(
      { venueName: venue.name, description: sourceText },
      {
        client: opts?.client,
        retries: opts?.retries,
        onProgress: opts?.onProgress
          ? (done, t) => opts.onProgress!(done, t)
          : undefined,
      },
    );
  } catch (err) {
    console.error('[publish] generateAllVariants failed:', err);
    await revert();
    if (err instanceof AiNotConfiguredError) return { error: AI_NOT_CONFIGURED_MESSAGE };
    return { error: 'The AI service is unavailable right now — please try again in a minute.' };
  }

  const failures = results.filter((r) => !r.result.ok);
  if (failures.length > 0) {
    await revert();
    return {
      error: `Couldn't generate ${failures.length} of 7 audience pages — please try again. Nothing was changed.`,
      variantErrors: failures.map((f) => ({
        variant: f.variant,
        errors: f.result.ok ? [] : f.result.errors,
      })),
    };
  }

  // Commit: replace the venue's variant rows + flip the publish state, transactionally. A
  // rolled-back transaction leaves the OLD 7 rows + published state intact. The typed
  // `description` is NOT touched — that column is strictly the owner's input.
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.pageVariant.deleteMany({ where: { venueId: venue.id } });
      for (const { variant, result } of results) {
        if (!result.ok) throw new Error('unreachable: validated above');
        await tx.pageVariant.create({
          data: {
            venueId: venue.id,
            visitorType: variant,
            content: {
              schemaVersion: SLOT_SCHEMA_VERSION,
              copy: result.value,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }
      await tx.venue.update({
        where: { id: venue.id },
        data: {
          publishState: 'published',
          publishedAt: now,
          slugLockedAt: venue.slugLockedAt ?? now,
        },
      });
    });
  } catch {
    await revert();
    return { error: 'Saving the generated pages failed — please try again.' };
  }

  return { ok: true };
}
