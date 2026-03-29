/**
 * Concurrency control primitives — shared between renderer and main process.
 * Pure JS: Mutex, Semaphore, ConcurrentMap, ConcurrentSet, RequestDeduplicator.
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

  async acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
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

  release() {
    if (!this.locked) return;
    this.locked = false;
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      setTimeout(next, 0);
    }
  }

  async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

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

  async acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
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

  release() {
    if (this.current <= 0) return;
    this.current--;
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      setTimeout(next, 0);
    }
  }

  async withPermit<T>(fn: () => T | Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  getStats() {
    return {
      current: this.current,
      max: this.maxConcurrent,
      queued: this.queue.length,
      available: this.maxConcurrent - this.current,
    };
  }
}

class ConcurrentMap<V = unknown> {
  name: string;
  map: Map<string, V>;
  mutex: Mutex;

  constructor(name = 'unnamed') {
    this.name = name;
    this.map = new Map();
    this.mutex = new Mutex(`${name}-map`);
  }

  async get(key: string): Promise<V | undefined> {
    return this.mutex.withLock(() => this.map.get(key));
  }

  async set(key: string, value: V): Promise<Map<string, V>> {
    return this.mutex.withLock(() => this.map.set(key, value));
  }

  async has(key: string): Promise<boolean> {
    return this.mutex.withLock(() => this.map.has(key));
  }

  async delete(key: string): Promise<boolean> {
    return this.mutex.withLock(() => this.map.delete(key));
  }

  async clear(): Promise<void> {
    return this.mutex.withLock(() => this.map.clear());
  }

  async size(): Promise<number> {
    return this.mutex.withLock(() => this.map.size);
  }

  async keys(): Promise<string[]> {
    return this.mutex.withLock(() => Array.from(this.map.keys()));
  }

  async entries(): Promise<[string, V][]> {
    return this.mutex.withLock(() => Array.from(this.map.entries()));
  }
}

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

  async values() {
    return this.mutex.withLock(() => Array.from(this.set));
  }
}

class RequestDeduplicator {
  pendingRequests: Map<string, Promise<unknown>>;
  mutex: Mutex;

  constructor() {
    this.pendingRequests = new Map();
    this.mutex = new Mutex('request-dedup');
  }

  async execute<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    const release = await this.mutex.acquire();
    try {
      if (this.pendingRequests.has(key)) {
        const existingPromise = this.pendingRequests.get(key);
        release();
        return existingPromise as Promise<T>;
      }

      const requestPromise = requestFn().finally(async () => {
        const cleanupRelease = await this.mutex.acquire();
        try {
          this.pendingRequests.delete(key);
        } finally {
          cleanupRelease();
        }
      });

      this.pendingRequests.set(key, requestPromise);
      release();
      return requestPromise;
    } catch (error) {
      release();
      throw error;
    }
  }

  async getPendingCount() {
    return this.mutex.withLock(() => this.pendingRequests.size);
  }
}

export { ConcurrentMap, ConcurrentSet, Mutex, RequestDeduplicator, Semaphore };
