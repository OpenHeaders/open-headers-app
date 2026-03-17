import { describe, it, expect, vi } from 'vitest';
import { WorkspaceHandler } from '../../../../src/renderer/services/export-import/handlers/WorkspaceHandler';
import { DEFAULTS } from '../../../../src/renderer/services/export-import/core/ExportImportConfig';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDeps(overrides: Record<string, any> = {}) {
  return {
    workspaces: [],
    createWorkspace: vi.fn(async (ws) => ws),
    switchWorkspace: vi.fn(),
    ...overrides,
  };
}

function validWorkspace(overrides: Record<string, any> = {}) {
  return {
    name: 'My Workspace',
    description: 'Test workspace',
    type: 'git',
    gitUrl: 'https://github.com/org/repo',
    gitBranch: 'main',
    gitPath: 'config/open-headers.json',
    authType: 'none',
    autoSync: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// _sanitizeAuthData  (pure)
// ---------------------------------------------------------------------------
describe('WorkspaceHandler._sanitizeAuthData', () => {
  it('returns empty object for null input', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect((handler as any)._sanitizeAuthData(null)).toEqual({});
  });

  it('returns empty object for non-object input', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect((handler as any)._sanitizeAuthData('str')).toEqual({});
  });

  it('removes sensitive debugging fields', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const result = (handler as any)._sanitizeAuthData({
      type: 'oauth',
      debugInfo: 'secret',
      lastError: 'err',
      internalTokens: ['tok'],
      otherField: 'keep',
    });
    expect(result.debugInfo).toBeUndefined();
    expect(result.lastError).toBeUndefined();
    expect(result.internalTokens).toBeUndefined();
    expect(result.otherField).toBe('keep');
  });

  it('sanitizes tokens to essential fields only', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const result = (handler as any)._sanitizeAuthData({
      tokens: {
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: 123,
        tokenType: 'Bearer',
        internalMeta: 'should-be-removed',
      },
    });
    expect(result.tokens).toEqual({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: 123,
      tokenType: 'Bearer',
    });
    expect(result.tokens.internalMeta).toBeUndefined();
  });

  it('preserves non-object tokens as-is', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const result = (handler as any)._sanitizeAuthData({ tokens: 'plain' });
    expect(result.tokens).toBe('plain');
  });
});

