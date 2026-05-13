// The publish pipeline — the state machine behind `publishAction` (lib/builder-actions.ts). Kept
// out of that `'use server'` module so it can take an injected `GenAiClient` for the integration
// test. Step 1 polishes the owner's free-text description with Gemini (`enhanceDescription`); step 2
// generates the 7 audience copy bundles from that polished text and validates the whole set; step 3
// commits transactionally — the polished text overwrites `venue.description`, the 7 `PageVariant`
// rows replace the prior ones, and `publishState` flips. ALL-OR-NOTHING: on any failure (enhance
// error, network error, or a single variant that won't validate after retries) it touches neither
// the existing `PageVariant` rows, nor the typed description, nor the published state, reverting
// `publishState` to its prior value; a failed re-publish leaves the live page intact. The "in-flight"
// marker (`publishState:'publishing'`) is a separate non-transactional write; the next publish
// reverts it / a re-publish overwrites it.

import { Prisma } from '@prisma/client';
import { SLOT_SCHEMA_VERSION, type VisitorType } from '@mizrahitality/contracts';
import { prisma } from './prisma';
import type { OwnerWithVenue } from './auth';
import {
  AiNotConfiguredError,
  enhanceDescription,
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
  opts?: { client?: GenAiClient; retries?: number },
): Promise<PublishState> {
  if (!owner.venue) return { error: 'Create your venue before publishing.' };
  const venue = owner.venue;

  // A passed `client` counts as configured (for tests). No state change on these guards.
  if (!isAiConfigured() && !opts?.client) return { error: AI_NOT_CONFIGURED_MESSAGE };
  if (venue.description.trim().length === 0) {
    return { error: 'Write a venue description before publishing.' };
  }

  // Revert target: 'draft' on a first publish, 'published' on a re-publish, defensively 'draft'
  // if a prior attempt crashed at 'publishing'.
  const priorState = venue.publishState === 'publishing' ? 'draft' : venue.publishState;
  const revert = (): Promise<unknown> =>
    prisma.venue
      .update({ where: { id: venue.id }, data: { publishState: priorState } })
      .catch(() => undefined);

  // Mark in-flight. Existing PageVariant rows stay live until the transactional commit below.
  await prisma.venue.update({ where: { id: venue.id }, data: { publishState: 'publishing' } });

  // Step 1: polish the description. Persisted transactionally below alongside the variant rows
  // and the publish-state flip, so a downstream failure leaves the owner's typed text intact.
  let polishedDescription: string;
  try {
    polishedDescription = await enhanceDescription(venue.description, opts?.client);
  } catch (err) {
    await revert();
    return err instanceof AiNotConfiguredError
      ? { error: AI_NOT_CONFIGURED_MESSAGE }
      : { error: 'The AI service is unavailable right now — please try again in a minute.' };
  }

  let results: Awaited<ReturnType<typeof generateAllVariants>>;
  try {
    results = await generateAllVariants(
      { venueName: venue.name, description: polishedDescription },
      { client: opts?.client, retries: opts?.retries },
    );
  } catch (err) {
    await revert();
    return err instanceof AiNotConfiguredError
      ? { error: AI_NOT_CONFIGURED_MESSAGE }
      : { error: 'The AI service is unavailable right now — please try again in a minute.' };
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
  // rolled-back transaction leaves the OLD 7 rows + published state intact.
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
          description: polishedDescription,
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
