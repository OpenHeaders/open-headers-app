import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
import { theme } from 'antd';

const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('NavigationContext');

// Create context
const NavigationContext = createContext();

// Action types that can be performed
export const NAVIGATION_ACTIONS = {
    HIGHLIGHT: 'highlight',
    EDIT: 'edit',
    DELETE: 'delete',
    TOGGLE: 'toggle',
    VIEW: 'view',
    CREATE: 'create',
    DUPLICATE: 'duplicate'
};

// Navigation targets
export const NAVIGATION_TARGETS = {
    RULES_HEADERS: 'rules.headers',
    RULES_PAYLOAD: 'rules.payload',
    RULES_URL: 'rules.url',
    RULES_COOKIES: 'rules.cookies',
    RULES_SCRIPTS: 'rules.scripts',
    RULES_MORE: 'rules.more',
    RECORDS: 'records',
    SOURCES: 'sources',
    ENVIRONMENTS: 'environments',
    PROXY_RULES: 'proxy.rules',
    WORKSPACES: 'workspaces'
};

export const NavigationProvider = ({ children }) => {
    // Get theme token
    const { token } = theme.useToken();
    
    // State to track current navigation intent
    const [navigationIntent, setNavigationIntent] = useState(null);
    
    // State to track highlights for different sections
    const [highlights, setHighlights] = useState({});
    
    // State to track action handlers
    const [actionHandlers, setActionHandlers] = useState({});
    
    // Ref to store pending actions
    const pendingActionsRef = useRef([]);
    
    /**
     * Navigate to a specific location with an optional action
     * @param {Object} intent - Navigation intent object
     * @param {string} intent.tab - Main tab to navigate to
     * @param {string} intent.subTab - Sub-tab within the main tab
     * @param {string} intent.target - Target section (from NAVIGATION_TARGETS)
     * @param {string} intent.action - Action to perform (from NAVIGATION_ACTIONS)
     * @param {string} intent.itemId - ID of the item to act upon
     * @param {Object} intent.data - Additional data for the action
     */
    const navigate = useCallback((intent) => {
        log.info('Navigation requested:', intent);
        
        // Focus the window when navigation is triggered (same as protocol handler)
        if (window.electronAPI?.showMainWindow) {
            window.electronAPI.showMainWindow();
        }
        
        setNavigationIntent({
            ...intent,
            timestamp: Date.now()
        });
        
        // If it's a highlight action, update highlights
        if (intent.action === NAVIGATION_ACTIONS.HIGHLIGHT && intent.target && intent.itemId) {
            setHighlights(prev => ({
                ...prev,
                [intent.target]: {
                    itemId: intent.itemId,
                    timestamp: Date.now()
                }
            }));
        }
        
        // If there's an action other than highlight, try to execute it
        if (intent.action && intent.action !== NAVIGATION_ACTIONS.HIGHLIGHT && intent.target) {
            const key = `${intent.target}.${intent.action}`;
            const handler = actionHandlers[key];
            
            if (handler) {
                // Handler already exists, execute immediately
                log.info(`Handler already registered for ${key}, executing action immediately`);
                setTimeout(() => {
                    handler(intent.itemId, intent.data || {});
                }, 500); // Small delay to ensure component is ready
            } else {
                // No handler yet, store as pending
                const pendingAction = {
                    target: intent.target,
                    action: intent.action,
                    itemId: intent.itemId,
                    data: intent.data || {},
                    timestamp: Date.now()
                };
                log.info('No handler found, storing pending action:', pendingAction);
                pendingActionsRef.current.push(pendingAction);
                log.info('Total pending actions:', pendingActionsRef.current.length);
            }
        }
    }, [actionHandlers]);
    
    /**
     * Register an action handler for a specific target
     * @param {string} target - Target section
     * @param {string} action - Action type
     * @param {Function} handler - Handler function
     */
    const registerActionHandler = useCallback((target, action, handler) => {
        const key = `${target}.${action}`;
        
        setActionHandlers(prev => ({
            ...prev,
            [key]: handler
        }));
        
        // Check if there are any pending actions for this handler
        const now = Date.now();
        pendingActionsRef.current = pendingActionsRef.current.filter(pending => {
            // Remove actions older than 10 seconds
            if (now - pending.timestamp > 10000) {
                return false;
            }
            
            // Execute matching pending actions
            if (pending.target === target && pending.action === action) {
                setTimeout(() => {
                    handler(pending.itemId, pending.data);
                }, 500); // Give more time for rules to load
                return false; // Remove from pending
            }
            
            return true; // Keep in pending
        });
        
        // Return cleanup function
        return () => {
            setActionHandlers(prev => {
                const newHandlers = { ...prev };
                delete newHandlers[key];
                return newHandlers;
            });
        };
    }, []);
    
    /**
     * Execute an action for a target
     * @param {string} target - Target section
     * @param {string} action - Action type
     * @param {string} itemId - Item ID
     * @param {Object} data - Additional data
     */
    const executeAction = useCallback((target, action, itemId, data = {}) => {
        const key = `${target}.${action}`;
        const handler = actionHandlers[key];
        
        if (handler) {
            log.debug(`Executing action: ${key} for item: ${itemId}`);
            handler(itemId, data);
        } else {
            log.warn(`No handler registered for action: ${key}`);
            // If handler not ready yet, retry after a short delay
            setTimeout(() => {
                const retryHandler = actionHandlers[key];
                if (retryHandler) {
                    log.debug(`Executing action (retry): ${key} for item: ${itemId}`);
                    retryHandler(itemId, data);
                }
            }, 500);
        }
    }, [actionHandlers]);
    
    /**
     * Clear navigation intent
     */
    const clearNavigationIntent = useCallback(() => {
        setNavigationIntent(null);
    }, []);
    
    /**
     * Clear highlight for a specific target
     * @param {string} target - Target section
     */
    const clearHighlight = useCallback((target) => {
        setHighlights(prev => {
            const newHighlights = { ...prev };
            delete newHighlights[target];
            return newHighlights;
        });
        
        // Also remove any DOM classes and inline styles
        const elements = document.querySelectorAll('.highlight-row');
        elements.forEach(el => {
            el.classList.remove('highlight-row');
            el.style.backgroundColor = '';
            // Also clear td backgrounds
            el.querySelectorAll('td').forEach(td => {
                td.style.backgroundColor = '';
            });
        });
    }, []);
    
    /**
     * Clear all highlights
     */
    const clearAllHighlights = useCallback(() => {
        // Remove all DOM classes and inline styles
        const elements = document.querySelectorAll('.highlight-row');
        elements.forEach(el => {
            el.classList.remove('highlight-row');
            el.style.backgroundColor = '';
            // Also clear td backgrounds
            el.querySelectorAll('td').forEach(td => {
                td.style.backgroundColor = '';
            });
        });
        
        setHighlights({});
    }, []);
    
    /**
     * Get highlight info for a target
     * @param {string} target - Target section
     * @returns {Object|null} - Highlight info or null
     */
    const getHighlight = useCallback((target) => {
        return highlights[target] || null;
    }, [highlights]);
    
    /**
     * Apply highlight to a DOM element
     * @param {string} target - Target section
     * @param {string} itemId - The item ID
     * @param {string} selector - Optional custom selector
     */
    const applyHighlight = useCallback((target, itemId, selector = null) => {
        const highlight = highlights[target];
        if (!highlight || highlight.itemId !== itemId) return;
        
        const elementSelector = selector || `tr[data-row-key="${itemId}"]`;
        
        // Small delay to ensure DOM is ready
        setTimeout(() => {
            const element = document.querySelector(elementSelector);
            if (element) {
                // Remove any existing highlights first
                document.querySelectorAll('.highlight-row').forEach(el => {
                    el.classList.remove('highlight-row');
                    el.style.backgroundColor = '';
                    // Also clear td backgrounds
                    el.querySelectorAll('td').forEach(td => {
                        td.style.backgroundColor = '';
                    });
                });
                
                // Scroll into view
                element.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
                
                // Add highlight class and inline styles with theme colors
                element.classList.add('highlight-row');
                
                // Use theme token colors
                const highlightColor = token.colorPrimaryBg || '#e6f7ff';
                const hoverColor = token.colorPrimaryBgHover || '#bae7ff';
                
                element.style.backgroundColor = highlightColor;
                element.style.transition = 'background-color 0.3s ease';
                
                // Apply to all td elements
                element.querySelectorAll('td').forEach(td => {
                    td.style.backgroundColor = highlightColor;
                });
                
                // Add hover effects
                element.addEventListener('mouseenter', function() {
                    this.style.backgroundColor = hoverColor;
                    this.querySelectorAll('td').forEach(td => {
                        td.style.backgroundColor = hoverColor;
                    });
                });
                
                element.addEventListener('mouseleave', function() {
                    this.style.backgroundColor = highlightColor;
                    this.querySelectorAll('td').forEach(td => {
                        td.style.backgroundColor = highlightColor;
                    });
                });
            }
        }, 300);
    }, [highlights, token]);
    
    const value = {
        // Navigation
        navigationIntent,
        navigate,
        clearNavigationIntent,
        
        // Action handlers
        registerActionHandler,
        executeAction,
        
        // Highlights
        highlights,
        clearHighlight,
        clearAllHighlights,
        getHighlight,
        applyHighlight,
        
        // Constants
        ACTIONS: NAVIGATION_ACTIONS,
        TARGETS: NAVIGATION_TARGETS
    };
    
    return (
        <NavigationContext.Provider value={value}>
            {children}
        </NavigationContext.Provider>
    );
};

// Custom hook to use navigation context
export const useNavigation = () => {
    const context = useContext(NavigationContext);
    if (!context) {
        throw new Error('useNavigation must be used within a NavigationProvider');
    }
    return context;
};