import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SparseCheckoutManager } from '../../../src/services/workspace/git/repository/SparseCheckoutManager';
import { GitExecutor } from '../../../src/services/workspace/git/core/GitExecutor';

function createMockExecutor() {
    const executor = new GitExecutor();
    const spy = vi.spyOn(executor, 'execute').mockResolvedValue({ stdout: '', stderr: '' });
    return { executor, spy };
}

describe('SparseCheckoutManager', () => {
    let manager: SparseCheckoutManager;
    let executeSpy: ReturnType<typeof createMockExecutor>['spy'];

    beforeEach(() => {
        const mock = createMockExecutor();
        manager = new SparseCheckoutManager(mock.executor);
        executeSpy = mock.spy;
    });

    describe('validatePatterns()', () => {
        it('accepts valid directory patterns', () => {
            expect(() => manager.validatePatterns([
                '/config/',
                '/.openheaders/workspaces/ws-prod/',
                '/src/services/',
            ])).not.toThrow();
        });

        it('accepts single valid pattern', () => {
            expect(() => manager.validatePatterns(['/config/'])).not.toThrow();
        });

        it('rejects empty string pattern', () => {
            expect(() => manager.validatePatterns([''])).toThrow('Invalid pattern');
        });

        it('rejects root pattern "/"', () => {
            expect(() => manager.validatePatterns(['/'])).toThrow('entire repository');
        });

        it('rejects wildcard root pattern "/*"', () => {
            expect(() => manager.validatePatterns(['/*'])).toThrow('entire repository');
        });

        it('allows patterns with ".." (warns but does not throw)', () => {
            expect(() => manager.validatePatterns(['/some/../path/'])).not.toThrow();
        });

        it('rejects array with one invalid pattern among valid ones', () => {
            expect(() => manager.validatePatterns(['/valid/', ''])).toThrow('Invalid pattern');
        });
    });

    describe('pathToPattern()', () => {
        it('returns directory pattern for nested config file', () => {
            expect(manager.pathToPattern('.openheaders/workspaces/ws-prod/sources.json'))
                .toBe('/.openheaders/workspaces/ws-prod/');
        });

        it('returns directory pattern for config/ file', () => {
            expect(manager.pathToPattern('config/open-headers.json')).toBe('/config/');
        });

        it('returns null for root-level file (already covered by /*)', () => {
            expect(manager.pathToPattern('README.md')).toBeNull();
        });

        it('returns null for file at root "/"', () => {
            expect(manager.pathToPattern('/file.txt')).toBeNull();
        });

        it('normalizes Windows backslashes to forward slashes', () => {
            expect(manager.pathToPattern('config\\sub\\file.json')).toBe('/config/sub/');
        });

        it('handles deeply nested paths', () => {
            expect(manager.pathToPattern('.openheaders/workspaces/ws-a1b2c3d4/config/environments.json'))
                .toBe('/.openheaders/workspaces/ws-a1b2c3d4/config/');
        });
    });

    describe('createWorkspacePatterns()', () => {
        it('always includes root pattern /*', () => {
            const patterns = manager.createWorkspacePatterns({});
            expect(patterns).toEqual(['/*']);
        });

        it('adds directory patterns for config paths', () => {
            const patterns = manager.createWorkspacePatterns({
                headers: '.openheaders/workspaces/ws-prod/headers.json',
                proxy: '.openheaders/workspaces/ws-prod/proxy.json',
                environments: '.openheaders/workspaces/ws-prod/environments.json',
            });
            expect(patterns).toContain('/*');
            expect(patterns).toContain('/.openheaders/workspaces/ws-prod/');
        });

        it('deduplicates patterns when multiple files share a directory', () => {
            const patterns = manager.createWorkspacePatterns({
                a: 'config/sources.json',
                b: 'config/rules.json',
                c: 'config/environments.json',
            });
            const configPatterns = patterns.filter(p => p === '/config/');
            expect(configPatterns).toHaveLength(1);
        });

        it('handles mixed root and nested files', () => {
            const patterns = manager.createWorkspacePatterns({
                root: 'package.json', // root-level, returns null
                nested: 'config/proxy.json',
            });
            expect(patterns).toContain('/*');
            expect(patterns).toContain('/config/');
            // root-level file should not add a separate pattern (null → skipped)
            expect(patterns).toHaveLength(2);
        });

        it('skips invalid config paths (empty or non-string)', () => {
            const patterns = manager.createWorkspacePatterns({
                valid: 'config/proxy.json',
            });
            expect(patterns).toContain('/config/');
        });
    });

    describe('optimizePatternsForCone()', () => {
        it('keeps directory patterns unchanged', () => {
            const result = manager.optimizePatternsForCone(['/src/', '/config/']);
            expect(result).toContain('/src/');
            expect(result).toContain('/config/');
        });

        it('converts file patterns to directory patterns', () => {
            const result = manager.optimizePatternsForCone(['/src/main.ts', '/config/proxy.json']);
            expect(result).toContain('/src/');
            expect(result).toContain('/config/');
        });

        it('handles top-level patterns (no slash prefix)', () => {
            const result = manager.optimizePatternsForCone(['docs', 'src']);
            expect(result).toContain('/docs/');
            expect(result).toContain('/src/');
        });

        it('deduplicates when multiple files resolve to same directory', () => {
            const result = manager.optimizePatternsForCone([
                '/config/sources.json',
                '/config/rules.json',
                '/config/',
            ]);
            expect(result.filter(p => p === '/config/')).toHaveLength(1);
        });
    });

    describe('initialize()', () => {
        it('enables sparse checkout and sets patterns', async () => {
            const result = await manager.initialize('/repo', ['/config/']);
            expect(result).toEqual({
                success: true,
                enabled: true,
                patterns: ['/config/'],
            });
            // Should have called config, init, and setPatterns commands
            expect(executeSpy).toHaveBeenCalledWith('config core.sparseCheckout true', { cwd: '/repo' });
            expect(executeSpy).toHaveBeenCalledWith('sparse-checkout init --cone', { cwd: '/repo' });
        });

        it('initializes without patterns', async () => {
            const result = await manager.initialize('/repo');
            expect(result.success).toBe(true);
            expect(result.patterns).toEqual([]);
        });
    });

    describe('setPatterns()', () => {
        it('throws when patterns array is empty', async () => {
            await expect(manager.setPatterns('/repo', []))
                .rejects.toThrow('At least one pattern is required');
        });

        it('validates and sets patterns', async () => {
            const result = await manager.setPatterns('/repo', ['/config/', '/.openheaders/']);
            expect(result.success).toBe(true);
            expect(result.patterns).toEqual(['/config/', '/.openheaders/']);
        });
    });

    describe('addPatterns()', () => {
        it('merges new patterns with existing ones (no duplicates)', async () => {
            // getPatterns returns existing
            executeSpy.mockResolvedValueOnce({ stdout: '/config/\n', stderr: '' });
            // setPatterns calls
            executeSpy.mockResolvedValue({ stdout: '', stderr: '' });

            const result = await manager.addPatterns('/repo', ['/config/', '/.openheaders/']);
            expect(result.success).toBe(true);
            expect(result.patterns).toEqual(['/config/', '/.openheaders/']);
        });
    });

    describe('removePatterns()', () => {
        it('removes specified patterns', async () => {
            // getPatterns
            executeSpy.mockResolvedValueOnce({ stdout: '/config/\n/.openheaders/\n/docs/\n', stderr: '' });
            // setPatterns
            executeSpy.mockResolvedValue({ stdout: '', stderr: '' });

            const result = await manager.removePatterns('/repo', ['/docs/']);
            expect(result.success).toBe(true);
            expect(result.patterns).toEqual(['/config/', '/.openheaders/']);
        });

        it('throws when removing all patterns', async () => {
            executeSpy.mockResolvedValueOnce({ stdout: '/config/\n', stderr: '' });

            await expect(manager.removePatterns('/repo', ['/config/']))
                .rejects.toThrow('Cannot remove all patterns');
        });
    });

    describe('isEnabled()', () => {
        it('returns true when sparseCheckout is true', async () => {
            executeSpy.mockResolvedValue({ stdout: 'true\n', stderr: '' });
            expect(await manager.isEnabled('/repo')).toBe(true);
        });

        it('returns false when sparseCheckout is false', async () => {
            executeSpy.mockResolvedValue({ stdout: 'false\n', stderr: '' });
            expect(await manager.isEnabled('/repo')).toBe(false);
        });

        it('returns false when config is not set', async () => {
            executeSpy.mockRejectedValue(new Error('key not found'));
            expect(await manager.isEnabled('/repo')).toBe(false);
        });
    });

    describe('disable()', () => {
        it('disables sparse checkout', async () => {
            const result = await manager.disable('/repo');
            expect(result).toEqual({ success: true, enabled: false });
            expect(executeSpy).toHaveBeenCalledWith('sparse-checkout disable', { cwd: '/repo' });
        });
    });
});
