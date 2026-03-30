import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock electron before importing the service
vi.mock('electron', () => ({
  default: {
    app: { getVersion: () => '3.5.0' },
    net: { request: vi.fn() },
    powerMonitor: { on: vi.fn() },
  },
}));

// Mock mainLogger
vi.mock('@/utils/mainLogger', () => ({
  default: {
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { HttpRequestService } from '@/services/http/HttpRequestService';
import { TotpCooldownTracker } from '@/services/http/TotpCooldownTracker';
import { SourceRefreshService } from '@/services/source-refresh/SourceRefreshService';
import type { Source } from '@/types/source';

function makeHttpSource(id: string, overrides: Partial<Source> = {}): Source {
  return {
    sourceId: id,
    sourceType: 'http',
    sourcePath: 'https://auth.openheaders.io/oauth2/token',
    sourceMethod: 'POST',
    sourceTag: 'oauth',
    sourceContent: null,
    requestOptions: {
      contentType: 'application/x-www-form-urlencoded',
      body: 'grant_type=client_credentials',
    },
    refreshOptions: { enabled: true, interval: 5 },
    ...overrides,
  } as Source;
}

function makeEnvResolver() {
  return {
    loadEnvironmentVariables: vi.fn(() => ({})),
    resolveTemplate: vi.fn((template: string) => template),
  };
}

describe('SourceRefreshService', () => {
  let service: SourceRefreshService;
  let envResolver: ReturnType<typeof makeEnvResolver>;

  beforeEach(() => {
    service = new SourceRefreshService();
    envResolver = makeEnvResolver();
    service.initialize();
    const httpRequestService = new HttpRequestService(envResolver, new TotpCooldownTracker());
    service.configure(null, httpRequestService);
  });

  afterEach(async () => {
    await service.shutdown();
  });

  describe('addSource', () => {
    it('ignores non-HTTP sources', async () => {
      await service.addSource({ sourceId: '1', sourceType: 'file' } as Source);
      const status = service.getRefreshStatus('1');
      expect(status.isRefreshing).toBe(false);
    });

    it('ignores sources waiting for dependencies', async () => {
      const source = makeHttpSource('1', { activationState: 'waiting_for_deps' });
      await service.addSource(source);
      expect(service.getRefreshStatus('1').isRefreshing).toBe(false);
    });

    it('does not trigger fetch if source already has content', async () => {
      const onContent = vi.fn();
      service.onContentUpdate = onContent;

      const source = makeHttpSource('1', { sourceContent: 'existing-token' });
      await service.addSource(source);

      // Wait a tick for any async work
      await new Promise((r) => setTimeout(r, 50));
      expect(onContent).not.toHaveBeenCalled();
    });
  });

  describe('removeSource', () => {
    it('removes source and clears circuit breaker', async () => {
      const source = makeHttpSource('1', { sourceContent: 'token' });
      await service.addSource(source);
      await service.removeSource('1');

      const status = service.getRefreshStatus('1');
      expect(status.isRefreshing).toBe(false);
    });
  });

  describe('manualRefresh', () => {
    it('returns error when source not found', async () => {
      const result = await service.manualRefresh('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('getTimeUntilRefresh', () => {
    it('returns 0 for unknown source', async () => {
      const time = await service.getTimeUntilRefresh('unknown');
      expect(time).toBe(0);
    });
  });

  describe('getRefreshStatus', () => {
    it('returns default status for unknown source', () => {
      const status = service.getRefreshStatus('unknown');
      expect(status.isRefreshing).toBe(false);
      expect(status.failureCount).toBe(0);
      expect(status.circuitBreaker.state).toBe('CLOSED');
    });
  });

  describe('shutdown', () => {
    it('completes without error', async () => {
      await service.addSource(makeHttpSource('1', { sourceContent: 'a' }));
      await expect(service.shutdown()).resolves.not.toThrow();
    });
  });

  describe('configure', () => {
    it('stores environment resolver', async () => {
      // Verify configure was called by attempting a refresh — it will
      // try to use the env resolver (even though the HTTP call fails)
      const source = makeHttpSource('1', { sourceContent: 'token' });
      await service.addSource(source);
      await service.manualRefresh('1');

      // The env resolver should have been called during the fetch attempt
      expect(envResolver.loadEnvironmentVariables).toHaveBeenCalled();
    });
  });
});
