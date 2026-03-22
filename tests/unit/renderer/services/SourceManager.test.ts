import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Source } from '../../../../src/types/source';

function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    sourceType: 'http',
    sourceName: 'Production API Gateway Token',
    sourcePath: 'https://auth.openheaders.internal:8443/oauth2/token',
    sourceMethod: 'POST',
    sourceTag: 'oauth',
    sourceContent: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQG9wZW5oZWFkZXJzLmlvIn0.sig',
    requestOptions: {
      contentType: 'application/x-www-form-urlencoded',
      body: 'grant_type=client_credentials&client_id={{CLIENT_ID}}&client_secret={{CLIENT_SECRET}}',
      headers: [
        { key: 'Accept', value: 'application/json' },
        { key: 'X-Request-ID', value: '{{REQUEST_ID}}' },
      ],
      queryParams: [{ key: 'scope', value: 'openid profile' }],
      totpSecret: '{{TOTP_KEY}}',
    },
    jsonFilter: { enabled: true, path: '$.{{JSON_FIELD}}' },
    refreshOptions: { enabled: true, type: 'custom', interval: 5 },
    activationState: 'active',
    missingDependencies: [],
    createdAt: '2025-11-15T09:30:00.000Z',
    ...overrides,
  };
}

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

describe('SourceManager', () => {
  let manager: InstanceType<typeof SourceManager>;
  let mockStorageAPI: { loadFromStorage: ReturnType<typeof vi.fn>; saveToStorage: ReturnType<typeof vi.fn> };
  let mockEnvironmentService: { waitForReady: ReturnType<typeof vi.fn>; getAllVariables: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockStorageAPI = {
      loadFromStorage: vi.fn(),
      saveToStorage: vi.fn(),
    };
    mockEnvironmentService = {
      waitForReady: vi.fn().mockResolvedValue(undefined),
      getAllVariables: vi.fn().mockReturnValue({}),
    };
    manager = new SourceManager(
      mockStorageAPI as ConstructorParameters<typeof SourceManager>[0],
      mockEnvironmentService as ConstructorParameters<typeof SourceManager>[1]
    );
  });

  // ========================================================================
  // extractVariablesFromSource
  // ========================================================================
  describe('extractVariablesFromSource', () => {
    it('extracts variables from sourcePath URL', () => {
      const source = makeSource({
        sourcePath: 'https://api.openheaders.io/{{API_VERSION}}/data',
        requestOptions: undefined,
        jsonFilter: undefined,
      });
      expect(manager.extractVariablesFromSource(source)).toEqual(['API_VERSION']);
    });

    it('extracts multiple distinct variables from URL, headers, body', () => {
      const source = makeSource({
        sourcePath: '{{PROTOCOL}}://{{AUTH_HOST}}',
        requestOptions: {
          headers: [{ key: 'Authorization', value: 'Bearer {{ACCESS_TOKEN}}' }],
          body: 'client_id={{CLIENT_ID}}',
        },
        jsonFilter: undefined,
      });
      const vars = manager.extractVariablesFromSource(source);
      expect(vars).toContain('PROTOCOL');
      expect(vars).toContain('AUTH_HOST');
      expect(vars).toContain('ACCESS_TOKEN');
      expect(vars).toContain('CLIENT_ID');
      expect(vars).toHaveLength(4);
    });

    it('deduplicates variables used in multiple fields', () => {
      const source = makeSource({
        sourcePath: '{{API_KEY}}',
        requestOptions: { body: '{{API_KEY}}' },
        jsonFilter: undefined,
      });
      expect(manager.extractVariablesFromSource(source)).toEqual(['API_KEY']);
    });

    it('returns empty array when no variables present', () => {
      const source = makeSource({
        sourcePath: 'https://auth.openheaders.io/oauth2/token',
        requestOptions: { headers: [{ key: 'Accept', value: 'application/json' }] },
        jsonFilter: { enabled: false },
      });
      expect(manager.extractVariablesFromSource(source)).toEqual([]);
    });

    it('extracts from header keys and values', () => {
      const source = makeSource({
        sourcePath: 'https://api.openheaders.io',
        requestOptions: {
          headers: [{ key: '{{HEADER_NAME}}', value: '{{HEADER_VALUE}}' }],
        },
        jsonFilter: undefined,
      });
      const vars = manager.extractVariablesFromSource(source);
      expect(vars).toContain('HEADER_NAME');
      expect(vars).toContain('HEADER_VALUE');
    });

    it('extracts from queryParams keys and values', () => {
      const source = makeSource({
        sourcePath: 'https://api.openheaders.io',
        requestOptions: {
          queryParams: [{ key: '{{PARAM_KEY}}', value: '{{PARAM_VALUE}}' }],
        },
        jsonFilter: undefined,
      });
      const vars = manager.extractVariablesFromSource(source);
      expect(vars).toContain('PARAM_KEY');
      expect(vars).toContain('PARAM_VALUE');
    });

    it('extracts from jsonFilter path', () => {
      const source = makeSource({
        sourcePath: 'https://api.openheaders.io',
        requestOptions: undefined,
        jsonFilter: { enabled: true, path: '$.data.{{FIELD_NAME}}' },
      });
      expect(manager.extractVariablesFromSource(source)).toEqual(['FIELD_NAME']);
    });

    it('extracts from body and totpSecret', () => {
      const source = makeSource({
        sourcePath: 'https://api.openheaders.io',
        requestOptions: {
          body: '{"key": "{{BODY_VAR}}"}',
          totpSecret: '{{TOTP_SECRET_KEY}}',
        },
        jsonFilter: undefined,
      });
      const vars = manager.extractVariablesFromSource(source);
      expect(vars).toContain('BODY_VAR');
      expect(vars).toContain('TOTP_SECRET_KEY');
    });

    it('extracts from contentType', () => {
      const source = makeSource({
        sourcePath: 'https://api.openheaders.io',
        requestOptions: { contentType: '{{CONTENT_TYPE}}' },
        jsonFilter: undefined,
      });
      expect(manager.extractVariablesFromSource(source)).toContain('CONTENT_TYPE');
    });

    it('handles source with no requestOptions or jsonFilter', () => {
      const source = makeSource({
        sourcePath: 'https://api.openheaders.io/static',
        requestOptions: undefined,
        jsonFilter: undefined,
      });
      expect(manager.extractVariablesFromSource(source)).toEqual([]);
    });

    it('extracts all variables from enterprise OAuth source', () => {
      const source = makeSource(); // uses full enterprise defaults
      const vars = manager.extractVariablesFromSource(source);
      expect(vars).toContain('CLIENT_ID');
      expect(vars).toContain('CLIENT_SECRET');
      expect(vars).toContain('REQUEST_ID');
      expect(vars).toContain('TOTP_KEY');
      expect(vars).toContain('JSON_FIELD');
      expect(vars).toHaveLength(5);
    });
  });

  // ========================================================================
  // evaluateSourceDependencies
  // ========================================================================
  describe('evaluateSourceDependencies', () => {
    it('returns ready for non-http sources', async () => {
      const source = makeSource({
        sourceType: 'file',
        sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json',
      });
      const result = await manager.evaluateSourceDependencies(source);
      expect(result).toEqual({ ready: true, missing: [] });
    });

    it('returns ready when all enterprise variables are available', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({
        CLIENT_ID: 'prod-service-account',
        CLIENT_SECRET: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
        REQUEST_ID: 'req-uuid-001',
        TOTP_KEY: 'JBSWY3DPEHPK3PXP',
        JSON_FIELD: 'access_token',
      });
      const result = await manager.evaluateSourceDependencies(makeSource());
      expect(result.ready).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('returns not ready with specific missing variables', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({
        CLIENT_ID: 'prod-service-account',
        REQUEST_ID: 'req-uuid-001',
      });
      const result = await manager.evaluateSourceDependencies(makeSource());
      expect(result.ready).toBe(false);
      expect(result.missing).toContain('CLIENT_SECRET');
      expect(result.missing).toContain('TOTP_KEY');
      expect(result.missing).toContain('JSON_FIELD');
    });

    it('treats empty string values as missing', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({
        CLIENT_ID: '',
        CLIENT_SECRET: 'ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
        REQUEST_ID: 'req-uuid-001',
        TOTP_KEY: 'JBSWY3DPEHPK3PXP',
        JSON_FIELD: 'access_token',
      });
      const source = makeSource();
      const result = await manager.evaluateSourceDependencies(source);
      expect(result.ready).toBe(false);
      expect(result.missing).toEqual(['CLIENT_ID']);
    });

    it('returns not ready when environment service times out', async () => {
      mockEnvironmentService.waitForReady.mockRejectedValue(new Error('Environment service timed out after 3000ms'));
      const source = makeSource({
        sourcePath: 'https://{{AUTH_HOST}}/token',
        requestOptions: undefined,
        jsonFilter: undefined,
      });
      const result = await manager.evaluateSourceDependencies(source);
      expect(result.ready).toBe(false);
      expect(result.missing).toEqual(['AUTH_HOST']);
    });

    it('returns ready for http source with no template variables', async () => {
      const source = makeSource({
        sourcePath: 'https://auth.openheaders.io/oauth2/token',
        requestOptions: { body: 'grant_type=client_credentials' },
        jsonFilter: { enabled: false },
      });
      const result = await manager.evaluateSourceDependencies(source);
      expect(result.ready).toBe(true);
      expect(result.missing).toEqual([]);
    });
  });

  // ========================================================================
  // addSource
  // ========================================================================
  describe('addSource', () => {
    it('generates incremented sourceId from existing max', async () => {
      const sources: Source[] = [
        makeSource({ sourceId: '1', sourceType: 'file', sourcePath: '/Users/jane.doe/tokens/staging.json' }),
        makeSource({ sourceId: '5', sourceType: 'file', sourcePath: '/Users/jane.doe/tokens/prod.json' }),
      ];
      const newData = makeSource({
        sourceType: 'file',
        sourcePath: '/Users/jane.doe/tokens/dev.json',
        requestOptions: undefined,
        jsonFilter: undefined,
      });
      const result = await manager.addSource(sources, newData);
      expect(result.sourceId).toBe('6');
    });

    it('starts at 1 for empty sources', async () => {
      const result = await manager.addSource([], makeSource({
        sourceType: 'file',
        sourcePath: '/Users/jane.doe/tokens/staging.json',
      }));
      expect(result.sourceId).toBe('1');
    });

    it('throws on duplicate source with descriptive message', async () => {
      const existing = makeSource({
        sourceId: '1',
        sourceType: 'http',
        sourcePath: 'https://auth.openheaders.io/token',
        sourceMethod: 'POST',
      });
      await expect(
        manager.addSource([existing], makeSource({
          sourceType: 'http',
          sourcePath: 'https://auth.openheaders.io/token',
          sourceMethod: 'POST',
        }))
      ).rejects.toThrow('Source already exists: HTTP https://auth.openheaders.io/token');
    });

    it('allows same URL with different method', async () => {
      const existing = makeSource({
        sourceId: '1',
        sourceType: 'http',
        sourcePath: 'https://auth.openheaders.io/token',
        sourceMethod: 'GET',
      });
      const result = await manager.addSource([existing], makeSource({
        sourceType: 'http',
        sourcePath: 'https://auth.openheaders.io/token',
        sourceMethod: 'POST',
      }));
      expect(result.sourceId).toBe('2');
    });

    it('includes createdAt ISO timestamp', async () => {
      const result = await manager.addSource([], makeSource({
        sourceType: 'file',
        sourcePath: '/Users/jane.doe/tokens/staging.json',
      }));
      expect(result.createdAt).toBeDefined();
      const parsed = new Date(result.createdAt!);
      expect(parsed.getTime()).not.toBeNaN();
    });

    it('sets activationState to active for non-http sources', async () => {
      const result = await manager.addSource([], makeSource({
        sourceType: 'file',
        sourcePath: '/Users/jane.doe/Documents/OpenHeaders/tokens/staging.json',
      }));
      expect(result.activationState).toBe('active');
      expect(result.missingDependencies).toEqual([]);
    });

    it('evaluates dependencies for http sources with missing vars', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({});
      const result = await manager.addSource([], makeSource({
        sourcePath: 'https://{{AUTH_HOST}}/oauth2/token',
        requestOptions: { headers: [{ key: 'Authorization', value: 'Bearer {{TOKEN}}' }] },
        jsonFilter: undefined,
      }));
      expect(result.activationState).toBe('waiting_for_deps');
      expect(result.missingDependencies).toContain('AUTH_HOST');
      expect(result.missingDependencies).toContain('TOKEN');
    });

    it('sets active when all dependencies resolved', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({
        AUTH_HOST: 'auth.openheaders.io',
        TOKEN: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzZXJ2aWNlIn0.sig',
      });
      const result = await manager.addSource([], makeSource({
        sourcePath: 'https://{{AUTH_HOST}}/oauth2/token',
        requestOptions: { headers: [{ key: 'Authorization', value: 'Bearer {{TOKEN}}' }] },
        jsonFilter: undefined,
      }));
      expect(result.activationState).toBe('active');
      expect(result.missingDependencies).toEqual([]);
    });
  });

  // ========================================================================
  // loadSources
  // ========================================================================
  describe('loadSources', () => {
    it('returns empty array when no data exists', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue(null);
      const result = await manager.loadSources('ws-prod-a1b2c3d4');
      expect(result).toEqual([]);
    });

    it('loads from correct workspace path', async () => {
      mockStorageAPI.loadFromStorage.mockResolvedValue('[]');
      await manager.loadSources('ws-prod-a1b2c3d4');
      expect(mockStorageAPI.loadFromStorage).toHaveBeenCalledWith('workspaces/ws-prod-a1b2c3d4/sources.json');
    });

    it('parses and returns sources with activation state', async () => {
      const sources: Source[] = [
        { sourceId: '1', sourceType: 'file', sourcePath: '/Users/jane.doe/tokens/staging.json' },
      ];
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify(sources));
      const result = await manager.loadSources('ws-prod-a1b2c3d4');
      expect(result).toHaveLength(1);
      expect(result[0].activationState).toBe('active');
      expect(result[0].missingDependencies).toEqual([]);
      expect(result[0].sourceId).toBe('1');
      expect(result[0].sourceType).toBe('file');
    });

    it('evaluates dependencies for http sources during load', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({});
      const sources: Source[] = [
        { sourceId: '1', sourceType: 'http', sourcePath: 'https://{{AUTH_HOST}}/oauth2/token' },
      ];
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify(sources));
      const result = await manager.loadSources('ws-prod-a1b2c3d4');
      expect(result[0].activationState).toBe('waiting_for_deps');
      expect(result[0].missingDependencies).toEqual(['AUTH_HOST']);
    });

    it('returns empty array on parse error', async () => {
      mockStorageAPI.loadFromStorage.mockRejectedValue(new Error('ENOENT: file not found'));
      const result = await manager.loadSources('ws-prod-a1b2c3d4');
      expect(result).toEqual([]);
    });

    it('handles multiple sources with mixed types and dependencies', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({ AUTH_HOST: 'auth.openheaders.io' });
      const sources: Source[] = [
        { sourceId: '1', sourceType: 'http', sourcePath: 'https://{{AUTH_HOST}}/token' },
        { sourceId: '2', sourceType: 'http', sourcePath: 'https://{{MISSING_HOST}}/token' },
        { sourceId: '3', sourceType: 'file', sourcePath: '/etc/config.json' },
      ];
      mockStorageAPI.loadFromStorage.mockResolvedValue(JSON.stringify(sources));
      const result = await manager.loadSources('ws-prod-a1b2c3d4');
      expect(result).toHaveLength(3);
      expect(result[0].activationState).toBe('active');
      expect(result[1].activationState).toBe('waiting_for_deps');
      expect(result[1].missingDependencies).toEqual(['MISSING_HOST']);
      expect(result[2].activationState).toBe('active');
    });
  });

  // ========================================================================
  // saveSources
  // ========================================================================
  describe('saveSources', () => {
    it('saves sources to correct workspace path', async () => {
      const sources: Source[] = [makeSource({ sourceId: '1' })];
      await manager.saveSources('ws-prod-a1b2c3d4', sources);
      expect(mockStorageAPI.saveToStorage).toHaveBeenCalledWith(
        'workspaces/ws-prod-a1b2c3d4/sources.json',
        JSON.stringify(sources)
      );
    });

    it('throws on save error with original message', async () => {
      mockStorageAPI.saveToStorage.mockRejectedValue(new Error('ENOSPC: no space left on device'));
      await expect(manager.saveSources('ws-prod-a1b2c3d4', [])).rejects.toThrow('ENOSPC: no space left on device');
    });

    it('saves empty array', async () => {
      await manager.saveSources('ws-prod-a1b2c3d4', []);
      expect(mockStorageAPI.saveToStorage).toHaveBeenCalledWith(
        'workspaces/ws-prod-a1b2c3d4/sources.json',
        '[]'
      );
    });
  });

  // ========================================================================
  // activateReadySources
  // ========================================================================
  describe('activateReadySources', () => {
    beforeEach(() => {
      vi.stubGlobal('window', {
        ...globalThis.window,
        dispatchEvent: vi.fn(),
      });
      vi.stubGlobal('CustomEvent', class CustomEvent {
        type: string;
        detail: unknown;
        constructor(type: string, opts?: { detail?: unknown }) {
          this.type = type;
          this.detail = opts?.detail;
        }
      });
    });

    it('activates sources when all dependencies are resolved', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({
        AUTH_HOST: 'auth.openheaders.io',
        TOKEN: 'eyJhbGciOiJSUzI1NiJ9.sig',
      });
      const sources: Source[] = [
        makeSource({
          sourceId: '1',
          sourcePath: 'https://{{AUTH_HOST}}/oauth2/token',
          requestOptions: { headers: [{ key: 'Auth', value: '{{TOKEN}}' }] },
          jsonFilter: undefined,
          activationState: 'waiting_for_deps',
          missingDependencies: ['AUTH_HOST', 'TOKEN'],
        }),
      ];
      const result = await manager.activateReadySources(sources);
      expect(result.activatedCount).toBe(1);
      expect(result.hasChanges).toBe(true);
      expect(result.sources[0].activationState).toBe('active');
      expect(result.sources[0].missingDependencies).toEqual([]);
    });

    it('skips already active sources', async () => {
      const sources: Source[] = [
        makeSource({ sourceId: '1', sourceType: 'file', activationState: 'active' }),
      ];
      const result = await manager.activateReadySources(sources);
      expect(result.activatedCount).toBe(0);
      expect(result.hasChanges).toBe(false);
      expect(result.sources).toEqual(sources);
    });

    it('updates missing deps list when partially resolved', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({
        AUTH_HOST: 'auth.openheaders.io',
      });
      const sources: Source[] = [
        makeSource({
          sourceId: '1',
          sourcePath: 'https://{{AUTH_HOST}}/{{API_PATH}}',
          requestOptions: undefined,
          jsonFilter: undefined,
          activationState: 'waiting_for_deps',
          missingDependencies: ['AUTH_HOST', 'API_PATH'],
        }),
      ];
      const result = await manager.activateReadySources(sources);
      expect(result.hasChanges).toBe(true);
      expect(result.activatedCount).toBe(0);
      expect(result.sources[0].missingDependencies).toEqual(['API_PATH']);
    });

    it('dispatches source-activated event on activation', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({
        AUTH_HOST: 'auth.openheaders.io',
      });
      const sources: Source[] = [
        makeSource({
          sourceId: '1',
          sourcePath: 'https://{{AUTH_HOST}}/token',
          requestOptions: undefined,
          jsonFilter: undefined,
          activationState: 'waiting_for_deps',
          missingDependencies: ['AUTH_HOST'],
        }),
      ];
      await manager.activateReadySources(sources);
      expect(window.dispatchEvent).toHaveBeenCalled();
    });

    it('does not change sources that still have all deps missing', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({});
      const sources: Source[] = [
        makeSource({
          sourceId: '1',
          sourcePath: 'https://{{AUTH_HOST}}/token',
          requestOptions: undefined,
          jsonFilter: undefined,
          activationState: 'waiting_for_deps',
          missingDependencies: ['AUTH_HOST'],
        }),
      ];
      const result = await manager.activateReadySources(sources);
      expect(result.activatedCount).toBe(0);
      expect(result.hasChanges).toBe(false);
    });

    it('handles multiple sources with mixed activation states', async () => {
      mockEnvironmentService.getAllVariables.mockReturnValue({
        TOKEN_A: 'token-a-value',
      });
      const sources: Source[] = [
        makeSource({
          sourceId: '1',
          sourcePath: 'https://api.openheaders.io/{{TOKEN_A}}',
          requestOptions: undefined,
          jsonFilter: undefined,
          activationState: 'waiting_for_deps',
          missingDependencies: ['TOKEN_A'],
        }),
        makeSource({
          sourceId: '2',
          sourcePath: 'https://api.openheaders.io/{{TOKEN_B}}',
          requestOptions: undefined,
          jsonFilter: undefined,
          activationState: 'waiting_for_deps',
          missingDependencies: ['TOKEN_B'],
        }),
        makeSource({ sourceId: '3', activationState: 'active' }),
      ];
      const result = await manager.activateReadySources(sources);
      expect(result.activatedCount).toBe(1);
      expect(result.sources[0].activationState).toBe('active');
      expect(result.sources[1].activationState).toBe('waiting_for_deps');
      expect(result.sources[2].activationState).toBe('active');
    });
  });
});
