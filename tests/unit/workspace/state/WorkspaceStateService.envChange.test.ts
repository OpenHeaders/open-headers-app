/**
 * Tests for WorkspaceStateService.onEnvironmentVariablesChanged
 *
 * Validates the three-tier refresh strategy:
 *  1. Sources with NO env var references → untouched (timers preserved)
 *  2. Sources with env var references but resolved values identical → untouched
 *  3. Sources with env var references and resolved values changed → re-fetch
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Source } from '../../../../src/types/source';

// Mock electron
vi.mock('electron', () => ({
    default: {
        app: { getPath: () => '/tmp/test' },
        BrowserWindow: { getAllWindows: () => [] },
    },
}));

// Mock mainLogger
vi.mock('../../../../src/utils/mainLogger.js', () => ({
    default: { createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }
}));

// Mock atomicFileWriter (used by StatePersistence imported transitively)
vi.mock('../../../../src/utils/atomicFileWriter.js', () => ({
    default: { writeJson: vi.fn().mockResolvedValue(undefined), readJson: vi.fn().mockResolvedValue(null) }
}));

vi.mock('../../../../src/config/version', () => ({ DATA_FORMAT_VERSION: '3.0.0' }));

import { WorkspaceStateService } from '../../../../src/services/workspace/WorkspaceStateService';
import type { EnvironmentResolverLike, ProxyServiceLike, SourceRefreshServiceLike, WebSocketServiceLike } from '../../../../src/services/workspace/state/types';

// ── Helpers ──────────────────────────────────────────────────────────

function httpSource(overrides: Partial<Source> = {}): Source {
    return {
        sourceId: '1',
        sourceType: 'http',
        sourcePath: 'https://api.openheaders.io/data',
        activationState: 'active',
        sourceContent: '{"ok":true}',
        ...overrides,
    };
}

function createEnvResolver(initialVars: Record<string, string> = {}): EnvironmentResolverLike {
    let vars = { ...initialVars };
    return {
        loadEnvironmentVariables: () => ({ ...vars }),
        resolveTemplate: vi.fn((template: string, variables: Record<string, string>) => {
            return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
        }),
        setVariables: vi.fn((newVars: Record<string, string>) => { vars = { ...newVars }; }),
        clearVariableCache: vi.fn(),
    };
}

function createRefreshService(): SourceRefreshServiceLike & {
    manualRefresh: ReturnType<typeof vi.fn>;
    resetCircuitBreaker: ReturnType<typeof vi.fn>;
    updateSource: ReturnType<typeof vi.fn>;
    clearAllSources: ReturnType<typeof vi.fn>;
    removeSourcesNotIn: ReturnType<typeof vi.fn>;
} {
    return {
        activeWorkspaceId: 'ws-test-1',
        manualRefresh: vi.fn<(id: string) => Promise<{ success: boolean; error?: string }>>().mockResolvedValue({ success: true }),
        resetCircuitBreaker: vi.fn<(id: string) => void>(),
        updateSource: vi.fn<(source: Source) => Promise<void>>().mockResolvedValue(undefined),
        clearAllSources: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        removeSourcesNotIn: vi.fn<(ids: Set<string>) => Promise<void>>().mockResolvedValue(undefined),
    };
}

function createProxyService(): ProxyServiceLike {
    return {
        switchWorkspace: vi.fn().mockResolvedValue(undefined),
        updateSources: vi.fn(),
        updateHeaderRules: vi.fn(),
        updateProxyRules: vi.fn(),
        updateEnvironmentVariables: vi.fn(),
        clearRules: vi.fn(),
    };
}

function createWebSocketService(envResolver: EnvironmentResolverLike): WebSocketServiceLike {
    return {
        sources: [],
        rules: { header: [], request: [], response: [] },
        sourceHandler: { broadcastSources: vi.fn() },
        ruleHandler: { broadcastRules: vi.fn() },
        environmentHandler: envResolver,
    };
}

/**
 * Build a WorkspaceStateService with pre-loaded state (bypassing initialize/disk).
 * Accesses private fields via type assertion — acceptable for white-box testing.
 */
