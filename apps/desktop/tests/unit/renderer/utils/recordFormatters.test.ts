import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  format24HTimeWithMs,
  formatBytes,
  formatConsoleArg,
  formatDuration,
  formatFileSize,
  formatMilliseconds,
  formatRelativeTime,
  formatRelativeTimeWithSmallMs,
  formatTimeAgo,
  formatTimestamp,
} from '../../../../src/renderer/utils/formatters/recordFormatters';

// ======================================================================
// formatDuration
// ======================================================================
describe('formatDuration', () => {
  it('formats seconds only', () => {
    expect(formatDuration(5000)).toBe('5s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(125000)).toBe('2m 5s');
  });

  it('formats 0ms', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('formats less than a second', () => {
    expect(formatDuration(500)).toBe('0s');
  });

  it('formats exactly 60 seconds', () => {
    expect(formatDuration(60000)).toBe('1m 0s');
  });
});

// ======================================================================
// formatTimestamp
// ======================================================================
describe('formatTimestamp', () => {
  it('formats a known timestamp', () => {
    // Use a fixed date to avoid timezone issues
    const date = new Date(2024, 0, 15, 10, 30, 45); // Jan 15, 2024 10:30:45
    const result = formatTimestamp(date.getTime());
    expect(result).toContain('15 January 2024');
    expect(result).toContain('10:30:45');
  });

  it('pads hours, minutes, seconds with zeros', () => {
    const date = new Date(2024, 5, 1, 5, 3, 7); // June 1, 2024 05:03:07
    const result = formatTimestamp(date.getTime());
    expect(result).toContain('05:03:07');
  });
});

// ======================================================================
// formatConsoleArg
// ======================================================================
describe('formatConsoleArg', () => {
  it('formats null', () => {
    expect(formatConsoleArg(null)).toBe('null');
  });

  it('formats undefined', () => {
    expect(formatConsoleArg(undefined)).toBe('undefined');
  });

  it('formats Error type', () => {
    expect(formatConsoleArg({ __type: 'Error', message: 'oops' })).toBe('Error: oops');
  });

  it('formats HTMLElement type', () => {
    expect(
      formatConsoleArg({
        __type: 'HTMLElement',
        tagName: 'div',
        id: 'main',
        className: 'container',
      }),
    ).toBe('<div#main.container>');
  });

  it('formats HTMLElement without id or class', () => {
    expect(
      formatConsoleArg({
        __type: 'HTMLElement',
        tagName: 'span',
        id: '',
        className: '',
      }),
    ).toBe('<span>');
  });

  it('formats Function type', () => {
    expect(formatConsoleArg({ __type: 'Function', name: 'myFunc' })).toBe('ƒ myFunc()');
  });

  it('formats plain objects as JSON', () => {
    const result = formatConsoleArg({ key: 'value' } as unknown as Parameters<typeof formatConsoleArg>[0]);
    expect(JSON.parse(result)).toEqual({ key: 'value' });
  });

  it('handles circular objects gracefully', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatConsoleArg(circular)).toBe('[Object]');
  });

  it('formats strings', () => {
    expect(formatConsoleArg('hello')).toBe('hello');
  });

  it('formats numbers', () => {
    expect(formatConsoleArg(42)).toBe('42');
  });

  it('formats booleans', () => {
    expect(formatConsoleArg(true)).toBe('true');
  });
});

// ======================================================================
// formatBytes / formatFileSize
// ======================================================================
describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });

  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formatFileSize is alias for formatBytes', () => {
    expect(formatFileSize).toBe(formatBytes);
  });
});

// ======================================================================
// formatMilliseconds
// ======================================================================
describe('formatMilliseconds', () => {
  it('formats sub-second as ms', () => {
    expect(formatMilliseconds(150)).toBe('150 ms');
  });

  it('formats >= 1000ms as seconds', () => {
    expect(formatMilliseconds(1500)).toBe('1.50 s');
  });

  it('formats exactly 1000ms', () => {
    expect(formatMilliseconds(1000)).toBe('1.00 s');
  });

  it('rounds sub-second values', () => {
    expect(formatMilliseconds(0.7)).toBe('1 ms');
  });
});

// ======================================================================
// formatRelativeTime
// ======================================================================
describe('formatRelativeTime', () => {
  it('formats zero', () => {
    expect(formatRelativeTime(0)).toBe('00:00.000');
  });

  it('formats seconds and milliseconds', () => {
    expect(formatRelativeTime(5123)).toBe('00:05.123');
  });

  it('formats minutes', () => {
    expect(formatRelativeTime(125456)).toBe('02:05.456');
  });
});

// ======================================================================
// formatRelativeTimeWithSmallMs
// ======================================================================
describe('formatRelativeTimeWithSmallMs', () => {
  it('returns main and ms parts', () => {
    const result = formatRelativeTimeWithSmallMs(65123);
    expect(result.main).toBe('01:05');
    expect(result.ms).toBe('.123');
  });

  it('pads correctly for zero', () => {
    const result = formatRelativeTimeWithSmallMs(0);
    expect(result.main).toBe('00:00');
    expect(result.ms).toBe('.000');
  });
});

// ======================================================================
// format24HTimeWithMs
// ======================================================================
describe('format24HTimeWithMs', () => {
  it('returns date, time, and ms parts', () => {
    const date = new Date(2024, 5, 6, 14, 30, 45, 123); // June 6, 2024
    const result = format24HTimeWithMs(date);
    expect(result.date).toBe('6 June 2024');
    expect(result.time).toBe('14:30:45');
    expect(result.ms).toBe('.123');
  });

  it('pads time components', () => {
    const date = new Date(2024, 0, 1, 5, 3, 7, 8);
    const result = format24HTimeWithMs(date);
    expect(result.time).toBe('05:03:07');
    expect(result.ms).toBe('.008');
  });
});

// ======================================================================
// formatTimeAgo
// ======================================================================
describe('formatTimeAgo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats seconds ago', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const result = formatTimeAgo(now - 10000);
    expect(result).toBe('Recorded 10s ago');
  });

  it('formats minutes and seconds ago', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const result = formatTimeAgo(now - 125000);
    expect(result).toBe('Recorded 2m 5s ago');
  });

  it('formats hours, minutes, seconds ago', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const result = formatTimeAgo(now - 3725000); // 1h 2m 5s
    expect(result).toBe('Recorded 1h 2m 5s ago');
  });

  it('formats days', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const result = formatTimeAgo(now - 90061000); // 1d 1h 1m 1s
    expect(result).toMatch(/Recorded 1d/);
  });

  it('handles future timestamp', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(formatTimeAgo(now + 10000)).toBe('Recorded in the future');
  });

  it('handles exact now', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(formatTimeAgo(now)).toBe('Recorded 0s ago');
  });
});
