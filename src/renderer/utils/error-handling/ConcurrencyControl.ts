import { createLogger } from './logger';
const log = createLogger('ConcurrencyControl');

/**
 * Mutex implementation for JavaScript
 * Ensures exclusive access to critical sections
 */
class Mutex {
  name: string;
  locked: boolean;
  queue: Array<() => void>;

  constructor(name = 'unnamed') {
    this.name = name;
    this.locked = false;
    this.queue = [];
  }

  /**
   * Acquire the mutex
   * @returns {Promise<() => void>} Release function
   */
  async acquire(): Promise<() => void> {
    return new Promise<() => void>(resolve => {
      const tryAcquire = () => {
        if (!this.locked) {
          this.locked = true;
          resolve(() => this.release());
        } else {
          this.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  /**
   * Release the mutex
   */
  release() {
    if (!this.locked) {
      log.warn(`Mutex ${this.name} released when not locked`);
      return;
    }
    
    this.locked = false;
    
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      // Use setTimeout(0) instead of process.nextTick for browser compatibility
      setTimeout(next, 0);
    }
  }

  /**
   * Execute a function with mutex protection
   * @param {Function} fn Function to execute
   * @returns {Promise<any>} Result of the function
   */
  async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

/**
 * Semaphore implementation for limiting concurrent operations
 */
class Semaphore {
  name: string;
  maxConcurrent: number;
  current: number;
  queue: Array<() => void>;

  constructor(maxConcurrent: number, name = 'unnamed') {
    this.name = name;
    this.maxConcurrent = maxConcurrent;
    this.current = 0;
    this.queue = [];
  }

  /**
   * Acquire a semaphore permit
   * @returns {Promise<() => void>} Release function
   */
  async acquire(): Promise<() => void> {
    return new Promise<() => void>(resolve => {
      const tryAcquire = () => {
        if (this.current < this.maxConcurrent) {
          this.current++;
          resolve(() => this.release());
        } else {
          this.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  /**
   * Release a semaphore permit
   */
  release() {
    if (this.current <= 0) {
      log.warn(`Semaphore ${this.name} released when count is ${this.current}`);
      return;
    }
    
    this.current--;
    
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      // Use setTimeout(0) instead of process.nextTick for browser compatibility
      setTimeout(next, 0);
    }
  }

  /**
   * Execute a function with semaphore protection
   * @param {Function} fn Function to execute
   * @returns {Promise<any>} Result of the function
   */
  async withPermit<T>(fn: () => T | Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Get current usage stats
   */
  getStats() {
    return {
      current: this.current,
      max: this.maxConcurrent,
      queued: this.queue.length,
      available: this.maxConcurrent - this.current
    };
  }
}

/**
 * Thread-safe Map implementation
 */
class ConcurrentMap {
  name: string;
  map: Map<string, any>;
  mutex: Mutex;

  constructor(name = 'unnamed') {
    this.name = name;
    this.map = new Map();
    this.mutex = new Mutex(`${name}-map`);
  }

  async get(key: string) {
    return this.mutex.withLock(() => this.map.get(key));
  }

  async set(key: string, value: unknown) {
    return this.mutex.withLock(() => this.map.set(key, value));
  }

  async has(key: string) {
    return this.mutex.withLock(() => this.map.has(key));
  }

  async delete(key: string) {
    return this.mutex.withLock(() => this.map.delete(key));
  }

  async clear() {
    return this.mutex.withLock(() => this.map.clear());
  }

  async size() {
    return this.mutex.withLock(() => this.map.size);
  }

  /**
   * Get all keys as array (snapshot)
   */
  async keys() {
    return this.mutex.withLock(() => Array.from(this.map.keys()));
  }

  /**
   * Get all entries as array (snapshot)
   */
  async entries() {
    return this.mutex.withLock(() => Array.from(this.map.entries()));
  }

}

/**
 * Thread-safe Set implementation
 */
class ConcurrentSet {
  name: string;
  set: Set<string>;
  mutex: Mutex;

  constructor(name = 'unnamed') {
    this.name = name;
    this.set = new Set();
    this.mutex = new Mutex(`${name}-set`);
  }

  async add(value: string) {
    return this.mutex.withLock(() => this.set.add(value));
  }

  async has(value: string) {
    return this.mutex.withLock(() => this.set.has(value));
  }

  async delete(value: string) {
    return this.mutex.withLock(() => this.set.delete(value));
  }

  async clear() {
    return this.mutex.withLock(() => this.set.clear());
  }

  async size() {
    return this.mutex.withLock(() => this.set.size);
  }

  /**
   * Get all values as array (snapshot)
   */
  async values() {
    return this.mutex.withLock(() => Array.from(this.set));
  }

}

/**
 * Request deduplication cache
 */
class RequestDeduplicator {
  pendingRequests: Map<string, Promise<any>>;
  mutex: Mutex;

  constructor() {
    this.pendingRequests = new Map();
    this.mutex = new Mutex('request-dedup');
  }

  /**
   * Execute a request with deduplication
   * @param {string} key Unique key for the request
   * @param {Function} requestFn Function that returns a promise
   * @returns {Promise<any>} Result of the request
   */
  async execute<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    const release = await this.mutex.acquire();
    try {
      // Check if request is already pending
      if (this.pendingRequests.has(key)) {
        log.debug(`Request ${key} already pending, returning existing promise`);
        const existingPromise = this.pendingRequests.get(key);
        release(); // Release lock before returning
        return existingPromise;
      }

      // Create new request promise
      const requestPromise = requestFn()
        .finally(async () => {
          // Clean up after completion
          const cleanupRelease = await this.mutex.acquire();
          try {
            this.pendingRequests.delete(key);
          } finally {
            cleanupRelease();
          }
        });

      // Store the promise
      this.pendingRequests.set(key, requestPromise);
      release(); // Release lock before returning promise
      
      return requestPromise;
    } catch (error) {
      release();
      throw error;
    }
  }


  /**
   * Get number of pending requests
   */
  async getPendingCount() {
    return this.mutex.withLock(() => this.pendingRequests.size);
  }
}

export { Mutex, Semaphore, ConcurrentMap, ConcurrentSet, RequestDeduplicator };