import { describe, it, expect } from 'vitest';

// We can test the pure logic methods without mocking since they don't call the executor
import { SparseCheckoutManager } from '../../../src/services/workspace/git/repository/SparseCheckoutManager';

describe('SparseCheckoutManager (pure logic)', () => {
    // Create instance with a dummy executor for pure-logic-only tests
    const manager = new SparseCheckoutManager({} as any);

    describe('validatePatterns()', () => {
        it('accepts valid patterns', () => {
            expect(() => manager.validatePatterns(['/src/', '/docs/'])).not.toThrow();
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

        it('does not throw for patterns with ".." but logs warning', () => {
            // just verify no throw - we can't easily test the log.warn
            expect(() => manager.validatePatterns(['/some/../path/'])).not.toThrow();
        });
    });

    describe('pathToPattern()', () => {
        it('returns directory pattern for nested file', () => {
            expect(manager.pathToPattern('config/headers.json')).toBe('/config/');
        });

        it('returns null for root-level file', () => {
            expect(manager.pathToPattern('README.md')).toBeNull();
        });

        it('normalizes backslashes', () => {
            expect(manager.pathToPattern('config\\sub\\file.json')).toBe('/config/sub/');
        });

        it('returns null for file at root "/"', () => {
            expect(manager.pathToPattern('/file.txt')).toBeNull();
        });
    });

    describe('createWorkspacePatterns()', () => {
        it('always includes root pattern', () => {
            const patterns = manager.createWorkspacePatterns({});
            expect(patterns).toContain('/*');
        });

        it('adds directory patterns for config paths', () => {
            const patterns = manager.createWorkspacePatterns({
                headers: '.openheaders/workspaces/ws1/headers.json',
                proxy: '.openheaders/workspaces/ws1/proxy.json'
            });
            expect(patterns).toContain('/*');
            expect(patterns).toContain('/.openheaders/workspaces/ws1/');
        });

        it('deduplicates patterns', () => {
            const patterns = manager.createWorkspacePatterns({
                a: 'dir/file1.json',
                b: 'dir/file2.json'
            });
            const dirPatterns = patterns.filter(p => p === '/dir/');
            expect(dirPatterns).toHaveLength(1);
        });

        it('skips non-string config paths', () => {
            const patterns = manager.createWorkspacePatterns({
                headers: null as any,
                proxy: undefined as any,
                valid: 'config/proxy.json'
            });
            expect(patterns).toContain('/*');
            expect(patterns).toContain('/config/');
        });
    });

    describe('optimizePatternsForCone()', () => {
        it('keeps directory patterns as-is', () => {
            const result = manager.optimizePatternsForCone(['/src/']);
            expect(result).toContain('/src/');
        });

        it('converts file patterns to directory patterns', () => {
            const result = manager.optimizePatternsForCone(['/src/main.ts']);
            expect(result).toContain('/src/');
        });

        it('handles top-level patterns', () => {
            const result = manager.optimizePatternsForCone(['docs']);
            expect(result).toContain('/docs/');
        });
    });
});
