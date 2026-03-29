import { describe, expect, it, vi } from 'vitest';
import type {
  ExportImportDependencies,
  ExportOptions,
  WorkspaceData,
} from '../../../../src/renderer/services/export-import/core/types';
import { WorkspaceHandler } from '../../../../src/renderer/services/export-import/handlers/WorkspaceHandler';

function makeExportOpts(overrides: Record<string, unknown> = {}): ExportOptions {
  return {
    selectedItems: {},
    fileFormat: 'single',
    environmentOption: 'none',
    includeWorkspace: false,
    ...overrides,
  } as ExportOptions;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDeps(overrides: Partial<ExportImportDependencies> = {}) {
  return {
    appVersion: '1.0.0',
    sources: [],
    activeWorkspaceId: 'default',
    exportSources: () => [],
    removeSource: vi.fn().mockResolvedValue(true),
    workspaces: [],
    createWorkspace: vi.fn(async (ws: WorkspaceData) => ws),
    switchWorkspace: vi.fn().mockResolvedValue(true),
    environments: {},
    createEnvironment: vi.fn().mockResolvedValue(true),
    setVariable: vi.fn().mockResolvedValue(true),
    generateEnvironmentSchema: vi.fn().mockReturnValue({ environments: {} }),
    rules: { header: [], request: [], response: [] },
    addHeaderRule: vi.fn(async () => true),
    updateHeaderRule: vi.fn(async () => true),
    removeHeaderRule: vi.fn(async () => true),
    ...overrides,
  } as unknown as ExportImportDependencies;
}

function validWorkspace(overrides: Partial<WorkspaceData> = {}): WorkspaceData {
  return {
    name: 'OpenHeaders — Staging Environment',
    description: 'Shared staging workspace for the platform team',
    type: 'git',
    gitUrl: 'https://gitlab.openheaders.io/platform/shared-headers.git',
    gitBranch: 'main',
    gitPath: 'config/open-headers.json',
    authType: 'token',
    autoSync: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// _sanitizeWorkspaceAuthData  (pure)
// ---------------------------------------------------------------------------
describe('WorkspaceHandler._sanitizeWorkspaceAuthData', () => {
  it('returns empty object for null input', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect(handler._sanitizeWorkspaceAuthData(null as never)).toEqual({});
  });

  it('returns empty object for non-object input', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect(handler._sanitizeWorkspaceAuthData('str' as never)).toEqual({});
  });

  it('copies only known auth fields from enterprise auth data', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const input = {
      token: 'glpat-a1b2c3d4e5f6g7h8i9j0',
      tokenType: 'gitlab',
      username: 'platform-bot@openheaders.io',
      password: 'P@ss=w0rd&special!chars',
      sshKeyPath: '/Users/jane.doe/.ssh/openheaders_ed25519',
      sshKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOpenHeaders',
      privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nb3Bl...',
      publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOpenHeaders',
      passphrase: 'my-key-passphrase!',
      unknownField: 'should-be-excluded',
      _internal: 'also-excluded',
    } as Parameters<typeof handler._sanitizeWorkspaceAuthData>[0];
    const result = handler._sanitizeWorkspaceAuthData(input);
    expect(result).toEqual({
      token: 'glpat-a1b2c3d4e5f6g7h8i9j0',
      tokenType: 'gitlab',
      username: 'platform-bot@openheaders.io',
      password: 'P@ss=w0rd&special!chars',
      sshKeyPath: '/Users/jane.doe/.ssh/openheaders_ed25519',
      sshKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOpenHeaders',
      privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nb3Bl...',
      publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOpenHeaders',
      passphrase: 'my-key-passphrase!',
    });
    expect((result as Record<string, unknown>).unknownField).toBeUndefined();
    expect((result as Record<string, unknown>)._internal).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// _validateAndSanitizeWorkspaceAuthData  (pure with validation)
// ---------------------------------------------------------------------------
describe('WorkspaceHandler._validateAndSanitizeWorkspaceAuthData', () => {
  it('throws for null input', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect(() => handler._validateAndSanitizeWorkspaceAuthData(null as never)).toThrow('must be an object');
  });

  it('throws for non-object input', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect(() => handler._validateAndSanitizeWorkspaceAuthData('str' as never)).toThrow('must be an object');
  });

  it('accepts valid token auth data', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const result = handler._validateAndSanitizeWorkspaceAuthData({
      token: 'glpat-a1b2c3d4e5f6g7h8i9j0',
      tokenType: 'gitlab',
    });
    expect(result).toEqual({
      token: 'glpat-a1b2c3d4e5f6g7h8i9j0',
      tokenType: 'gitlab',
    });
  });

  it('accepts valid basic auth data with special characters', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const result = handler._validateAndSanitizeWorkspaceAuthData({
      username: 'platform-bot@openheaders.io',
      password: 'P@ss=w0rd&special!chars',
    });
    expect(result).toEqual({
      username: 'platform-bot@openheaders.io',
      password: 'P@ss=w0rd&special!chars',
    });
  });

  it('accepts SSH auth data', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const result = handler._validateAndSanitizeWorkspaceAuthData({
      sshKeyPath: '/Users/jane.doe/.ssh/openheaders_ed25519',
      passphrase: 'my-key-passphrase!',
    });
    expect(result).toEqual({
      sshKeyPath: '/Users/jane.doe/.ssh/openheaders_ed25519',
      passphrase: 'my-key-passphrase!',
    });
  });
});

