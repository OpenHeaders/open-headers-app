import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProxyCache } from '../../../src/services/proxy/ProxyCache';
import type { CacheMetadata } from '../../../src/services/proxy/ProxyCache';

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
                readFile: vi.fn(() => Promise.resolve(Buffer.from('cached-content'))),
                unlink: vi.fn(() => Promise.resolve()),
                rm: vi.fn(() => Promise.resolve()),
            },
        },
        promises: {
            ...actual.promises,
            mkdir: vi.fn(() => Promise.resolve(undefined)),
            writeFile: vi.fn(() => Promise.resolve()),
            readFile: vi.fn(() => Promise.resolve(Buffer.from('cached-content'))),
            unlink: vi.fn(() => Promise.resolve()),
            rm: vi.fn(() => Promise.resolve()),
        },
    };
});

/** Create a realistic CacheMetadata entry */
function makeCacheMetadata(overrides: Partial<CacheMetadata> = {}): CacheMetadata {
    return {
        url: 'https://cdn.acme-corp.com/assets/main.bundle.js',
        timestamp: Date.now(),
        lastAccessed: Date.now(),
        size: 245_760,
        headers: {
            'content-type': 'application/javascript',
            'cache-control': 'public, max-age=31536000',
            'etag': '"W/5d4a1c3b2e"',
        },
        contentType: 'application/javascript',
        statusCode: 200,
        ...overrides,
    };
}

