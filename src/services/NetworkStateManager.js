const { EventEmitter } = require('events');
const { BrowserWindow } = require('electron');
const { createLogger } = require('../utils/mainLogger');
const log = createLogger('NetworkStateManager');

/**
 * Centralized network state manager that maintains a single source of truth
 * for network state across the entire application.
 */
class NetworkStateManager extends EventEmitter {
  constructor() {
    super();
    
    // Single source of truth for network state
    this.state = {
      isOnline: false, // Start offline until proven otherwise
      networkQuality: 'offline', // Start with offline quality
      vpnActive: false,
      interfaces: [],
      primaryInterface: null,
      connectionType: 'unknown',
      lastCheck: Date.now(),
      lastStateChange: Date.now(),
      diagnostics: {
        dnsResolvable: false, // Start with no DNS
        internetReachable: false, // Start with no internet
        captivePortal: false,
        latency: 0
      }
    };
    
    // Debounce timer for state changes
    this.stateChangeTimer = null;
    this.pendingStateChanges = {};
  }
  
  /**
   * Get the current network state
   */
  getState() {
    return { ...this.state };
  }
  
  /**
   * Update network state with debouncing to prevent rapid changes
   */
  updateState(changes, immediate = false) {
    log.debug('State update requested', changes);
    
    // Merge pending changes
    this.pendingStateChanges = { ...this.pendingStateChanges, ...changes };
    
    if (immediate) {
      this.applyStateChanges();
    } else {
      // Debounce state changes to prevent rapid updates
      clearTimeout(this.stateChangeTimer);
      this.stateChangeTimer = setTimeout(() => {
        this.applyStateChanges();
      }, 200); // 200ms debounce
    }
  }
  
  /**
   * Apply accumulated state changes
   */
  applyStateChanges() {
    if (Object.keys(this.pendingStateChanges).length === 0) {
      return;
    }
    
    const previousState = { ...this.state };
    this.state = {
      ...this.state,
      ...this.pendingStateChanges,
      lastCheck: Date.now()
    };
    
    // Check if state actually changed
    const hasChanged = Object.keys(this.pendingStateChanges).some(
      key => previousState[key] !== this.state[key]
    );
    
    if (hasChanged) {
      this.state.lastStateChange = Date.now();
      log.info('State changed', {
        previous: previousState,
        current: this.state,
        changes: this.pendingStateChanges
      });
      
      // Emit event with change details
      this.emit('state-changed', {
        state: this.getState(),
        previousState,
        changes: this.pendingStateChanges
      });
      
      // Broadcast to all renderer processes
      this.broadcastState();
    }
    
    // Clear pending changes
    this.pendingStateChanges = {};
  }
  
  /**
   * Broadcast current state to all renderer processes
   */
  broadcastState() {
    const windows = BrowserWindow.getAllWindows();
    const stateUpdate = {
      state: this.getState(),
      timestamp: Date.now()
    };
    
    windows.forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send('network-state-sync', stateUpdate);
      }
    });
  }
  
  
  /**
   * Analyze network changes and determine appropriate actions
   */
  analyzeNetworkChange() {
    return {
      wasOffline: !this.state.isOnline,
      isNowOnline: this.state.isOnline,
      networkQualityImproved: false,
      vpnStateChanged: false,
      likelyRecovery: false,
      significantChange: false
    };
  }
}

// Export singleton instance
module.exports = new NetworkStateManager();