// ---------------------------------------------------------------------------
// _shouldImportCredentials  (pure)
// ---------------------------------------------------------------------------
describe('WorkspaceHandler._shouldImportCredentials', () => {
  it('returns true for git sync operations', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect(handler._shouldImportCredentials({ isGitSync: true })).toBe(true);
  });

  it('returns true when includeCredentials is true', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect(handler._shouldImportCredentials({ includeCredentials: true })).toBe(true);
  });

  it('returns false when includeCredentials is false', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect(handler._shouldImportCredentials({ includeCredentials: false })).toBe(false);
  });

  it('returns false when includeCredentials is undefined', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect(handler._shouldImportCredentials({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// _generateWorkspaceId  (pure)
// ---------------------------------------------------------------------------
describe('WorkspaceHandler._generateWorkspaceId', () => {
  it('returns a non-empty string', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const id = handler._generateWorkspaceId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates unique IDs', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const ids = new Set(Array.from({ length: 20 }, () => handler._generateWorkspaceId()));
    expect(ids.size).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// getWorkspaceStatistics  (pure)
// ---------------------------------------------------------------------------
describe('WorkspaceHandler.getWorkspaceStatistics', () => {
  it('returns hasWorkspace: false for null', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect(handler.getWorkspaceStatistics(null).hasWorkspace).toBe(false);
  });

  it('returns hasWorkspace: false for undefined', () => {
    const handler = new WorkspaceHandler(makeDeps());
    // Intentionally undefined to test defensive guard
    expect(handler.getWorkspaceStatistics(undefined as unknown as WorkspaceData | null).hasWorkspace).toBe(false);
  });

  it('returns detailed stats for valid workspace', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const stats = handler.getWorkspaceStatistics(validWorkspace());
    expect(stats).toEqual({
      hasWorkspace: true,
      name: 'OpenHeaders — Staging Environment',
      type: 'git',
      hasGitUrl: true,
      hasAuthData: false,
      authType: 'token',
      autoSync: true,
    });
  });

  it('detects when authData is present', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const stats = handler.getWorkspaceStatistics(validWorkspace({ authData: { token: 'test' } }));
    expect(stats.hasAuthData).toBe(true);
  });

  it('detects missing gitUrl', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const stats = handler.getWorkspaceStatistics(validWorkspace({ gitUrl: '' }));
    expect(stats.hasGitUrl).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateWorkspaceForExport  (delegates to validateWorkspaceConfig)
// ---------------------------------------------------------------------------
describe('WorkspaceHandler.validateWorkspaceForExport', () => {
  it('returns success for null (no workspace = valid)', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect(handler.validateWorkspaceForExport(null).success).toBe(true);
  });

  it('returns success for undefined', () => {
    const handler = new WorkspaceHandler(makeDeps());
    // Intentionally undefined to test defensive guard
    expect(handler.validateWorkspaceForExport(undefined as unknown as WorkspaceData | null).success).toBe(true);
  });

  it('validates non-null workspace data', () => {
    const handler = new WorkspaceHandler(makeDeps());
    // Intentionally missing name to test validation
    const r = handler.validateWorkspaceForExport({ type: 'git' } as WorkspaceData);
    expect(r.success).toBe(false);
    expect(r.error).toContain('name');
  });

  it('accepts valid workspace', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const r = handler.validateWorkspaceForExport(validWorkspace());
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// exportWorkspace  (async)
// ---------------------------------------------------------------------------
describe('WorkspaceHandler.exportWorkspace', () => {
  it('returns null when includeWorkspace is false', async () => {
    const handler = new WorkspaceHandler(makeDeps());
    const result = await handler.exportWorkspace(
      makeExportOpts({
        includeWorkspace: false,
        currentWorkspace: validWorkspace(),
      }),
    );
    expect(result).toBeNull();
  });

  it('returns null when currentWorkspace is null', async () => {
    const handler = new WorkspaceHandler(makeDeps());
    const result = await handler.exportWorkspace(
      makeExportOpts({
        includeWorkspace: true,
        currentWorkspace: null,
      }),
    );
    expect(result).toBeNull();
  });

  it('exports workspace data with defaults applied', async () => {
    const handler = new WorkspaceHandler(makeDeps());
    const result = await handler.exportWorkspace(
      makeExportOpts({
        includeWorkspace: true,
        includeCredentials: false,
        currentWorkspace: validWorkspace(),
      }),
    );

    expect(result).toEqual({
      name: 'OpenHeaders — Staging Environment',
      description: 'Shared staging workspace for the platform team',
      type: 'git',
      gitUrl: 'https://gitlab.openheaders.io/platform/shared-headers.git',
      gitBranch: 'main',
      gitPath: 'config/open-headers.json',
      authType: 'token',
      autoSync: true,
    });
  });

  it('includes credentials when requested', async () => {
    const handler = new WorkspaceHandler(makeDeps());
    const result = await handler.exportWorkspace(
      makeExportOpts({
        includeWorkspace: true,
        includeCredentials: true,
        currentWorkspace: validWorkspace({
          authData: { token: 'glpat-a1b2c3d4e5f6g7h8i9j0', tokenType: 'gitlab' },
        }),
      }),
    );

    expect(result!.authData).toEqual({
      token: 'glpat-a1b2c3d4e5f6g7h8i9j0',
      tokenType: 'gitlab',
    });
  });

  it('omits credentials when not requested even if present', async () => {
    const handler = new WorkspaceHandler(makeDeps());
    const result = await handler.exportWorkspace(
      makeExportOpts({
        includeWorkspace: true,
        includeCredentials: false,
        currentWorkspace: validWorkspace({
          authData: { token: 'glpat-secret-token' },
        }),
      }),
    );

    expect(result!.authData).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// importWorkspace  (async orchestration)
// ---------------------------------------------------------------------------
describe('WorkspaceHandler.importWorkspace', () => {
  it('returns empty stats for null workspace info', async () => {
    const handler = new WorkspaceHandler(makeDeps());
    const stats = await handler.importWorkspace(null, {});
    expect(stats.createdWorkspace).toBeNull();
    expect(stats.errors).toEqual([]);
  });

  it('records validation errors for invalid workspace', async () => {
    const handler = new WorkspaceHandler(makeDeps());
    // Intentionally missing name to test validation
    const stats = await handler.importWorkspace({ type: 'git' } as WorkspaceData, {});
    expect(stats.createdWorkspace).toBeNull();
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0].error).toContain('Invalid workspace configuration');
  });

  it('records error when createWorkspace throws', async () => {
    const handler = new WorkspaceHandler(
      makeDeps({
        createWorkspace: vi.fn().mockRejectedValue(new Error('db fail')),
      }),
    );

    const stats = await handler.importWorkspace(validWorkspace(), {});
    expect(stats.createdWorkspace).toBeNull();
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0].error).toContain('db fail');
  });
});
