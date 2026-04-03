import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock storage-chunking before importing the module under test
const mockGetChunkedData = vi.fn();
vi.mock('@utils/storage-chunking.js', () => ({
  getChunkedData: (...args: unknown[]) => mockGetChunkedData(...args),
  setChunkedData: vi.fn(),
}));

vi.mock('@utils/browser-api.js', () => ({
  storage: { onChanged: { addListener: vi.fn() } },
  tabs: { query: vi.fn() },
}));

const mockSendMessage = vi.fn();
vi.mock('@utils/messaging', () => ({
  sendMessageWithCallback: (...args: unknown[]) => mockSendMessage(...args),
}));

vi.mock('@utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import type { SavedDataMap } from '@openheaders/core';
import {
  addTrackedUrl,
  checkIfUrlMatchesAnyRule,
  getActiveRulesForTab,
  refreshSavedDataCache,
  tabsWithActiveRules,
} from '@/background/modules/request-tracker';

function makeSavedData(
  entries: Record<
    string,
    { headerName: string; domains: string[]; isEnabled?: boolean; isResponse?: boolean; tag?: string }
  >,
): SavedDataMap {
  const data: SavedDataMap = {};
  for (const [id, entry] of Object.entries(entries)) {
    data[id] = {
      headerName: entry.headerName,
      headerValue: 'test-value',
      domains: entry.domains,
      isEnabled: entry.isEnabled !== false,
      isResponse: entry.isResponse || false,
      tag: entry.tag || '',
      isDynamic: false,
      sourceId: '',
      prefix: '',
      suffix: '',
      createdAt: new Date().toISOString(),
    };
  }
  return data;
}

function seedCache(data: SavedDataMap): void {
  mockGetChunkedData.mockImplementation((_key: string, cb: (data: SavedDataMap) => void) => cb(data));
  refreshSavedDataCache();
}

describe('getActiveRulesForTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tabsWithActiveRules.clear();
  });

  it('returns empty array for non-trackable URLs', async () => {
    const result = await getActiveRulesForTab(1, 'chrome://extensions');
    expect(result).toEqual([]);
  });

  it('returns empty array for empty URL', async () => {
    const result = await getActiveRulesForTab(1, '');
    expect(result).toEqual([]);
  });

  it('returns matching enabled rules with matchedUrls', async () => {
    seedCache(
      makeSavedData({
        'rule-1': { headerName: 'X-Debug', domains: ['*.openheaders.io'], isEnabled: true },
      }),
    );

    const result = await getActiveRulesForTab(1, 'https://api.openheaders.io/v2');
    expect(result).toHaveLength(1);
    expect(result[0].headerName).toBe('X-Debug');
    expect(result[0].isEnabled).toBe(true);
    expect(result[0].matchType).toBe('direct');
    expect(result[0].matchedUrls).toHaveLength(1);
    expect(result[0].matchedUrls[0].url).toBe('https://api.openheaders.io/v2');
    expect(result[0].matchedUrls[0].pattern).toBe('*.openheaders.io');
    expect(result[0].matchedUrls[0].timestamp).toBeGreaterThan(0);
  });

  it('returns disabled matching rules (Option B — show all matching)', async () => {
    seedCache(
      makeSavedData({
        'rule-1': { headerName: 'X-Debug', domains: ['*.openheaders.io'], isEnabled: true },
        'rule-2': { headerName: 'X-Disabled', domains: ['*.openheaders.io'], isEnabled: false },
      }),
    );

    const result = await getActiveRulesForTab(1, 'https://api.openheaders.io/v2');
    expect(result).toHaveLength(2);

    const enabled = result.find((r) => r.headerName === 'X-Debug');
    const disabled = result.find((r) => r.headerName === 'X-Disabled');
    expect(enabled?.isEnabled).toBe(true);
    expect(disabled?.isEnabled).toBe(false);
  });

  it('does not return rules that do not match the domain', async () => {
    seedCache(
      makeSavedData({
        'rule-1': { headerName: 'X-Debug', domains: ['*.openheaders.io'] },
        'rule-2': { headerName: 'X-Other', domains: ['*.example.com'] },
      }),
    );

    const result = await getActiveRulesForTab(1, 'https://api.openheaders.io/v2');
    expect(result).toHaveLength(1);
    expect(result[0].headerName).toBe('X-Debug');
  });

  it('returns rules with no domains as direct matches with tab URL in matchedUrls', async () => {
    seedCache(
      makeSavedData({
        'rule-1': { headerName: 'X-Global', domains: [] },
      }),
    );

    const result = await getActiveRulesForTab(1, 'https://any-site.com/page');
    expect(result).toHaveLength(1);
    expect(result[0].matchType).toBe('direct');
    expect(result[0].matchedUrls).toHaveLength(1);
    expect(result[0].matchedUrls[0].url).toBe('https://any-site.com/page');
    expect(result[0].matchedUrls[0].pattern).toBe('*');
    expect(result[0].matchedUrls[0].timestamp).toBeGreaterThan(0);
  });

  it('preserves rule id and key in results', async () => {
    seedCache(
      makeSavedData({
        'my-rule-id': { headerName: 'X-Test', domains: ['*.openheaders.io'] },
      }),
    );

    const result = await getActiveRulesForTab(1, 'https://api.openheaders.io/test');
    expect(result[0].id).toBe('my-rule-id');
    expect(result[0].key).toBe('my-rule-id');
  });

  it('includes tag and isResponse in results', async () => {
    seedCache(
      makeSavedData({
        'rule-1': { headerName: 'X-Tagged', domains: ['*.openheaders.io'], tag: 'DEV', isResponse: true },
      }),
    );

    const result = await getActiveRulesForTab(1, 'https://api.openheaders.io/test');
    expect(result[0].tag).toBe('DEV');
    expect(result[0].isResponse).toBe(true);
  });
});

