import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../../src/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock version
vi.mock('../../../../src/config/version', () => ({
  DATA_FORMAT_VERSION: '3.0.0',
}));

const RulesManager = (
  await import('../../../../src/renderer/services/workspace/RulesManager')
).default;

describe('RulesManager', () => {
  let manager: InstanceType<typeof RulesManager>;
  let mockStorageAPI: { loadFromStorage: ReturnType<typeof vi.fn>; saveToStorage: ReturnType<typeof vi.fn> };
  let mockElectronAPI: { updateWebSocketSources: ReturnType<typeof vi.fn>; proxySaveRule: ReturnType<typeof vi.fn>; proxyDeleteRule: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockStorageAPI = {
      loadFromStorage: vi.fn(),
      saveToStorage: vi.fn(),
    };
    mockElectronAPI = {
      updateWebSocketSources: vi.fn(),
      proxySaveRule: vi.fn(),
      proxyDeleteRule: vi.fn(),
    };
    manager = new RulesManager(mockStorageAPI, mockElectronAPI);
  });

  // ========================================================================
  // addHeaderRule (pure)
  // ========================================================================
  describe('addHeaderRule', () => {
    it('adds a rule to the header array', () => {
      const rules = { header: [], request: [], response: [] };
      const ruleData = { name: 'X-Custom', value: 'test', enabled: true };
      const result = manager.addHeaderRule(rules, ruleData);
      expect(result.header).toHaveLength(1);
      expect(result.header[0].name).toBe('X-Custom');
      expect(result.header[0].value).toBe('test');
      expect(result.header[0].id).toBeDefined();
      expect(result.header[0].createdAt).toBeDefined();
    });

    it('preserves existing rules', () => {
      const rules = {
        header: [{ id: '1', name: 'Existing' }],
        request: [{ id: 'r1' }],
        response: [],
      };
      const result = manager.addHeaderRule(rules, { name: 'New' });
      expect(result.header).toHaveLength(2);
      expect(result.header[0].name).toBe('Existing');
      expect(result.header[1].name).toBe('New');
    });

    it('does not mutate original rules', () => {
      const rules = { header: [{ id: '1' }], request: [], response: [] };
      const result = manager.addHeaderRule(rules, { name: 'New' });
      expect(rules.header).toHaveLength(1);
      expect(result.header).toHaveLength(2);
    });

    it('preserves request and response arrays', () => {
      const rules = {
        header: [],
        request: [{ id: 'r1' }],
        response: [{ id: 's1' }],
      };
      const result = manager.addHeaderRule(rules, { name: 'H1' });
      expect(result.request).toEqual([{ id: 'r1' }]);
      expect(result.response).toEqual([{ id: 's1' }]);
    });
  });

  // ========================================================================
  // updateHeaderRule (pure)
  // ========================================================================
  describe('updateHeaderRule', () => {
    it('updates the matching rule', () => {
      const rules = {
        header: [
          { id: '1', name: 'Rule1', value: 'old' },
          { id: '2', name: 'Rule2', value: 'keep' },
        ],
        request: [],
        response: [],
      };
      const result = manager.updateHeaderRule(rules, '1', { value: 'new' });
      expect(result.header[0].value).toBe('new');
      expect(result.header[0].name).toBe('Rule1');
      expect(result.header[0].updatedAt).toBeDefined();
      expect(result.header[1].value).toBe('keep');
    });

    it('does not modify non-matching rules', () => {
      const rules = {
        header: [{ id: '1', name: 'Rule1' }, { id: '2', name: 'Rule2' }],
        request: [],
        response: [],
      };
      const result = manager.updateHeaderRule(rules, '1', { name: 'Updated' });
      expect(result.header[1]).toEqual({ id: '2', name: 'Rule2' });
    });

    it('does not mutate original rules', () => {
      const rules = {
        header: [{ id: '1', name: 'Rule1' }],
        request: [],
        response: [],
      };
      const result = manager.updateHeaderRule(rules, '1', { name: 'Changed' });
      expect(rules.header[0].name).toBe('Rule1');
      expect(result.header[0].name).toBe('Changed');
    });

    it('leaves header array unchanged when ID not found', () => {
      const rules = {
        header: [{ id: '1', name: 'Rule1' }],
        request: [],
        response: [],
      };
      const result = manager.updateHeaderRule(rules, 'nonexistent', { name: 'Changed' });
      expect(result.header).toHaveLength(1);
      expect(result.header[0].name).toBe('Rule1');
      expect(result.header[0].updatedAt).toBeUndefined();
    });
  });

  // ========================================================================
  // removeHeaderRule (pure)
  // ========================================================================
  describe('removeHeaderRule', () => {
    it('removes the matching rule', () => {
      const rules = {
        header: [{ id: '1' }, { id: '2' }],
        request: [],
        response: [],
      };
      const result = manager.removeHeaderRule(rules, '1');
      expect(result.header).toHaveLength(1);
      expect(result.header[0].id).toBe('2');
    });

    it('does not mutate original rules', () => {
      const rules = {
        header: [{ id: '1' }, { id: '2' }],
        request: [],
        response: [],
      };
      manager.removeHeaderRule(rules, '1');
      expect(rules.header).toHaveLength(2);
    });

    it('returns rules unchanged when ID not found', () => {
      const rules = {
        header: [{ id: '1' }],
        request: [],
        response: [],
      };
      const result = manager.removeHeaderRule(rules, 'nonexistent');
      expect(result.header).toHaveLength(1);
    });

    it('preserves request and response arrays', () => {
      const rules = {
        header: [{ id: '1' }],
        request: [{ id: 'r1' }],
        response: [{ id: 's1' }],
      };
      const result = manager.removeHeaderRule(rules, '1');
      expect(result.request).toEqual([{ id: 'r1' }]);
      expect(result.response).toEqual([{ id: 's1' }]);
    });
  });

  // ========================================================================
  // loadRules
  // ========================================================================
  describe('loadRules', () => {
    it('parses and returns stored rules', async () => {
      const stored = {
        rules: {
          header: [{ id: '1' }],
          request: [],
          response: [],
        },
      };
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify(stored));
      const result = await manager.loadRules('ws-1');
      expect(result.header).toHaveLength(1);
    });

    it('returns empty rule sets when no data', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(null);
      const result = await manager.loadRules('ws-1');
      expect(result).toEqual({ header: [], request: [], response: [] });
    });

    it('returns empty rule sets when rules key is missing', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify({}));
      const result = await manager.loadRules('ws-1');
      expect(result).toEqual({ header: [], request: [], response: [] });
    });

    it('returns empty rule sets on error', async () => {
      mockStorageAPI.loadFromStorage.mockRejectedValue(new Error('fail'));
      const result = await manager.loadRules('ws-1');
      expect(result).toEqual({ header: [], request: [], response: [] });
    });

    it('loads from correct workspace path', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(null);
      await manager.loadRules('my-workspace');
      expect(mockStorageAPI.loadFromStorage).toHaveBeenCalledWith(
        'workspaces/my-workspace/rules.json'
      );
    });
  });

  // ========================================================================
  // loadProxyRules
  // ========================================================================
  describe('loadProxyRules', () => {
    it('parses and returns proxy rules', async () => {
      const rules = [{ id: '1', pattern: '*.com' }];
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify(rules));
      const result = await manager.loadProxyRules('ws-1');
      expect(result).toEqual(rules);
    });

    it('returns empty array when no data', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(null);
      const result = await manager.loadProxyRules('ws-1');
      expect(result).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mockStorageAPI.loadFromStorage.mockRejectedValue(new Error('fail'));
      const result = await manager.loadProxyRules('ws-1');
      expect(result).toEqual([]);
    });
  });

  // ========================================================================
  // saveProxyRules
  // ========================================================================
  describe('saveProxyRules', () => {
    it('saves to correct path', async () => {
      const rules = [{ id: '1' }];
      await manager.saveProxyRules('ws-1', rules);
      expect(mockStorageAPI.saveToStorage).toHaveBeenCalledWith(
        'workspaces/ws-1/proxy-rules.json',
        JSON.stringify(rules)
      );
    });

    it('throws on storage error', async () => {
      mockStorageAPI.saveToStorage.mockRejectedValue(new Error('fail'));
      await expect(manager.saveProxyRules('ws-1', [])).rejects.toThrow('fail');
    });
  });

  // ========================================================================
  // syncProxyRule
  // ========================================================================
  describe('syncProxyRule', () => {
    it('calls proxySaveRule on add action', async () => {
      const rule = { id: '1', pattern: '*.com' };
      await manager.syncProxyRule(rule, 'add');
      expect(mockElectronAPI.proxySaveRule).toHaveBeenCalledWith(rule);
    });

    it('calls proxyDeleteRule on remove action', async () => {
      const rule = { id: '1', pattern: '*.com' };
      await manager.syncProxyRule(rule, 'remove');
      expect(mockElectronAPI.proxyDeleteRule).toHaveBeenCalledWith('1');
    });

    it('does nothing when electronAPI is null', async () => {
      const mgr = new RulesManager(mockStorageAPI, null);
      await mgr.syncProxyRule({ id: '1' }, 'add');
      // Should not throw
    });

    it('throws on sync error', async () => {
      mockElectronAPI.proxySaveRule.mockRejectedValue(new Error('sync fail'));
      await expect(
        manager.syncProxyRule({ id: '1' }, 'add')
      ).rejects.toThrow('sync fail');
    });
  });
});
