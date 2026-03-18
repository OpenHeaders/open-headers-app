// @vitest-environment jsdom
/**
 * Tests for useHeaderRules hook
 *
 * Validates header rule CRUD and toggle operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const mockShowMessage = vi.fn();
vi.mock('../../../../src/renderer/utils/ui/messageUtil', () => ({
  showMessage: (...args: unknown[]) => mockShowMessage(...args),
}));

const mockAddHeaderRule = vi.fn();
const mockUpdateHeaderRule = vi.fn();
const mockRemoveHeaderRule = vi.fn();

const mockRules = [
  { id: 'rule-1', headerName: 'Authorization', headerValue: 'Bearer token', isEnabled: true },
  { id: 'rule-2', headerName: 'X-Custom', headerValue: 'value', isEnabled: false },
];

vi.mock('../../../../src/renderer/hooks/useCentralizedWorkspace', () => ({
  useCentralizedWorkspace: () => ({
    rules: { header: mockRules },
    service: {
      addHeaderRule: mockAddHeaderRule,
      updateHeaderRule: mockUpdateHeaderRule,
      removeHeaderRule: mockRemoveHeaderRule,
    },
  }),
}));

import { useHeaderRules } from '../../../../src/renderer/hooks/workspace/useHeaderRules';

describe('useHeaderRules', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockShowMessage.mockClear();
    mockAddHeaderRule.mockReset().mockResolvedValue(undefined);
    mockUpdateHeaderRule.mockReset().mockResolvedValue(undefined);
    mockRemoveHeaderRule.mockReset().mockResolvedValue(undefined);
  });

  it('returns header rules from centralized workspace', () => {
    const { result } = renderHook(() => useHeaderRules());
    expect(result.current.rules).toEqual(mockRules);
  });

  describe('addRule', () => {
    it('adds rule and shows success', async () => {
      const { result } = renderHook(() => useHeaderRules());

      let added = false;
      await act(async () => {
        added = await result.current.addRule({ headerName: 'X-New', headerValue: 'val' });
      });

      expect(added).toBe(true);
      expect(mockAddHeaderRule).toHaveBeenCalledWith({ headerName: 'X-New', headerValue: 'val' });
      expect(mockShowMessage).toHaveBeenCalledWith('success', 'Rule added successfully');
    });

    it('returns false on error', async () => {
      mockAddHeaderRule.mockRejectedValue(new Error('Duplicate'));

      const { result } = renderHook(() => useHeaderRules());

      let added = true;
      await act(async () => {
        added = await result.current.addRule({ headerName: 'X-Dup' });
      });

      expect(added).toBe(false);
      expect(mockShowMessage).toHaveBeenCalledWith('error', 'Duplicate');
    });
  });

  describe('updateRule', () => {
    it('updates rule and returns true', async () => {
      const { result } = renderHook(() => useHeaderRules());

      let updated = false;
      await act(async () => {
        updated = await result.current.updateRule('rule-1', { headerValue: 'new-value' });
      });

      expect(updated).toBe(true);
      expect(mockUpdateHeaderRule).toHaveBeenCalledWith('rule-1', { headerValue: 'new-value' });
    });
  });

  describe('removeRule', () => {
    it('removes rule and shows success', async () => {
      const { result } = renderHook(() => useHeaderRules());

      let removed = false;
      await act(async () => {
        removed = await result.current.removeRule('rule-1');
      });

      expect(removed).toBe(true);
      expect(mockRemoveHeaderRule).toHaveBeenCalledWith('rule-1');
      expect(mockShowMessage).toHaveBeenCalledWith('success', 'Rule removed');
    });
  });

  describe('toggleRule', () => {
    it('enables a rule', async () => {
      const { result } = renderHook(() => useHeaderRules());

      let toggled = false;
      await act(async () => {
        toggled = await result.current.toggleRule('rule-2', true);
      });

      expect(toggled).toBe(true);
      expect(mockUpdateHeaderRule).toHaveBeenCalledWith('rule-2', { isEnabled: true });
    });

    it('disables a rule', async () => {
      const { result } = renderHook(() => useHeaderRules());

      await act(async () => {
        await result.current.toggleRule('rule-1', false);
      });

      expect(mockUpdateHeaderRule).toHaveBeenCalledWith('rule-1', { isEnabled: false });
    });

    it('returns false on error', async () => {
      mockUpdateHeaderRule.mockRejectedValue(new Error('Not found'));

      const { result } = renderHook(() => useHeaderRules());

      let toggled = true;
      await act(async () => {
        toggled = await result.current.toggleRule('bad-id', true);
      });

      expect(toggled).toBe(false);
      expect(mockShowMessage).toHaveBeenCalledWith('error', 'Not found');
    });
  });
});
