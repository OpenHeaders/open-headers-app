import type { JsonValue } from '@openheaders/core';
import { theme } from 'antd';
import type React from 'react';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createLogger } from '@/renderer/utils/error-handling/logger';

const log = createLogger('NavigationContext');

/** Arbitrary key/value metadata passed to navigation action handlers. */
type NavigationActionData = Record<string, JsonValue>;

interface NavigationIntent {
  tab?: string;
  subTab?: string;
  target?: string;
  action?: string;
  itemId?: string;
  data?: NavigationActionData;
  timestamp?: number;
}

interface HighlightInfo {
  itemId: string;
  timestamp: number;
}

interface PendingAction {
  target: string;
  action: string;
  itemId: string;
  data: NavigationActionData;
  timestamp: number;
}

interface NavigationContextValue {
  navigationIntent: NavigationIntent | null;
  navigate: (intent: NavigationIntent) => void;
  clearNavigationIntent: () => void;
  registerActionHandler: (
    target: string,
    action: string,
    handler: (itemId: string, data: NavigationActionData) => void,
  ) => () => void;
  flushPendingActions: (target: string) => void;
  executeAction: (target: string, action: string, itemId: string, data?: NavigationActionData) => void;
  highlights: Record<string, HighlightInfo>;
  clearHighlight: (target: string) => void;
  clearAllHighlights: () => void;
  getHighlight: (target: string) => HighlightInfo | null;
  applyHighlight: (target: string, itemId: string, selector?: string | null) => void;
  ACTIONS: typeof NAVIGATION_ACTIONS;
  TARGETS: typeof NAVIGATION_TARGETS;
}

// Create context
const NavigationContext = createContext<NavigationContextValue | null>(null);

