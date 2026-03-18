// @vitest-environment jsdom
/**
 * Tests for useHttp hook
 *
 * Validates JSON filter logic, URL-encoded body conversion,
 * variable substitution, and request/test flow with mocked electronAPI.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

const mockResolveTemplate = vi.fn((text: string) => text);
const mockResolveObjectTemplate = vi.fn((obj: unknown) => obj);
const mockWaitForEnvironments = vi.fn().mockResolvedValue(true);
const mockRecordTotpUsage = vi.fn();
const mockGetCooldownSeconds = vi.fn().mockReturnValue(0);

vi.mock('../../../../src/renderer/contexts', () => ({
  useTotpState: () => ({
    recordTotpUsage: mockRecordTotpUsage,
    getCooldownSeconds: mockGetCooldownSeconds,
  }),
  useEnvironments: () => ({
    resolveTemplate: mockResolveTemplate,
    resolveObjectTemplate: mockResolveObjectTemplate,
    environmentsReady: true,
    waitForEnvironments: mockWaitForEnvironments,
  }),
}));

// Mock electronAPI on window
const mockMakeHttpRequest = vi.fn();
Object.defineProperty(window, 'electronAPI', {
  value: { makeHttpRequest: mockMakeHttpRequest },
  writable: true,
});

import { useHttp } from '../../../../src/renderer/hooks/useHttp';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useHttp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── applyJsonFilter ──────────────────────────────────────────────

  describe('applyJsonFilter', () => {
    it('returns body unchanged when filter is disabled', () => {
      const { result } = renderHook(() => useHttp());
      const body = '{"name":"John","age":30}';
      expect(result.current.applyJsonFilter(body, { enabled: false })).toBe(body);
    });

    it('returns body unchanged when filter path is empty', () => {
      const { result } = renderHook(() => useHttp());
      const body = '{"name":"John"}';
      expect(result.current.applyJsonFilter(body, { enabled: true, path: '' })).toBe(body);
    });

    it('extracts a top-level field', () => {
      const { result } = renderHook(() => useHttp());
      const body = '{"name":"John","age":30}';
      expect(result.current.applyJsonFilter(body, { enabled: true, path: 'name' })).toBe('John');
    });

    it('extracts a nested field', () => {
      const { result } = renderHook(() => useHttp());
      const body = '{"user":{"name":"John","address":{"city":"NYC"}}}';
      expect(result.current.applyJsonFilter(body, { enabled: true, path: 'user.address.city' })).toBe('NYC');
    });

    it('extracts an array element', () => {
      const { result } = renderHook(() => useHttp());
      const body = '{"items":["apple","banana","cherry"]}';
      expect(result.current.applyJsonFilter(body, { enabled: true, path: 'items[1]' })).toBe('banana');
    });

    it('returns formatted JSON for object results', () => {
      const { result } = renderHook(() => useHttp());
      const body = '{"user":{"name":"John","age":30}}';
      const filtered = result.current.applyJsonFilter(body, { enabled: true, path: 'user' });
      expect(JSON.parse(filtered as string)).toEqual({ name: 'John', age: 30 });
    });

    it('strips root. prefix from path', () => {
      const { result } = renderHook(() => useHttp());
      const body = '{"name":"John"}';
      expect(result.current.applyJsonFilter(body, { enabled: true, path: 'root.name' })).toBe('John');
    });

    it('returns error message for missing field', () => {
      const { result } = renderHook(() => useHttp());
      const body = '{"name":"John"}';
      const msg = result.current.applyJsonFilter(body, { enabled: true, path: 'missing' });
      expect(msg).toContain('not found');
    });

    it('returns error message for out-of-bounds array index', () => {
      const { result } = renderHook(() => useHttp());
      const body = '{"items":["a"]}';
      const msg = result.current.applyJsonFilter(body, { enabled: true, path: 'items[5]' });
      expect(msg).toContain('out of bounds');
    });

    it('returns error message when trying array access on non-array', () => {
      const { result } = renderHook(() => useHttp());
      const body = '{"items":"not-an-array"}';
      const msg = result.current.applyJsonFilter(body, { enabled: true, path: 'items[0]' });
      expect(msg).toContain('not an array');
    });

    it('handles error responses by extracting error message', () => {
      const { result } = renderHook(() => useHttp());
      const body = '{"error":"unauthorized","error_description":"Token expired"}';
      const msg = result.current.applyJsonFilter(body, { enabled: true, path: 'data' });
      expect(msg).toContain('unauthorized');
      expect(msg).toContain('Token expired');
    });

    it('works with object input (not just string)', () => {
      const { result } = renderHook(() => useHttp());
      const body = { user: { name: 'John' } };
      expect(result.current.applyJsonFilter(body, { enabled: true, path: 'user.name' })).toBe('John');
    });

    it('returns original body for non-JSON string', () => {
      const { result } = renderHook(() => useHttp());
      const body = 'not valid json';
      expect(result.current.applyJsonFilter(body, { enabled: true, path: 'field' })).toBe(body);
    });
  });

  // ── request ──────────────────────────────────────────────────────

  describe('request', () => {
    it('makes a GET request and returns parsed response', async () => {
      mockMakeHttpRequest.mockResolvedValue(JSON.stringify({
        statusCode: 200,
        body: '{"result":"ok"}',
        headers: { 'content-type': 'application/json' },
      }));

      const { result } = renderHook(() => useHttp());

      let response: Awaited<ReturnType<typeof result.current.request>>;
      await act(async () => {
        response = await result.current.request('src-1', 'https://api.example.com/data');
      });

      expect(mockMakeHttpRequest).toHaveBeenCalledWith(
        'https://api.example.com/data',
        'GET',
        expect.objectContaining({ headers: {}, queryParams: {} })
      );
      expect(response!.content).toBe('{"result":"ok"}');
      expect(response!.headers).toEqual({ 'content-type': 'application/json' });
    });

    it('applies JSON filter to response', async () => {
      mockMakeHttpRequest.mockResolvedValue(JSON.stringify({
        statusCode: 200,
        body: '{"data":{"value":42}}',
        headers: {},
      }));

      const { result } = renderHook(() => useHttp());

      let response: Awaited<ReturnType<typeof result.current.request>>;
      await act(async () => {
        response = await result.current.request(
          'src-1', 'https://api.example.com/data', 'GET', {},
          { enabled: true, path: 'data.value' }
        );
      });

      expect(response!.content).toBe('42');
      expect(response!.filteredWith).toBe('data.value');
      expect(response!.isFiltered).toBe(true);
    });

    it('substitutes environment variables in URL', async () => {
      mockResolveTemplate.mockImplementation((text: string) =>
        text.replace('{{API_URL}}', 'https://resolved.api.com')
      );
      mockMakeHttpRequest.mockResolvedValue(JSON.stringify({
        statusCode: 200, body: 'ok', headers: {},
      }));

      const { result } = renderHook(() => useHttp());
      await act(async () => {
        await result.current.request('src-1', '{{API_URL}}/endpoint');
      });

      expect(mockMakeHttpRequest).toHaveBeenCalledWith(
        'https://resolved.api.com/endpoint',
        'GET',
        expect.anything()
      );
    });

    it('throws on TOTP cooldown', async () => {
      mockGetCooldownSeconds.mockReturnValue(15);

      const { result } = renderHook(() => useHttp());

      await expect(
        act(async () => {
          await result.current.request('src-1', 'https://api.example.com', 'POST', {
            totpSecret: 'JBSWY3DPEHPK3PXP',
          });
        })
      ).rejects.toThrow('TOTP cooldown');
    });

    it('processes array headers into object format', async () => {
      mockMakeHttpRequest.mockResolvedValue(JSON.stringify({
        statusCode: 200, body: '', headers: {},
      }));

      const { result } = renderHook(() => useHttp());
      await act(async () => {
        await result.current.request('src-1', 'https://api.example.com', 'GET', {
          headers: [
            { key: 'Authorization', value: 'Bearer token123' },
            { key: 'Accept', value: 'application/json' },
          ],
        });
      });

      expect(mockMakeHttpRequest).toHaveBeenCalledWith(
        'https://api.example.com',
        'GET',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer token123',
            Accept: 'application/json',
          },
        })
      );
    });

    it('converts url-encoded body format', async () => {
      mockMakeHttpRequest.mockResolvedValue(JSON.stringify({
        statusCode: 200, body: '', headers: {},
      }));

      const { result } = renderHook(() => useHttp());
      await act(async () => {
        await result.current.request('src-1', 'https://api.example.com', 'POST', {
          contentType: 'application/x-www-form-urlencoded',
          body: 'grant_type: client_credentials\nclient_id: my-app',
        });
      });

      expect(mockMakeHttpRequest).toHaveBeenCalledWith(
        'https://api.example.com',
        'POST',
        expect.objectContaining({
          body: 'grant_type=client_credentials&client_id=my-app',
          contentType: 'application/x-www-form-urlencoded',
        })
      );
    });

    it('throws on HTTP error for non-test requests', async () => {
      mockMakeHttpRequest.mockResolvedValue(JSON.stringify({
        statusCode: 500, body: 'Internal Server Error', headers: {},
      }));

      const { result } = renderHook(() => useHttp());

      await expect(
        act(async () => {
          await result.current.request('src-1', 'https://api.example.com');
        })
      ).rejects.toThrow('HTTP 500');
    });

    it('does NOT throw on HTTP error for test requests', async () => {
      mockMakeHttpRequest.mockResolvedValue(JSON.stringify({
        statusCode: 500, body: 'Error', headers: {},
      }));

      const { result } = renderHook(() => useHttp());

      let response: Awaited<ReturnType<typeof result.current.request>>;
      await act(async () => {
        response = await result.current.request('test-src-1', 'https://api.example.com');
      });

      expect(response!.content).toBe('Error');
    });
  });

  // ── testRequest ──────────────────────────────────────────────────

  describe('testRequest', () => {
    it('returns JSON string with status and body on success', async () => {
      mockMakeHttpRequest.mockResolvedValue(JSON.stringify({
        statusCode: 200,
        body: '{"ok":true}',
        headers: { 'content-type': 'application/json' },
      }));

      const { result } = renderHook(() => useHttp());

      let response: string = '';
      await act(async () => {
        response = await result.current.testRequest(
          'https://api.example.com', 'GET', {}, { enabled: false }
        );
      });

      const parsed = JSON.parse(response);
      expect(parsed.statusCode).toBe(200);
      expect(parsed.body).toBe('{"ok":true}');
    });

    it('returns error JSON on request failure', async () => {
      mockMakeHttpRequest.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useHttp());

      let response: string = '';
      await act(async () => {
        response = await result.current.testRequest(
          'https://api.example.com', 'GET', {}, { enabled: false }
        );
      });

      const parsed = JSON.parse(response);
      expect(parsed.error).toBe('Network error');
    });
  });
});
