/**
 * Browser API helper types
 */

import type { Source } from '@openheaders/core';

declare const browser: typeof chrome | undefined;

/** The cross-browser API object (Firefox `browser` or Chrome `chrome`) */
export type BrowserAPI = typeof chrome;

/**
 * Get the appropriate browser API object.
 * In Firefox, `browser` is defined globally; everywhere else we fall back to `chrome`.
 */
export function getBrowserAPI(): BrowserAPI {
  return typeof browser !== 'undefined' ? browser : chrome;
}

/** Callback used to send a response back through runtime.onMessage */
export type SendResponse = (response: unknown) => void;

/** Badge states used by the badge manager */
export type BadgeState = 'none' | 'active' | 'disconnected' | 'paused';

/** Pending request info tracked by the request monitor */
export interface PendingRequest {
  tabId: number;
  url: string;
  headersApplied: boolean;
  method: string;
}

/** Active rule entry returned by getActiveRulesForTab */
export interface MatchedRequest {
  url: string;
  pattern: string;
  timestamp: number;
}

export interface ActiveRule {
  id: string;
  key: string;
  matchType: 'direct' | 'indirect';
  matchedUrls: MatchedRequest[];
  [key: string]: unknown;
}

/** Context object passed to handleGeneralMessage */
export interface MessageHandlerContext {
  getCurrentSources: () => Source[];
  isWebSocketConnected: () => boolean;
  sendViaWebSocket: (data: Record<string, unknown>) => boolean;
  scheduleUpdate: (reason: string, options?: { immediate?: boolean; sources?: Source[] }) => void;
  revalidateTrackedRequests: () => Promise<void>;
  updateBadgeCallback: () => void;
  lastSourcesHash: string;
  setLastSourcesHash: (hash: string) => void;
  lastRulesUpdateTime: number;
  setLastRulesUpdateTime: (time: number) => void;
  lastSavedDataHash: string;
  setLastSavedDataHash: (hash: string) => void;
}

/** Hotkey command stored in local storage */
export interface HotkeyCommand {
  type: 'TOGGLE_RECORDING';
  timestamp: number;
}
