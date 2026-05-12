import { describe, expect, it } from 'vitest';
import { allVisitorVariants } from '@mizrahitality/contracts';

// Smoke test: the workspace link to @mizrahitality/contracts resolves and is usable.
describe('@mizrahitality/contracts wiring (customer)', () => {
  it('exposes exactly 7 visitor variants', () => {
    expect(allVisitorVariants()).toHaveLength(7);
  });
});
