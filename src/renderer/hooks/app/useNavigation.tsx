/**
 * Navigation Hook
 *
 * Handles navigation requests from the main process and maps them to appropriate
 * UI actions and tab switches.
 */

import { useEffect } from 'react';
import { createLogger } from '../../utils/error-handling/logger';
const log = createLogger('useNavigation');

interface NavigationRequest {
  tab?: string;
  subTab?: string;
  itemId?: string;
  action?: string;
  settingsTab?: string;
  value?: string | boolean;
}

export interface NavigationIntent {
  tab?: string;
  subTab?: string;
  target?: string;
  action?: string;
  itemId?: string;
}

export interface SettingsAction {
  action: string;
  value?: unknown;
}

interface UseNavigationDeps {
  setActiveTab: (tab: string) => void;
  navigate: (intent: NavigationIntent) => void;
  ACTIONS: Record<string, string>;
  TARGETS: Record<string, string>;
  setSettingsInitialTab: (tab: string | null) => void;
  setSettingsVisible: (visible: boolean) => void;
  setSettingsAction: (action: SettingsAction) => void;
}

/**
 * Hook for handling navigation requests
 */
export function useNavigation({
  setActiveTab,
  navigate,
  ACTIONS,
  TARGETS,
  setSettingsInitialTab,
  setSettingsVisible,
  setSettingsAction
}: UseNavigationDeps): void {
  useEffect(() => {
    const unsubscribe = window.electronAPI.onNavigateTo((navigation: NavigationRequest) => {
      log.info('Received navigation request:', navigation);

      // Always focus the window when navigation is requested
      if (window.electronAPI?.showMainWindow) {
        window.electronAPI.showMainWindow();
      }

      if (navigation.tab) {
        // Handle settings navigation separately (before changing active tab)
        if (navigation.tab === 'settings') {
          handleSettingsNavigation(navigation, setSettingsInitialTab, setSettingsVisible, setSettingsAction);
          return;
        }

        // For non-settings tabs, change the active tab
        setActiveTab(navigation.tab);

        if (navigation.subTab || navigation.itemId || navigation.action) {
          let target: string | undefined;

          // Map navigation requests to appropriate targets
          target = mapNavigationToTarget(navigation, TARGETS);

          if (target) {
            const action = mapNavigationAction(navigation, ACTIONS);

            navigate({
              tab: navigation.tab,
              subTab: navigation.subTab,
              target: target,
              action: action,
              itemId: navigation.itemId
            });
          }
        }

        // Handle tab focus after navigation
        handleTabFocus(navigation);
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [navigate, ACTIONS, TARGETS, setActiveTab, setSettingsInitialTab, setSettingsVisible, setSettingsAction]);
}

/**
 * Maps navigation request to appropriate target
 */
function mapNavigationToTarget(navigation: NavigationRequest, TARGETS: Record<string, string>): string | undefined {
  if (navigation.tab === 'rules') {
    switch (navigation.subTab) {
      case 'headers':
        return TARGETS.RULES_HEADERS;
      case 'payload':
        return TARGETS.RULES_PAYLOAD;
      case 'url':
      case 'query-params':
        navigation.subTab = 'url';
        return TARGETS.RULES_URL;
      case 'scripts':
      case 'inject':
        navigation.subTab = 'scripts';
        return TARGETS.RULES_SCRIPTS;
      case 'block':
      case 'redirect':
        navigation.subTab = 'more';
        return TARGETS.RULES_MORE;
      default:
        return undefined;
    }
  } else if (navigation.tab === 'record-viewer') {
    return TARGETS.RECORDS;
  }

  return undefined;
}

/**
 * Maps navigation action to appropriate action constant
 */
function mapNavigationAction(navigation: NavigationRequest, ACTIONS: Record<string, string>): string | undefined {
  if (navigation.action) {
    switch (navigation.action) {
      case 'edit': return ACTIONS.EDIT;
      case 'delete': return ACTIONS.DELETE;
      case 'toggle': return ACTIONS.TOGGLE;
      case 'view': return ACTIONS.VIEW;
      case 'create': return ACTIONS.CREATE;
      case 'duplicate': return ACTIONS.DUPLICATE;
      default: return ACTIONS.HIGHLIGHT;
    }
  } else if (navigation.itemId) {
    return ACTIONS.HIGHLIGHT;
  }

  return undefined;
}

/**
 * Handles settings-specific navigation
 */
function handleSettingsNavigation(
  navigation: NavigationRequest,
  setSettingsInitialTab: (tab: string | null) => void,
  setSettingsVisible: (visible: boolean) => void,
  setSettingsAction: (action: SettingsAction) => void
): void {
  // Handle settings tab navigation
  if (navigation.settingsTab === 'workflows') {
    setSettingsInitialTab('3');
  } else if (navigation.settingsTab === 'general') {
    setSettingsInitialTab('1');
  } else if (navigation.settingsTab === 'appearance') {
    setSettingsInitialTab('2');
  }

  setSettingsVisible(true);

  // Handle specific settings actions
  if (navigation.action === 'toggleVideoRecording' && navigation.value !== undefined) {
    setSettingsAction({
      action: navigation.action,
      value: navigation.value === 'true' || navigation.value === true
    });
  } else if (navigation.action === 'editHotkey') {
    setSettingsAction({
      action: navigation.action
    });
  } else if (navigation.action === 'toggleRecordingHotkey' && navigation.value !== undefined) {
    setSettingsAction({
      action: navigation.action,
      value: navigation.value === 'true' || navigation.value === true
    });
  }
}

/**
 * Handles tab focus after navigation
 */
function handleTabFocus(navigation: NavigationRequest): void {
  requestAnimationFrame(() => {
    const focusedElement = document.activeElement as HTMLElement;
    if (focusedElement && focusedElement.closest('.ant-tabs-tab')) {
      focusedElement.blur();
    }

    const tabButtons = document.querySelectorAll('.ant-tabs-tab');
    tabButtons.forEach(button => {
      const tabKey = button.getAttribute('data-node-key');
      if (tabKey === navigation.tab) {
        if (!button.classList.contains('ant-tabs-tab-active')) {
          (button as HTMLElement).click();
        }
      }
    });
  });
}
