import type React from 'react';
import { createContext, useCallback, useContext, useState } from 'react';

/**
 * WorkspaceSwitchContext - Simple workspace switching state
 *
 * Provides simple state management for workspace switching with 1-second overlay.
 */

interface TargetWorkspace {
  id?: string;
  name?: string;
  type?: string;
}

interface SwitchState {
  switching: boolean;
  targetWorkspace: TargetWorkspace | null;
  startTime?: number;
}

interface WorkspaceSwitchContextValue {
  switchState: SwitchState;
  startSwitch: (targetWorkspace: TargetWorkspace | null) => void;
  completeSwitch: () => void;
  manualClose: () => void;
}

const WorkspaceSwitchContext = createContext<WorkspaceSwitchContextValue | null>(null);

export const WorkspaceSwitchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [switchState, setSwitchState] = useState<SwitchState>({
    switching: false,
    targetWorkspace: null,
  });

  /**
   * Start workspace switching process
   */
  const startSwitch = useCallback((targetWorkspace: TargetWorkspace | null) => {
    setSwitchState({
      switching: true,
      targetWorkspace,
      startTime: Date.now(),
    });
  }, []);

  /**
   * Complete workspace switching (with minimum 1 second display)
   */
  const completeSwitch = useCallback(() => {
    setSwitchState((prev) => {
      if (!prev.switching) return prev;

      const elapsed = Date.now() - (prev.startTime ?? 0);
      const remainingTime = Math.max(0, 1000 - elapsed); // Minimum 1 second

      if (remainingTime > 0) {
        // Wait for remaining time before hiding
        setTimeout(() => {
          setSwitchState({
            switching: false,
            targetWorkspace: null,
            startTime: 0,
          });
        }, remainingTime);
        return prev; // Keep current state while waiting
      } else {
        // Hide immediately if already shown for 1+ seconds
        return {
          switching: false,
          targetWorkspace: null,
          startTime: 0,
        };
      }
    });
  }, []);

  /**
   * Manually close the overlay
   */
  const manualClose = useCallback(() => {
    setSwitchState({
      switching: false,
      targetWorkspace: null,
    });
  }, []);

  const contextValue: WorkspaceSwitchContextValue = {
    // State
    switchState,

    // Actions
    startSwitch,
    completeSwitch,
    manualClose,
  };

  return <WorkspaceSwitchContext.Provider value={contextValue}>{children}</WorkspaceSwitchContext.Provider>;
};

/**
 * Hook to use workspace switching context
 */
export const useWorkspaceSwitch = (): WorkspaceSwitchContextValue => {
  const context = useContext(WorkspaceSwitchContext);
  if (!context) {
    throw new Error('useWorkspaceSwitch must be used within WorkspaceSwitchProvider');
  }
  return context;
};
