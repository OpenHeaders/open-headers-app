// @vitest-environment jsdom
/**
 * Tests for useProxyRules hook
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const mockShowMessage = vi.fn();
vi.mock('../../../../src/renderer/utils', () => ({
  showMessage: (...args: unknown[]) => mockShowMessage(...args),
}));

const mockAddProxyRule = vi.fn();
const mockRemoveProxyRule = vi.fn();

const mockProxyRules = [
  {
    id: 'pr-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    headerName: 'Authorization',
    headerValue: 'Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig',
    domains: ['*.openheaders.io', 'api.partner-service.io'],
    enabled: true,
  },
  {
    id: 'pr-b2c3d4e5-f6a7-8901-bcde-f12345678901',
    headerName: 'Cache-Control',
    headerValue: 'no-cache',
    domains: ['*.staging.openheaders.io'],
    enabled: true,
  },
];

vi.mock('../../../../src/renderer/hooks/useCentralizedWorkspace', () => ({
  useCentralizedWorkspace: () => ({
    proxyRules: mockProxyRules,
    service: {
      addProxyRule: mockAddProxyRule,
      removeProxyRule: mockRemoveProxyRule,
    },
  }),
}));

import { useProxyRules } from '@/renderer/hooks/workspace/useProxyRules';

describe('useProxyRules', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockShowMessage.mockClear();
    mockAddProxyRule.mockReset().mockResolvedValue(undefined);
    mockRemoveProxyRule.mockReset().mockResolvedValue(undefined);
  });

  it('returns proxy rules from workspace service', () => {
    const { result } = renderHook(() => useProxyRules());
    expect(result.current.rules).toEqual(mockProxyRules);
    expect(result.current.rules).toHaveLength(2);
  });

  it('exposes addRule and removeRule functions', () => {
    const { result } = renderHook(() => useProxyRules());
    expect(typeof result.current.addRule).toBe('function');
    expect(typeof result.current.removeRule).toBe('function');
  });

  describe('addRule', () => {
    it('adds enterprise rule and shows success message', async () => {
      const { result } = renderHook(() => useProxyRules());

      const newRule = {
        id: 'pr-c3d4e5f6-a7b8-9012-cdef-123456789012',
        headerName: 'X-Tenant-ID',
        headerValue: 'org-openheaders-prod',
        domains: ['*.openheaders.io'],
      };

      let added = false;
      await act(async () => {
        added = await result.current.addRule(newRule);
      });

      expect(added).toBe(true);
      expect(mockAddProxyRule).toHaveBeenCalledOnce();
      expect(mockAddProxyRule).toHaveBeenCalledWith(newRule);
      expect(mockShowMessage).toHaveBeenCalledWith('success', 'Proxy rule added');
    });

    it('returns false and shows error on failure', async () => {
      mockAddProxyRule.mockRejectedValue(new Error('Invalid rule: headerName is required'));

      const { result } = renderHook(() => useProxyRules());

      let added = true;
      await act(async () => {
        added = await result.current.addRule({ id: 'bad-1', headerName: '' });
      });

      expect(added).toBe(false);
      expect(mockShowMessage).toHaveBeenCalledWith('error', 'Invalid rule: headerName is required');
    });
  });

  describe('removeRule', () => {
    it('removes rule by ID and shows success message', async () => {
      const { result } = renderHook(() => useProxyRules());

      let removed = false;
      await act(async () => {
        removed = await result.current.removeRule('pr-a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      });

      expect(removed).toBe(true);
      expect(mockRemoveProxyRule).toHaveBeenCalledOnce();
      expect(mockRemoveProxyRule).toHaveBeenCalledWith('pr-a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(mockShowMessage).toHaveBeenCalledWith('success', 'Proxy rule removed');
    });

    it('returns false and shows error on failure', async () => {
      mockRemoveProxyRule.mockRejectedValue(new Error('Rule not found'));

      const { result } = renderHook(() => useProxyRules());

      let removed = true;
      await act(async () => {
        removed = await result.current.removeRule('nonexistent-id');
      });

      expect(removed).toBe(false);
      expect(mockShowMessage).toHaveBeenCalledWith('error', 'Rule not found');
    });
  });
});