function createService(opts: {
    sources: Source[];
    envVars?: Record<string, string>;
}): {
    service: WorkspaceStateService;
    refreshService: ReturnType<typeof createRefreshService>;
    proxyService: ProxyServiceLike;
    envResolver: EnvironmentResolverLike;
} {
    const envResolver = createEnvResolver(opts.envVars ?? {});
    const refreshService = createRefreshService();
    const proxyService = createProxyService();
    const wsService = createWebSocketService(envResolver);

    const service = new WorkspaceStateService();

    // Wire dependencies via configure()
    const syncScheduler = {
        onWorkspaceSwitch: vi.fn().mockResolvedValue(undefined),
        onWorkspaceUpdated: vi.fn().mockResolvedValue(undefined),
        importSyncedData: vi.fn().mockResolvedValue(undefined),
    };
    service.configure({
        webSocketService: wsService,
        proxyService,
        sourceRefreshService: refreshService,
        syncScheduler,
    });

    // Inject pre-loaded state (bypass disk-based initialize)
    const state = (service as unknown as { state: { sources: Source[]; initialized: boolean } }).state;
    state.sources = opts.sources;
    state.initialized = true;

    return { service, refreshService, proxyService, envResolver };
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => { vi.clearAllMocks(); });

describe('WorkspaceStateService.onEnvironmentVariablesChanged', () => {
    describe('sources with no env var references', () => {
        it('does not refresh or reset circuit breaker', async () => {
            const source = httpSource({
                sourceId: '1',
                sourcePath: 'https://api.openheaders.io/static-data',
                sourceContent: '{"data":"cached"}',
            });

            const { service, refreshService } = createService({
                sources: [source],
                envVars: { API_KEY: 'old-key' },
            });

            await service.onEnvironmentVariablesChanged({ API_KEY: 'new-key' });

            expect(refreshService.manualRefresh).not.toHaveBeenCalled();
            expect(refreshService.resetCircuitBreaker).not.toHaveBeenCalled();
        });

        it('preserves timer for source with no env var deps even when many vars change', async () => {
            const source = httpSource({
                sourceId: '1',
                sourcePath: 'https://api.openheaders.io/public',
                sourceContent: '{"public":true}',
            });

            const { service, refreshService } = createService({
                sources: [source],
                envVars: { A: '1', B: '2', C: '3' },
            });

            await service.onEnvironmentVariablesChanged({ A: 'x', B: 'y', C: 'z' });

            expect(refreshService.manualRefresh).not.toHaveBeenCalled();
            expect(refreshService.resetCircuitBreaker).not.toHaveBeenCalled();
        });
    });

    describe('sources with env var references but values unchanged', () => {
        it('does not refresh when env var values are identical', async () => {
            const source = httpSource({
                sourceId: '1',
                sourcePath: 'https://{{HOST}}/api/data',
                sourceContent: '{"data":"cached"}',
            });

            const { service, refreshService } = createService({
                sources: [source],
                envVars: { HOST: 'api.openheaders.io' },
            });

            // Same value for HOST
            await service.onEnvironmentVariablesChanged({ HOST: 'api.openheaders.io' });

            expect(refreshService.manualRefresh).not.toHaveBeenCalled();
            expect(refreshService.resetCircuitBreaker).not.toHaveBeenCalled();
        });

        it('does not refresh when only unrelated vars change', async () => {
            const source = httpSource({
                sourceId: '1',
                sourcePath: 'https://{{HOST}}/api/data',
                sourceContent: '{"data":"cached"}',
            });

            const { service, refreshService } = createService({
                sources: [source],
                envVars: { HOST: 'api.openheaders.io', UNRELATED: 'old' },
            });

            // HOST stays the same, only UNRELATED changes
            await service.onEnvironmentVariablesChanged({ HOST: 'api.openheaders.io', UNRELATED: 'new' });

            expect(refreshService.manualRefresh).not.toHaveBeenCalled();
            expect(refreshService.resetCircuitBreaker).not.toHaveBeenCalled();
        });
    });

    describe('sources with env var references and values changed', () => {
        it('refreshes source when referenced env var value changes', async () => {
            const source = httpSource({
                sourceId: '1',
                sourcePath: 'https://{{HOST}}/api/data',
                sourceContent: '{"data":"from-staging"}',
            });

            const { service, refreshService } = createService({
                sources: [source],
                envVars: { HOST: 'api-staging.openheaders.io' },
            });

            await service.onEnvironmentVariablesChanged({ HOST: 'api.openheaders.io' });

            expect(refreshService.manualRefresh).toHaveBeenCalledWith('1');
            expect(refreshService.resetCircuitBreaker).toHaveBeenCalledWith('1');
        });

        it('refreshes source when auth header env var changes', async () => {
            const source = httpSource({
                sourceId: '1',
                sourcePath: 'https://api.openheaders.io/data',
                requestOptions: {
                    headers: [{ key: 'Authorization', value: 'Bearer {{API_KEY}}' }],
                } as Source['requestOptions'],
                sourceContent: '{"data":"cached"}',
            });

            const { service, refreshService } = createService({
                sources: [source],
                envVars: { API_KEY: 'staging-key' },
            });

            await service.onEnvironmentVariablesChanged({ API_KEY: 'production-key' });

            expect(refreshService.manualRefresh).toHaveBeenCalledWith('1');
            expect(refreshService.resetCircuitBreaker).toHaveBeenCalledWith('1');
        });

        it('only refreshes sources whose referenced vars changed, not all', async () => {
            const sourceAffected = httpSource({
                sourceId: '1',
                sourcePath: 'https://{{HOST}}/api',
                sourceContent: 'cached-1',
            });
            const sourceUnaffected = httpSource({
                sourceId: '2',
                sourcePath: 'https://{{OTHER_HOST}}/api',
                sourceContent: 'cached-2',
            });
            const sourceStatic = httpSource({
                sourceId: '3',
                sourcePath: 'https://api.openheaders.io/static',
                sourceContent: 'cached-3',
            });

            const { service, refreshService } = createService({
                sources: [sourceAffected, sourceUnaffected, sourceStatic],
                envVars: { HOST: 'old.openheaders.io', OTHER_HOST: 'other.openheaders.io' },
            });

            // Only HOST changes
            await service.onEnvironmentVariablesChanged({
                HOST: 'new.openheaders.io',
                OTHER_HOST: 'other.openheaders.io',
            });

            expect(refreshService.manualRefresh).toHaveBeenCalledTimes(1);
            expect(refreshService.manualRefresh).toHaveBeenCalledWith('1');
            expect(refreshService.resetCircuitBreaker).toHaveBeenCalledTimes(1);
            expect(refreshService.resetCircuitBreaker).toHaveBeenCalledWith('1');
        });
    });

    describe('newly activated sources (waiting_for_deps → active)', () => {
        it('registers newly activated source with refresh service', async () => {
            const source = httpSource({
                sourceId: '1',
                sourcePath: 'https://{{HOST}}/api',
                activationState: 'waiting_for_deps',
                missingDependencies: ['HOST'],
                sourceContent: null,
            });

            const { service, refreshService } = createService({
                sources: [source],
                envVars: {},  // HOST was missing
            });

            // Now provide HOST
            await service.onEnvironmentVariablesChanged({ HOST: 'api.openheaders.io' });

            expect(refreshService.updateSource).toHaveBeenCalled();
            expect(refreshService.resetCircuitBreaker).toHaveBeenCalledWith('1');
            // Should NOT call manualRefresh — updateSource triggers eager fetch internally
            expect(refreshService.manualRefresh).not.toHaveBeenCalled();
        });
    });

    describe('sources without content', () => {
        it('does not refresh source that has no content yet (even if vars changed)', async () => {
            const source = httpSource({
                sourceId: '1',
                sourcePath: 'https://{{HOST}}/api',
                sourceContent: null,
            });

            const { service, refreshService } = createService({
                sources: [source],
                envVars: { HOST: 'old.openheaders.io' },
            });

            await service.onEnvironmentVariablesChanged({ HOST: 'new.openheaders.io' });

            // No manualRefresh — source has no cached content to invalidate
            expect(refreshService.manualRefresh).not.toHaveBeenCalled();
        });
    });

    describe('normalizes { value, isSecret } objects to plain strings', () => {
        it('passes normalized string values to envResolver.setVariables', async () => {
            const source = httpSource({ sourceId: '1', sourcePath: 'https://api.openheaders.io/data' });
            const { service, envResolver } = createService({
                sources: [source],
                envVars: {},
            });

            await service.onEnvironmentVariablesChanged({
                API_KEY: { value: 'secret-key' },
                HOST: 'plain-string',
            });

            expect(envResolver.setVariables).toHaveBeenCalledWith({
                API_KEY: 'secret-key',
                HOST: 'plain-string',
            });
        });
    });

    describe('proxy service integration', () => {
        it('always updates proxy with new env vars regardless of source impact', async () => {
            const source = httpSource({
                sourceId: '1',
                sourcePath: 'https://api.openheaders.io/static',
                sourceContent: 'cached',
            });

            const { service, proxyService } = createService({
                sources: [source],
                envVars: { UNRELATED: 'old' },
            });

            await service.onEnvironmentVariablesChanged({ UNRELATED: 'new' });

            expect(proxyService.updateEnvironmentVariables).toHaveBeenCalledWith({ UNRELATED: 'new' });
        });
    });

    describe('mixed scenario — full env switch', () => {
        it('handles realistic env switch: some sources affected, some not', async () => {
            const sources: Source[] = [
                httpSource({
                    sourceId: '1',
                    sourcePath: 'https://{{BASE_URL}}/config',
                    requestOptions: {
                        headers: [{ key: 'Authorization', value: 'Bearer {{API_KEY}}' }],
                    } as Source['requestOptions'],
                    sourceContent: '{"env":"staging"}',
                }),
                httpSource({
                    sourceId: '2',
                    sourcePath: 'https://cdn.openheaders.io/assets.json',
                    sourceContent: '{"assets":true}',
                }),
                httpSource({
                    sourceId: '3',
                    sourcePath: 'https://{{BASE_URL}}/health',
                    sourceContent: '{"healthy":true}',
                }),
                { sourceId: '4', sourceType: 'file', sourcePath: '/tmp/local.json', sourceContent: 'local', activationState: 'active' },
            ];

            const { service, refreshService } = createService({
                sources,
                envVars: {
                    BASE_URL: 'api-staging.openheaders.io',
                    API_KEY: 'staging-key',
                    THEME: 'dark',
                },
            });

            // Switch to production env
            await service.onEnvironmentVariablesChanged({
                BASE_URL: 'api.openheaders.io',
                API_KEY: 'production-key',
                THEME: 'dark',  // unchanged
            });

            // Source 1: uses {{BASE_URL}} and {{API_KEY}} — both changed → refresh
            expect(refreshService.manualRefresh).toHaveBeenCalledWith('1');
            // Source 2: no env vars → untouched
            // Source 3: uses {{BASE_URL}} — changed → refresh
            expect(refreshService.manualRefresh).toHaveBeenCalledWith('3');
            // Source 4: file type → untouched
            expect(refreshService.manualRefresh).toHaveBeenCalledTimes(2);

            // Circuit breakers reset only for affected sources
            expect(refreshService.resetCircuitBreaker).toHaveBeenCalledWith('1');
            expect(refreshService.resetCircuitBreaker).toHaveBeenCalledWith('3');
            expect(refreshService.resetCircuitBreaker).toHaveBeenCalledTimes(2);
        });
    });
});
