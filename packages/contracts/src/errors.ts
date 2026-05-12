// Error envelope for the owner REST API (open — localhost-only demo; no auth).

export interface ApiError {
  /** Machine-readable code, e.g. `not_found`, `bad_request`. */
  error: string;
  /** Human-readable explanation. */
  message: string;
}
