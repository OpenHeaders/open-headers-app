import { describe, expect, it, vi } from 'vitest';

// Mock electron
vi.mock('electron', () => ({
  default: {
    net: { request: vi.fn() },
  },
  net: { request: vi.fn() },
}));

// Mock mainLogger
vi.mock('../../../src/utils/mainLogger.js', () => ({
  default: {
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { ConnectionTester } from '../../../src/services/workspace/git/operations/ConnectionTester';

type TesterDeps = ConstructorParameters<typeof ConnectionTester>[0];

function makeTesterDeps(overrides: Record<string, unknown> = {}): TesterDeps {
  return {
    executor: {},
    authManager: {},
    configDetector: {},
    branchManager: {},
    ...overrides,
  } as unknown as TesterDeps;
}

describe('ConnectionTester', () => {
  const tester = new ConnectionTester(makeTesterDeps());

  describe('parseLsRemoteOutput()', () => {
    it('parses standard ls-remote output with enterprise branches', () => {
      const output = [
        'f7a3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9\trefs/heads/main',
        'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0\trefs/heads/workspace/staging-env',
        'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1\trefs/heads/workspace/production',
        'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2\trefs/heads/develop',
      ].join('\n');
      expect(tester.parseLsRemoteOutput(output)).toEqual([
        'main',
        'workspace/staging-env',
        'workspace/production',
        'develop',
      ]);
    });

    it('handles empty output', () => {
      expect(tester.parseLsRemoteOutput('')).toEqual([]);
    });

    it('skips lines without tab separator', () => {
      const output = 'abc123\trefs/heads/main\nmalformed line without tab';
      expect(tester.parseLsRemoteOutput(output)).toEqual(['main']);
    });

    it('handles single branch', () => {
      const output = 'abc123\trefs/heads/main\n';
      expect(tester.parseLsRemoteOutput(output)).toEqual(['main']);
    });
  });

  describe('detectDefaultBranch()', () => {
    it('prefers "main" when present', () => {
      expect(tester.detectDefaultBranch(['workspace/staging', 'master', 'main', 'develop'])).toBe('main');
    });

    it('falls back to "master" when "main" not present', () => {
      expect(tester.detectDefaultBranch(['workspace/staging', 'master', 'develop'])).toBe('master');
    });

    it('falls back to "develop" when main/master not present', () => {
      expect(tester.detectDefaultBranch(['workspace/staging', 'develop'])).toBe('develop');
    });

    it('falls back to "development" when main/master/develop not present', () => {
      expect(tester.detectDefaultBranch(['workspace/staging', 'development'])).toBe('development');
    });

    it('returns first branch when no common defaults found', () => {
      expect(tester.detectDefaultBranch(['workspace/staging', 'workspace/prod'])).toBe('workspace/staging');
    });

    it('returns "main" for empty list', () => {
      expect(tester.detectDefaultBranch([])).toBe('main');
    });
  });

  describe('suggestAlternativeBranches()', () => {
    const branches = [
      'main',
      'master',
      'develop',
      'workspace/staging-env',
      'workspace/production',
      'feature/oauth2-headers',
    ];

    it('suggests case-insensitive exact match first', () => {
      const result = tester.suggestAlternativeBranches('Main', branches);
      expect(result[0]).toBe('main');
    });

    it('suggests partial matches for workspace branches', () => {
      const result = tester.suggestAlternativeBranches('workspace', branches);
      expect(result).toContain('workspace/staging-env');
      expect(result).toContain('workspace/production');
    });

    it('includes default branches if not already present', () => {
      const result = tester.suggestAlternativeBranches('nonexistent-branch', branches);
      expect(result).toContain('main');
      expect(result).toContain('master');
    });

    it('limits to 5 suggestions', () => {
      const manyBranches = Array.from({ length: 20 }, (_, i) => `workspace/env-${i}`);
      const result = tester.suggestAlternativeBranches('workspace', manyBranches);
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('handles empty branch list', () => {
      const result = tester.suggestAlternativeBranches('main', []);
      expect(result).toEqual([]);
    });
  });

  describe('classifyError()', () => {
    it('classifies auth errors', () => {
      expect(tester.classifyError(new Error('permission denied (publickey)'))).toBe('AUTH_ERROR');
      expect(
        tester.classifyError(
          new Error('authentication failed for https://github.com/OpenHeaders/open-headers-app.git'),
        ),
      ).toBe('AUTH_ERROR');
      expect(tester.classifyError(new Error('unauthorized access'))).toBe('AUTH_ERROR');
    });

    it('classifies network errors', () => {
      expect(tester.classifyError(new Error('could not resolve host gitlab.openheaders.io'))).toBe('NETWORK_ERROR');
      expect(tester.classifyError(new Error('timeout connecting to github.com'))).toBe('NETWORK_ERROR');
    });

    it('classifies not found errors', () => {
      expect(tester.classifyError(new Error('repository not found'))).toBe('NOT_FOUND');
      expect(tester.classifyError(new Error('does not exist'))).toBe('NOT_FOUND');
    });

    it('classifies invalid URL errors', () => {
      expect(tester.classifyError(new Error('invalid URL format'))).toBe('INVALID_URL');
      expect(tester.classifyError(new Error('malformed repository URL'))).toBe('INVALID_URL');
    });

    it('returns UNKNOWN_ERROR for unrecognized messages', () => {
      expect(tester.classifyError(new Error('something completely different'))).toBe('UNKNOWN_ERROR');
    });
  });

  describe('getErrorHint()', () => {
    it('gives auth hint for auth errors', () => {
      const hint = tester.getErrorHint(new Error('authentication failed'));
      expect(hint).toContain('credentials');
      expect(hint).toContain('permissions');
    });

    it('gives network hint for network errors', () => {
      const hint = tester.getErrorHint(new Error('could not resolve host'));
      expect(hint).toContain('internet');
      expect(hint).toContain('URL');
    });

    it('gives not found hint', () => {
      const hint = tester.getErrorHint(new Error('repository not found'));
      expect(hint).toContain('URL');
      expect(hint).toContain('correct');
    });

    it('gives invalid URL hint', () => {
      const hint = tester.getErrorHint(new Error('invalid URL'));
      expect(hint).toContain('format');
    });

    it('gives generic hint for unknown errors', () => {
      const hint = tester.getErrorHint(new Error('something unknown'));
      expect(hint).toContain('try again');
    });
  });

  describe('stripAuth()', () => {
    it('removes token credentials from GitHub URL', () => {
      const result = tester.stripAuth('https://ghp_abc123:x-oauth-basic@github.com/OpenHeaders/open-headers-app.git');
      expect(result).not.toContain('ghp_abc123');
      expect(result).not.toContain('x-oauth-basic');
      expect(result).toContain('github.com/OpenHeaders/open-headers-app.git');
    });

    it('removes basic auth credentials', () => {
      const result = tester.stripAuth('https://deploy-bot:secret-pass@gitlab.openheaders.io/team/repo.git');
      expect(result).not.toContain('deploy-bot');
      expect(result).not.toContain('secret-pass');
    });

    it('returns original URL for URLs without credentials', () => {
      const url = 'https://github.com/OpenHeaders/open-headers-app.git';
      expect(tester.stripAuth(url)).toBe(url);
    });

    it('returns original string for invalid URLs', () => {
      expect(tester.stripAuth('not-a-url')).toBe('not-a-url');
    });
  });

  describe('parseGitHubUrl()', () => {
    it('parses HTTPS GitHub URL without .git', () => {
      const result = tester.parseGitHubUrl('https://github.com/OpenHeaders/open-headers-app');
      expect(result).toEqual({ owner: 'OpenHeaders', repo: 'open-headers-app' });
    });

    it('parses HTTPS GitHub URL with .git suffix', () => {
      const result = tester.parseGitHubUrl('https://github.com/OpenHeaders/open-headers-app.git');
      expect(result).toEqual({ owner: 'OpenHeaders', repo: 'open-headers-app' });
    });

    it('parses SSH GitHub URL', () => {
      const result = tester.parseGitHubUrl('git@github.com:OpenHeaders/open-headers-app.git');
      expect(result).toEqual({ owner: 'OpenHeaders', repo: 'open-headers-app' });
    });

    it('returns null for non-GitHub URL (GitLab)', () => {
      expect(tester.parseGitHubUrl('https://gitlab.openheaders.io/team/repo')).toBeNull();
    });

    it('returns null for non-GitHub URL (Bitbucket)', () => {
      expect(tester.parseGitHubUrl('https://bitbucket.org/OpenHeaders/repo')).toBeNull();
    });
  });

  describe('collectWarnings()', () => {
    it('adds warning when branch does not exist with alternatives', () => {
      const warnings = tester.collectWarnings(
        { accessible: true, isPrivate: true },
        { exists: false, alternatives: ['main', 'develop'] },
        { hasConfig: null, requiresClone: false },
      );
      expect(warnings.some((w) => w.includes('does not exist'))).toBe(true);
      expect(warnings.some((w) => w.includes('main'))).toBe(true);
    });

    it('adds warning for public repository', () => {
      const warnings = tester.collectWarnings(
        { accessible: true, isPrivate: false },
        { exists: true, alternatives: [] },
        { hasConfig: null, requiresClone: false },
      );
      expect(warnings.some((w) => w.includes('public'))).toBe(true);
    });

    it('adds warning when clone required for config verification', () => {
      const warnings = tester.collectWarnings(
        { accessible: true, isPrivate: true },
        { exists: true, alternatives: [] },
        { hasConfig: null, requiresClone: true },
      );
      expect(warnings.some((w) => w.includes('cloning'))).toBe(true);
    });

    it('returns empty array when everything is fine', () => {
      const warnings = tester.collectWarnings(
        { accessible: true, isPrivate: true },
        { exists: true, alternatives: [] },
        { hasConfig: null, requiresClone: false },
      );
      expect(warnings).toEqual([]);
    });

    it('accumulates multiple warnings', () => {
      const warnings = tester.collectWarnings(
        { accessible: true, isPrivate: false },
        { exists: false, alternatives: [] },
        { hasConfig: null, requiresClone: true },
      );
      // Should have at least 2 warnings (branch not found + public repo)
      expect(warnings.length).toBeGreaterThanOrEqual(2);
    });
  });
});
