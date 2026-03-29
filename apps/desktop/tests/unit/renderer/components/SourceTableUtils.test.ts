import { describe, expect, it, vi } from 'vitest';
import {
  debugRefreshState,
  formatTimeRemaining,
  trimContent,
} from '../../../../src/renderer/components/sources/source-table/SourceTableUtils';

// ======================================================================
// formatTimeRemaining
// ======================================================================
describe('formatTimeRemaining', () => {
  it('formats seconds only', () => {
    expect(formatTimeRemaining(45000)).toBe('0m 45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimeRemaining(330000)).toBe('5m 30s');
  });

  it('formats with hours', () => {
    expect(formatTimeRemaining(3661000)).toBe('1h 1m 1s');
  });

  it('formats zero', () => {
    expect(formatTimeRemaining(0)).toBe('0m 0s');
  });

  it('formats exactly one hour', () => {
    expect(formatTimeRemaining(3600000)).toBe('1h 0m 0s');
  });

  it('formats exactly 5 minutes', () => {
    expect(formatTimeRemaining(300000)).toBe('5m 0s');
  });
});

// ======================================================================
// trimContent
// ======================================================================
describe('trimContent', () => {
  it('returns "No content yet" for empty string', () => {
    expect(trimContent('')).toBe('No content yet');
  });

  it('returns short content as-is', () => {
    expect(trimContent('short')).toBe('short');
  });

  it('returns content of exactly 30 chars as-is', () => {
    const str = 'a'.repeat(30);
    expect(trimContent(str)).toBe(str);
  });

  it('trims long content with middle ellipsis', () => {
    const long = 'ABCDEFGHIJ' + 'x'.repeat(20) + '0123456789';
    const result = trimContent(long);
    expect(result).toBe('ABCDEFGHIJ...0123456789');
  });
});

// ======================================================================
// debugRefreshState
// ======================================================================
describe('debugRefreshState', () => {
  it('calls log.debug with structured message', () => {
    const mockLog = { debug: vi.fn() };
    const mockTimeManager = {
      getDate: () => new Date('2024-01-15T14:30:45.000Z'),
    };

    debugRefreshState(123, 'Manual Refresh', { test: true }, mockLog, mockTimeManager);

    expect(mockLog.debug).toHaveBeenCalledTimes(1);
    const callArgs = mockLog.debug.mock.calls[0];
    expect(callArgs[0]).toContain('14:30:45');
    expect(callArgs[0]).toContain('RefreshTable');
    expect(callArgs[0]).toContain('123');
    expect(callArgs[0]).toContain('Manual Refresh');
    expect(callArgs[1]).toEqual({ test: true });
  });
});
