/**
 * RefreshManagerContext — thin IPC bridge to main-process SourceRefreshService.
 *
 * The main process owns all refresh scheduling, circuit breaking, HTTP fetching,
 * and source state updates. This context only:
 *  - Subscribes to IPC events for status/schedule updates (for UI indicators)
 *  - Exposes synchronous cache-based query methods for status and timing
 *  - Forwards manual refresh requests to main via IPC
 *
 * IMPORTANT: This context does NOT echo data back to main. When the main process
 * fetches a source, it updates WorkspaceStateService directly. The renderer
 * receives the updated sources via workspace:state-patch IPC. This context only
 * maintains supplementary caches (refresh status, next-refresh timestamps) that
 * are not part of the core workspace state.
 */

import type React from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Source } from '../../../types/source';
import { useSources } from '../../hooks/workspace';
import { createLogger } from '../../utils/error-handling/logger';

const _log = createLogger('RefreshManagerContext');

interface RefreshStatus {
  isRefreshing: boolean;
  isOverdue: boolean;
  isPaused: boolean;
  consecutiveErrors: number;
  isRetry: boolean;
  attemptNumber: number;
  failureCount: number;
  lastRefresh?: number;
  success?: boolean;
  error?: string;
  circuitBreaker: {
    state: string;
    isOpen: boolean;
    canManualBypass: boolean;
    timeUntilNextAttempt: string | null;
    timeUntilNextAttemptMs: number;
    consecutiveOpenings: number;
    currentTimeout: number;
    failureCount: number;
  };
}

interface RefreshManagerContextValue {
  isReady: () => boolean;
  manualRefresh: (sourceId: string) => Promise<boolean>;
  addSource: (source: Source) => void;
  updateSource: (source: Source) => void;
  removeSource: (sourceId: string) => Promise<void>;
  getTimeUntilRefresh: (sourceId: string, sourceData: Source | null) => number;
  getRefreshStatus: (sourceId: string) => RefreshStatus;
}

export const RefreshManagerContext = createContext<RefreshManagerContextValue | null>(null);

// Cache for async IPC results so getRefreshStatus/getTimeUntilRefresh stay synchronous
const statusCache = new Map<string, RefreshStatus>();
/** Stores the absolute nextRefresh timestamp — delta is computed on each call */
const nextRefreshCache = new Map<string, number | null>();

const DEFAULT_STATUS: RefreshStatus = {
  isRefreshing: false,
  isOverdue: false,
  isPaused: false,
  consecutiveErrors: 0,
  isRetry: false,
  attemptNumber: 0,
  failureCount: 0,
  circuitBreaker: {
    state: 'closed',
    isOpen: false,
    canManualBypass: false,
    timeUntilNextAttempt: null,
    timeUntilNextAttemptMs: 0,
    consecutiveOpenings: 0,
    currentTimeout: 0,
    failureCount: 0,
  },
};

export const RefreshManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { sources: currentSources } = useSources();
  const cleanupRefs = useRef<Array<() => void>>([]);
  const [, setRenderTick] = useState(0);
  const bumpRender = () => setRenderTick((n) => n + 1);

  // On mount, fetch current schedules from main process.
  // Schedule events during startup fire before the renderer is ready — this catches up.
  useEffect(() => {
    if (!window.electronAPI?.sourceRefresh || !currentSources.length) return;

    for (const source of currentSources) {
      if (source.sourceType === 'http') {
        window.electronAPI.sourceRefresh
          .getTimeUntilRefresh(source.sourceId)
          .then((ms) => {
            if (ms > 0) {
              nextRefreshCache.set(source.sourceId, Date.now() + ms);
              bumpRender();
            }
          })
          .catch(() => {});
      }
    }
  }, [currentSources.length]);

  useEffect(() => {
    if (!window.electronAPI?.sourceRefresh) return;

    const api = window.electronAPI.sourceRefresh;

    // Status changes — update local cache for UI indicators only.
    // Do NOT push status back to main; refresh status is a renderer-side UI concern.
    const cleanupStatus = api.onStatusChanged((data) => {
      statusCache.set(data.sourceId, data.status as unknown as RefreshStatus);
      bumpRender();
    });

    // Schedule updates — store absolute timestamp and trigger re-render.
    const cleanupSchedule = api.onScheduleUpdated((data) => {
      nextRefreshCache.set(data.sourceId, data.nextRefresh);
      bumpRender();
    });

    cleanupRefs.current = [cleanupStatus, cleanupSchedule];

    return () => {
      cleanupRefs.current.forEach((fn) => fn());
      cleanupRefs.current = [];
    };
  }, []);

  const value: RefreshManagerContextValue = {
    isReady: () => !!window.electronAPI?.sourceRefresh,

    manualRefresh: async (sourceId: string) => {
      if (!window.electronAPI?.sourceRefresh) return false;
      const result = await window.electronAPI.sourceRefresh.manualRefresh(sourceId);
      return result.success;
    },

    // These are no-ops — main process manages source lifecycle
    addSource: () => {},
    updateSource: () => {},
    removeSource: async () => {},

    getTimeUntilRefresh: (sourceId: string, _sourceData: Source | null) => {
      const nextRefresh = nextRefreshCache.get(sourceId);
      if (nextRefresh) {
        return Math.max(0, nextRefresh - Date.now());
      }

      // No cached timestamp yet — kick off async fetch in background
      if (window.electronAPI?.sourceRefresh) {
        window.electronAPI.sourceRefresh
          .getTimeUntilRefresh(sourceId)
          .then((ms) => {
            // Convert delta back to absolute timestamp for future calls
            if (ms > 0) {
              nextRefreshCache.set(sourceId, Date.now() + ms);
            }
          })
          .catch(() => {});
      }
      return 0;
    },

    getRefreshStatus: (sourceId: string) => {
      const cached = statusCache.get(sourceId);
      if (cached) return cached;

      // Kick off async fetch in background
      if (window.electronAPI?.sourceRefresh) {
        window.electronAPI.sourceRefresh
          .getRefreshStatus(sourceId)
          .then((status) => {
            statusCache.set(sourceId, {
              ...DEFAULT_STATUS,
              isRefreshing: status.isRefreshing,
              failureCount: status.failureCount,
              circuitBreaker: {
                ...DEFAULT_STATUS.circuitBreaker,
                state: status.circuitBreaker.state,
                isOpen: status.circuitBreaker.isOpen,
                timeUntilNextAttemptMs: status.circuitBreaker.timeUntilNextAttemptMs,
                failureCount: status.circuitBreaker.failureCount,
              },
            });
          })
          .catch(() => {});
      }
      return DEFAULT_STATUS;
    },
  };

  return <RefreshManagerContext.Provider value={value}>{children}</RefreshManagerContext.Provider>;
};

export const useRefreshManager = (): RefreshManagerContextValue => {
  const context = useContext(RefreshManagerContext);
  if (!context) {
    throw new Error('useRefreshManager must be used within RefreshManagerProvider');
  }
  return context;
};
