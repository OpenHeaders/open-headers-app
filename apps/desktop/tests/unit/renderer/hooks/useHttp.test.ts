// @vitest-environment jsdom
/**
 * Tests for useHttp hook
 *
 * The hook is now a thin IPC wrapper — all template resolution, TOTP,
 * and HTTP execution happen in main process. Tests validate the IPC
 * delegation.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequestResult, HttpRequestSpec } from '../../../../src/types/http';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockExecuteRequest = vi.fn<(spec: HttpRequestSpec) => Promise<HttpRequestResult>>();

Object.defineProperty(window, 'electronAPI', {
  value: {
    httpRequest: {
      executeRequest: mockExecuteRequest,
      getTotpCooldown: vi.fn(),
      generateTotpPreview: vi.fn(),
    },
  },
  writable: true,
});

import { useHttp } from '../../../../src/renderer/hooks/useHttp';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const makeResult = (overrides: Partial<HttpRequestResult> = {}): HttpRequestResult => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: '{"result":"ok"}',
  duration: 100,
  responseSize: 15,
  isFiltered: false,
  ...overrides,
});

describe('useHttp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── request ──────────────────────────────────────────────────────

  describe('request', () => {
    it('delegates to electronAPI.httpRequest.executeRequest', async () => {
      mockExecuteRequest.mockResolvedValue(makeResult());

      const { result } = renderHook(() => useHttp());
      const spec: HttpRequestSpec = {
        url: 'https://api.openheaders.io/data',
        method: 'GET',
        sourceId: 'src-1',
        workspaceId: 'ws-test-1',
      };

      let response: HttpRequestResult;
      await act(async () => {
        response = await result.current.request(spec);
      });

      expect(mockExecuteRequest).toHaveBeenCalledWith(spec);
      expect(response!.statusCode).toBe(200);
      expect(response!.body).toBe('{"result":"ok"}');
    });

    it('passes through all spec fields unchanged', async () => {
      mockExecuteRequest.mockResolvedValue(makeResult());

      const { result } = renderHook(() => useHttp());
      const spec: HttpRequestSpec = {
        url: '{{API_URL}}/endpoint',
        method: 'POST',
        headers: [{ key: 'Authorization', value: 'Bearer {{TOKEN}}' }],
        queryParams: [{ key: 'page', value: '1' }],
        body: '{"name":"{{USER}}"}',
        contentType: 'application/json',
        totpSecret: '{{TOTP_SECRET}}',
        sourceId: 'src-1',
        workspaceId: 'ws-test-1',
      };

      await act(async () => {
        await result.current.request(spec);
      });

      // The spec is passed as-is — main process resolves templates
      expect(mockExecuteRequest).toHaveBeenCalledWith(spec);
    });
  });

  // ── testRequest ──────────────────────────────────────────────────

  describe('testRequest', () => {
    it('returns TestResponseContent with status and body on success', async () => {
      mockExecuteRequest.mockResolvedValue(
        makeResult({
          body: '{"ok":true}',
          duration: 150,
        }),
      );

      const { result } = renderHook(() => useHttp());
      const spec: HttpRequestSpec = {
        url: 'https://api.openheaders.io/test',
        method: 'GET',
        sourceId: 'src-1',
        workspaceId: 'ws-test-1',
      };

      let response: Awaited<ReturnType<typeof result.current.testRequest>>;
      await act(async () => {
        response = await result.current.testRequest(spec);
      });

      expect(response!.statusCode).toBe(200);
      expect(response!.body).toBe('{"ok":true}');
      expect(response!.duration).toBe(150);
    });

    it('prefixes sourceId with test- for test requests', async () => {
      mockExecuteRequest.mockResolvedValue(makeResult());

      const { result } = renderHook(() => useHttp());

      await act(async () => {
        await result.current.testRequest({
          url: 'https://api.openheaders.io/test',
          method: 'GET',
          sourceId: 'src-1',
          workspaceId: 'ws-test-1',
        });
      });

      expect(mockExecuteRequest).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'test-src-1' }));
    });

    it('returns error on request failure', async () => {
      mockExecuteRequest.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useHttp());

      let response: Awaited<ReturnType<typeof result.current.testRequest>>;
      await act(async () => {
        response = await result.current.testRequest({
          url: 'https://api.openheaders.io/test',
          method: 'GET',
          sourceId: 'src-1',
          workspaceId: 'ws-test-1',
        });
      });

      expect(response!.error).toBe('Network error');
      expect(response!.statusCode).toBe(0);
    });

    it('returns filtered body when JSON filter is applied', async () => {
      mockExecuteRequest.mockResolvedValue(
        makeResult({
          body: '{"data":{"value":42}}',
          filteredBody: '42',
          isFiltered: true,
          filteredWith: 'data.value',
          originalResponse: '{"data":{"value":42}}',
        }),
      );

      const { result } = renderHook(() => useHttp());

      let response: Awaited<ReturnType<typeof result.current.testRequest>>;
      await act(async () => {
        response = await result.current.testRequest({
          url: 'https://api.openheaders.io/test',
          method: 'GET',
          sourceId: 'src-1',
          workspaceId: 'ws-test-1',
          jsonFilter: { enabled: true, path: 'data.value' },
        });
      });

      expect(response!.body).toBe('42');
      expect(response!.filteredWith).toBe('data.value');
    });
  });
});
