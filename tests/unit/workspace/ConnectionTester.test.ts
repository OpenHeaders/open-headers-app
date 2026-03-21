import { describe, it, expect, vi } from 'vitest';

// Mock electron
vi.mock('electron', () => ({
    default: {
        net: { request: vi.fn() }
    },
    net: { request: vi.fn() }
}));

// Mock mainLogger
vi.mock('../../../src/utils/mainLogger.js', () => ({
    default: {
        createLogger: () => ({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn()
        })
    }
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
        it('parses standard ls-remote output', () => {
            const output = [
                'abc123\trefs/heads/main',
                'def456\trefs/heads/feature-x',
                'ghi789\trefs/heads/develop'
            ].join('\n');
            expect(tester.parseLsRemoteOutput(output)).toEqual(['main', 'feature-x', 'develop']);
        });

        it('handles empty output', () => {
            expect(tester.parseLsRemoteOutput('')).toEqual([]);
        });

        it('skips lines without tab', () => {
            const output = 'abc123\trefs/heads/main\nmalformed line';
            expect(tester.parseLsRemoteOutput(output)).toEqual(['main']);
        });
    });

    describe('detectDefaultBranch()', () => {
        it('prefers "main" over "master"', () => {
            expect(tester.detectDefaultBranch(['feature', 'master', 'main'])).toBe('main');
        });

        it('falls back to "master" when "main" not present', () => {
            expect(tester.detectDefaultBranch(['feature', 'master'])).toBe('master');
        });

        it('falls back to "develop" when main/master not present', () => {
            expect(tester.detectDefaultBranch(['feature', 'develop'])).toBe('develop');
        });

        it('returns first branch when no common defaults found', () => {
            expect(tester.detectDefaultBranch(['alpha', 'beta'])).toBe('alpha');
        });

        it('returns "main" for empty list', () => {
            expect(tester.detectDefaultBranch([])).toBe('main');
        });
    });

    describe('suggestAlternativeBranches()', () => {
        const branches = ['main', 'master', 'develop', 'feature-login', 'feature-auth'];

        it('suggests case-insensitive exact match first', () => {
            const result = tester.suggestAlternativeBranches('Main', branches);
            expect(result[0]).toBe('main');
        });

        it('suggests partial matches', () => {
            const result = tester.suggestAlternativeBranches('feature', branches);
            expect(result).toContain('feature-login');
            expect(result).toContain('feature-auth');
        });

        it('includes default branches if not already present', () => {
            const result = tester.suggestAlternativeBranches('nonexistent', branches);
            expect(result).toContain('main');
            expect(result).toContain('master');
        });

        it('limits to 5 suggestions', () => {
            const manyBranches = Array.from({ length: 20 }, (_, i) => `test-${i}`);
            const result = tester.suggestAlternativeBranches('test', manyBranches);
            expect(result.length).toBeLessThanOrEqual(5);
        });
    });

    describe('classifyError()', () => {
        it('classifies auth errors', () => {
            expect(tester.classifyError(new Error('permission denied'))).toBe('AUTH_ERROR');
            expect(tester.classifyError(new Error('authentication failed'))).toBe('AUTH_ERROR');
        });

        it('classifies network errors', () => {
            expect(tester.classifyError(new Error('could not resolve host'))).toBe('NETWORK_ERROR');
            expect(tester.classifyError(new Error('timeout'))).toBe('NETWORK_ERROR');
        });

        it('classifies not found errors', () => {
            expect(tester.classifyError(new Error('repository not found'))).toBe('NOT_FOUND');
        });

        it('classifies invalid URL errors', () => {
            expect(tester.classifyError(new Error('invalid URL'))).toBe('INVALID_URL');
        });

        it('returns UNKNOWN_ERROR for unrecognized', () => {
            expect(tester.classifyError(new Error('something else'))).toBe('UNKNOWN_ERROR');
        });
    });

    describe('getErrorHint()', () => {
        it('gives auth hint for auth errors', () => {
            const hint = tester.getErrorHint(new Error('authentication failed'));
            expect(hint).toContain('credentials');
        });

        it('gives network hint for network errors', () => {
            const hint = tester.getErrorHint(new Error('could not resolve host'));
            expect(hint).toContain('internet');
        });
    });

    describe('stripAuth()', () => {
        it('removes credentials from URL', () => {
            const result = tester.stripAuth('https://user:pass@github.com/repo.git');
            expect(result).not.toContain('user');
            expect(result).not.toContain('pass');
            expect(result).toContain('github.com');
        });

        it('returns original URL for invalid URLs', () => {
            expect(tester.stripAuth('not-a-url')).toBe('not-a-url');
        });
    });

    describe('parseGitHubUrl()', () => {
        it('parses HTTPS GitHub URL', () => {
            const result = tester.parseGitHubUrl('https://github.com/owner/repo');
            expect(result).toEqual({ owner: 'owner', repo: 'repo' });
        });

        it('parses HTTPS GitHub URL with .git suffix', () => {
            const result = tester.parseGitHubUrl('https://github.com/owner/repo.git');
            expect(result).toEqual({ owner: 'owner', repo: 'repo' });
        });

        it('parses SSH GitHub URL', () => {
            const result = tester.parseGitHubUrl('git@github.com:owner/repo.git');
            expect(result).toEqual({ owner: 'owner', repo: 'repo' });
        });

        it('returns null for non-GitHub URL', () => {
            expect(tester.parseGitHubUrl('https://gitlab.com/owner/repo')).toBeNull();
        });
    });

    describe('collectWarnings()', () => {
        it('adds warning when branch does not exist', () => {
            const warnings = tester.collectWarnings(
                { accessible: true, isPrivate: true },
                { exists: false, alternatives: ['main'] },
                { hasConfig: null, requiresClone: false }
            );
            expect(warnings.some(w => w.includes('does not exist'))).toBe(true);
            expect(warnings.some(w => w.includes('main'))).toBe(true);
        });

        it('adds warning for public repository', () => {
            const warnings = tester.collectWarnings(
                { accessible: true, isPrivate: false },
                { exists: true, alternatives: [] },
                { hasConfig: null, requiresClone: false }
            );
            expect(warnings.some(w => w.includes('public'))).toBe(true);
        });

        it('adds warning when clone required', () => {
            const warnings = tester.collectWarnings(
                { accessible: true, isPrivate: true },
                { exists: true, alternatives: [] },
                { hasConfig: null, requiresClone: true }
            );
            expect(warnings.some(w => w.includes('cloning'))).toBe(true);
        });

        it('returns empty for no issues', () => {
            const warnings = tester.collectWarnings(
                { accessible: true, isPrivate: true },
                { exists: true, alternatives: [] },
                { hasConfig: null, requiresClone: false }
            );
            expect(warnings).toEqual([]);
        });
    });
});
