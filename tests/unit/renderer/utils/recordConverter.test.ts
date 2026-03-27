import { describe, it, expect } from 'vitest';
import type { StorageRecord, RawRecordingRecord } from '../../../../src/types/recording';
import {
  convertNewRecordingFormat,
  processStorageEvents,
  convertStorageForTable,
} from '../../../../src/renderer/utils/formatters/recordConverter';

// ======================================================================
// extractDomain (internal, tested indirectly via processStorageEvents)
// ======================================================================

// ======================================================================
// convertNewRecordingFormat
// ======================================================================
describe('convertNewRecordingFormat', () => {
  it('returns null/undefined input unchanged', () => {
    // intentionally passing invalid input to test runtime null guard
    expect(convertNewRecordingFormat(null as unknown as RawRecordingRecord)).toBeNull();
    expect(convertNewRecordingFormat(undefined as unknown as RawRecordingRecord)).toBeUndefined();
  });

  it('returns record without events unchanged', () => {
    const record = { id: '1', startTime: 0 } as RawRecordingRecord;
    expect(convertNewRecordingFormat(record)).toEqual(record);
  });

  it('returns record already in old format unchanged', () => {
    const record = { events: [], console: [], network: [], storage: [] } as unknown as RawRecordingRecord;
    expect(convertNewRecordingFormat(record)).toEqual(record);
  });

  it('converts console events', () => {
    const record = {
      startTime: 1000,
      events: [
        {
          type: 'console',
          timestamp: 1500,
          data: { level: 'log', args: ['hello'], stack: null },
        },
      ],
    } as unknown as RawRecordingRecord;
    const result = convertNewRecordingFormat(record);
    expect(result.console!).toHaveLength(1);
    expect(result.console![0]).toEqual({
      timestamp: 500,
      level: 'log',
      args: ['hello'],
      stack: null,
    });
  });

  it('converts network request events', () => {
    const record = {
      startTime: 1000,
      events: [
        {
          type: 'network',
          timestamp: 2000,
          data: {
            type: 'request',
            requestId: 'req-1',
            method: 'GET',
            url: 'https://example.com/api',
            headers: { 'Content-Type': 'application/json' },
            body: null,
            timing: { startTime: 1000 },
          },
        },
      ],
    } as unknown as RawRecordingRecord;
    const result = convertNewRecordingFormat(record);
    expect(result.network!).toHaveLength(1);
    expect(result.network![0].id).toBe('req-1');
    expect(result.network![0].method).toBe('GET');
    expect(result.network![0].url).toBe('https://example.com/api');
    expect(result.network![0].timestamp).toBe(1000);
  });

  it('matches network response to request', () => {
    const record = {
      startTime: 1000,
      events: [
        {
          type: 'network',
          timestamp: 2000,
          data: {
            type: 'request',
            requestId: 'req-1',
            method: 'POST',
            url: 'https://example.com/api',
            headers: {},
            body: '{"a":1}',
            timing: { startTime: 1000 },
          },
        },
        {
          type: 'network',
          timestamp: 3000,
          data: {
            type: 'response',
            requestId: 'req-1',
            status: 200,
            statusText: 'OK',
            responseHeaders: { 'x-custom': 'val' },
            responseBody: '{"ok":true}',
            timing: { endTime: 2000 },
          },
        },
      ],
    } as unknown as RawRecordingRecord;
    const result = convertNewRecordingFormat(record);
    expect(result.network!).toHaveLength(1);
    expect(result.network![0].status).toBe(200);
    expect(result.network![0].statusText).toBe('OK');
    expect(result.network![0].responseBody).toBe('{"ok":true}');
    expect(result.network![0].responseHeaders).toEqual({ 'x-custom': 'val' });
  });

  it('resolves relative network URLs using event.url', () => {
    const record = {
      startTime: 0,
      events: [
        {
          type: 'network',
          timestamp: 100,
          url: 'https://example.com/page',
          data: {
            type: 'request',
            requestId: 'r1',
            method: 'GET',
            url: '/api/data',
            headers: {},
          },
        },
      ],
    } as unknown as RawRecordingRecord;
    const result = convertNewRecordingFormat(record);
    expect(result.network![0].url).toBe('https://example.com/api/data');
  });

  it('resolves relative URLs via record.url when event.url is invalid', () => {
    const record = {
      startTime: 0,
      url: 'https://fallback.com',
      events: [
        {
          type: 'network',
          timestamp: 100,
          url: 'not-a-url',
          data: {
            type: 'request',
            requestId: 'r1',
            method: 'GET',
            url: '/path',
            headers: {},
          },
        },
      ],
    } as unknown as RawRecordingRecord;
    const result = convertNewRecordingFormat(record);
    expect(result.network![0].url).toBe('https://fallback.com/path');
  });

  it('converts navigation events', () => {
    const record = {
      startTime: 1000,
      events: [
        {
          type: 'navigation',
          timestamp: 1200,
          url: 'https://example.com/page',
          data: { title: 'Page', transitionType: 'typed' },
        },
      ],
    } as unknown as RawRecordingRecord;
    const result = convertNewRecordingFormat(record) as Record<string, unknown>;
    const navHistory = result.navigationHistory as Array<{ timestamp: number; url: string; title: string; transitionType: string }>;
    expect(navHistory).toHaveLength(1);
    expect(navHistory[0]).toEqual({
      timestamp: 200,
      url: 'https://example.com/page',
      title: 'Page',
      transitionType: 'typed',
    });
  });

  it('passes rrweb events through as event.data', () => {
    const rrwebData = { type: 2, data: { node: {} } };
    const record = {
      startTime: 0,
      events: [{ type: 'rrweb', timestamp: 100, data: rrwebData }],
    } as unknown as RawRecordingRecord;
    const result = convertNewRecordingFormat(record);
    expect(result.events!).toHaveLength(1);
    expect(result.events![0]).toEqual(rrwebData);
  });

  it('ignores recording-start and recording-stop events', () => {
    const record = {
      startTime: 0,
      events: [
        { type: 'recording-start', timestamp: 0, data: {} },
        { type: 'recording-stop', timestamp: 5000, data: {} },
      ],
    } as unknown as RawRecordingRecord;
    const result = convertNewRecordingFormat(record);
    expect(result.console!).toHaveLength(0);
    expect(result.network!).toHaveLength(0);
  });

  it('converts storage-initial events', () => {
    const record = {
      startTime: 0,
      events: [
        {
          type: 'storage-initial',
          timestamp: 10,
          url: 'https://example.com',
          data: {
            localStorage: { key1: 'val1' },
            sessionStorage: {},
            cookies: 'a=1; b=2',
          },
        },
      ],
    } as unknown as RawRecordingRecord;
    const result = convertNewRecordingFormat(record);
    // storage-initial produces initial snapshot entries
    expect(result.storage!.length).toBeGreaterThan(0);
  });

  it('converts storage change events with type mapping', () => {
    const record = {
      startTime: 0,
      events: [
        {
          type: 'storage',
          timestamp: 500,
          url: 'https://example.com',
          data: {
            type: 'local',
            action: 'set',
            key: 'myKey',
            oldValue: null,
            newValue: 'hello',
          },
        },
      ],
    } as unknown as RawRecordingRecord;
    const result = convertNewRecordingFormat(record);
    // Storage events get processed and deduplicated
    expect(result.storage!.length).toBeGreaterThanOrEqual(1);
    const item = result.storage![0];
    expect(item.type).toBe('localStorage');
    expect(item.action).toBe('set');
    expect(item.key).toBe('myKey');
  });

  it('generates metadata from record fields when metadata is absent', () => {
    const record = {
      id: 'rec-1',
      startTime: 1000,
      endTime: 5000,
      url: 'https://example.com',
      viewport: { width: 800, height: 600 },
      events: [],
    } as unknown as RawRecordingRecord;
    const result = convertNewRecordingFormat(record);
    expect(result.metadata!.recordId).toBe('rec-1');
    expect(result.metadata!.duration).toBe(4000);
    expect(result.metadata!.viewport).toEqual({ width: 800, height: 600 });
  });

  it('preserves existing metadata on the record', () => {
    const record = {
      startTime: 0,
      metadata: { recordId: 'custom', startTime: 0, endTime: 100, duration: 100, url: '', viewport: { width: 1920, height: 1080 }, userAgent: 'test' },
      events: [],
    } as unknown as RawRecordingRecord;
    const result = convertNewRecordingFormat(record);
    expect(result.metadata!.recordId).toBe('custom');
  });

  it('stores original events in _originalEvents', () => {
    const events = [{ type: 'console', timestamp: 100, data: { level: 'log', args: [] } }];
    const record = { startTime: 0, events } as unknown as RawRecordingRecord;
    const result = convertNewRecordingFormat(record);
    expect(result._originalEvents).toBe(events);
  });

  it('handles response without matching request gracefully', () => {
    const record = {
      startTime: 0,
      events: [
        {
          type: 'network',
          timestamp: 100,
          data: {
            type: 'response',
            requestId: 'no-match',
            status: 404,
          },
        },
      ],
    } as unknown as RawRecordingRecord;
    const result = convertNewRecordingFormat(record);
    expect(result.network!).toHaveLength(0);
  });

  it('sets response size from responseSize field', () => {
    const record = {
      startTime: 0,
      events: [
        {
          type: 'network',
          timestamp: 100,
          data: { type: 'request', requestId: 'r1', method: 'GET', url: 'https://x.com', headers: {} },
        },
        {
          type: 'network',
          timestamp: 200,
          data: { type: 'response', requestId: 'r1', status: 200, responseSize: 1234, timing: { endTime: 100 } },
        },
      ],
    } as unknown as RawRecordingRecord;
    const result = convertNewRecordingFormat(record);
    expect(result.network![0].size).toBe(1234);
  });
});

