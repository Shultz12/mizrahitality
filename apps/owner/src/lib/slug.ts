// Slug derivation for venues — pure, no Next.js / Prisma imports, unit-tested directly.
// The rule: the owner types a venue name (already validated to English letters + spaces); the
// slug is that name lowercased with all whitespace removed, with a numeric suffix appended on
// collision (`bluelagoon`, `bluelagoon2`, `bluelagoon3`, …). Used by the builder Server Action.

/**
 * The slug "base" for a (validated) venue name: lowercase it and strip all whitespace.
 * Defensively also strips anything that isn't `[a-z]`, so a name that slipped past validation
 * still yields a clean slug. `"Blue Lagoon"` → `"bluelagoon"`.
 */
export function deriveSlugBase(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Find the first free slug starting from `base`: try `base`, then `base2`, `base3`, … until
 * `isTaken` says it's available. `isTaken` is injected so this stays unit-testable and so the
 * rename case can pass a predicate that excludes the venue's own current slug.
 */
export async function nextAvailableSlug(
  base: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  if (!(await isTaken(base))) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
}
