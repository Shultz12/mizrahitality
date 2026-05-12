// Disk storage for uploaded venue images — server-only (Node `fs`/`path`/`crypto`).
//
// Uploads live OUTSIDE `public/`, under `apps/owner/uploads/venues/<venueId>/<random>.<ext>`
// (the dir is gitignored and `mkdir -p`'d on demand), and are served back by the unauthenticated
// Route Handler at `app/uploads/[...path]/route.ts` — the public customer page loads these images,
// and the filenames are unguessable random hex. A venue stores the relative key
// `venues/<venueId>/<file>` in `Venue.imageValue` (with `imageKind: 'upload'`).
//
// Assumes Next runs with cwd = the app directory (`apps/owner`) — true for `next dev` / `next
// build` / `next start` and for Vitest (which runs from `apps/owner`). Validation: declared
// `File.type` must be an allowed image MIME, a magic-byte sniff must agree, and the size cap is
// 5 MB. No resizing/cropping/optimizing — files are stored as-is (no `sharp`).

import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/** Absolute path to the uploads root (`apps/owner/uploads`). */
export const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');

/** Accepted image MIME types → the file extension we store them under. */
export const ALLOWED_UPLOAD_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export type AllowedUploadMime = keyof typeof ALLOWED_UPLOAD_MIME;

/** Hard size cap on an uploaded image. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const EXTENSION_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * Magic-byte content sniff. Returns the detected MIME (one of {@link ALLOWED_UPLOAD_MIME}'s keys)
 * or `null` if the bytes don't start with a recognised JPEG/PNG/WebP signature.
 */
export function sniffImageMime(bytes: Uint8Array): AllowedUploadMime | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A — checking the first four is enough to disambiguate.
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/** Thrown by {@link saveVenueUpload}; `.message` is safe to show the owner. */
export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadValidationError';
  }
}

/**
 * Persist an uploaded image for a venue. Validates size + content, writes it under a
 * server-generated random filename, and returns the relative key to store on `Venue.imageValue`.
 * `opts.rootOverride` lets tests write into a tmpdir instead of the real uploads root.
 */
export async function saveVenueUpload(
  venueId: string,
  file: File,
  opts: { rootOverride?: string } = {},
): Promise<{ key: string }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError('That image is too large — please upload a file up to 5 MB.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImageMime(bytes);
  if (!sniffed || !(file.type in ALLOWED_UPLOAD_MIME) || file.type !== sniffed) {
    throw new UploadValidationError(
      "That file doesn't look like a supported image. Use a JPEG, PNG, or WebP file.",
    );
  }

  const ext = ALLOWED_UPLOAD_MIME[sniffed];
  const root = opts.rootOverride ?? UPLOADS_ROOT;
  const dir = path.join(root, 'venues', venueId);
  await mkdir(dir, { recursive: true });
  const filename = `${randomBytes(16).toString('hex')}.${ext}`;
  await writeFile(path.join(dir, filename), bytes);
  return { key: `venues/${venueId}/${filename}` };
}

/**
 * Resolve a stored relative key to an absolute path under {@link UPLOADS_ROOT}, or `null` if the
 * key is malformed or would escape the root (path-traversal guard). Rejects any `.`/`..`/empty
 * segment outright, then double-checks the resolved path is still inside the root.
 */
export function resolveUploadPath(key: string): string | null {
  const segments = key.split(/[/\\]+/).filter((s) => s.length > 0);
  if (segments.length === 0 || segments.some((s) => s === '.' || s === '..')) return null;
  const abs = path.resolve(UPLOADS_ROOT, ...segments);
  const rel = path.relative(UPLOADS_ROOT, abs);
  if (rel.length === 0 || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return abs;
}

/** MIME type for a stored key, by its extension; `application/octet-stream` if unrecognised. */
export function contentTypeForKey(key: string): string {
  return EXTENSION_TO_MIME[path.extname(key).toLowerCase()] ?? 'application/octet-stream';
}

/** Best-effort delete of a previously-uploaded file (e.g. when the owner switches images). */
export async function deleteUploadByKey(key: string): Promise<void> {
  const abs = resolveUploadPath(key);
  if (!abs) return;
  try {
    await unlink(abs);
  } catch {
    // Orphaned files are acceptable at demo scale — never let cleanup failure break a save.
  }
}