// ======================================================================
// processStorageEvents
// ======================================================================
describe('processStorageEvents', () => {
  const baseRecord = { url: 'https://example.com' } as RawRecordingRecord;

  it('returns empty array for empty input', () => {
    expect(processStorageEvents([], baseRecord)).toEqual([]);
  });

  it('processes initial localStorage snapshot', () => {
    const storage = [
      {
        timestamp: 0,
        type: 'initial',
        action: 'snapshot',
        data: { localStorage: { foo: 'bar' }, sessionStorage: {}, cookies: '' },
        url: 'https://example.com',
      },
    ] as unknown as StorageRecord[];
    const result = processStorageEvents(storage, baseRecord);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const lsItem = result.find((r: StorageRecord) => r.type === 'localStorage');
    expect(lsItem).toBeDefined();
    expect(lsItem!.key).toBe('foo');
    expect(lsItem!.value).toBe('bar');
    expect(lsItem!.metadata!.initial).toBe(true);
  });

  it('processes initial sessionStorage snapshot', () => {
    const storage = [
      {
        timestamp: 0,
        type: 'initial',
        action: 'snapshot',
        data: { localStorage: {}, sessionStorage: { sess: 'val' }, cookies: '' },
        url: 'https://example.com',
      },
    ] as unknown as StorageRecord[];
    const result = processStorageEvents(storage, baseRecord);
    const ssItem = result.find((r: StorageRecord) => r.type === 'sessionStorage');
    expect(ssItem).toBeDefined();
    expect(ssItem!.key).toBe('sess');
    expect(ssItem!.value).toBe('val');
  });

  it('processes initial cookie snapshot', () => {
    const storage = [
      {
        timestamp: 0,
        type: 'initial',
        action: 'snapshot',
        data: { localStorage: {}, sessionStorage: {}, cookies: 'a=1; b=2' },
        url: 'https://example.com',
      },
    ] as unknown as StorageRecord[];
    const result = processStorageEvents(storage, baseRecord);
    const cookies = result.filter((r: StorageRecord) => r.type === 'cookie');
    expect(cookies).toHaveLength(2);
    expect(cookies[0].key).toBe('a');
    expect(cookies[0].value).toBe('1');
    expect(cookies[1].key).toBe('b');
    expect(cookies[1].value).toBe('2');
  });

  it('maps local/session type to localStorage/sessionStorage', () => {
    const storage = [
      {
        timestamp: 100,
        type: 'local',
        action: 'set',
        key: 'k',
        name: 'k',
        value: 'v',
        url: 'https://example.com',
      },
    ] as unknown as StorageRecord[];
    const result = processStorageEvents(storage, baseRecord);
    expect(result[0].type).toBe('localStorage');
  });

  it('parses cookie SET events with parseCookieString', () => {
    const storage = [
      {
        timestamp: 100,
        type: 'cookie',
        action: 'set',
        newValue: 'myCookie=myValue; path=/; secure',
        url: 'https://example.com',
      },
    ] as unknown as StorageRecord[];
    const result = processStorageEvents(storage, baseRecord);
    expect(result[0].key).toBe('myCookie');
    expect(result[0].value).toBe('myValue');
    expect(result[0].metadata!.secure).toBe(true);
  });

  it('detects cookie deletion via max-age=0', () => {
    const storage = [
      {
        timestamp: 100,
        type: 'cookie',
        action: 'set',
        newValue: 'gone=; max-age=0',
        url: 'https://example.com',
      },
    ] as unknown as StorageRecord[];
    const result = processStorageEvents(storage, baseRecord);
    expect(result[0].action).toBe('remove');
  });

  it('falls back to record.url for domain extraction', () => {
    const storage = [
      {
        timestamp: 100,
        type: 'localStorage',
        action: 'set',
        key: 'k',
        name: 'k',
        value: 'v',
      },
    ] as unknown as StorageRecord[];
    const result = processStorageEvents(storage, baseRecord);
    expect(result[0].domain).toBe('example.com');
  });

  it('deduplicates initial storage events', () => {
    const storage = [
      {
        timestamp: 0,
        type: 'initial',
        action: 'snapshot',
        data: { localStorage: { dup: 'a' }, sessionStorage: {}, cookies: '' },
        url: 'https://example.com',
      },
      {
        timestamp: 0,
        type: 'initial',
        action: 'snapshot',
        data: { localStorage: { dup: 'b' }, sessionStorage: {}, cookies: '' },
        url: 'https://example.com',
      },
    ] as unknown as StorageRecord[];
    const result = processStorageEvents(storage, baseRecord);
    // Only one entry for 'dup' since key is deduplicated
    const dupItems = result.filter((r: StorageRecord) => r.key === 'dup');
    expect(dupItems).toHaveLength(1);
  });

  it('tracks old values across events', () => {
    const storage = [
      {
        timestamp: 0,
        type: 'initial',
        action: 'snapshot',
        data: { localStorage: { counter: 'initial' }, sessionStorage: {}, cookies: '' },
        url: 'https://example.com',
      },
      {
        timestamp: 100,
        type: 'localStorage',
        action: 'set',
        key: 'counter',
        name: 'counter',
        value: 'updated',
        url: 'https://example.com',
      },
    ] as unknown as StorageRecord[];
    const result = processStorageEvents(storage, baseRecord);
    const setEvent = result.find((r: StorageRecord) => r.action === 'set' && !r.metadata?.initial);
    expect(setEvent).toBeDefined();
    expect(setEvent!.oldValue).toBe('initial');
    expect(setEvent!.value).toBe('updated');
  });

  it('handles remove action', () => {
    const storage = [
      {
        timestamp: 0,
        type: 'initial',
        action: 'snapshot',
        data: { localStorage: { toRemove: 'val' }, sessionStorage: {}, cookies: '' },
        url: 'https://example.com',
      },
      {
        timestamp: 100,
        type: 'localStorage',
        action: 'remove',
        key: 'toRemove',
        name: 'toRemove',
        url: 'https://example.com',
      },
    ] as unknown as StorageRecord[];
    const result = processStorageEvents(storage, baseRecord);
    const removeEvent = result.find((r: StorageRecord) => r.action === 'remove');
    expect(removeEvent).toBeDefined();
    expect(removeEvent!.oldValue).toBe('val');
    expect(removeEvent!.value).toBeUndefined();
  });

  it('handles clear action', () => {
    const storage = [
      {
        timestamp: 0,
        type: 'initial',
        action: 'snapshot',
        data: { localStorage: { a: '1', b: '2' }, sessionStorage: {}, cookies: '' },
        url: 'https://example.com',
      },
      {
        timestamp: 100,
        type: 'localStorage',
        action: 'clear',
        key: '*',
        name: '*',
        url: 'https://example.com',
      },
    ] as unknown as StorageRecord[];
    const result = processStorageEvents(storage, baseRecord);
    const clearEvent = result.find((r: StorageRecord) => r.action === 'clear');
    expect(clearEvent).toBeDefined();
    expect(clearEvent!.metadata!.clearedCount).toBe(2);
    expect(clearEvent!.metadata!.clearedKeys).toHaveLength(2);
  });
});

