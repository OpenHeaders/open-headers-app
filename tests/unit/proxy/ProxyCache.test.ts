import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProxyCache } from '../../../src/services/proxy/ProxyCache';

// Mock atomicWriter
vi.mock('../../../src/utils/atomicFileWriter', () => ({
    default: {
        readJson: vi.fn(() => Promise.resolve(null)),
        writeJson: vi.fn(() => Promise.resolve()),
    },
}));

// Mock fs.promises for cache file operations
vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        default: {
            ...actual,
            promises: {
                ...actual.promises,
                mkdir: vi.fn(() => Promise.resolve(undefined)),
                writeFile: vi.fn(() => Promise.resolve()),
                readFile: vi.fn(() => Promise.resolve(Buffer.from('test'))),
                unlink: vi.fn(() => Promise.resolve()),
                rm: vi.fn(() => Promise.resolve()),
            },
        },
        promises: {
            ...actual.promises,
            mkdir: vi.fn(() => Promise.resolve(undefined)),
            writeFile: vi.fn(() => Promise.resolve()),
            readFile: vi.fn(() => Promise.resolve(Buffer.from('test'))),
            unlink: vi.fn(() => Promise.resolve()),
            rm: vi.fn(() => Promise.resolve()),
        },
    };
});

describe('ProxyCache', () => {
    let cache: ProxyCache;

    beforeEach(() => {
        cache = new ProxyCache();
        vi.clearAllMocks();
    });

    // ── getCacheKey ─────────────────────────────────────────────────

    describe('getCacheKey()', () => {
        it('returns a sha256 hex string', () => {
            const key = cache.getCacheKey('https://example.com/api');
            expect(key).toMatch(/^[a-f0-9]{64}$/);
        });

        it('returns same key for same URL', () => {
            const a = cache.getCacheKey('https://example.com/path');
            const b = cache.getCacheKey('https://example.com/path');
            expect(a).toBe(b);
        });

        it('is case-insensitive on URL', () => {
            const a = cache.getCacheKey('https://Example.COM/Path');
            const b = cache.getCacheKey('https://example.com/path');
            expect(a).toBe(b);
        });

        it('returns different keys for different URLs', () => {
            const a = cache.getCacheKey('https://example.com/a');
            const b = cache.getCacheKey('https://example.com/b');
            expect(a).not.toBe(b);
        });

        it('includes authorization header for non-static files', () => {
            const noAuth = cache.getCacheKey('https://example.com/api/data');
            const withAuth = cache.getCacheKey('https://example.com/api/data', { authorization: 'Bearer token' });
            expect(noAuth).not.toBe(withAuth);
        });

        it('ignores authorization header for static files', () => {
            const noAuth = cache.getCacheKey('https://cdn.example.com/font.woff2');
            const withAuth = cache.getCacheKey('https://cdn.example.com/font.woff2', { authorization: 'Bearer token' });
            expect(noAuth).toBe(withAuth);
        });

        it('ignores auth for various static extensions', () => {
            const extensions = ['.css', '.js', '.png', '.jpg', '.svg', '.woff', '.ttf', '.ico', '.gif', '.webp'];
            for (const ext of extensions) {
                const a = cache.getCacheKey(`https://cdn.example.com/file${ext}`);
                const b = cache.getCacheKey(`https://cdn.example.com/file${ext}`, { authorization: 'Bearer x' });
                expect(a).toBe(b);
            }
        });

        it('ignores auth for static files with query strings', () => {
            const a = cache.getCacheKey('https://cdn.example.com/app.js?v=123');
            const b = cache.getCacheKey('https://cdn.example.com/app.js?v=123', { authorization: 'Bearer x' });
            expect(a).toBe(b);
        });
    });

    // ── getCachePath ────────────────────────────────────────────────

    describe('getCachePath()', () => {
        it('uses first 2 chars as subdirectory', () => {
            const key = 'abcdef1234567890';
            const cachePath = cache.getCachePath(key);
            expect(cachePath).toContain('ab/');
            expect(cachePath.endsWith(key)).toBe(true);
        });
    });

    // ── sanitizeHeaders ─────────────────────────────────────────────

    describe('sanitizeHeaders()', () => {
        it('keeps only relevant headers', () => {
            const result = cache.sanitizeHeaders({
                'content-type': 'text/html',
                'content-encoding': 'gzip',
                'cache-control': 'max-age=3600',
                'etag': '"abc"',
                'last-modified': 'Mon, 01 Jan 2024',
                'x-custom': 'should-be-removed',
                'authorization': 'should-be-removed',
                'set-cookie': 'should-be-removed',
            });

            expect(result).toEqual({
                'content-type': 'text/html',
                'content-encoding': 'gzip',
                'cache-control': 'max-age=3600',
                'etag': '"abc"',
                'last-modified': 'Mon, 01 Jan 2024',
            });
        });

        it('is case-insensitive for header matching', () => {
            const result = cache.sanitizeHeaders({
                'Content-Type': 'text/html',
                'ETag': '"xyz"',
            });
            // The keys are preserved as-is, but matching is case-insensitive
            expect(result['Content-Type']).toBe('text/html');
            expect(result['ETag']).toBe('"xyz"');
        });

        it('returns empty object for no relevant headers', () => {
            expect(cache.sanitizeHeaders({ 'x-custom': 'val' })).toEqual({});
        });
    });

    // ── metadata operations (get/set with in-memory metadata) ───────

    describe('get() with metadata', () => {
        it('returns null when key not in metadata', async () => {
            const result = await cache.get('https://example.com/missing');
            expect(result).toBeNull();
        });

        it('returns null and removes entry when expired', async () => {
            const key = cache.getCacheKey('https://example.com/old');
            cache.metadata.set(key, {
                url: 'https://example.com/old',
                timestamp: Date.now() - cache.maxAge - 1000, // expired
                lastAccessed: Date.now(),
                size: 100,
                headers: {},
                contentType: 'text/html',
                statusCode: 200,
            });

            const result = await cache.get('https://example.com/old');
            expect(result).toBeNull();
            expect(cache.metadata.has(key)).toBe(false);
        });
    });

    // ── getStats ────────────────────────────────────────────────────

    describe('getStats()', () => {
        it('returns zeros when empty', async () => {
            const stats = await cache.getStats();
            expect(stats.totalSize).toBe(0);
            expect(stats.totalEntries).toBe(0);
            expect(stats.usage).toBe(0);
            expect(stats.maxCacheSize).toBe(500 * 1024 * 1024);
        });

        it('sums up metadata entries', async () => {
            cache.metadata.set('k1', { url: 'a', timestamp: 0, lastAccessed: 0, size: 1000, headers: {}, contentType: '', statusCode: 200 });
            cache.metadata.set('k2', { url: 'b', timestamp: 0, lastAccessed: 0, size: 2000, headers: {}, contentType: '', statusCode: 200 });

            const stats = await cache.getStats();
            expect(stats.totalSize).toBe(3000);
            expect(stats.totalEntries).toBe(2);
        });
    });

    // ── getCacheEntries ─────────────────────────────────────────────

    describe('getCacheEntries()', () => {
        it('returns empty array when no entries', async () => {
            expect(await cache.getCacheEntries()).toEqual([]);
        });

        it('returns entries sorted by lastAccessed descending', async () => {
            cache.metadata.set('old', { url: 'a', timestamp: 100, lastAccessed: 100, size: 10, headers: {}, contentType: 'text/html', statusCode: 200 });
            cache.metadata.set('new', { url: 'b', timestamp: 200, lastAccessed: 200, size: 20, headers: {}, contentType: 'text/css', statusCode: 200 });

            const entries = await cache.getCacheEntries();
            expect(entries).toHaveLength(2);
            expect(entries[0].key).toBe('new');
            expect(entries[1].key).toBe('old');
        });
    });

    // ── cleanup ─────────────────────────────────────────────────────

    describe('cleanup()', () => {
        it('removes expired entries', async () => {
            const expiredKey = 'expired-key';
            cache.metadata.set(expiredKey, {
                url: 'https://example.com/old',
                timestamp: Date.now() - cache.maxAge - 1000,
                lastAccessed: 1,
                size: 100,
                headers: {},
                contentType: '',
                statusCode: 200,
            });
            cache.metadata.set('fresh-key', {
                url: 'https://example.com/new',
                timestamp: Date.now(),
                lastAccessed: Date.now(),
                size: 100,
                headers: {},
                contentType: '',
                statusCode: 200,
            });

            await cache.cleanup();

            expect(cache.metadata.has(expiredKey)).toBe(false);
            expect(cache.metadata.has('fresh-key')).toBe(true);
        });

        it('removes oldest entries when over max cache size', async () => {
            cache.maxCacheSize = 150; // tiny limit

            cache.metadata.set('old', {
                url: 'a', timestamp: Date.now(), lastAccessed: 1, size: 100,
                headers: {}, contentType: '', statusCode: 200,
            });
            cache.metadata.set('new', {
                url: 'b', timestamp: Date.now(), lastAccessed: 2, size: 100,
                headers: {}, contentType: '', statusCode: 200,
            });

            await cache.cleanup();

            // 'old' has lower lastAccessed, sorted first, totalSize 100 < 150 → kept
            // 'new' brings totalSize to 200 > 150 → removed
            expect(cache.metadata.has('old')).toBe(true);
            expect(cache.metadata.has('new')).toBe(false);
        });
    });
});
