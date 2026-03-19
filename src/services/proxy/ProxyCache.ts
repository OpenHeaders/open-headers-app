import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import electron from 'electron';
import mainLogger from '../../utils/mainLogger';
import atomicWriter from '../../utils/atomicFileWriter';
import { errorMessage } from '../../types/common';

const { app } = electron;
const { createLogger } = mainLogger;
const fsPromises = fs.promises;

export interface CacheMetadata {
  url: string;
  timestamp: number;
  lastAccessed: number;
  size: number;
  headers: Record<string, string>;
  contentType: string;
  statusCode: number;
}

export interface CacheEntry {
  data: Buffer;
  headers: Record<string, string>;
  contentType: string;
  statusCode: number;
}

export interface CacheStats {
  totalSize: number;
  totalEntries: number;
  maxCacheSize: number;
  usage: number;
}

class ProxyCache {
  private log = createLogger('ProxyCache');
  private cacheDir = '';
  private metadataPath = '';
  metadata: Map<string, CacheMetadata> = new Map();
  maxCacheSize = 500 * 1024 * 1024; // 500MB
  maxAge = 90 * 24 * 60 * 60 * 1000; // 90 days

  async initialize(): Promise<void> {
    try {
      this.cacheDir = path.join(app.getPath('userData'), 'proxy-cache');
      this.metadataPath = path.join(this.cacheDir, 'metadata.json');
      await fsPromises.mkdir(this.cacheDir, { recursive: true });
      await this.loadMetadata();
      await this.cleanup();
      this.log.info('Proxy cache initialized');
    } catch (error: unknown) {
      this.log.error('Error initializing cache:', error);
    }
  }

  async loadMetadata(): Promise<void> {
    try {
      const entries = await atomicWriter.readJson(this.metadataPath);
      if (entries !== null) {
        this.metadata = new Map(entries as Array<[string, CacheMetadata]>);
      } else {
        this.metadata = new Map();
      }
    } catch (error: unknown) {
      this.log.error('Error loading cache metadata:', error);
      this.metadata = new Map();
    }
  }

  async saveMetadata(): Promise<void> {
    try {
      const entries = Array.from(this.metadata.entries());
      await atomicWriter.writeJson(this.metadataPath, entries, { pretty: true });
    } catch (error: unknown) {
      this.log.error('Error saving cache metadata:', error);
    }
  }

  getCacheKey(url: string, headers: Record<string, string> = {}): string {
    const normalizedUrl = url.toLowerCase();

    // For static files, don't include auth header in cache key
    const staticFileRegex = /\.(woff2?|ttf|otf|eot|png|jpg|jpeg|gif|webp|svg|ico|css|js|mjs)(\?|$)/i;
    const isStaticFile = staticFileRegex.test(normalizedUrl);
    const authHeader = isStaticFile ? '' : (headers.authorization || '');

    const keyData = `${normalizedUrl}|${authHeader}`;
    return crypto.createHash('sha256').update(keyData).digest('hex');
  }

  getCachePath(key: string): string {
    const subdir = key.substring(0, 2);
    return path.join(this.cacheDir, subdir, key);
  }

  async get(url: string, headers: Record<string, string> = {}): Promise<CacheEntry | null> {
    const key = this.getCacheKey(url, headers);
    const metadata = this.metadata.get(key);

    if (!metadata) {
      return null;
    }

    const now = Date.now();
    if (now - metadata.timestamp > this.maxAge) {
      await this.remove(key);
      return null;
    }

    try {
      const cachePath = this.getCachePath(key);
      const data = await fsPromises.readFile(cachePath);

      metadata.lastAccessed = now;
      this.metadata.set(key, metadata);
      await this.saveMetadata();

      return {
        data,
        headers: metadata.headers,
        contentType: metadata.contentType,
        statusCode: metadata.statusCode
      };
    } catch (error: unknown) {
      this.log.error('Error reading from cache:', error);
      await this.remove(key);
      return null;
    }
  }

  async set(url: string, data: Buffer, options: { headers?: Record<string, string>; contentType?: string; statusCode?: number } = {}): Promise<void> {
    const { headers = {}, contentType = '', statusCode = 200 } = options;
    const key = this.getCacheKey(url, headers);

    try {
      const cachePath = this.getCachePath(key);
      const cacheDir = path.dirname(cachePath);

      await fsPromises.mkdir(cacheDir, { recursive: true });
      await fsPromises.writeFile(cachePath, data);

      const metadata: CacheMetadata = {
        url,
        timestamp: Date.now(),
        lastAccessed: Date.now(),
        size: data.length,
        headers: this.sanitizeHeaders(headers),
        contentType,
        statusCode
      };

      this.metadata.set(key, metadata);
      await this.saveMetadata();

      this.log.debug(`Cached resource: ${url} (${data.length} bytes)`);
    } catch (error: unknown) {
      this.log.error('Error writing to cache:', error);
    }
  }

  sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const relevantHeaders = [
      'content-type',
      'content-encoding',
      'cache-control',
      'etag',
      'last-modified'
    ];

    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (relevantHeaders.includes(key.toLowerCase())) {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  async remove(key: string): Promise<void> {
    try {
      const cachePath = this.getCachePath(key);
      await fsPromises.unlink(cachePath);
      this.metadata.delete(key);
      await this.saveMetadata();
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.log.error('Error removing cache entry:', error);
      }
    }
  }

  async clear(): Promise<void> {
    try {
      await fsPromises.rm(this.cacheDir, { recursive: true, force: true });
      await fsPromises.mkdir(this.cacheDir, { recursive: true });
      this.metadata.clear();
      await this.saveMetadata();
      this.log.info('Cache cleared');
    } catch (error: unknown) {
      this.log.error('Error clearing cache:', error);
    }
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    let totalSize = 0;
    const entries = Array.from(this.metadata.entries());
    const sortedEntries = entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    for (const [key, metadata] of sortedEntries) {
      if (now - metadata.timestamp > this.maxAge) {
        await this.remove(key);
        continue;
      }

      totalSize += metadata.size || 0;

      if (totalSize > this.maxCacheSize) {
        await this.remove(key);
      }
    }
  }

  async getStats(): Promise<CacheStats> {
    let totalSize = 0;
    let totalEntries = 0;

    for (const metadata of this.metadata.values()) {
      totalSize += metadata.size || 0;
      totalEntries++;
    }

    return {
      totalSize,
      totalEntries,
      maxCacheSize: this.maxCacheSize,
      usage: (totalSize / this.maxCacheSize) * 100
    };
  }

  async getCacheEntries(): Promise<Array<{ key: string; url: string; size: number; timestamp: number; lastAccessed: number; contentType: string }>> {
    const entries = [];
    for (const [key, metadata] of this.metadata.entries()) {
      entries.push({
        key,
        url: metadata.url,
        size: metadata.size,
        timestamp: metadata.timestamp,
        lastAccessed: metadata.lastAccessed,
        contentType: metadata.contentType
      });
    }
    return entries.sort((a, b) => b.lastAccessed - a.lastAccessed);
  }
}

export { ProxyCache };
export default ProxyCache;