// ======================================================================
// convertStorageForTable
// ======================================================================
describe('convertStorageForTable', () => {
  it('returns empty array for empty input', () => {
    expect(convertStorageForTable([])).toEqual([]);
  });

  it('passes through storage items with domain fallback', () => {
    const items = [
      { type: 'localStorage', action: 'set', key: 'k', value: 'v', name: 'k', domain: '' },
      { type: 'cookie', action: 'initial', key: 'c', value: '1', name: 'c', domain: 'example.com' },
    ] as unknown as StorageRecord[];
    const result = convertStorageForTable(items);
    expect(result).toHaveLength(2);
    expect(result[0].domain).toBe('unknown');
    expect(result[1].domain).toBe('example.com');
  });

  it('preserves all existing fields', () => {
    const item = {
      type: 'sessionStorage',
      action: 'set',
      key: 'myKey',
      value: 'myVal',
      name: 'myKey',
      timestamp: 123,
      domain: 'test.com',
      url: 'https://test.com',
    } as unknown as StorageRecord;
    const result = convertStorageForTable([item]);
    expect(result[0]).toEqual(item);
  });
});

// ======================================================================
// parseCookieString (internal, tested via processStorageEvents)
// ======================================================================
describe('parseCookieString (via processStorageEvents)', () => {
  const baseRecord = { url: 'https://example.com' } as RawRecordingRecord;

  it('handles cookie with domain attribute', () => {
    const storage = [
      {
        timestamp: 0,
        type: 'cookie',
        action: 'set',
        newValue: 'sess=abc123; path=/; domain=.example.com; httponly',
        url: 'https://example.com',
      },
    ] as unknown as StorageRecord[];
    const result = processStorageEvents(storage, baseRecord);
    expect(result[0].key).toBe('sess');
    expect(result[0].domain).toBe('.example.com');
    expect(result[0].metadata!.httpOnly).toBe(true);
  });

  it('handles multiple simple cookies format', () => {
    // Multiple cookies without attributes: "name1=value1; name2=value2"
    const storage = [
      {
        timestamp: 0,
        type: 'cookie',
        action: 'set',
        newValue: 'a=1; b=2',
        url: 'https://example.com',
      },
    ] as unknown as StorageRecord[];
    const result = processStorageEvents(storage, baseRecord);
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('a');
    expect(result[1].key).toBe('b');
  });

  it('handles empty cookie value', () => {
    const storage = [
      {
        timestamp: 0,
        type: 'cookie',
        action: 'set',
        newValue: '',
        url: 'https://example.com',
      },
    ] as unknown as StorageRecord[];
    const result = processStorageEvents(storage, baseRecord);
    // Empty string from parseCookieString returns []
    expect(result).toHaveLength(0);
  });
});
