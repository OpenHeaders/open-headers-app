import { EventEmitter } from 'node:events';
import type { BrowserWindow as BrowserWindowType } from 'electron';
import electron from 'electron';
import timeManager from '@/services/core/TimeManager';
import mainLogger from '@/utils/mainLogger';

const { BrowserWindow } = electron;
const { createLogger } = mainLogger;
const log = createLogger('NetworkStateManager');

export interface NetworkDiagnostics {
  dnsResolvable: boolean;
  internetReachable: boolean;
  captivePortal: boolean;
  latency: number;
}

export interface NetworkManagerState {
  isOnline: boolean;
  networkQuality: string;
  vpnActive: boolean;
  interfaces: string[];
  primaryInterface: string | null;
  connectionType: string;
  lastCheck: number;
  lastStateChange: number;
  diagnostics: NetworkDiagnostics;
}

export interface NetworkAnalysis {
  wasOffline: boolean;
  isNowOnline: boolean;
  networkQualityImproved: boolean;
  vpnStateChanged: boolean;
  likelyRecovery: boolean;
  significantChange: boolean;
}

/**
 * Centralized network state manager that maintains a single source of truth
 * for network state across the entire application.
 */
class NetworkStateManager extends EventEmitter {
  // Single source of truth for network state
  state: NetworkManagerState;

  // Debounce timer for state changes
  private stateChangeTimer: ReturnType<typeof setTimeout> | undefined;
  pendingStateChanges: Partial<NetworkManagerState> = {};
  stateUpdateLock = false;
  stateVersion = 0; // Version counter for detecting concurrent updates

  constructor() {
    super();

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
        latency: 0,
      },
    };
  }

  /**
   * Get the current network state
   */
  getState(): NetworkManagerState {
    // Deep clone to prevent external modifications
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Update network state with debouncing to prevent rapid changes
   */
  updateState(changes: Partial<NetworkManagerState>, immediate = false): void {
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
  applyStateChanges(retryCount = 0): void {
    // Prevent concurrent state updates
    if (this.stateUpdateLock) {
      if (retryCount >= 10) {
        log.error('State update retry limit exceeded, dropping changes');
        this.pendingStateChanges = {};
        return;
      }
      log.warn(`State update already in progress, queueing changes (retry ${retryCount + 1}/10)`);
      // Re-queue the update with exponential backoff
      const delay = Math.min(50 * 2 ** retryCount, 1000);
      setTimeout(() => this.applyStateChanges(retryCount + 1), delay);
      return;
    }

    if (Object.keys(this.pendingStateChanges).length === 0) {
      return;
    }

    try {
      this.stateUpdateLock = true;

      // Deep clone previous state for comparison
      const previousState: NetworkManagerState = JSON.parse(JSON.stringify(this.state));
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
          version: this.stateVersion,
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
  mergeStateChanges(currentState: NetworkManagerState, changes: Partial<NetworkManagerState>): NetworkManagerState {
    const newState: NetworkManagerState = JSON.parse(JSON.stringify(currentState));

    if (changes.diagnostics) {
      newState.diagnostics = { ...newState.diagnostics, ...changes.diagnostics };
    }

    const { diagnostics: _, ...rest } = changes;
    return Object.assign(newState, rest);
  }

  /**
   * Check if state has actually changed
   */
  hasStateChanged(oldState: NetworkManagerState, newState: NetworkManagerState): boolean {
    return JSON.stringify(oldState) !== JSON.stringify(newState);
  }

  /**
   * Broadcast current state to all renderer processes
   */
  broadcastState(): void {
    const windows = BrowserWindow.getAllWindows();
    const stateUpdate = {
      state: this.getState(),
      timestamp: timeManager.now(),
      version: this.stateVersion,
    };

    windows.forEach((window: BrowserWindowType) => {
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
  analyzeNetworkChange(): NetworkAnalysis {
    return {
      wasOffline: !this.state.isOnline,
      isNowOnline: this.state.isOnline,
      networkQualityImproved: false,
      vpnStateChanged: false,
      likelyRecovery: false,
      significantChange: false,
    };
  }
}

// Export singleton instance
const networkStateManager = new NetworkStateManager();

export { NetworkStateManager, networkStateManager };
export default networkStateManager;
