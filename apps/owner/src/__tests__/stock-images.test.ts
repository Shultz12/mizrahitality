import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STOCK_IMAGES, STOCK_IMAGE_IDS, isStockImageId, stockImagePath } from '@/lib/stock-images';

describe('STOCK_IMAGES', () => {
  it('has exactly 3 entries with unique ids matching the filenames', () => {
    expect(STOCK_IMAGES).toHaveLength(3);
    const ids = STOCK_IMAGES.map((i) => i.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual([...STOCK_IMAGE_IDS]);
    for (const img of STOCK_IMAGES) {
      expect(img.path).toBe(`/stock/${img.id}.jpg`);
    }
  });
});

describe('isStockImageId', () => {
  it('is true for the 3 ids and false otherwise', () => {
    for (const id of STOCK_IMAGE_IDS) expect(isStockImageId(id)).toBe(true);
    expect(isStockImageId('not-a-stock-image')).toBe(false);
    expect(isStockImageId('')).toBe(false);
    expect(isStockImageId(undefined)).toBe(false);
    expect(isStockImageId(42)).toBe(false);
  });
});

describe('stockImagePath', () => {
  it('points at a file that exists under apps/owner/public/', () => {
    // Vitest runs with cwd = apps/owner.
    for (const id of STOCK_IMAGE_IDS) {
      const rel = stockImagePath(id); // e.g. /stock/atlantis-paradise.jpg
      expect(rel).toBe(`/stock/${id}.jpg`);
      expect(existsSync(path.join(process.cwd(), 'public', rel))).toBe(true);
    }
  });
});
