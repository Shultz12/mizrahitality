// The 3 supplied stock images the builder offers as an alternative to uploading one.
// The image files live at `apps/owner/public/stock/<id>.jpg` (committed app assets, served by
// Next from `/stock/...`); a venue that picks one stores `imageKind: 'stock', imageValue: <id>`.
// Pure data + helpers — safe to import from client components.

export interface StockImage {
  /** Stable id stored on `Venue.imageValue` when `imageKind === 'stock'`. */
  readonly id: string;
  /** Human label shown in the picker. */
  readonly label: string;
  /** Public path Next serves the file from (under `public/`). */
  readonly path: string;
}

export const STOCK_IMAGES = [
  { id: 'atlantis-paradise', label: 'Atlantis Paradise', path: '/stock/atlantis-paradise.jpg' },
  { id: 'burj-al-arab', label: 'Burj Al Arab', path: '/stock/burj-al-arab.jpg' },
  { id: 'mardan-palace', label: 'Mardan Palace', path: '/stock/mardan-palace.jpg' },
] as const satisfies readonly StockImage[];

export const STOCK_IMAGE_IDS = ['atlantis-paradise', 'burj-al-arab', 'mardan-palace'] as const;
export type StockImageId = (typeof STOCK_IMAGE_IDS)[number];

const STOCK_IMAGE_ID_SET: ReadonlySet<string> = new Set(STOCK_IMAGE_IDS);

/** Type guard: is `value` one of the 3 stock-image ids? */
export function isStockImageId(value: unknown): value is StockImageId {
  return typeof value === 'string' && STOCK_IMAGE_ID_SET.has(value);
}

/** The public path for a stock image id (e.g. `'atlantis-paradise'` → `/stock/atlantis-paradise.jpg`). */
export function stockImagePath(id: StockImageId): string {
  const found = STOCK_IMAGES.find((img) => img.id === id);
  // `id: StockImageId` guarantees a hit; the fallback only satisfies `noUncheckedIndexedAccess`.
  return found ? found.path : `/stock/${id}.jpg`;
}
