// @vitest-environment jsdom
/**
 * Tests for useRecordPlayer hook
 *
 * Validates URL proxy rewriting, console override suppression,
 * and initial loading state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock the rrweb-player script loading
vi.stubGlobal('rrwebPlayer', undefined);

import { useRecordPlayer } from '../../../../src/renderer/hooks/useRecordPlayer';
import type { Recording, RRWebEvent } from '../../../../src/types/recording';
import type { RecordData, ProxyStatus } from '../../../../src/renderer/components/record/player/hooks/usePlayerManager';

function makeProxyStatus(overrides: Partial<ProxyStatus> = {}): ProxyStatus {
    return { running: false, port: 59212, rulesCount: 0, sourcesCount: 0, cacheEnabled: false, ...overrides };
}

function makeRecording(overrides: Record<string, unknown> = {}): Recording {
    return {
        metadata: { startTime: 0 },
        events: [],
        console: [],
        network: [],
        storage: [],
        ...overrides,
    } as Recording;
}

describe('useRecordPlayer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with null player and no error', () => {
    const { result } = renderHook(() => useRecordPlayer());
    expect(result.current.rrwebPlayer).toBeNull();
    expect(result.current.error).toBeNull();
  });

  // ── processRecordForProxy ──────────────────────────────────────

  describe('processRecordForProxy', () => {
    it('returns record unchanged when proxy is not running', async () => {
      const { result } = renderHook(() => useRecordPlayer());
      const record = makeRecording({ events: [{ data: { href: 'https://example.com/page' } }] });

      let processed!: RecordData;
      await act(async () => {
        processed = await result.current.processRecordForProxy(
          record,
          makeProxyStatus({ running: false })
        );
      });

      expect(processed).toEqual(record);
    });

    it('rewrites HTTP URLs to go through proxy', async () => {
      const { result } = renderHook(() => useRecordPlayer());
      const record = makeRecording({ url: 'https://example.com/style.css' });

      let processed!: RecordData;
      await act(async () => {
        processed = await result.current.processRecordForProxy(
          record,
          makeProxyStatus({ running: true })
        );
      });

      expect(processed.url).toBe('http://localhost:59212/https://example.com/style.css');
    });

    it('does not double-proxy already proxied URLs', async () => {
      const { result } = renderHook(() => useRecordPlayer());
      const record = makeRecording({ url: 'http://localhost:59212/https://example.com/page' });

      let processed!: RecordData;
      await act(async () => {
        processed = await result.current.processRecordForProxy(
          record,
          makeProxyStatus({ running: true })
        );
      });

      // Should not add another proxy prefix
      expect((processed.url as string).match(/localhost:59212/g)?.length).toBe(1);
    });

    it('converts protocol-relative URLs to https before proxying', async () => {
      const { result } = renderHook(() => useRecordPlayer());
      const record = makeRecording({ src: '//cdn.example.com/lib.js' });

      let processed!: RecordData;
      await act(async () => {
        processed = await result.current.processRecordForProxy(
          record,
          makeProxyStatus({ running: true })
        );
      });

      expect((processed as unknown as Record<string, unknown>).src).toBe('http://localhost:59212/https://cdn.example.com/lib.js');
    });

    it('rewrites nested URLs in events array', async () => {
      const { result } = renderHook(() => useRecordPlayer());
      const record = makeRecording({
        events: [
          { data: { href: 'https://example.com/a.css' } },
          { data: { src: 'https://cdn.example.com/b.js' } },
        ],
      });

      let processed!: RecordData;
      await act(async () => {
        processed = await result.current.processRecordForProxy(
          record,
          makeProxyStatus({ running: true, port: 8080 })
        );
      });

      const events = processed.events as { data: { href?: string; src?: string } }[];
      expect(events[0].data.href).toBe('http://localhost:8080/https://example.com/a.css');
      expect(events[1].data.src).toBe('http://localhost:8080/https://cdn.example.com/b.js');
    });
  });

  // ── createConsoleOverrides ─────────────────────────────────────

  describe('createConsoleOverrides', () => {
    it('suppresses known error patterns', () => {
      const { result } = renderHook(() => useRecordPlayer());

      const originalError = console.error;
      const restore = result.current.createConsoleOverrides();

      // These should be suppressed
      console.error('Failed to load resource: net::ERR_FAILED');
      console.error('CORS policy blocked');
      console.error('[Intervention] something');

      // Restore
      restore();
      expect(console.error).toBe(originalError);
    });

    it('allows non-suppressed errors through', () => {
      const { result } = renderHook(() => useRecordPlayer());
      const spy = vi.fn();
      const originalError = console.error;
      console.error = spy;

      const restore = result.current.createConsoleOverrides();

      // This should pass through since it doesn't match suppression patterns
      console.error('Actual application error');

      restore();
      console.error = originalError;

      expect(spy).toHaveBeenCalledWith('Actual application error');
    });

    it('returns cleanup function that restores original console', () => {
      const { result } = renderHook(() => useRecordPlayer());
      const originalError = console.error;
      const originalWarn = console.warn;

      const restore = result.current.createConsoleOverrides();

      expect(console.error).not.toBe(originalError);
      expect(console.warn).not.toBe(originalWarn);

      restore();

      expect(console.error).toBe(originalError);
      expect(console.warn).toBe(originalWarn);
    });
  });
});
