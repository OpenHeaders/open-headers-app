const { EventEmitter } = require('events');
const { BrowserWindow } = require('electron');
const { createLogger } = require('../utils/mainLogger');
const timeManager = require('../core/TimeManager');
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
      lastCheck: timeManager.now(),
      lastStateChange: timeManager.now(),
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
    this.stateUpdateLock = false;
    this.stateVersion = 0; // Version counter for detecting concurrent updates
  }

  /**
   * Get the current network state
   */
  getState() {
    // Deep clone to prevent external modifications
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Update network state with debouncing to prevent rapid changes
   */
  updateState(changes, immediate = false) {
    //log.debug('State update requested', changes);

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
   * Apply accumulated state changes atomically
   */
  applyStateChanges(retryCount = 0) {
    // Prevent concurrent state updates
    if (this.stateUpdateLock) {
      if (retryCount >= 10) {
        log.error('State update retry limit exceeded, dropping changes');
        this.pendingStateChanges = {};
        return;
      }
      log.warn(`State update already in progress, queueing changes (retry ${retryCount + 1}/10)`);
      // Re-queue the update with exponential backoff
      const delay = Math.min(50 * Math.pow(2, retryCount), 1000);
      setTimeout(() => this.applyStateChanges(retryCount + 1), delay);
      return;
    }

    if (Object.keys(this.pendingStateChanges).length === 0) {
      return;
    }

    try {
      this.stateUpdateLock = true;

      // Deep clone previous state for comparison
      const previousState = JSON.parse(JSON.stringify(this.state));
      const expectedVersion = this.stateVersion;

      // Create new state object atomically
      const newState = this.mergeStateChanges(this.state, this.pendingStateChanges);
      newState.lastCheck = timeManager.now();

      // Check if state actually changed
      const hasChanged = this.hasStateChanged(previousState, newState);

      if (hasChanged) {
        newState.lastStateChange = timeManager.now();

        // Atomic state update
        this.state = newState;
        this.stateVersion++;

        // Verify version hasn't changed during update
        if (this.stateVersion !== expectedVersion + 1) {
          log.error('Concurrent state modification detected!');
          throw new Error('State version mismatch');
        }

        // Emit event with change details
        this.emit('state-changed', {
          state: this.getState(),
          previousState,
          changes: this.pendingStateChanges,
          version: this.stateVersion
        });

        // Broadcast to all renderer processes
        this.broadcastState();
      }

      // Clear pending changes
      this.pendingStateChanges = {};
    } catch (error) {
      log.error('Error applying state changes:', error);
      // Reset pending changes on error
      this.pendingStateChanges = {};
    } finally {
      this.stateUpdateLock = false;
    }
  }

  /**
   * Merge state changes deeply
   */
  mergeStateChanges(currentState, changes) {
    const newState = JSON.parse(JSON.stringify(currentState));

    for (const [key, value] of Object.entries(changes)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Deep merge for objects
        newState[key] = this.mergeStateChanges(newState[key] || {}, value);
      } else {
        // Direct assignment for primitives and arrays
        newState[key] = value;
      }
    }

    return newState;
  }

  /**
   * Check if state has actually changed
   */
  hasStateChanged(oldState, newState) {
    return JSON.stringify(oldState) !== JSON.stringify(newState);
  }

  /**
   * Broadcast current state to all renderer processes
   */
  broadcastState() {
    const windows = BrowserWindow.getAllWindows();
    const stateUpdate = {
      state: this.getState(),
      timestamp: timeManager.now(),
      version: this.stateVersion
    };

    windows.forEach(window => {
      if (!window.isDestroyed()) {
        try {
          window.webContents.send('network-state-sync', stateUpdate);
        } catch (error) {
          log.error('Failed to broadcast state to window:', error);
        }
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