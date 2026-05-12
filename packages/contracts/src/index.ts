// @mizrahitality/contracts — the only thing the owner and customer apps share.
// Types + plain constants, zero runtime dependencies, consumed as TypeScript source.
// DTOs (rendered-page payload, analytics event shapes) are added by the features that
// introduce them (#5 published-page-ssr added `page.ts`; #6 analytics-api adds the event shapes).

export * from './visitor';
export * from './slots';
export * from './copy';
export * from './page';
export * from './analytics';
export * from './errors';
