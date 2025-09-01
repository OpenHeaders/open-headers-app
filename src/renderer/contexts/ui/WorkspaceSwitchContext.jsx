import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * WorkspaceSwitchContext - Simple workspace switching state
 * 
 * Provides simple state management for workspace switching with 1-second overlay.
 */

const WorkspaceSwitchContext = createContext(null);

export const WorkspaceSwitchProvider = ({ children }) => {
    const [switchState, setSwitchState] = useState({
        switching: false,
        targetWorkspace: null
    });

    /**
     * Start workspace switching process
     */
    const startSwitch = useCallback((targetWorkspace) => {
        setSwitchState({
            switching: true,
            targetWorkspace,
            startTime: Date.now()
        });
    }, []);

    /**
     * Complete workspace switching (with minimum 1 second display)
     */
    const completeSwitch = useCallback(() => {
        setSwitchState(prev => {
            if (!prev.switching) return prev;
            
            const elapsed = Date.now() - (prev.startTime || 0);
            const remainingTime = Math.max(0, 1000 - elapsed); // Minimum 1 second
            
            if (remainingTime > 0) {
                // Wait for remaining time before hiding
                setTimeout(() => {
                    setSwitchState({
                        switching: false,
                        targetWorkspace: null,
                        startTime: 0
                    });
                }, remainingTime);
                return prev; // Keep current state while waiting
            } else {
                // Hide immediately if already shown for 1+ seconds
                return {
                    switching: false,
                    targetWorkspace: null,
                    startTime: 0
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
            targetWorkspace: null
        });
    }, []);

    const contextValue = {
        // State
        switchState,
        
        // Actions
        startSwitch,
        completeSwitch,
        manualClose
    };

    return (
        <WorkspaceSwitchContext.Provider value={contextValue}>
            {children}
        </WorkspaceSwitchContext.Provider>
    );
};

/**
 * Hook to use workspace switching context
 */
export const useWorkspaceSwitch = () => {
    const context = useContext(WorkspaceSwitchContext);
    if (!context) {
        throw new Error('useWorkspaceSwitch must be used within WorkspaceSwitchProvider');
    }
    return context;
};

