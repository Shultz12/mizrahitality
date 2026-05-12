import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { contentTypeForKey, resolveUploadPath } from '@/lib/uploads';

// Streams an uploaded venue image by its stored key. Lives OUTSIDE the `(authed)` route group —
// deliberately UNAUTHENTICATED: the public customer site renders these images, and the keys are
// unguessable random hex (`venues/<venueId>/<random>.<ext>`). `resolveUploadPath` is the
// path-traversal guard — anything that would escape `uploads/` (or any `.`/`..` segment) → 404.
// (`/uploads/...` here doesn't collide with `public/`'s `/stock/...`.)
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const key = path.join('/');
  const abs = resolveUploadPath(key);
  if (!abs) return new NextResponse('Not found', { status: 404 });

  try {
    const buf = await readFile(abs);
    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentTypeForKey(key),
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