describe('checkIfUrlMatchesAnyRule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tabsWithActiveRules.clear();
  });

  it('returns true when URL matches an enabled rule', async () => {
    seedCache(
      makeSavedData({
        'rule-1': { headerName: 'X-Debug', domains: ['*.openheaders.io'], isEnabled: true },
      }),
    );

    const result = await checkIfUrlMatchesAnyRule('https://api.openheaders.io/v2');
    expect(result).toBe(true);
  });

  it('returns true when URL matches a disabled rule (tracks for Active tab)', async () => {
    seedCache(
      makeSavedData({
        'rule-1': { headerName: 'X-Debug', domains: ['*.openheaders.io'], isEnabled: false },
      }),
    );

    const result = await checkIfUrlMatchesAnyRule('https://api.openheaders.io/v2');
    expect(result).toBe(true);
  });

  it('returns false when URL matches no rules', async () => {
    seedCache(
      makeSavedData({
        'rule-1': { headerName: 'X-Debug', domains: ['*.example.com'] },
      }),
    );

    const result = await checkIfUrlMatchesAnyRule('https://api.openheaders.io/v2');
    expect(result).toBe(false);
  });

  it('returns false when no rules exist', async () => {
    seedCache({});

    const result = await checkIfUrlMatchesAnyRule('https://api.openheaders.io/v2');
    expect(result).toBe(false);
  });

  it('matches path-based patterns against full URLs', async () => {
    seedCache(
      makeSavedData({
        'rule-1': { headerName: 'X-Debug', domains: ['github.githubassets.com/assets'] },
      }),
    );

    const result = await checkIfUrlMatchesAnyRule('https://github.githubassets.com/assets/37160-72dc5a515abc7d3b.js');
    expect(result).toBe(true);
  });
});

describe('addTrackedUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tabsWithActiveRules.clear();
  });

  it('adds a URL with a timestamp', () => {
    const before = Date.now();
    addTrackedUrl(1, 'https://api.openheaders.io/v2');
    const after = Date.now();

    const tracked = tabsWithActiveRules.get(1)!;
    expect(tracked.has('https://api.openheaders.io/v2')).toBe(true);
    const ts = tracked.get('https://api.openheaders.io/v2')!;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('notifies popup when a new URL is tracked', () => {
    addTrackedUrl(1, 'https://api.openheaders.io/v2');

    expect(mockSendMessage).toHaveBeenCalledWith({ type: 'trackedUrlsUpdated', tabId: 1 }, expect.any(Function));
  });

  it('does not notify for duplicate URLs', () => {
    addTrackedUrl(1, 'https://api.openheaders.io/v2');
    mockSendMessage.mockClear();

    addTrackedUrl(1, 'https://api.openheaders.io/v2');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('creates tab entry if it does not exist', () => {
    expect(tabsWithActiveRules.has(42)).toBe(false);
    addTrackedUrl(42, 'https://openheaders.io');
    expect(tabsWithActiveRules.has(42)).toBe(true);
  });

  it('tracks all URLs without a cap', () => {
    for (let i = 0; i < 100; i++) {
      addTrackedUrl(1, `https://openheaders.io/page/${i}`);
    }
    expect(tabsWithActiveRules.get(1)!.size).toBe(100);

    addTrackedUrl(1, 'https://openheaders.io/page/new');
    expect(tabsWithActiveRules.get(1)!.size).toBe(101);
    expect(tabsWithActiveRules.get(1)!.has('https://openheaders.io/page/0')).toBe(true);
    expect(tabsWithActiveRules.get(1)!.has('https://openheaders.io/page/new')).toBe(true);
  });
});

describe('getActiveRulesForTab with tracked resource URLs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tabsWithActiveRules.clear();
  });

  it('returns indirect matches with timestamps from tracked URLs', async () => {
    seedCache(
      makeSavedData({
        'rule-1': { headerName: 'X-Debug', domains: ['*.cdn.openheaders.io'] },
      }),
    );

    // Simulate a tracked resource URL
    addTrackedUrl(1, 'https://assets.cdn.openheaders.io/bundle.js');

    const result = await getActiveRulesForTab(1, 'https://openheaders.io');
    expect(result).toHaveLength(1);
    expect(result[0].matchType).toBe('indirect');
    expect(result[0].matchedUrls).toHaveLength(1);
    expect(result[0].matchedUrls[0].url).toBe('https://assets.cdn.openheaders.io/bundle.js');
    expect(result[0].matchedUrls[0].timestamp).toBeGreaterThan(0);
  });

  it('returns both direct and indirect matchedUrls for a rule matching both', async () => {
    seedCache(
      makeSavedData({
        'rule-1': { headerName: 'X-Debug', domains: ['*.openheaders.io'] },
      }),
    );

    addTrackedUrl(1, 'https://api.openheaders.io/data');

    const result = await getActiveRulesForTab(1, 'https://app.openheaders.io/dashboard');
    expect(result).toHaveLength(1);
    expect(result[0].matchType).toBe('direct');
    expect(result[0].matchedUrls).toHaveLength(2);
    // Direct match (tab URL)
    expect(result[0].matchedUrls[0].url).toBe('https://app.openheaders.io/dashboard');
    // Indirect match (resource URL)
    expect(result[0].matchedUrls[1].url).toBe('https://api.openheaders.io/data');
  });
});
