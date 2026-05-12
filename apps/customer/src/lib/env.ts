// Fail-fast environment access for mizrahitality-customer. `env` throws at module load if a
// required variable is missing. Consumed (since feature #8, customer-site) by the SSR venue page
// (`app/[slug]/page.tsx` → `GET …/page`) and the `trackEventAction` Server Action (→ `POST …/events`).

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  /** Base URL of the mizrahitality-owner REST API. */
  OWNER_API_BASE_URL: required('OWNER_API_BASE_URL'),
} as const;
