/**
 * Navigation Hook
 * 
 * Handles navigation requests from the main process and maps them to appropriate
 * UI actions and tab switches.
 */

import { useEffect } from 'react';
const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('useNavigation');

/**
 * Hook for handling navigation requests
 * 
 * @param {Object} deps - Dependencies
 * @param {Function} deps.setActiveTab - Sets the active tab
 * @param {Function} deps.navigate - Navigation handler function
 * @param {Object} deps.ACTIONS - Available navigation actions
 * @param {Object} deps.TARGETS - Available navigation targets
 * @param {Function} deps.setSettingsInitialTab - Sets initial settings tab
 * @param {Function} deps.setSettingsVisible - Controls settings modal visibility
 * @param {Function} deps.setSettingsAction - Sets settings action to perform
 */
export function useNavigation({ 
  setActiveTab, 
  navigate, 
  ACTIONS, 
  TARGETS, 
  setSettingsInitialTab, 
  setSettingsVisible, 
  setSettingsAction 
}) {
  useEffect(() => {
    const unsubscribe = window.electronAPI.onNavigateTo((navigation) => {
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
          let target = null;
          
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
 * @param {Object} navigation - Navigation request
 * @param {Object} TARGETS - Available targets
 * @returns {string|null} - Target or null
 */
function mapNavigationToTarget(navigation, TARGETS) {
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
        return null;
    }
  } else if (navigation.tab === 'record-viewer') {
    return TARGETS.RECORDS;
  }
  
  return null;
}

/**
 * Maps navigation action to appropriate action constant
 * @param {Object} navigation - Navigation request
 * @param {Object} ACTIONS - Available actions
 * @returns {string|null} - Action or null
 */
function mapNavigationAction(navigation, ACTIONS) {
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
  
  return null;
}

/**
 * Handles settings-specific navigation
 * @param {Object} navigation - Navigation request
 * @param {Function} setSettingsInitialTab - Sets initial settings tab
 * @param {Function} setSettingsVisible - Controls settings modal visibility
 * @param {Function} setSettingsAction - Sets settings action to perform
 */
function handleSettingsNavigation(navigation, setSettingsInitialTab, setSettingsVisible, setSettingsAction) {
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
 * @param {Object} navigation - Navigation request
 */
function handleTabFocus(navigation) {
  setTimeout(() => {
    const focusedElement = document.activeElement;
    if (focusedElement && focusedElement.closest('.ant-tabs-tab')) {
      focusedElement.blur();
    }
    
    const tabButtons = document.querySelectorAll('.ant-tabs-tab');
    tabButtons.forEach(button => {
      const tabKey = button.getAttribute('data-node-key');
      if (tabKey === navigation.tab) {
        if (!button.classList.contains('ant-tabs-tab-active')) {
          button.click();
        }
      }
    });
  }, 100);
}