// @vitest-environment jsdom
/**
 * Tests for useHeaderRules hook
 *
 * Validates header rule CRUD and toggle operations.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const mockShowMessage = vi.fn();
vi.mock('@/renderer/utils/ui/messageUtil', () => ({
  showMessage: (...args: unknown[]) => mockShowMessage(...args),
}));

const mockAddHeaderRule = vi.fn();
const mockUpdateHeaderRule = vi.fn();
const mockRemoveHeaderRule = vi.fn();

const mockRules = [
  {
    id: 'rule-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    headerName: 'Authorization',
    headerValue: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQG9wZW5oZWFkZXJzLmlvIn0.sig',
    isEnabled: true,
  },
  {
    id: 'rule-b2c3d4e5-f6a7-8901-bcde-f12345678901',
    headerName: 'X-Tenant-ID',
    headerValue: 'org-openheaders-prod',
    isEnabled: false,
  },
];

vi.mock('@/renderer/hooks/useCentralizedWorkspace', () => ({
  useCentralizedWorkspace: () => ({
    rules: { header: mockRules },
    service: {
      addHeaderRule: mockAddHeaderRule,
      updateHeaderRule: mockUpdateHeaderRule,
      removeHeaderRule: mockRemoveHeaderRule,
    },
  }),
}));

import { useHeaderRules } from '@/renderer/hooks/workspace/useHeaderRules';

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
      const newRule = {
        headerName: 'X-Correlation-ID',
        headerValue: 'req-c3d4e5f6-a7b8-9012',
      };
      await act(async () => {
        added = await result.current.addRule(newRule);
      });

      expect(added).toBe(true);
      expect(mockAddHeaderRule).toHaveBeenCalledOnce();
      expect(mockAddHeaderRule).toHaveBeenCalledWith(newRule);
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
      const ruleId = 'rule-a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      await act(async () => {
        updated = await result.current.updateRule(ruleId, { headerValue: 'Bearer new-token-value' });
      });

      expect(updated).toBe(true);
      expect(mockUpdateHeaderRule).toHaveBeenCalledOnce();
      expect(mockUpdateHeaderRule).toHaveBeenCalledWith(ruleId, { headerValue: 'Bearer new-token-value' });
    });
  });

  describe('removeRule', () => {
    it('removes rule and shows success', async () => {
      const { result } = renderHook(() => useHeaderRules());

      let removed = false;
      await act(async () => {
        removed = await result.current.removeRule('rule-a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      });

      expect(removed).toBe(true);
      expect(mockRemoveHeaderRule).toHaveBeenCalledWith('rule-a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(mockShowMessage).toHaveBeenCalledWith('success', 'Rule removed');
    });
  });

  describe('toggleRule', () => {
    it('enables a rule', async () => {
      const { result } = renderHook(() => useHeaderRules());

      let toggled = false;
      await act(async () => {
        toggled = await result.current.toggleRule('rule-b2c3d4e5-f6a7-8901-bcde-f12345678901', true);
      });

      expect(toggled).toBe(true);
      expect(mockUpdateHeaderRule).toHaveBeenCalledWith('rule-b2c3d4e5-f6a7-8901-bcde-f12345678901', {
        isEnabled: true,
      });
    });

    it('disables a rule', async () => {
      const { result } = renderHook(() => useHeaderRules());

      await act(async () => {
        await result.current.toggleRule('rule-a1b2c3d4-e5f6-7890-abcd-ef1234567890', false);
      });

      expect(mockUpdateHeaderRule).toHaveBeenCalledWith('rule-a1b2c3d4-e5f6-7890-abcd-ef1234567890', {
        isEnabled: false,
      });
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
