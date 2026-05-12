import { describe, expect, it } from 'vitest';
import { BOOK_NOW_LABEL, POWERED_BY_TEXT, RENDERED_PAGE_SCHEMA_VERSION } from './page';
import {
  BOOK_NOW_LABEL as ReexportedLabel,
  POWERED_BY_TEXT as ReexportedPoweredBy,
  RENDERED_PAGE_SCHEMA_VERSION as ReexportedVersion,
} from './index';

describe('RenderedPage DTO surface', () => {
  it('exposes the schema version and the fixed UI strings', () => {
    expect(RENDERED_PAGE_SCHEMA_VERSION).toBe(1);
    expect(BOOK_NOW_LABEL).toBe('Book Now');
    expect(POWERED_BY_TEXT).toBe('Powered by Mizrahitality');
  });

  it('re-exports them from the package index', () => {
    expect(ReexportedLabel).toBe(BOOK_NOW_LABEL);
    expect(ReexportedPoweredBy).toBe(POWERED_BY_TEXT);
    expect(ReexportedVersion).toBe(RENDERED_PAGE_SCHEMA_VERSION);
  });
});
