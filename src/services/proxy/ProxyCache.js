const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const { createLogger } = require('../../utils/mainLogger');
const atomicWriter = require('../../utils/atomicFileWriter');

class ProxyCache {
  constructor() {
    this.log = createLogger('ProxyCache');
    this.cacheDir = path.join(app.getPath('userData'), 'proxy-cache');
    this.metadataPath = path.join(this.cacheDir, 'metadata.json');
    this.metadata = new Map();
    this.maxCacheSize = 500 * 1024 * 1024; // 500MB default
    this.maxAge = 90 * 24 * 60 * 60 * 1000; // 90 days default
  }

  async initialize() {
    try {
      // Ensure cache directory exists
      await fs.mkdir(this.cacheDir, { recursive: true });
      
      // Load metadata
      await this.loadMetadata();
      
      // Clean up old entries
      await this.cleanup();
      
      this.log.info('Proxy cache initialized');
    } catch (error) {
      this.log.error('Error initializing cache:', error);
    }
  }

  async loadMetadata() {
    try {
      const entries = await atomicWriter.readJson(this.metadataPath);
      if (entries !== null) {
        this.metadata = new Map(entries);
      } else {
        this.metadata = new Map();
      }
    } catch (error) {
      this.log.error('Error loading cache metadata:', error);
      this.metadata = new Map();
    }
  }

  async saveMetadata() {
    try {
      const entries = Array.from(this.metadata.entries());
      await atomicWriter.writeJson(this.metadataPath, entries, { pretty: true });
    } catch (error) {
      this.log.error('Error saving cache metadata:', error);
    }
  }

  getCacheKey(url, headers = {}) {
    // Create a unique key based on URL and relevant headers
    const normalizedUrl = url.toLowerCase();
    
    // For static files (fonts, images, CSS, JS), don't include auth header in cache key
    // This allows static resources to be cached once and reused regardless of auth
    const staticFileRegex = /\.(woff2?|ttf|otf|eot|png|jpg|jpeg|gif|webp|svg|ico|css|js|mjs)(\?|$)/i;
    const isStaticFile = staticFileRegex.test(normalizedUrl);
    const authHeader = isStaticFile ? '' : (headers.authorization || '');
    
    const keyData = `${normalizedUrl}|${authHeader}`;
    return crypto.createHash('sha256').update(keyData).digest('hex');
  }

  getCachePath(key) {
    // Split key into subdirectories to avoid too many files in one directory
    const subdir = key.substring(0, 2);
    return path.join(this.cacheDir, subdir, key);
  }

  async get(url, headers = {}) {
    const key = this.getCacheKey(url, headers);
    const metadata = this.metadata.get(key);
    
    if (!metadata) {
      return null;
    }
    
    // Check if expired
    const now = Date.now();
    if (now - metadata.timestamp > this.maxAge) {
      await this.remove(key);
      return null;
    }
    
    try {
      const cachePath = this.getCachePath(key);
      const data = await fs.readFile(cachePath);
      
      // Update last accessed time
      metadata.lastAccessed = now;
      this.metadata.set(key, metadata);
      await this.saveMetadata();
      
      return {
        data,
        headers: metadata.headers,
        contentType: metadata.contentType,
        statusCode: metadata.statusCode
      };
    } catch (error) {
      this.log.error('Error reading from cache:', error);
      await this.remove(key);
      return null;
    }
  }

  async set(url, data, options = {}) {
    const { headers = {}, contentType, statusCode = 200 } = options;
    const key = this.getCacheKey(url, headers);
    
    try {
      const cachePath = this.getCachePath(key);
      const cacheDir = path.dirname(cachePath);
      
      // Ensure directory exists
      await fs.mkdir(cacheDir, { recursive: true });
      
      // Write data to cache
      // For binary cache data, use regular fs since it's not critical config
      // and might be large binary data
      await fs.writeFile(cachePath, data);
      
      // Update metadata
      const metadata = {
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
    } catch (error) {
      this.log.error('Error writing to cache:', error);
    }
  }

  sanitizeHeaders(headers) {
    // Store only relevant headers
    const relevantHeaders = [
      'content-type',
      'content-encoding',
      'cache-control',
      'etag',
      'last-modified'
    ];
    
    const sanitized = {};
    for (const [key, value] of Object.entries(headers)) {
      if (relevantHeaders.includes(key.toLowerCase())) {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  async remove(key) {
    try {
      const cachePath = this.getCachePath(key);
      await fs.unlink(cachePath);
      this.metadata.delete(key);
      await this.saveMetadata();
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.log.error('Error removing cache entry:', error);
      }
    }
  }

  async clear() {
    try {
      // Remove all cached files
      await fs.rm(this.cacheDir, { recursive: true, force: true });
      
      // Recreate cache directory
      await fs.mkdir(this.cacheDir, { recursive: true });
      
      // Clear metadata
      this.metadata.clear();
      await this.saveMetadata();
      
      this.log.info('Cache cleared');
    } catch (error) {
      this.log.error('Error clearing cache:', error);
    }
  }

  async cleanup() {
    const now = Date.now();
    let totalSize = 0;
    const entries = Array.from(this.metadata.entries());
    const sortedEntries = entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    for (const [key, metadata] of sortedEntries) {
      // Remove expired entries
      if (now - metadata.timestamp > this.maxAge) {
        await this.remove(key);
        continue;
      }
      
      totalSize += metadata.size || 0;
      
      // Remove oldest entries if cache is too large
      if (totalSize > this.maxCacheSize) {
        await this.remove(key);
      }
    }
  }

  async getStats() {
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

  async getCacheEntries() {
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

module.exports = ProxyCache;