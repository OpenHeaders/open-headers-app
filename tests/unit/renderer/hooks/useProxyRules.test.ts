// @vitest-environment jsdom
/**
 * Tests for useProxyRules hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

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
  { id: 'pr-1', headerName: 'X-Proxy', headerValue: 'true' },
  { id: 'pr-2', headerName: 'Cache-Control', headerValue: 'no-cache' },
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

import { useProxyRules } from '../../../../src/renderer/hooks/workspace/useProxyRules';

describe('useProxyRules', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockShowMessage.mockClear();
    mockAddProxyRule.mockReset().mockResolvedValue(undefined);
    mockRemoveProxyRule.mockReset().mockResolvedValue(undefined);
  });

  it('returns proxy rules', () => {
    const { result } = renderHook(() => useProxyRules());
    expect(result.current.rules).toEqual(mockProxyRules);
  });

  describe('addRule', () => {
    it('adds rule and shows success', async () => {
      const { result } = renderHook(() => useProxyRules());

      let added = false;
      await act(async () => {
        added = await result.current.addRule({ id: 'new-1', headerName: 'X-New', headerValue: 'val' });
      });

      expect(added).toBe(true);
      expect(mockAddProxyRule).toHaveBeenCalledWith({ id: 'new-1', headerName: 'X-New', headerValue: 'val' });
      expect(mockShowMessage).toHaveBeenCalledWith('success', 'Proxy rule added');
    });

    it('returns false on error', async () => {
      mockAddProxyRule.mockRejectedValue(new Error('Invalid rule'));

      const { result } = renderHook(() => useProxyRules());

      let added = true;
      await act(async () => {
        added = await result.current.addRule({ id: 'bad-1', headerName: '' });
      });

      expect(added).toBe(false);
      expect(mockShowMessage).toHaveBeenCalledWith('error', 'Invalid rule');
    });
  });

  describe('removeRule', () => {
    it('removes rule and shows success', async () => {
      const { result } = renderHook(() => useProxyRules());

      let removed = false;
      await act(async () => {
        removed = await result.current.removeRule('pr-1');
      });

      expect(removed).toBe(true);
      expect(mockRemoveProxyRule).toHaveBeenCalledWith('pr-1');
      expect(mockShowMessage).toHaveBeenCalledWith('success', 'Proxy rule removed');
    });

    it('returns false on error', async () => {
      mockRemoveProxyRule.mockRejectedValue(new Error('Not found'));

      const { result } = renderHook(() => useProxyRules());

      let removed = true;
      await act(async () => {
        removed = await result.current.removeRule('bad-id');
      });

      expect(removed).toBe(false);
      expect(mockShowMessage).toHaveBeenCalledWith('error', 'Not found');
    });
  });
});
