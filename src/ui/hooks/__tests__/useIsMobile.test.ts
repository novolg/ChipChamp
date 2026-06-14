// src/ui/hooks/__tests__/useIsMobile.test.ts  (fallback — no testing-library)
import { describe, expect, it } from 'vitest';
import { MOBILE_QUERY } from '../useIsMobile';

describe('useIsMobile', () => {
  it('exposes the breakpoint query string', () => {
    expect(MOBILE_QUERY).toBe('(max-width: 760px)');
  });
});
