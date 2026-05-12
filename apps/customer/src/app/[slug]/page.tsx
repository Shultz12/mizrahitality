// SSR venue page. In the foundation skeleton this just echoes the slug — feature #8
// (customer-site) makes it fetch the rendered page from the owner API for the current
// visitor type and render the supplied per-audience template. No owner-API call yet.

export default async function VenuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{slug}</h1>
      <p className="mt-3 text-neutral-600">
        This venue page is wired up but not live yet — feature #8 (customer-site) renders it from
        the owner API.
      </p>
    </main>
  );
}
