import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_EVENT_TYPES,
  isAnalyticsEventType,
  parseAnalyticsEventRequest,
} from './analytics';
import { parseAnalyticsEventRequest as ReexportedParse } from './index';

describe('isAnalyticsEventType', () => {
  it('accepts the three event types and rejects anything else', () => {
    for (const t of ANALYTICS_EVENT_TYPES) expect(isAnalyticsEventType(t)).toBe(true);
    for (const v of ['', 'visited', 'click', null, 42, {}])
      expect(isAnalyticsEventType(v)).toBe(false);
  });
});

describe('parseAnalyticsEventRequest', () => {
  it('accepts a full valid body', () => {
    const result = parseAnalyticsEventRequest({
      type: 'book-now-click',
      visitorType: 'male-50+',
      sessionId: 's1',
    });
    expect(result).toEqual({
      ok: true,
      value: { type: 'book-now-click', visitorType: 'male-50+', sessionId: 's1' },
    });
  });

  it('accepts a body with no sessionId — normalises it to null', () => {
    const result = parseAnalyticsEventRequest({ type: 'visit', visitorType: 'neutral' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sessionId).toBeNull();
  });

  it('accepts an explicit null sessionId', () => {
    const result = parseAnalyticsEventRequest({
      type: 'visit',
      visitorType: 'female-18-30',
      sessionId: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sessionId).toBeNull();
  });

  it('rejects an unknown event type', () => {
    const result = parseAnalyticsEventRequest({ type: 'foo', visitorType: 'neutral' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/type/);
  });

  it('rejects an unknown visitor type', () => {
    const result = parseAnalyticsEventRequest({ type: 'visit', visitorType: 'martian' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/visitorType/);
  });

  it('rejects a non-object body', () => {
    for (const v of ['hello', 42, null, ['visit'], true]) {
      expect(parseAnalyticsEventRequest(v).ok, JSON.stringify(v)).toBe(false);
    }
  });

  it('rejects an empty-string sessionId', () => {
    const result = parseAnalyticsEventRequest({
      type: 'visit',
      visitorType: 'neutral',
      sessionId: '',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/sessionId/);
  });

  it('rejects a non-string sessionId', () => {
    const result = parseAnalyticsEventRequest({
      type: 'visit',
      visitorType: 'neutral',
      sessionId: 7,
    });
    expect(result.ok).toBe(false);
  });

  it('is re-exported from the package index', () => {
    expect(ReexportedParse).toBe(parseAnalyticsEventRequest);
  });
});
