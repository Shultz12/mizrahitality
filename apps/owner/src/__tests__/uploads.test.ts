import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  UploadValidationError,
  contentTypeForKey,
  resolveUploadPath,
  saveVenueUpload,
  sniffImageMime,
} from '@/lib/uploads';

const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_MAGIC = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe('sniffImageMime', () => {
  it('recognises JPEG / PNG / WebP magic bytes', () => {
    expect(sniffImageMime(JPEG_MAGIC)).toBe('image/jpeg');
    expect(sniffImageMime(PNG_MAGIC)).toBe('image/png');
    expect(sniffImageMime(WEBP_MAGIC)).toBe('image/webp');
  });

  it('returns null for non-image bytes', () => {
    expect(sniffImageMime(new TextEncoder().encode('not an image at all'))).toBeNull();
    expect(sniffImageMime(new Uint8Array([0x00, 0x01, 0x02]))).toBeNull();
  });
});

describe('resolveUploadPath', () => {
  it('rejects path traversal and malformed keys', () => {
    expect(resolveUploadPath('../../../etc/passwd')).toBeNull();
    expect(resolveUploadPath('venues/x/../../escape')).toBeNull();
    expect(resolveUploadPath('')).toBeNull();
    expect(resolveUploadPath('venues/./x.jpg')).toBeNull();
  });

  it('accepts a well-formed key and returns an absolute path under the uploads root', () => {
    const resolved = resolveUploadPath('venues/abc/def.jpg');
    expect(resolved).not.toBeNull();
    expect(resolved!.endsWith(path.join('venues', 'abc', 'def.jpg'))).toBe(true);
    expect(path.isAbsolute(resolved!)).toBe(true);
  });
});

describe('contentTypeForKey', () => {
  it('maps known extensions and falls back otherwise', () => {
    expect(contentTypeForKey('venues/x/a.jpg')).toBe('image/jpeg');
    expect(contentTypeForKey('venues/x/a.jpeg')).toBe('image/jpeg');
    expect(contentTypeForKey('venues/x/a.png')).toBe('image/png');
    expect(contentTypeForKey('venues/x/a.webp')).toBe('image/webp');
    expect(contentTypeForKey('venues/x/a.txt')).toBe('application/octet-stream');
    expect(contentTypeForKey('venues/x/noext')).toBe('application/octet-stream');
  });
});

describe('saveVenueUpload', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mizrahitality-uploads-'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes a venues/<id>/<file>.jpg key with matching bytes', async () => {
    const bytes = new Uint8Array([...JPEG_MAGIC, 1, 2, 3, 4, 5]);
    const file = new File([bytes], 'photo.jpg', { type: 'image/jpeg' });
    const { key } = await saveVenueUpload('venue123', file, { rootOverride: root });

    expect(key).toMatch(/^venues\/venue123\/[0-9a-f]{32}\.jpg$/);
    const written = await readFile(path.join(root, ...key.split('/')));
    expect(new Uint8Array(written)).toEqual(bytes);
  });

  it('rejects an oversized file', async () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set(JPEG_MAGIC, 0);
    const file = new File([big], 'big.jpg', { type: 'image/jpeg' });
    await expect(saveVenueUpload('venue123', file, { rootOverride: root })).rejects.toBeInstanceOf(
      UploadValidationError,
    );
  });

  it('rejects a non-image file (a .txt renamed to .jpg)', async () => {
    const file = new File([new TextEncoder().encode('definitely not an image')], 'fake.jpg', {
      type: 'image/jpeg',
    });
    await expect(saveVenueUpload('venue123', file, { rootOverride: root })).rejects.toBeInstanceOf(
      UploadValidationError,
    );
  });

  it('rejects a declared type inconsistent with the content', async () => {
    const file = new File([PNG_MAGIC], 'mislabelled.jpg', { type: 'image/jpeg' });
    await expect(saveVenueUpload('venue123', file, { rootOverride: root })).rejects.toBeInstanceOf(
      UploadValidationError,
    );
  });
});
