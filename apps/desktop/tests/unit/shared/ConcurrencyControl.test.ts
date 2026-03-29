import { describe, expect, it } from 'vitest';
import {
  ConcurrentMap,
  ConcurrentSet,
  Mutex,
  RequestDeduplicator,
  Semaphore,
} from '../../../src/shared/ConcurrencyControl';

describe('Mutex', () => {
  it('allows sequential access', async () => {
    const mutex = new Mutex('test');
    const results: number[] = [];

    await mutex.withLock(async () => {
      results.push(1);
    });
    await mutex.withLock(async () => {
      results.push(2);
    });

    expect(results).toEqual([1, 2]);
  });

  it('queues concurrent access', async () => {
    const mutex = new Mutex('test');
    const results: number[] = [];

    const p1 = mutex.withLock(async () => {
      await new Promise((r) => setTimeout(r, 10));
      results.push(1);
    });
    const p2 = mutex.withLock(async () => {
      results.push(2);
    });

    await Promise.all([p1, p2]);
    expect(results).toEqual([1, 2]);
  });
});

describe('Semaphore', () => {
  it('limits concurrent operations', async () => {
    const sem = new Semaphore(2, 'test');
    let concurrent = 0;
    let maxConcurrent = 0;

    const tasks = Array.from({ length: 5 }, () =>
      sem.withPermit(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 10));
        concurrent--;
      }),
    );

    await Promise.all(tasks);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('reports stats correctly', () => {
    const sem = new Semaphore(3, 'test');
    const stats = sem.getStats();
    expect(stats.max).toBe(3);
    expect(stats.current).toBe(0);
    expect(stats.available).toBe(3);
  });
});

describe('ConcurrentMap', () => {
  it('supports basic CRUD operations', async () => {
    const map = new ConcurrentMap<string>('test');

    await map.set('key', 'value');
    expect(await map.get('key')).toBe('value');
    expect(await map.has('key')).toBe(true);
    expect(await map.size()).toBe(1);

    await map.delete('key');
    expect(await map.has('key')).toBe(false);
    expect(await map.size()).toBe(0);
  });

  it('returns entries snapshot', async () => {
    const map = new ConcurrentMap<number>('test');
    await map.set('a', 1);
    await map.set('b', 2);

    const entries = await map.entries();
    expect(entries).toHaveLength(2);
    expect(entries.map(([k]) => k).sort()).toEqual(['a', 'b']);
  });

  it('clears all entries', async () => {
    const map = new ConcurrentMap<string>('test');
    await map.set('a', '1');
    await map.set('b', '2');
    await map.clear();
    expect(await map.size()).toBe(0);
  });
});

describe('ConcurrentSet', () => {
  it('supports add/has/delete', async () => {
    const set = new ConcurrentSet('test');

    await set.add('a');
    expect(await set.has('a')).toBe(true);
    expect(await set.size()).toBe(1);

    await set.delete('a');
    expect(await set.has('a')).toBe(false);
  });

  it('returns values snapshot', async () => {
    const set = new ConcurrentSet('test');
    await set.add('x');
    await set.add('y');
    const values = await set.values();
    expect(values.sort()).toEqual(['x', 'y']);
  });
});

describe('RequestDeduplicator', () => {
  it('deduplicates concurrent requests with same key', async () => {
    const dedup = new RequestDeduplicator();
    let callCount = 0;

    const fn = async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 50));
      return 'result';
    };

    const [r1, r2] = await Promise.all([dedup.execute('key', fn), dedup.execute('key', fn)]);

    expect(r1).toBe('result');
    expect(r2).toBe('result');
    expect(callCount).toBe(1); // only called once
  });

  it('allows sequential requests with same key', async () => {
    const dedup = new RequestDeduplicator();
    let callCount = 0;

    const fn = async () => {
      callCount++;
      return 'ok';
    };

    await dedup.execute('key', fn);
    await dedup.execute('key', fn);

    expect(callCount).toBe(2); // called twice since first completed
  });
});
