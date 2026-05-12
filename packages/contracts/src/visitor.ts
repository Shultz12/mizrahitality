// Visitor type = gender × age group (6) + a neutral default = 7 page variants per venue.
// The visitor type is never shown to the visitor or put in a URL — it travels server-side
// inside the owner↔customer API call. Wire/canonical form: `<gender>-<ageGroup>` | `neutral`
// (e.g. `male-18-30`, `female-50+`); `50+` is kept verbatim in the canonical/DB value and
// URL-encoded on the wire (`encodeURIComponent` → `50%2B`).

export const VISITOR_GENDERS = ['male', 'female'] as const;
export type VisitorGender = (typeof VISITOR_GENDERS)[number];

export const AGE_GROUPS = ['18-30', '31-50', '50+'] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const NEUTRAL_VISITOR_TYPE = 'neutral' as const;
export type NeutralVisitorType = typeof NEUTRAL_VISITOR_TYPE;

/** A targeted (non-neutral) variant key, e.g. `male-18-30`. */
export type TypedVisitorType = `${VisitorGender}-${AgeGroup}`;

/** Every page variant a published venue has. Exactly 7 values. */
export type VisitorType = TypedVisitorType | NeutralVisitorType;

/** All visitor variants for a published venue — exactly 7, in a deterministic order. */
export function allVisitorVariants(): VisitorType[] {
  const typed: TypedVisitorType[] = [];
  for (const gender of VISITOR_GENDERS) {
    for (const ageGroup of AGE_GROUPS) {
      typed.push(`${gender}-${ageGroup}`);
    }
  }
  return [...typed, NEUTRAL_VISITOR_TYPE];
}

const VISITOR_TYPE_SET: ReadonlySet<string> = new Set<string>(allVisitorVariants());

/** Type guard: is `value` one of the 7 visitor variants? */
export function isVisitorType(value: unknown): value is VisitorType {
  return typeof value === 'string' && VISITOR_TYPE_SET.has(value);
}

/**
 * Coerce arbitrary input (e.g. a query param or cookie) to a `VisitorType`,
 * defaulting to `neutral` when it is missing or unrecognised.
 */
export function parseVisitorType(value: string | null | undefined): VisitorType {
  return isVisitorType(value) ? value : NEUTRAL_VISITOR_TYPE;
}
