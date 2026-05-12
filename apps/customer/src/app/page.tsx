export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Mizrahitality</h1>
      <p className="mt-3 text-neutral-600">
        Visit a venue at{' '}
        <code className="rounded bg-neutral-100 px-1 py-0.5">{'/<your-venue-slug>'}</code>.
      </p>
    </main>
  );
}
