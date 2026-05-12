// Shown when the owner REST API can't be reached (or returns something we can't render) — REQ-19,
// the "owner API down" case. A calm, centered notice in the Warm Minimalist palette: no stack
// trace, no client JS. The "venue doesn't exist" case (a 404 from the API) is `app/[slug]/not-found.tsx`
// instead.

export function ServiceUnavailable() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1
        style={{ fontFamily: 'var(--font-playfair)' }}
        className="text-[28px] font-semibold leading-[1.2] text-[#2C2824]"
      >
        We can&rsquo;t load this page right now
      </h1>
      <p className="text-[15px] leading-[1.6] text-[#2C2824]/70">
        Something went wrong reaching the venue. Please try again in a moment.
      </p>
    </div>
  );
}
