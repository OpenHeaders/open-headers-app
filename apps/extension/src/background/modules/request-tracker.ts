/**
 * Request Tracker - Tracks which tabs are making requests to domains with rules
 */

import type { HeaderEntry, SavedDataMap } from '@openheaders/core';
import { storage, tabs } from '@utils/browser-api.js';
import { getChunkedData } from '@utils/storage-chunking.js';
import { sendMessageWithCallback } from '@utils/messaging';
import type { ActiveRule, MatchedRequest } from '@/types/browser';
import {
  clearPatternCache,
  doesUrlMatchPattern,
  isTrackableUrl,
  normalizeUrlForTracking,
  precompileAllPatterns,
} from './url-utils';

// Constants
const REVALIDATION_QUEUE = new Set<number>(); // Track pending revalidations
let isRevalidating = false; // Prevent concurrent revalidations

// Track which tabs are making requests to domains with rules.
// Map<tabId, Map<normalizedUrl, timestamp>> — timestamp enables
// the Active tab to show when each request was intercepted.
export const tabsWithActiveRules: Map<number, Map<string, number>> = new Map();

// ── In-memory savedData cache ──────────────────────────────────────
let cachedSavedData: SavedDataMap | null = null;
let cacheInitialized = false;

/** Warm the cache from storage (called once at startup) */
function ensureCache(callback: (data: SavedDataMap) => void): void {
  if (cacheInitialized && cachedSavedData !== null) {
    callback(cachedSavedData);
    return;
  }
  refreshSavedDataCache(() => {
    callback(cachedSavedData!);
  });
}

/** Force-refresh the cache from storage right now and pre-compile URL patterns */
export function refreshSavedDataCache(callback?: () => void): void {
  getChunkedData('savedData', (data: SavedDataMap | null) => {
    cachedSavedData = data || {};
    cacheInitialized = true;

    // Pre-compile all domain patterns for fast matching
    clearPatternCache();
    const allDomains: string[] = [];
    for (const id in cachedSavedData) {
      const entry = cachedSavedData[id];
      if (entry.isEnabled !== false && entry.domains) {
        allDomains.push(...entry.domains);
      }
    }
    if (allDomains.length > 0) {
      precompileAllPatterns(allDomains);
    }

    if (callback) callback();
  });
}

// Listen for storage changes that affect savedData and auto-refresh cache
storage.onChanged.addListener((changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
  if (area === 'sync') {
    const hasDataChange =
      changes.savedData ||
      changes.savedData_chunked ||
      Object.keys(changes).some((key) => key.startsWith('savedData_chunk_'));
    if (hasDataChange) {
      refreshSavedDataCache();
    }
  }
});

/**
 * Check if a URL matches any active rule
 */
export async function checkIfUrlMatchesAnyRule(url: string): Promise<boolean> {
  const normalizedUrl = normalizeUrlForTracking(url);

  return new Promise<boolean>((resolve) => {
    ensureCache((savedData: SavedDataMap) => {
      // Check if this URL matches any rule (enabled or disabled).
      // Disabled rules still need tracking so the Active tab can show
      // them as indirect matches with the toggle off.
      for (const id in savedData) {
        const entry: HeaderEntry = savedData[id];

        const domains: string[] = entry.domains || [];
        for (const domain of domains) {
          if (doesUrlMatchPattern(normalizedUrl, domain)) {
            resolve(true);
            return;
          }
        }
      }

      resolve(false);
    });
  });
}

/**
 * Get all matching rules for a specific tab (direct and indirect matches).
 * Returns both enabled and disabled rules so the Active tab can show
 * everything that matches this domain and let the user toggle them.
 */
