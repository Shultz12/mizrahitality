// Analytics events the customer site posts back to the owner API, each tagged with the
// active visitor type. Event request/response DTOs are added by feature #6 (analytics-api).

export const ANALYTICS_EVENT_TYPES = ['visit', 'book-now-hover', 'book-now-click'] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];
