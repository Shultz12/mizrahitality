// `getSessionId()` — an opaque per-browser-session correlator the customer site sends on every
// analytics event (#8). The owner stores it (#6) so #7's dashboard can correlate a `book-now-hover`
// with the `book-now-click` that followed it. Browser-only: it's lazily minted with
// `crypto.randomUUID()` and cached in `sessionStorage['miz_sid']` so it survives reloads within the
// same tab. If `sessionStorage` is unavailable (private mode, SSR — which never calls this) it
// falls back to a module-cached per-load id. Never returns the empty string, so the owner API never
// 400s on it (and an absent id is fine too — the route is lenient).

const STORAGE_KEY = 'miz_sid';

let cached: string | null = null;

export function getSessionId(): string {
  if (cached) return cached;

  let id: string | null = null;
  try {
    id = sessionStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(STORAGE_KEY, id);
    }
  } catch {
    // `sessionStorage` blocked / unavailable — a per-load id is good enough for the demo funnel.
    id = crypto.randomUUID();
  }

  cached = id;
  return id;
}
