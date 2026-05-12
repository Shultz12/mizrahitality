// @mizrahitality/contracts — the only thing the owner and customer apps share.
// Types + plain constants, zero runtime dependencies, consumed as TypeScript source.
// DTOs (rendered-page payload, analytics event shapes) are added by the features that
// introduce them (#5 published-page-ssr, #6 analytics-api).

export * from './visitor';
export * from './slots';
export * from './analytics';
export * from './errors';