describe('ProxyCache', () => {
    let cache: ProxyCache;

    beforeEach(() => {
        cache = new ProxyCache();
        vi.clearAllMocks();
    });

    // ── getCacheKey ─────────────────────────────────────────────────

    describe('getCacheKey()', () => {
        it('returns a sha256 hex string (64 characters)', () => {
            const key = cache.getCacheKey('https://api.acme-corp.com/v2/oauth/token');
            expect(key).toMatch(/^[a-f0-9]{64}$/);
        });

        it('returns same key for same URL (deterministic)', () => {
            const url = 'https://auth.acme-corp.internal:8443/oauth2/token?grant_type=client_credentials';
            const a = cache.getCacheKey(url);
            const b = cache.getCacheKey(url);
            expect(a).toBe(b);
        });

        it('is case-insensitive on URL', () => {
            const a = cache.getCacheKey('https://CDN.Acme-Corp.COM/Assets/Main.JS');
            const b = cache.getCacheKey('https://cdn.acme-corp.com/assets/main.js');
            expect(a).toBe(b);
        });

        it('returns different keys for different URLs', () => {
            const a = cache.getCacheKey('https://api.acme-corp.com/v1/users');
            const b = cache.getCacheKey('https://api.acme-corp.com/v2/users');
            expect(a).not.toBe(b);
        });

        it('includes authorization header for non-static API endpoints', () => {
            const noAuth = cache.getCacheKey('https://api.acme-corp.com/v2/data');
            const withAuth = cache.getCacheKey('https://api.acme-corp.com/v2/data', {
                authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig',
            });
            expect(noAuth).not.toBe(withAuth);
        });

        it('ignores authorization header for static font files', () => {
            const noAuth = cache.getCacheKey('https://cdn.acme-corp.com/fonts/Inter-Regular.woff2');
            const withAuth = cache.getCacheKey('https://cdn.acme-corp.com/fonts/Inter-Regular.woff2', {
                authorization: 'Bearer token',
            });
            expect(noAuth).toBe(withAuth);
        });

        it('ignores auth for all static file extensions', () => {
            const extensions = ['.css', '.js', '.mjs', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.eot'];
            for (const ext of extensions) {
                const a = cache.getCacheKey(`https://cdn.acme-corp.com/static/asset${ext}`);
                const b = cache.getCacheKey(`https://cdn.acme-corp.com/static/asset${ext}`, {
                    authorization: 'Bearer ohk_live_4eC39HqLyjWDarjtT1zdp7dc',
                });
                expect(a).toBe(b);
            }
        });

        it('ignores auth for static files with query strings (cache busting)', () => {
            const a = cache.getCacheKey('https://cdn.acme-corp.com/app.js?v=a1b2c3d4');
            const b = cache.getCacheKey('https://cdn.acme-corp.com/app.js?v=a1b2c3d4', {
                authorization: 'Bearer token',
            });
            expect(a).toBe(b);
        });

        it('differentiates by auth for JSON API responses', () => {
            const userA = cache.getCacheKey('https://api.acme-corp.com/me', {
                authorization: 'Bearer user-a-token',
            });
            const userB = cache.getCacheKey('https://api.acme-corp.com/me', {
                authorization: 'Bearer user-b-token',
            });
            expect(userA).not.toBe(userB);
        });
    });

    // ── getCachePath ────────────────────────────────────────────────

    describe('getCachePath()', () => {
        it('uses first 2 chars of key as subdirectory', () => {
            const key = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
            const cachePath = cache.getCachePath(key);
            expect(cachePath).toContain('ab');
            expect(cachePath.endsWith(key)).toBe(true);
        });

        it('generates consistent paths', () => {
            const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
            const a = cache.getCachePath(key);
            const b = cache.getCachePath(key);
            expect(a).toBe(b);
        });
    });

    // ── sanitizeHeaders ─────────────────────────────────────────────

    describe('sanitizeHeaders()', () => {
        it('keeps only cache-relevant headers', () => {
            const result = cache.sanitizeHeaders({
                'content-type': 'application/json; charset=utf-8',
                'content-encoding': 'gzip',
                'cache-control': 'public, max-age=3600, s-maxage=7200',
                'etag': '"W/5d4a1c3b2e"',
                'last-modified': 'Sat, 15 Nov 2025 09:30:00 GMT',
                'x-request-id': 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                'authorization': 'Bearer sensitive-token',
                'set-cookie': 'session=abc123; HttpOnly; Secure',
                'x-ratelimit-remaining': '99',
                'server': 'nginx/1.25.3',
            });

            expect(result).toEqual({
                'content-type': 'application/json; charset=utf-8',
                'content-encoding': 'gzip',
                'cache-control': 'public, max-age=3600, s-maxage=7200',
                'etag': '"W/5d4a1c3b2e"',
                'last-modified': 'Sat, 15 Nov 2025 09:30:00 GMT',
            });
        });

        it('preserves original header key casing while matching case-insensitively', () => {
            const result = cache.sanitizeHeaders({
                'Content-Type': 'text/html',
                'ETag': '"abc"',
            });
            expect(result['Content-Type']).toBe('text/html');
            expect(result['ETag']).toBe('"abc"');
        });

        it('returns empty object when no relevant headers present', () => {
            expect(cache.sanitizeHeaders({
                'x-custom': 'val',
                'x-request-id': 'req-123',
            })).toEqual({});
        });

        it('returns empty object for empty input', () => {
            expect(cache.sanitizeHeaders({})).toEqual({});
        });
    });

    // ── get() with metadata ────────────────────────────────────────

    describe('get()', () => {
        it('returns null when key not in metadata', async () => {
            const result = await cache.get('https://api.acme-corp.com/v2/missing-resource');
            expect(result).toBeNull();
        });

        it('returns null and removes entry when expired (beyond maxAge)', async () => {
            const url = 'https://cdn.acme-corp.com/old-asset.css';
            const key = cache.getCacheKey(url);
            cache.metadata.set(key, makeCacheMetadata({
                url,
                timestamp: Date.now() - cache.maxAge - 1000,
                contentType: 'text/css',
            }));

            const result = await cache.get(url);
            expect(result).toBeNull();
            expect(cache.metadata.has(key)).toBe(false);
        });

        it('returns cached entry with all fields when valid', async () => {
            const url = 'https://cdn.acme-corp.com/app.bundle.js';
            const key = cache.getCacheKey(url);
            const metadata = makeCacheMetadata({
                url,
                contentType: 'application/javascript',
                statusCode: 200,
                headers: { 'content-type': 'application/javascript', 'etag': '"v1"' },
            });
            cache.metadata.set(key, metadata);

            const result = await cache.get(url);
            expect(result).not.toBeNull();
            expect(result!.data).toBeInstanceOf(Buffer);
            expect(result!.headers).toEqual(metadata.headers);
            expect(result!.contentType).toBe('application/javascript');
            expect(result!.statusCode).toBe(200);
        });

        it('updates lastAccessed timestamp on cache hit', async () => {
            const url = 'https://cdn.acme-corp.com/styles.css';
            const key = cache.getCacheKey(url);
            const oldAccessTime = Date.now() - 60_000;
            cache.metadata.set(key, makeCacheMetadata({
                url,
                lastAccessed: oldAccessTime,
            }));

            await cache.get(url);

            const updated = cache.metadata.get(key)!;
            expect(updated.lastAccessed).toBeGreaterThan(oldAccessTime);
        });

        it('returns null and removes entry when file read fails', async () => {
            const fs = await import('fs');
            vi.mocked(fs.default.promises.readFile).mockRejectedValueOnce(new Error('ENOENT'));

            const url = 'https://cdn.acme-corp.com/missing-on-disk.js';
            const key = cache.getCacheKey(url);
            cache.metadata.set(key, makeCacheMetadata({ url }));

            const result = await cache.get(url);
            expect(result).toBeNull();
            expect(cache.metadata.has(key)).toBe(false);
        });
    });

    // ── set() ──────────────────────────────────────────────────────

    describe('set()', () => {
        it('stores entry with correct metadata', async () => {
            const url = 'https://cdn.acme-corp.com/images/logo.png';
            const data = Buffer.from('PNG-binary-data-here');
            const headers = { 'content-type': 'image/png', 'cache-control': 'max-age=86400' };

            await cache.set(url, data, {
                headers,
                contentType: 'image/png',
                statusCode: 200,
            });

            const key = cache.getCacheKey(url, headers);
            const metadata = cache.metadata.get(key);
            expect(metadata).toBeDefined();
            expect(metadata!.url).toBe(url);
            expect(metadata!.size).toBe(data.length);
            expect(metadata!.contentType).toBe('image/png');
            expect(metadata!.statusCode).toBe(200);
            expect(metadata!.timestamp).toBeGreaterThan(0);
            expect(metadata!.lastAccessed).toBeGreaterThan(0);
        });

        it('writes file to disk in correct subdirectory', async () => {
            const fs = await import('fs');
            const url = 'https://cdn.acme-corp.com/font.woff2';
            const data = Buffer.from('woff2-binary');

            await cache.set(url, data, { contentType: 'font/woff2' });

            expect(fs.default.promises.mkdir).toHaveBeenCalled();
            expect(fs.default.promises.writeFile).toHaveBeenCalled();
        });

        it('handles large buffer (simulated 10MB)', async () => {
            const url = 'https://cdn.acme-corp.com/large-bundle.js';
            const data = Buffer.alloc(10 * 1024 * 1024, 'a');

            await cache.set(url, data, { contentType: 'application/javascript' });

            const key = cache.getCacheKey(url);
            const metadata = cache.metadata.get(key);
            expect(metadata!.size).toBe(10 * 1024 * 1024);
        });

        it('uses default values when options are omitted', async () => {
            const url = 'https://cdn.acme-corp.com/misc.bin';
            const data = Buffer.from('binary');

            await cache.set(url, data);

            const key = cache.getCacheKey(url);
            const metadata = cache.metadata.get(key);
            expect(metadata!.contentType).toBe('');
            expect(metadata!.statusCode).toBe(200);
        });
    });

    // ── getStats ────────────────────────────────────────────────────

    describe('getStats()', () => {
        it('returns zeros when cache is empty', async () => {
            const stats = await cache.getStats();
            expect(stats).toEqual({
                totalSize: 0,
                totalEntries: 0,
                maxCacheSize: 500 * 1024 * 1024,
                usage: 0,
            });
        });

        it('correctly sums up multiple metadata entries', async () => {
            cache.metadata.set('k1', makeCacheMetadata({ size: 102_400 }));
            cache.metadata.set('k2', makeCacheMetadata({ size: 204_800 }));
            cache.metadata.set('k3', makeCacheMetadata({ size: 51_200 }));

            const stats = await cache.getStats();
            expect(stats.totalSize).toBe(358_400);
            expect(stats.totalEntries).toBe(3);
            expect(stats.usage).toBeCloseTo((358_400 / (500 * 1024 * 1024)) * 100, 5);
            expect(stats.maxCacheSize).toBe(500 * 1024 * 1024);
        });
    });

    // ── getCacheEntries ─────────────────────────────────────────────

    describe('getCacheEntries()', () => {
        it('returns empty array when no entries', async () => {
            expect(await cache.getCacheEntries()).toEqual([]);
        });

        it('returns entries sorted by lastAccessed descending (most recent first)', async () => {
            const now = Date.now();
            cache.metadata.set('oldest', makeCacheMetadata({
                url: 'https://cdn.acme-corp.com/old.css',
                lastAccessed: now - 3600_000,
                size: 1024,
                contentType: 'text/css',
                timestamp: now - 86400_000,
            }));
            cache.metadata.set('middle', makeCacheMetadata({
                url: 'https://cdn.acme-corp.com/mid.js',
                lastAccessed: now - 1800_000,
                size: 2048,
                contentType: 'application/javascript',
                timestamp: now - 43200_000,
            }));
            cache.metadata.set('newest', makeCacheMetadata({
                url: 'https://cdn.acme-corp.com/new.png',
                lastAccessed: now,
                size: 4096,
                contentType: 'image/png',
                timestamp: now - 3600_000,
            }));

            const entries = await cache.getCacheEntries();
            expect(entries).toHaveLength(3);
            expect(entries[0]).toEqual({
                key: 'newest',
                url: 'https://cdn.acme-corp.com/new.png',
                size: 4096,
                timestamp: entries[0].timestamp,
                lastAccessed: now,
                contentType: 'image/png',
            });
            expect(entries[1].key).toBe('middle');
            expect(entries[2].key).toBe('oldest');
        });
    });

    // ── cleanup ─────────────────────────────────────────────────────

    describe('cleanup()', () => {
        it('removes expired entries beyond maxAge', async () => {
            cache.metadata.set('expired', makeCacheMetadata({
                url: 'https://cdn.acme-corp.com/expired.js',
                timestamp: Date.now() - cache.maxAge - 1000,
                lastAccessed: 1,
            }));
            cache.metadata.set('fresh', makeCacheMetadata({
                url: 'https://cdn.acme-corp.com/fresh.js',
                timestamp: Date.now(),
                lastAccessed: Date.now(),
            }));

            await cache.cleanup();

            expect(cache.metadata.has('expired')).toBe(false);
            expect(cache.metadata.has('fresh')).toBe(true);
        });

        it('evicts least-recently-accessed entries when over maxCacheSize', async () => {
            cache.maxCacheSize = 150;

            cache.metadata.set('lru-old', makeCacheMetadata({
                url: 'https://cdn.acme-corp.com/old.css',
                timestamp: Date.now(),
                lastAccessed: 1,
                size: 100,
            }));
            cache.metadata.set('lru-new', makeCacheMetadata({
                url: 'https://cdn.acme-corp.com/new.js',
                timestamp: Date.now(),
                lastAccessed: 2,
                size: 100,
            }));

            await cache.cleanup();

            // Sorted by lastAccessed ascending: old(1) comes first
            // old: totalSize 100 < 150, kept
            // new: totalSize 200 > 150, evicted
            expect(cache.metadata.has('lru-old')).toBe(true);
            expect(cache.metadata.has('lru-new')).toBe(false);
        });

        it('evicts multiple entries to get under maxCacheSize', async () => {
            cache.maxCacheSize = 100;

            cache.metadata.set('a', makeCacheMetadata({ timestamp: Date.now(), lastAccessed: 1, size: 50 }));
            cache.metadata.set('b', makeCacheMetadata({ timestamp: Date.now(), lastAccessed: 2, size: 50 }));
            cache.metadata.set('c', makeCacheMetadata({ timestamp: Date.now(), lastAccessed: 3, size: 50 }));

            await cache.cleanup();

            // a(50) < 100: kept; b(100) < 100: no, 100 is not > 100 so kept; c(150) > 100: evicted
            expect(cache.metadata.has('a')).toBe(true);
            expect(cache.metadata.has('b')).toBe(true);
            expect(cache.metadata.has('c')).toBe(false);
        });

        it('handles cleanup on empty cache', async () => {
            await cache.cleanup();
            expect(cache.metadata.size).toBe(0);
        });
    });

    // ── clear ──────────────────────────────────────────────────────

    describe('clear()', () => {
        it('removes all entries and clears metadata', async () => {
            cache.metadata.set('k1', makeCacheMetadata());
            cache.metadata.set('k2', makeCacheMetadata());

            await cache.clear();

            expect(cache.metadata.size).toBe(0);
        });

        it('recreates cache directory after deletion', async () => {
            const fs = await import('fs');
            await cache.clear();

            expect(fs.default.promises.rm).toHaveBeenCalled();
            expect(fs.default.promises.mkdir).toHaveBeenCalled();
        });
    });

    // ── remove ─────────────────────────────────────────────────────

    describe('remove()', () => {
        it('removes entry from metadata and disk', async () => {
            const fs = await import('fs');
            cache.metadata.set('remove-me', makeCacheMetadata());

            await cache.remove('remove-me');

            expect(cache.metadata.has('remove-me')).toBe(false);
            expect(fs.default.promises.unlink).toHaveBeenCalled();
        });

        it('handles ENOENT gracefully (file already deleted)', async () => {
            const fs = await import('fs');
            const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
            enoent.code = 'ENOENT';
            vi.mocked(fs.default.promises.unlink).mockRejectedValueOnce(enoent);

            cache.metadata.set('gone', makeCacheMetadata());

            // Should not throw — ENOENT is silently swallowed
            // Note: metadata stays because unlink throws before metadata.delete runs
            await cache.remove('gone');
            expect(cache.metadata.has('gone')).toBe(true);
        });
    });
});