export async function getActiveRulesForTab(tabId: number | undefined, tabUrl: string): Promise<ActiveRule[]> {
  if (!tabUrl || !isTrackableUrl(tabUrl)) {
    return [];
  }

  // Get tracked resource URLs with timestamps for this tab (indirect matches)
  const trackedResources: Map<string, number> = new Map();
  if (tabId && tabsWithActiveRules.has(tabId)) {
    const tracked = tabsWithActiveRules.get(tabId)!;
    for (const [url, ts] of tracked) {
      trackedResources.set(url, ts);
    }
  }

  return new Promise<ActiveRule[]>((resolve) => {
    ensureCache((savedData: SavedDataMap) => {
      const activeRules: ActiveRule[] = [];

      for (const id in savedData) {
        const entry: HeaderEntry = savedData[id];

        const domains: string[] = entry.domains || [];
        let matchType: 'direct' | 'indirect' | null = null;

        // Collect matched URLs with the pattern that matched them
        const matchedUrls: MatchedRequest[] = [];

        const now = Date.now();

        // Check if rule applies to all domains
        if (domains.length === 0) {
          matchType = 'direct'; // Rules without domains apply everywhere
          matchedUrls.push({ url: tabUrl, pattern: '*', timestamp: now });
          for (const [resourceUrl, ts] of trackedResources) {
            matchedUrls.push({ url: resourceUrl, pattern: '*', timestamp: ts });
          }
        } else {
          // Check for direct match (main page domain)
          for (const domain of domains) {
            if (doesUrlMatchPattern(tabUrl, domain)) {
              matchType = 'direct';
              matchedUrls.push({ url: tabUrl, pattern: domain, timestamp: now });
              break;
            }
          }

          // Check resource URLs — collect ALL matching ones regardless of direct match
          if (trackedResources.size > 0) {
            for (const [resourceUrl, ts] of trackedResources) {
              for (const domain of domains) {
                if (doesUrlMatchPattern(resourceUrl, domain)) {
                  matchedUrls.push({ url: resourceUrl, pattern: domain, timestamp: ts });
                  if (!matchType) matchType = 'indirect';
                  break;
                }
              }
            }
          }
        }

        if (matchType) {
          activeRules.push({
            ...entry,
            id: id,
            key: id,
            matchType,
            matchedUrls,
          });
        }
      }

      resolve(activeRules);
    });
  });
}

/**
 * Re-evaluate tracked requests when rules change
 */
export async function revalidateTrackedRequests(): Promise<void> {
  // Add to queue if already revalidating
  if (isRevalidating) {
    REVALIDATION_QUEUE.add(Date.now());
    return;
  }

  isRevalidating = true;

  try {
    await new Promise<void>((resolve) => {
      ensureCache(async (savedData: SavedDataMap) => {
        const allRules: [string, HeaderEntry][] = Object.entries(savedData);

        // If no rules at all, clear all tracking
        if (allRules.length === 0) {
          tabsWithActiveRules.clear();
          resolve();
          return;
        }

        // For each tracked tab, re-evaluate if its requests still match any rule
        // (enabled or disabled — tracking represents observed resource domains,
        // not rule enable state, so disabled rules keep their tracked URLs)
        for (const [tabId, trackedUrls] of tabsWithActiveRules.entries()) {
          const validUrls = new Map<string, number>();

          // Check each tracked URL against all rules
          for (const [url, ts] of trackedUrls) {
            let stillMatches = false;

            for (const [_id, entry] of allRules) {
              const domains: string[] = entry.domains || [];
              for (const domain of domains) {
                if (doesUrlMatchPattern(url, domain)) {
                  stillMatches = true;
                  break;
                }
              }
              if (stillMatches) break;
            }

            if (stillMatches) {
              validUrls.set(url, ts);
            }
          }

          // Update or remove the tab's tracking based on results
          if (validUrls.size > 0) {
            tabsWithActiveRules.set(tabId, validUrls);
          } else {
            tabsWithActiveRules.delete(tabId);
          }
        }

        resolve();
      });
    });
  } finally {
    isRevalidating = false;

    // Process any queued revalidations
    if (REVALIDATION_QUEUE.size > 0) {
      REVALIDATION_QUEUE.clear();
      setTimeout(() => revalidateTrackedRequests(), 100);
    }
  }
}

/**
 * Restore tracking state after service worker restart
 */
export async function restoreTrackingState(updateBadgeCallback: () => void): Promise<void> {
  // Get all tabs
  tabs.query({}, async (allTabs: chrome.tabs.Tab[]) => {
    for (const tab of allTabs) {
      if (tab.url && tab.id && isTrackableUrl(tab.url)) {
        const matchesRule = await checkIfUrlMatchesAnyRule(tab.url);
        if (matchesRule) {
          if (!tabsWithActiveRules.has(tab.id)) {
            tabsWithActiveRules.set(tab.id, new Map());
          }
          tabsWithActiveRules.get(tab.id)!.set(normalizeUrlForTracking(tab.url), Date.now());
        }
      }
    }

    // Update badge for current tab
    if (updateBadgeCallback) {
      updateBadgeCallback();
    }
  });
}

/**
 * Add a tracked URL for a tab
 */
export function addTrackedUrl(tabId: number, url: string): void {
  if (!tabsWithActiveRules.has(tabId)) {
    tabsWithActiveRules.set(tabId, new Map());
  }

  const trackedUrls = tabsWithActiveRules.get(tabId)!;

  // Skip if already tracked (no-op, no notification needed)
  if (trackedUrls.has(url)) return;

  trackedUrls.set(url, Date.now());

  // Notify the popup (if open) that tracked URLs changed
  sendMessageWithCallback({ type: 'trackedUrlsUpdated', tabId }, () => {});
}

/**
 * Clear all tracking
 */
export function clearAllTracking(): void {
  tabsWithActiveRules.clear();
}
