// Fail-fast environment access for mizrahitality-customer. `env` throws at module load if a
// required variable is missing. Nothing imports this module in the foundation skeleton —
// feature #8 (customer-site) wires it into the SSR page → owner-API call.

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
