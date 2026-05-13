'use client';

// The builder's image input: pick one of the 3 supplied stock photos, or upload your own
// (JPEG/PNG/WebP, ≤ 5 MB — enforced server-side). All state lives here; the parent form just
// reads the hidden inputs this emits:
//   stock mode  → imageMode=stock, stockImageId=<id>
//   upload mode → imageFile=<file> + imageMode=upload   (a file has been chosen)
//               → imageMode=keep                        (none chosen, but the venue already has an upload)
//               → imageMode=upload                      (none chosen, no existing upload — server asks for one)

import { useEffect, useState } from 'react';
import { STOCK_IMAGES, STOCK_IMAGE_IDS, isStockImageId, stockImagePath } from '@/lib/stock-images';
import type { StockImageId } from '@/lib/stock-images';
import { cn } from '@/lib/utils';

type CurrentImage = { kind: string; value: string };

function currentImageSrc(current: CurrentImage): string {
  if (current.kind === 'upload') return `/uploads/${current.value}`;
  return isStockImageId(current.value)
    ? stockImagePath(current.value)
    : `/stock/${current.value}.jpg`;
}

/**
 * Has the owner picked something that the per-section "Save photo" button can actually persist?
 *  - Stock tab: a different stock id than the current one (or current is an upload).
 *  - Upload tab: a new file is selected. "Keep current upload" doesn't count as a change.
 * Called only from the existing-venue flow (the new-venue flow uses the one big "Create venue"
 * button and doesn't read this signal).
 */
function computeImageDirty(
  mode: 'stock' | 'upload',
  stockImageId: StockImageId,
  pickedFileName: string | null,
  current: CurrentImage | null,
): boolean {
  if (mode === 'stock') {
    if (!current) return true;
    if (current.kind !== 'stock') return true;
    return stockImageId !== current.value;
  }
  // mode === 'upload' — only a freshly picked file counts as a change to save.
  return pickedFileName !== null;
}

export function ImagePicker({
  current,
  onDirtyChange,
}: {
  current: CurrentImage | null;
  /** Notifies the parent whenever the picker has (or no longer has) something to save. Optional —
   *  the new-venue create flow doesn't wire it. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [mode, setMode] = useState<'stock' | 'upload'>(
    current?.kind === 'upload' ? 'upload' : 'stock',
  );
  const [stockImageId, setStockImageId] = useState<StockImageId>(
    current && isStockImageId(current.value) ? current.value : STOCK_IMAGE_IDS[0],
  );
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);

  const uploadMode = pickedFileName ? 'upload' : current?.kind === 'upload' ? 'keep' : 'upload';

  const dirty = computeImageDirty(mode, stockImageId, pickedFileName, current);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="imageModeChoice"
            value="stock"
            checked={mode === 'stock'}
            onChange={() => setMode('stock')}
          />
          Choose a stock photo
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="imageModeChoice"
            value="upload"
            checked={mode === 'upload'}
            onChange={() => setMode('upload')}
          />
          Upload your own
        </label>
      </div>

      {mode === 'stock' ? (
        <>
          <input type="hidden" name="imageMode" value="stock" />
          <input type="hidden" name="stockImageId" value={stockImageId} />
          <div className="grid grid-cols-3 gap-3">
            {STOCK_IMAGES.map((img) => (
              <label
                key={img.id}
                className={cn(
                  'cursor-pointer overflow-hidden rounded-lg border bg-card p-3 transition-colors',
                  stockImageId === img.id
                    ? 'border-primary ring-2 ring-primary'
                    : 'hover:border-foreground/40',
                )}
              >
                <input
                  type="radio"
                  name="stockImageChoice"
                  value={img.id}
                  checked={stockImageId === img.id}
                  onChange={() => setStockImageId(img.id)}
                  className="sr-only"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.path}
                  alt={img.label}
                  className="aspect-video w-full rounded-md object-cover"
                />
                <span className="mt-2 block text-xs font-medium">{img.label}</span>
              </label>
            ))}
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="imageMode" value={uploadMode} />
          {current?.kind === 'upload' && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Current photo</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentImageSrc(current)}
                alt="Current venue photo"
                className="max-h-40 rounded-lg object-cover"
              />
            </div>
          )}
          <input
            type="file"
            name="imageFile"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setPickedFileName(e.currentTarget.files?.[0]?.name ?? null)}
            className="block text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-2.5 file:py-1 file:text-sm file:font-medium hover:file:bg-muted"
          />
          <p className="text-xs text-muted-foreground">
            JPEG, PNG, or WebP, up to 5 MB.
            {current?.kind === 'upload' && !pickedFileName
              ? ' Leave empty to keep your current photo.'
              : ''}
          </p>
        </>
      )}
    </div>
  );
}
