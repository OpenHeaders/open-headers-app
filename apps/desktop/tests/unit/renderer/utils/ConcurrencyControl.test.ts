import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the logger before importing the module
vi.mock('@/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const { Mutex, Semaphore, ConcurrentMap, ConcurrentSet, RequestDeduplicator } = await import(
  '../../../../src/renderer/utils/error-handling/ConcurrencyControl'
);

// ======================================================================
// Mutex
// ======================================================================
describe('Mutex', () => {
  let mutex: InstanceType<typeof Mutex>;

  beforeEach(() => {
    mutex = new Mutex('test-mutex');
  });

  it('starts unlocked', () => {
    expect(mutex.locked).toBe(false);
  });

  it('acquire locks the mutex and returns a release function', async () => {
    const release = await mutex.acquire();
    expect(mutex.locked).toBe(true);
    expect(typeof release).toBe('function');
    release();
  });

  it('release unlocks the mutex', async () => {
    const release = await mutex.acquire();
    release();
    expect(mutex.locked).toBe(false);
  });

  it('serializes access for concurrent acquirers', async () => {
    const order: number[] = [];

    const p1 = mutex.withLock(async () => {
      order.push(1);
      return 'first';
    });

    const p2 = mutex.withLock(async () => {
      order.push(2);
      return 'second';
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('first');
    expect(r2).toBe('second');
    expect(order).toEqual([1, 2]);
  });

  it('withLock releases even on error', async () => {
    await expect(
      mutex.withLock(() => {
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');
    expect(mutex.locked).toBe(false);
  });

  it('release when not locked does not throw (warns)', () => {
    expect(() => mutex.release()).not.toThrow();
  });
});

// ======================================================================
// Semaphore
// ======================================================================
describe('Semaphore', () => {
  let sem: InstanceType<typeof Semaphore>;

  beforeEach(() => {
    sem = new Semaphore(2, 'test-sem');
  });

  it('allows up to maxConcurrent simultaneous acquires', async () => {
    const r1 = await sem.acquire();
    const r2 = await sem.acquire();
    expect(sem.current).toBe(2);
    r1();
    r2();
  });

  it('blocks when at capacity', async () => {
    const r1 = await sem.acquire();
    const r2 = await sem.acquire();
    expect(sem.current).toBe(2);

    let acquired = false;
    const p3 = sem.acquire().then((release) => {
      acquired = true;
      release();
    });

    // Still blocked
    expect(acquired).toBe(false);

    // Release one permit
    r1();

    // Wait for microtasks + setTimeout(0)
    await new Promise((r) => setTimeout(r, 10));
    await p3;
    expect(acquired).toBe(true);
    r2();
  });

  it('getStats returns accurate information', async () => {
    const r1 = await sem.acquire();
    const stats = sem.getStats();
    expect(stats.current).toBe(1);
    expect(stats.max).toBe(2);
    expect(stats.available).toBe(1);
    expect(stats.queued).toBe(0);
    r1();
  });

  it('withPermit releases on success', async () => {
    const result = await sem.withPermit(async () => 'done');
    expect(result).toBe('done');
    expect(sem.current).toBe(0);
  });

  it('withPermit releases on error', async () => {
    await expect(
      sem.withPermit(() => {
        throw new Error('err');
      }),
    ).rejects.toThrow('err');
    expect(sem.current).toBe(0);
  });

  it('release when count is 0 does not throw', () => {
    expect(() => sem.release()).not.toThrow();
  });
});

// ======================================================================
// ConcurrentMap
// ======================================================================
describe('ConcurrentMap', () => {
  let map: InstanceType<typeof ConcurrentMap>;

  beforeEach(() => {
    map = new ConcurrentMap('test-map');
  });

  it('set and get a value', async () => {
    await map.set('key1', 'value1');
    expect(await map.get('key1')).toBe('value1');
  });

  it('has returns true for existing key', async () => {
    await map.set('k', 'v');
    expect(await map.has('k')).toBe(true);
  });

  it('has returns false for missing key', async () => {
    expect(await map.has('missing')).toBe(false);
  });

  it('delete removes a key', async () => {
    await map.set('k', 'v');
    await map.delete('k');
    expect(await map.has('k')).toBe(false);
  });

  it('clear removes all entries', async () => {
    await map.set('a', 1);
    await map.set('b', 2);
    await map.clear();
    expect(await map.size()).toBe(0);
  });

  it('size returns correct count', async () => {
    await map.set('a', 1);
    await map.set('b', 2);
    expect(await map.size()).toBe(2);
  });

  it('entries returns all entries', async () => {
    await map.set('x', 10);
    await map.set('y', 20);
    const entries = await map.entries();
    expect(entries).toEqual([
      ['x', 10],
      ['y', 20],
    ]);
  });
});

// ======================================================================
// ConcurrentSet
// ======================================================================
describe('ConcurrentSet', () => {
  let set: InstanceType<typeof ConcurrentSet>;

  beforeEach(() => {
    set = new ConcurrentSet('test-set');
  });

  it('add and has', async () => {
    await set.add('a');
    expect(await set.has('a')).toBe(true);
  });

  it('has returns false for missing value', async () => {
    expect(await set.has('missing')).toBe(false);
  });

  it('delete removes a value', async () => {
    await set.add('a');
    await set.delete('a');
    expect(await set.has('a')).toBe(false);
  });

  it('clear removes all values', async () => {
    await set.add('a');
    await set.add('b');
    await set.clear();
    expect(await set.size()).toBe(0);
  });

  it('size returns correct count', async () => {
    await set.add('a');
    await set.add('b');
    expect(await set.size()).toBe(2);
  });

  it('values returns all values', async () => {
    await set.add('x');
    await set.add('y');
    const values = await set.values();
    expect(values).toContain('x');
    expect(values).toContain('y');
  });

  it('does not add duplicates (Set semantics)', async () => {
    await set.add('a');
    await set.add('a');
    expect(await set.size()).toBe(1);
  });
});

// ======================================================================
// RequestDeduplicator
// ======================================================================
describe('RequestDeduplicator', () => {
  let dedup: InstanceType<typeof RequestDeduplicator>;

  beforeEach(() => {
    dedup = new RequestDeduplicator();
  });

  it('executes and returns the result', async () => {
    const result = await dedup.execute('req1', () => Promise.resolve('data'));
    expect(result).toBe('data');
  });

  it('deduplicates concurrent identical requests', async () => {
    let callCount = 0;
    const fn = () => {
      callCount++;
      return new Promise((resolve) => setTimeout(() => resolve('result'), 10));
    };

    const [r1, r2, r3] = await Promise.all([
      dedup.execute('same-key', fn),
      dedup.execute('same-key', fn),
      dedup.execute('same-key', fn),
    ]);

    expect(r1).toBe('result');
    expect(r2).toBe('result');
    expect(r3).toBe('result');
    expect(callCount).toBe(1);
  });

  it('executes separately for different keys', async () => {
    let callCount = 0;
    const fn = () => {
      callCount++;
      return Promise.resolve(callCount);
    };

    const [_r1, _r2] = await Promise.all([dedup.execute('key-a', fn), dedup.execute('key-b', fn)]);

    expect(callCount).toBe(2);
  });

  it('cleans up after completion so next call re-executes', async () => {
    let callCount = 0;
    const fn = () => {
      callCount++;
      return Promise.resolve(callCount);
    };

    await dedup.execute('k', fn);
    // Wait for cleanup
    await new Promise((r) => setTimeout(r, 20));
    await dedup.execute('k', fn);
    expect(callCount).toBe(2);
  });

  it('propagates errors', async () => {
    await expect(dedup.execute('err', () => Promise.reject(new Error('oops')))).rejects.toThrow('oops');
  });

  it('getPendingCount returns 0 when idle', async () => {
    expect(await dedup.getPendingCount()).toBe(0);
  });
});
