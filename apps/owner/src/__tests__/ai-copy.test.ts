import { afterEach, describe, expect, it, vi } from 'vitest';
import { allVisitorVariants, type VisitorType } from '@mizrahitality/contracts';
import {
  AiCallError,
  AiNotConfiguredError,
  __resetAnthropicForTests,
  enhanceDescription,
  generateAllVariants,
  generateVariantCopy,
  type MessagesClient,
} from '@/lib/ai';

// Exercises the AI steps against a faked `MessagesClient` — no DB, no network. The fake reads the
// 2nd `system` block (the persona block) to echo back the right `variant`.

type FakeCreateParams = {
  system?: string | Array<{ type: string; text: string }>;
  messages: Array<{ role: string; content: string }>;
};
type FakeResp = { content: Array<{ type: string; text: string }> };

function textResp(text: string): FakeResp {
  return { content: [{ type: 'text', text }] };
}

function validBundleFor(variant: VisitorType) {
  return {
    variant,
    tagline: 'A genuinely calm and comfortable place to stay near everything that matters',
    heroTrustPrimer: 'Takes less than two minutes.',
    story: {
      hook: 'You want a stay that just works. This place gives you exactly that.',
      detail:
        'Comfortable rooms, a quiet setting, and an easy location make this a straightforward choice for a short trip.',
      detailBullets: [] as string[],
      nudge: 'Your dates are still open right now.',
    },
    highlightStripLine: 'Comfort, quiet, and a location that just works.',
    closingHeading: 'Your stay is waiting',
    closingTrustLine: 'Instant confirmation.',
  };
}

function personaVariant(params: FakeCreateParams): VisitorType | null {
  const block = Array.isArray(params.system) ? params.system[1] : undefined;
  const match = (block?.text ?? '').match(/<!-- variant: (.+?) -->/);
  const found = match?.[1];
  return found && allVisitorVariants().includes(found as VisitorType)
    ? (found as VisitorType)
    : null;
}

/** A fake that always returns a valid bundle for whatever variant the persona block names. */
function fakeClient(
  handler?: (params: FakeCreateParams, callIndex: number) => FakeResp,
): MessagesClient {
  let calls = 0;
  const create = vi.fn(async (params: FakeCreateParams): Promise<FakeResp> => {
    const index = calls++;
    if (handler) return handler(params, index);
    const variant = personaVariant(params) ?? 'neutral';
    return textResp(JSON.stringify(validBundleFor(variant)));
  });
  return { messages: { create } } as unknown as MessagesClient;
}

afterEach(() => {
  __resetAnthropicForTests();
  vi.restoreAllMocks();
});

describe('enhanceDescription', () => {
  it('returns the trimmed reply text', async () => {
    const client = fakeClient(() => textResp('  Polished and tidy.  '));
    await expect(enhanceDescription('rough text', client)).resolves.toBe('Polished and tidy.');
  });

  it('throws AiCallError on an empty reply', async () => {
    const client = fakeClient(() => textResp('   '));
    await expect(enhanceDescription('rough text', client)).rejects.toBeInstanceOf(AiCallError);
  });

  it('throws AiNotConfiguredError when no key and no client', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    __resetAnthropicForTests();
    await expect(enhanceDescription('rough text')).rejects.toBeInstanceOf(AiNotConfiguredError);
  });
});

describe('generateVariantCopy', () => {
  it('returns a valid bundle for the requested variant', async () => {
    const result = await generateVariantCopy(
      { venueName: 'Blue Lagoon', description: 'A cosy spot by the sea.', variant: 'male-18-30' },
      { client: fakeClient() },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.variant).toBe('male-18-30');
  });

  it('retries after a bad reply and includes the prior errors in the retry turn', async () => {
    const userContents: string[] = [];
    const client = fakeClient((params, index) => {
      userContents.push(
        typeof params.messages[0]?.content === 'string' ? params.messages[0]!.content : '',
      );
      if (index === 0) return textResp('this is not json at all');
      const variant = personaVariant(params) ?? 'neutral';
      return textResp(JSON.stringify(validBundleFor(variant)));
    });
    const result = await generateVariantCopy(
      { venueName: 'Blue Lagoon', description: 'A cosy spot by the sea.', variant: 'female-31-50' },
      { client },
    );
    expect(result.ok).toBe(true);
    expect(userContents).toHaveLength(2);
    expect(userContents[1] ?? '').toContain('FAILED VALIDATION');
  });

  it('gives up after 1 + retries attempts when every reply is garbage', async () => {
    const create = vi.fn(async (): Promise<FakeResp> => textResp('still not json'));
    const client = { messages: { create } } as unknown as MessagesClient;
    const result = await generateVariantCopy(
      { venueName: 'Blue Lagoon', description: 'A cosy spot.', variant: 'neutral' },
      { client, retries: 1 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('throws AiNotConfiguredError when no key and no client', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    __resetAnthropicForTests();
    await expect(
      generateVariantCopy({ venueName: 'X', description: 'Y', variant: 'neutral' }),
    ).rejects.toBeInstanceOf(AiNotConfiguredError);
  });
});

describe('generateAllVariants', () => {
  it('produces 7 valid results in allVisitorVariants() order', async () => {
    const seen: VisitorType[] = [];
    const client = fakeClient((params) => {
      const variant = personaVariant(params) ?? 'neutral';
      seen.push(variant);
      return textResp(JSON.stringify(validBundleFor(variant)));
    });
    const results = await generateAllVariants(
      { venueName: 'Blue Lagoon', description: 'A cosy spot.' },
      { client },
    );
    expect(results).toHaveLength(7);
    expect(results.every((r) => r.result.ok)).toBe(true);
    expect(results.map((r) => r.variant)).toEqual(allVisitorVariants());
    expect(seen).toEqual(allVisitorVariants());
  });

  it('throws AiNotConfiguredError when no key and no client', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    __resetAnthropicForTests();
    await expect(generateAllVariants({ venueName: 'X', description: 'Y' })).rejects.toBeInstanceOf(
      AiNotConfiguredError,
    );
  });
});
