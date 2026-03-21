/**
 * BaseStateManager - Base class for state management with listeners
 */
import { createLogger } from '../../utils/error-handling/logger';

class BaseStateManager<TState extends object = Record<string, unknown>> {
  serviceName: string;
  log: ReturnType<typeof createLogger>;
  listeners: Set<(state: TState, changedKeys: string[]) => void>;
  state: TState;

  constructor(serviceName: string, initialState: TState) {
    this.serviceName = serviceName;
    this.log = createLogger(serviceName);
    this.listeners = new Set();
    this.state = initialState;
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: TState, changedKeys: string[]) => void) {
    this.listeners.add(listener);
    // Immediately call with current state
    listener(this.getState(), []);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners
   */
  notifyListeners(changedKeys: string[] = []) {
    const state = this.getState();
    this.listeners.forEach(listener => {
      try {
        listener(state, changedKeys);
      } catch (error) {
        this.log.error('Listener error:', error);
      }
    });
  }

  /**
   * Get current state (immutable copy)
   */
  getState(): TState {
    // TODO: Consider using a proper deep clone library for performance
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Update state and notify listeners
   */
  setState(updates: Partial<TState>, changedKeys: string[] = []) {
    this.state = { ...this.state, ...updates };
    this.notifyListeners(changedKeys);
  }

  /**
   * Cleanup listeners
   */
  cleanup() {
    this.listeners.clear();
  }
}

export default BaseStateManager;
