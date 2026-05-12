import Link from 'next/link';

// Rendered when the owner API has no published venue at the requested slug — REQ-19, the "bad slug"
// case (the page route calls `notFound()` on a 404 from `GET /api/venues/<slug>/page`). Friendly,
// centered, link back to `/`; no stack trace, no client JS. Wrapped by `app/[slug]/layout.tsx`, so
// it gets the warm shell + fonts.

export default function VenueNotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1
        style={{ fontFamily: 'var(--font-playfair)' }}
        className="text-[28px] font-semibold leading-[1.2] text-[#2C2824]"
      >
        We couldn&rsquo;t find a venue at that address
      </h1>
      <p className="text-[15px] leading-[1.6] text-[#2C2824]/70">
        Double-check the link — or the venue may not be published yet.
      </p>
      <Link
        href="/"
        className="min-h-[48px] rounded bg-[#E85D4A] px-6 py-3 text-[14px] font-semibold uppercase tracking-[0.1em] text-white transition-all duration-300 hover:scale-[1.03]"
      >
        Go home
      </Link>
    </div>
  );
}