// Action types that can be performed
export const NAVIGATION_ACTIONS = {
  HIGHLIGHT: 'highlight',
  EDIT: 'edit',
  DELETE: 'delete',
  TOGGLE: 'toggle',
  VIEW: 'view',
  CREATE: 'create',
  DUPLICATE: 'duplicate',
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
  WORKSPACES: 'workspaces',
};

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Get theme token
  const { token } = theme.useToken();

  // State to track current navigation intent
  const [navigationIntent, setNavigationIntent] = useState<NavigationIntent | null>(null);

  // State to track highlights for different sections
  const [highlights, setHighlights] = useState<Record<string, HighlightInfo>>({});

  // Action handlers stored in a ref so navigate/executeAction always see the
  // latest registrations without stale-closure issues. State is kept in sync
  // purely to trigger re-renders when the set of handlers changes (e.g. for
  // context consumers that depend on handler availability).
  const actionHandlersRef = useRef<Record<string, (itemId: string, data: NavigationActionData) => void>>({});
  const [, setActionHandlersVersion] = useState(0);

  // Ref to store pending actions
  const pendingActionsRef = useRef<PendingAction[]>([]);

  /**
   * Navigate to a specific location with an optional action
   */
  const navigate = useCallback((intent: NavigationIntent) => {
    log.info('Navigation requested:', intent);

    // Focus the window when navigation is triggered (same as protocol handler)
    window.electronAPI?.showMainWindow?.();

    setNavigationIntent({
      ...intent,
      timestamp: Date.now(),
    });

    // If it's a highlight action, update highlights
    if (intent.action === NAVIGATION_ACTIONS.HIGHLIGHT && intent.target && intent.itemId) {
      setHighlights((prev) => ({
        ...prev,
        [intent.target!]: {
          itemId: intent.itemId!,
          timestamp: Date.now(),
        },
      }));
    }

    // If there's an action other than highlight, try to execute it
    if (intent.action && intent.action !== NAVIGATION_ACTIONS.HIGHLIGHT && intent.target) {
      const key = `${intent.target}.${intent.action}`;
      const handler = actionHandlersRef.current[key];

      if (handler) {
        // Handler already exists — wait one frame so React flushes
        // the tab-switch state update before the action fires.
        log.info(`Handler already registered for ${key}, executing action immediately`);
        requestAnimationFrame(() => {
          handler(intent.itemId!, intent.data || {});
        });
      } else {
        // No handler yet, store as pending
        const pendingAction: PendingAction = {
          target: intent.target,
          action: intent.action,
          itemId: intent.itemId!,
          data: intent.data || {},
          timestamp: Date.now(),
        };
        log.info('No handler found, storing pending action:', pendingAction);
        pendingActionsRef.current.push(pendingAction);
        log.info('Total pending actions:', pendingActionsRef.current.length);
      }
    }
  }, []); // stable — reads from ref, never stale

  /**
   * Register an action handler for a specific target
   */
  const registerActionHandler = useCallback(
    (target: string, action: string, handler: (itemId: string, data: NavigationActionData) => void): (() => void) => {
      const key = `${target}.${action}`;

      actionHandlersRef.current = { ...actionHandlersRef.current, [key]: handler };
      setActionHandlersVersion((v) => v + 1);

      // Pending actions are NOT executed here — the component must call
      // flushPendingActions(target) once its data is loaded.

      // Return cleanup function
      return () => {
        const updated = { ...actionHandlersRef.current };
        delete updated[key];
        actionHandlersRef.current = updated;
        setActionHandlersVersion((v) => v + 1);
      };
    },
    [],
  );

  /**
   * Flush pending actions for a target. Components call this after their
   * data has loaded so actions execute against populated state, not empty.
   */
  const flushPendingActions = useCallback((target: string) => {
    const now = Date.now();
    pendingActionsRef.current = pendingActionsRef.current.filter((pending) => {
      if (now - pending.timestamp > 10000) return false;

      if (pending.target === target) {
        const key = `${pending.target}.${pending.action}`;
        const handler = actionHandlersRef.current[key];
        if (handler) {
          log.info(`Flushing pending action: ${key} for item: ${pending.itemId}`);
          handler(pending.itemId, pending.data);
          return false;
        }
      }
      return true;
    });
  }, []);

  /**
   * Execute an action for a target
   */
  const executeAction = useCallback(
    (target: string, action: string, itemId: string, data: NavigationActionData = {}) => {
      const key = `${target}.${action}`;
      const handler = actionHandlersRef.current[key];

      if (handler) {
        log.debug(`Executing action: ${key} for item: ${itemId}`);
        handler(itemId, data);
      } else {
        log.warn(`No handler registered for action: ${key}`);
        // If handler not ready yet, retry after next frame
        requestAnimationFrame(() => {
          const retryHandler = actionHandlersRef.current[key];
          if (retryHandler) {
            log.debug(`Executing action (retry): ${key} for item: ${itemId}`);
            retryHandler(itemId, data);
          }
        });
      }
    },
    [],
  ); // stable — reads from ref

  /**
   * Clear navigation intent
   */
  const clearNavigationIntent = useCallback(() => {
    setNavigationIntent(null);
  }, []);

  /**
   * Clear highlight for a specific target
   */
  const clearHighlight = useCallback((target: string) => {
    setHighlights((prev) => {
      const newHighlights = { ...prev };
      delete newHighlights[target];
      return newHighlights;
    });

    // Also remove any DOM classes and inline styles
    const elements = document.querySelectorAll('.highlight-row');
    elements.forEach((el) => {
      el.classList.remove('highlight-row');
      (el as HTMLElement).style.backgroundColor = '';
      // Also clear td backgrounds
      el.querySelectorAll('td').forEach((td) => {
        (td as HTMLElement).style.backgroundColor = '';
      });
    });
  }, []);

  /**
   * Clear all highlights
   */
  const clearAllHighlights = useCallback(() => {
    // Remove all DOM classes and inline styles
    const elements = document.querySelectorAll('.highlight-row');
    elements.forEach((el) => {
      el.classList.remove('highlight-row');
      (el as HTMLElement).style.backgroundColor = '';
      // Also clear td backgrounds
      el.querySelectorAll('td').forEach((td) => {
        (td as HTMLElement).style.backgroundColor = '';
      });
    });

    setHighlights({});
  }, []);

  /**
   * Get highlight info for a target
   */
  const getHighlight = useCallback(
    (target: string): HighlightInfo | null => {
      return highlights[target] || null;
    },
    [highlights],
  );

  /**
   * Apply highlight to a DOM element
   */
  const applyHighlight = useCallback(
    (target: string, itemId: string, selector: string | null = null) => {
      const highlight = highlights[target];
      if (!highlight || highlight.itemId !== itemId) return;

      const elementSelector = selector || `tr[data-row-key="${itemId}"]`;

      // Wait for next paint so React has flushed DOM updates
      requestAnimationFrame(() => {
        const element = document.querySelector(elementSelector) as HTMLElement;
        if (element) {
          // Remove any existing highlights first
          document.querySelectorAll('.highlight-row').forEach((el) => {
            el.classList.remove('highlight-row');
            (el as HTMLElement).style.backgroundColor = '';
            // Also clear td backgrounds
            el.querySelectorAll('td').forEach((td) => {
              (td as HTMLElement).style.backgroundColor = '';
            });
          });

          // Scroll into view
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });

          // Add highlight class and inline styles with theme colors
          element.classList.add('highlight-row');

          // Use theme token colors
          const highlightColor = token.colorPrimaryBg || '#e6f7ff';
          const hoverColor = token.colorPrimaryBgHover || '#bae7ff';

          element.style.backgroundColor = highlightColor;
          element.style.transition = 'background-color 0.3s ease';

          // Apply to all td elements
          element.querySelectorAll('td').forEach((td) => {
            (td as HTMLElement).style.backgroundColor = highlightColor;
          });

          // Add hover effects
          element.addEventListener('mouseenter', function (this: HTMLElement) {
            this.style.backgroundColor = hoverColor;
            this.querySelectorAll('td').forEach((td) => {
              (td as HTMLElement).style.backgroundColor = hoverColor;
            });
          });

          element.addEventListener('mouseleave', function (this: HTMLElement) {
            this.style.backgroundColor = highlightColor;
            this.querySelectorAll('td').forEach((td) => {
              (td as HTMLElement).style.backgroundColor = highlightColor;
            });
          });
        }
      });
    },
    [highlights, token],
  );

  const value: NavigationContextValue = {
    // Navigation
    navigationIntent,
    navigate,
    clearNavigationIntent,

    // Action handlers
    registerActionHandler,
    flushPendingActions,
    executeAction,

    // Highlights
    highlights,
    clearHighlight,
    clearAllHighlights,
    getHighlight,
    applyHighlight,

    // Constants
    ACTIONS: NAVIGATION_ACTIONS,
    TARGETS: NAVIGATION_TARGETS,
  };

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
};

// Custom hook to use navigation context
export const useNavigation = (): NavigationContextValue => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};

export { NavigationContext };
