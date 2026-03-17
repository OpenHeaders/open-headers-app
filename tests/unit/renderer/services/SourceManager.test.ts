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

const SourceManager = (
  await import('../../../../src/renderer/services/workspace/SourceManager')
).default;

// ---------------------------------------------------------------------------
// extractVariablesFromSource (pure)
// ---------------------------------------------------------------------------
describe('SourceManager', () => {
  let manager: InstanceType<typeof SourceManager>;
  let mockStorageAPI: any;
  let mockEnvironmentService: any;

  beforeEach(() => {
    mockStorageAPI = {
      loadFromStorage: vi.fn(),
      saveToStorage: vi.fn(),
    };
    mockEnvironmentService = {
      waitForReady: vi.fn().mockResolvedValue(undefined),
      getAllVariables: vi.fn().mockReturnValue({}),
    };
    manager = new SourceManager(mockStorageAPI, mockEnvironmentService);
  });

  // ========================================================================
  // extractVariablesFromSource
  // ========================================================================
  describe('extractVariablesFromSource', () => {
    it('extracts variables from sourcePath (URL)', () => {
      const source = { sourcePath: 'https://api.example.com/{{host}}/data' };
      expect(manager.extractVariablesFromSource(source)).toEqual(['host']);
    });

    it('extracts multiple distinct variables', () => {
      const source = {
        sourcePath: '{{proto}}://{{host}}',
        requestOptions: { headers: { Authorization: 'Bearer {{token}}' } },
      };
      const vars = manager.extractVariablesFromSource(source);
      expect(vars).toContain('proto');
      expect(vars).toContain('host');
      expect(vars).toContain('token');
      expect(vars).toHaveLength(3);
    });

    it('deduplicates variables', () => {
      const source = {
        sourcePath: '{{api}}',
        requestOptions: { url: '{{api}}' },
      };
      const vars = manager.extractVariablesFromSource(source);
      expect(vars).toEqual(['api']);
    });

    it('returns empty array when no variables present', () => {
      const source = { sourcePath: 'https://example.com/data' };
      expect(manager.extractVariablesFromSource(source)).toEqual([]);
    });

    it('extracts from nested requestOptions', () => {
      const source = {
        sourcePath: 'https://example.com',
        requestOptions: {
          headers: {
            'X-Custom': '{{customVar}}',
            nested: { deep: '{{deepVar}}' },
          },
        },
      };
      const vars = manager.extractVariablesFromSource(source);
      expect(vars).toContain('customVar');
      expect(vars).toContain('deepVar');
    });

    it('extracts from jsonFilter path', () => {
      const source = {
        sourcePath: 'https://example.com',
        jsonFilter: { path: '$.data.{{field}}' },
      };
      expect(manager.extractVariablesFromSource(source)).toEqual(['field']);
    });

    it('handles source with no requestOptions or jsonFilter', () => {
      const source = { sourcePath: 'https://example.com' };
      expect(manager.extractVariablesFromSource(source)).toEqual([]);
    });

    it('handles array of objects in requestOptions', () => {
      const source = {
        sourcePath: 'https://example.com',
        requestOptions: {
          items: [{ key: '{{a}}' }, { key: '{{b}}' }],
        },
      };
      const vars = manager.extractVariablesFromSource(source);
      expect(vars).toContain('a');
      expect(vars).toContain('b');
    });

    it('does not extract from plain string array items (no object wrapper)', () => {
      // The implementation only extracts from object values, not direct string array items
      const source = {
        sourcePath: 'https://example.com',
        requestOptions: {
          items: ['{{a}}', '{{b}}'],
        },
      };
      const vars = manager.extractVariablesFromSource(source);
      expect(vars).toEqual([]);
    });

    it('ignores non-string values', () => {
      const source = {
        sourcePath: 'https://example.com',
        requestOptions: { timeout: 5000, enabled: true },
      };
      expect(manager.extractVariablesFromSource(source)).toEqual([]);
    });
  });

  // ========================================================================
  // evaluateSourceDependencies
  // ========================================================================
  describe('evaluateSourceDependencies', () => {
    it('returns ready for non-http sources', async () => {
      const source = { sourceType: 'file', sourcePath: '/path/to/file' };
      const result = await manager.evaluateSourceDependencies(source);
      expect(result).toEqual({ ready: true, missing: [] });
    });

    it('returns ready when all variables are available', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({
        host: 'api.example.com',
        token: 'abc123',
      });
      const source = {
        sourceType: 'http',
        sourcePath: 'https://{{host}}/data',
        requestOptions: { headers: { Authorization: '{{token}}' } },
      };
      const result = await manager.evaluateSourceDependencies(source);
      expect(result.ready).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('returns not ready with missing variables', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({ host: 'api.example.com' });
      const source = {
        sourceType: 'http',
        sourcePath: 'https://{{host}}/data',
        requestOptions: { headers: { Authorization: '{{token}}' } },
      };
      const result = await manager.evaluateSourceDependencies(source);
      expect(result.ready).toBe(false);
      expect(result.missing).toEqual(['token']);
    });

    it('treats empty string values as missing', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({ host: '' });
      const source = {
        sourceType: 'http',
        sourcePath: 'https://{{host}}/data',
      };
      const result = await manager.evaluateSourceDependencies(source);
      expect(result.ready).toBe(false);
      expect(result.missing).toEqual(['host']);
    });

    it('returns not ready when environment service is not ready', async () => {
      mockEnvironmentService.waitForReady.mockRejectedValue(new Error('timeout'));
      const source = {
        sourceType: 'http',
        sourcePath: 'https://{{host}}/data',
      };
      const result = await manager.evaluateSourceDependencies(source);
      expect(result.ready).toBe(false);
      expect(result.missing).toEqual(['host']);
    });

    it('returns ready for http source with no variables', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({});
      const source = {
        sourceType: 'http',
        sourcePath: 'https://example.com/data',
      };
      const result = await manager.evaluateSourceDependencies(source);
      expect(result.ready).toBe(true);
      expect(result.missing).toEqual([]);
    });
  });

  // ========================================================================
  // addSource
  // ========================================================================
  describe('addSource', () => {
    it('generates incremented sourceId', async () => {
      const sources = [
        { sourceId: '1', sourceType: 'file', sourcePath: '/a' },
        { sourceId: '3', sourceType: 'file', sourcePath: '/b' },
      ];
      const newData = { sourceType: 'file', sourcePath: '/c' };
      const result = await manager.addSource(sources, newData);
      expect(result.sourceId).toBe('4');
    });

    it('starts at 1 for empty sources', async () => {
      const result = await manager.addSource([], { sourceType: 'file', sourcePath: '/a' });
      expect(result.sourceId).toBe('1');
    });

    it('throws on duplicate source (same type and path)', async () => {
      const sources = [{ sourceType: 'file', sourcePath: '/a' }];
      await expect(
        manager.addSource(sources, { sourceType: 'file', sourcePath: '/a' })
      ).rejects.toThrow('Source already exists');
    });

    it('allows same path with different type', async () => {
      const sources = [{ sourceId: '1', sourceType: 'file', sourcePath: '/a' }];
      const result = await manager.addSource(sources, { sourceType: 'http', sourcePath: '/a' });
      expect(result.sourceId).toBe('2');
    });

    it('checks method for http source duplicates', async () => {
      const sources = [
        { sourceId: '1', sourceType: 'http', sourcePath: 'https://api.com', sourceMethod: 'GET' },
      ];
      // Same URL but different method should be allowed
      const result = await manager.addSource(sources, {
        sourceType: 'http',
        sourcePath: 'https://api.com',
        sourceMethod: 'POST',
      });
      expect(result.sourceId).toBe('2');
    });

    it('rejects duplicate http source with same method', async () => {
      const sources = [
        { sourceId: '1', sourceType: 'http', sourcePath: 'https://api.com', sourceMethod: 'GET' },
      ];
      await expect(
        manager.addSource(sources, {
          sourceType: 'http',
          sourcePath: 'https://api.com',
          sourceMethod: 'GET',
        })
      ).rejects.toThrow('Source already exists');
    });

    it('includes createdAt timestamp', async () => {
      const result = await manager.addSource([], { sourceType: 'file', sourcePath: '/a' });
      expect(result.createdAt).toBeDefined();
      expect(new Date(result.createdAt).getTime()).not.toBeNaN();
    });

    it('sets activationState to active for non-http source', async () => {
      const result = await manager.addSource([], { sourceType: 'file', sourcePath: '/a' });
      expect(result.activationState).toBe('active');
      expect(result.missingDependencies).toEqual([]);
    });

    it('evaluates dependencies for http sources', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({});
      const result = await manager.addSource([], {
        sourceType: 'http',
        sourcePath: 'https://{{host}}/data',
      });
      expect(result.activationState).toBe('waiting_for_deps');
      expect(result.missingDependencies).toEqual(['host']);
    });
  });

  // ========================================================================
  // loadSources
  // ========================================================================
  describe('loadSources', () => {
    it('returns empty array when no data exists', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(null);
      const result = await manager.loadSources('ws-1');
      expect(result).toEqual([]);
    });

    it('parses and returns sources with activation state', async () => {
      const sources = [
        { sourceId: '1', sourceType: 'file', sourcePath: '/a' },
      ];
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify(sources));
      const result = await manager.loadSources('ws-1');
      expect(result).toHaveLength(1);
      expect(result[0].activationState).toBe('active');
      expect(result[0].missingDependencies).toEqual([]);
    });

    it('evaluates dependencies for http sources during load', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({});
      const sources = [
        { sourceId: '1', sourceType: 'http', sourcePath: 'https://{{host}}/data' },
      ];
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify(sources));
      const result = await manager.loadSources('ws-1');
      expect(result[0].activationState).toBe('waiting_for_deps');
      expect(result[0].missingDependencies).toEqual(['host']);
    });

    it('returns empty array on error', async () => {
      mockStorageAPI.loadFromStorage.mockRejectedValue(new Error('fail'));
      const result = await manager.loadSources('ws-1');
      expect(result).toEqual([]);
    });
  });

  // ========================================================================
  // saveSources
  // ========================================================================
  describe('saveSources', () => {
    it('saves sources to correct path', async () => {
      const sources = [{ sourceId: '1' }];
      await manager.saveSources('ws-1', sources);
      expect(mockStorageAPI.saveToStorage).toHaveBeenCalledWith(
        'workspaces/ws-1/sources.json',
        JSON.stringify(sources)
      );
    });

    it('throws on save error', async () => {
      mockStorageAPI.saveToStorage.mockRejectedValue(new Error('disk full'));
      await expect(manager.saveSources('ws-1', [])).rejects.toThrow('disk full');
    });
  });

  // ========================================================================
  // activateReadySources
  // ========================================================================
  describe('activateReadySources', () => {
    beforeEach(() => {
      // Mock window.dispatchEvent for activation events
      vi.stubGlobal('window', {
        ...globalThis.window,
        dispatchEvent: vi.fn(),
      });
      (globalThis as any).CustomEvent = class CustomEvent {
        type: string;
        detail: any;
        constructor(type: string, opts?: any) {
          this.type = type;
          this.detail = opts?.detail;
        }
      };
    });

    it('activates sources when dependencies are resolved', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({ host: 'api.com' });
      const sources = [
        {
          sourceId: '1',
          sourceType: 'http',
          sourcePath: 'https://{{host}}/data',
          activationState: 'waiting_for_deps',
          missingDependencies: ['host'],
        },
      ];
      const result = await manager.activateReadySources(sources);
      expect(result.activatedCount).toBe(1);
      expect(result.hasChanges).toBe(true);
      expect(result.sources[0].activationState).toBe('active');
      expect(result.sources[0].missingDependencies).toEqual([]);
    });

    it('skips already active sources', async () => {
      const sources = [
        { sourceId: '1', sourceType: 'file', activationState: 'active' },
      ];
      const result = await manager.activateReadySources(sources);
      expect(result.activatedCount).toBe(0);
      expect(result.hasChanges).toBe(false);
    });

    it('updates missing deps list when it changes', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({ host: 'api.com' });
      const sources = [
        {
          sourceId: '1',
          sourceType: 'http',
          sourcePath: 'https://{{host}}/{{path}}',
          activationState: 'waiting_for_deps',
          missingDependencies: ['host', 'path'],
        },
      ];
      const result = await manager.activateReadySources(sources);
      // host is now available but path is still missing
      expect(result.hasChanges).toBe(true);
      expect(result.activatedCount).toBe(0);
      expect(result.sources[0].missingDependencies).toEqual(['path']);
    });

    it('dispatches source-activated event', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({ host: 'api.com' });
      const sources = [
        {
          sourceId: '1',
          sourceType: 'http',
          sourcePath: 'https://{{host}}/data',
          activationState: 'waiting_for_deps',
          missingDependencies: ['host'],
        },
      ];
      await manager.activateReadySources(sources);
      expect(window.dispatchEvent).toHaveBeenCalled();
    });

    it('does not change sources that still have missing deps', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({});
      const sources = [
        {
          sourceId: '1',
          sourceType: 'http',
          sourcePath: 'https://{{host}}/data',
          activationState: 'waiting_for_deps',
          missingDependencies: ['host'],
        },
      ];
      const result = await manager.activateReadySources(sources);
      expect(result.activatedCount).toBe(0);
      expect(result.hasChanges).toBe(false);
    });
  });
});
