/**
 * TotpContext — renderer-side TOTP state for UI display.
 *
 * Cooldown tracking is owned by main-process TotpCooldownTracker.
 * This context polls main via IPC for cooldown state and provides
 * synchronous access to cached values for component rendering.
 */

import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useWorkspaces } from '../data';

interface TotpContextValue {
  canUseTotpForSource: (sourceId: string) => boolean;
  getCooldownSecondsForSource: (sourceId: string) => number;
  trackTotpSource: (sourceId: string) => void;
  untrackTotpSource: (sourceId: string) => void;
  // Legacy method names for backward compatibility
  canUseTotpSecret: (sourceId: string) => boolean;
  getCooldownSeconds: (sourceId: string) => number;
  trackTotpSecret: (sourceId: string) => void;
  untrackTotpSecret: (sourceId: string) => void;
}

export const TotpContext = createContext<TotpContextValue | undefined>(undefined);

export const useTotpState = (): TotpContextValue => {
  const context = useContext(TotpContext);
  if (!context) {
    throw new Error('useTotpState must be used within TotpProvider');
  }
  return context;
};

export const TotpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeWorkspaceId } = useWorkspaces();

  // Local cache of cooldown state — polled from main process
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const trackedSourcesRef = useRef<Set<string>>(new Set());
  const [hasActiveCooldowns, setHasActiveCooldowns] = useState(false);
  const monitoringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check if a source can use TOTP (reads from local cache)
  const canUseTotpForSource = useCallback(
    (sourceId: string): boolean => {
      if (!sourceId) return true;
      return (cooldowns[sourceId] || 0) <= 0;
    },
    [cooldowns],
  );

  // Get cooldown remaining seconds (reads from local cache)
  const getCooldownSecondsForSource = useCallback(
    (sourceId: string): number => {
      if (!sourceId) return 0;
      return cooldowns[sourceId] || 0;
    },
    [cooldowns],
  );

  // Poll main process for cooldown state
  useEffect(() => {
    const checkAllCooldowns = async (): Promise<boolean> => {
      const allSourceIds = new Set<string>();
      Object.keys(cooldowns).forEach((id) => allSourceIds.add(id));
      trackedSourcesRef.current.forEach((id) => allSourceIds.add(id));

      if (allSourceIds.size === 0) return false;

      const newCooldowns: Record<string, number> = {};
      let stillActive = false;

      for (const sourceId of allSourceIds) {
        try {
          const info = await window.electronAPI.httpRequest.getTotpCooldown(activeWorkspaceId, sourceId);
          if (info.inCooldown) {
            newCooldowns[sourceId] = info.remainingSeconds;
            stillActive = true;
          }
        } catch (e) {
          // IPC not ready yet — skip
        }
      }

      setCooldowns(newCooldowns);
      return stillActive;
    };

    const startMonitoring = () => {
      if (monitoringIntervalRef.current) return;

      checkAllCooldowns().then((hasActive) => {
        if (hasActive) {
          monitoringIntervalRef.current = setInterval(() => {
            checkAllCooldowns().then((stillActive) => {
              if (!stillActive && monitoringIntervalRef.current) {
                clearInterval(monitoringIntervalRef.current);
                monitoringIntervalRef.current = null;
                setHasActiveCooldowns(false);
              }
            });
          }, 1000);
        } else {
          setHasActiveCooldowns(false);
        }
      });
    };

    if (hasActiveCooldowns) {
      startMonitoring();
    }

    return () => {
      if (monitoringIntervalRef.current) {
        clearInterval(monitoringIntervalRef.current);
        monitoringIntervalRef.current = null;
      }
    };
  }, [hasActiveCooldowns]);

  const trackTotpSource = useCallback((sourceId: string): void => {
    if (!sourceId) return;
    trackedSourcesRef.current.add(sourceId);

    window.electronAPI.httpRequest
      .getTotpCooldown(activeWorkspaceId, sourceId)
      .then((info) => {
        if (info.inCooldown) {
          setCooldowns((prev) => ({ ...prev, [sourceId]: info.remainingSeconds }));
          setHasActiveCooldowns(true);
        }
      })
      .catch(() => {
        /* IPC not ready */
      });
  }, []);

  const untrackTotpSource = useCallback((sourceId: string): void => {
    if (!sourceId) return;
    trackedSourcesRef.current.delete(sourceId);
    setCooldowns((prev) => {
      const next = { ...prev };
      delete next[sourceId];
      return next;
    });
  }, []);

  const value: TotpContextValue = {
    canUseTotpForSource,
    getCooldownSecondsForSource,
    trackTotpSource,
    untrackTotpSource,
    // Legacy aliases
    canUseTotpSecret: canUseTotpForSource,
    getCooldownSeconds: getCooldownSecondsForSource,
    trackTotpSecret: trackTotpSource,
    untrackTotpSecret: untrackTotpSource,
  };

  return <TotpContext.Provider value={value}>{children}</TotpContext.Provider>;
};