// ---------------------------------------------------------------------------
// _validateAndSanitizeAuthData  (pure with validation)
// ---------------------------------------------------------------------------
describe('WorkspaceHandler._validateAndSanitizeAuthData', () => {
  it('throws for null input', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect(() => (handler as any)._validateAndSanitizeAuthData(null))
      .toThrow('must be an object');
  });

  it('throws for non-object input', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect(() => (handler as any)._validateAndSanitizeAuthData('str'))
      .toThrow('must be an object');
  });

  it('throws for OAuth without access token', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect(() => (handler as any)._validateAndSanitizeAuthData({
      type: 'oauth',
      tokens: {},
    })).toThrow('missing required tokens');
  });

  it('throws for OAuth without tokens at all', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect(() => (handler as any)._validateAndSanitizeAuthData({
      type: 'oauth',
    })).toThrow('missing required tokens');
  });

  it('throws for personal-token without token', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect(() => (handler as any)._validateAndSanitizeAuthData({
      type: 'personal-token',
    })).toThrow('missing token');
  });

  it('accepts valid OAuth auth data', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const result = (handler as any)._validateAndSanitizeAuthData({
      type: 'oauth',
      tokens: { accessToken: 'abc', refreshToken: 'def' },
    });
    expect(result.type).toBe('oauth');
    expect(result.tokens.accessToken).toBe('abc');
  });

  it('accepts valid personal-token auth data', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const result = (handler as any)._validateAndSanitizeAuthData({
      type: 'personal-token',
      token: 'ghp_123',
    });
    expect(result.token).toBe('ghp_123');
  });

  it('accepts auth data with no special type', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const result = (handler as any)._validateAndSanitizeAuthData({ type: 'none' });
    expect(result.type).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// _shouldImportCredentials  (pure)
// ---------------------------------------------------------------------------
describe('WorkspaceHandler._shouldImportCredentials', () => {
  it('returns true for git sync operations', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect((handler as any)._shouldImportCredentials({ isGitSync: true })).toBe(true);
  });

  it('returns true when includeCredentials is true', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect((handler as any)._shouldImportCredentials({ includeCredentials: true })).toBe(true);
  });

  it('returns false when includeCredentials is false', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect((handler as any)._shouldImportCredentials({ includeCredentials: false })).toBe(false);
  });

  it('returns false when includeCredentials is undefined', () => {
    const handler = new WorkspaceHandler(makeDeps());
    expect((handler as any)._shouldImportCredentials({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// _generateWorkspaceId  (pure)
// ---------------------------------------------------------------------------
describe('WorkspaceHandler._generateWorkspaceId', () => {
  it('returns a non-empty string', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const id = (handler as any)._generateWorkspaceId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates unique IDs', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const ids = new Set(Array.from({ length: 20 }, () => (handler as any)._generateWorkspaceId()));
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
    expect(handler.getWorkspaceStatistics(undefined).hasWorkspace).toBe(false);
  });

  it('returns detailed stats for valid workspace', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const stats = handler.getWorkspaceStatistics(validWorkspace());
    expect(stats.hasWorkspace).toBe(true);
    expect(stats.name).toBe('My Workspace');
    expect(stats.type).toBe('git');
    expect(stats.hasGitUrl).toBe(true);
    expect(stats.hasAuthData).toBe(false);
    expect(stats.authType).toBe('none');
    expect(stats.autoSync).toBe(true);
  });

  it('detects when authData is present', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const stats = handler.getWorkspaceStatistics(validWorkspace({ authData: { type: 'oauth' } }));
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
    expect(handler.validateWorkspaceForExport(undefined).success).toBe(true);
  });

  it('validates non-null workspace data', () => {
    const handler = new WorkspaceHandler(makeDeps());
    const r = handler.validateWorkspaceForExport({ type: 'git' }); // missing name
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
    const result = await handler.exportWorkspace({
      includeWorkspace: false,
      currentWorkspace: validWorkspace(),
    });
    expect(result).toBeNull();
  });

  it('returns null when currentWorkspace is null', async () => {
    const handler = new WorkspaceHandler(makeDeps());
    const result = await handler.exportWorkspace({
      includeWorkspace: true,
      currentWorkspace: null,
    });
    expect(result).toBeNull();
  });

  it('exports workspace data with defaults applied', async () => {
    const handler = new WorkspaceHandler(makeDeps());
    const result = await handler.exportWorkspace({
      includeWorkspace: true,
      includeCredentials: false,
      currentWorkspace: {
        name: 'Test WS',
        description: 'Desc',
        gitUrl: 'https://github.com/test',
      },
    });

    expect(result.name).toBe('Test WS');
    expect(result.type).toBe(DEFAULTS.WORKSPACE_TYPE);
    expect(result.gitBranch).toBe(DEFAULTS.WORKSPACE_BRANCH);
    expect(result.gitPath).toBe(DEFAULTS.WORKSPACE_PATH);
    expect(result.authType).toBe(DEFAULTS.AUTH_TYPE);
    expect(result.autoSync).toBe(true);
    expect(result.authData).toBeUndefined();
  });

  it('includes credentials when requested', async () => {
    const handler = new WorkspaceHandler(makeDeps());
    const result = await handler.exportWorkspace({
      includeWorkspace: true,
      includeCredentials: true,
      currentWorkspace: {
        name: 'Test WS',
        type: 'git',
        gitUrl: 'https://github.com/test',
        authData: { type: 'oauth', tokens: { accessToken: 'at' } },
      },
    });

    expect(result.authData).toBeDefined();
    expect(result.authData.type).toBe('oauth');
  });

  it('omits credentials when not requested even if present', async () => {
    const handler = new WorkspaceHandler(makeDeps());
    const result = await handler.exportWorkspace({
      includeWorkspace: true,
      includeCredentials: false,
      currentWorkspace: {
        name: 'Test WS',
        type: 'git',
        gitUrl: 'https://github.com/test',
        authData: { type: 'oauth', tokens: { accessToken: 'at' } },
      },
    });

    expect(result.authData).toBeUndefined();
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
    const stats = await handler.importWorkspace({ type: 'git' }, {}); // missing name
    expect(stats.createdWorkspace).toBeNull();
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0].error).toContain('Invalid workspace configuration');
  });

  it('records error when createWorkspace throws', async () => {
    const handler = new WorkspaceHandler(makeDeps({
      createWorkspace: vi.fn().mockRejectedValue(new Error('db fail')),
    }));

    const stats = await handler.importWorkspace(validWorkspace(), {});
    expect(stats.createdWorkspace).toBeNull();
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0].error).toContain('db fail');
  });
});
