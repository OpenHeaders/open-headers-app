/**
 * BaseStateManager - Base class for state management with listeners
 */
const { createLogger } = require('../../utils/error-handling/logger');

class BaseStateManager {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.log = createLogger(serviceName);
    this.listeners = new Set();
    this.state = {};
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener) {
    this.listeners.add(listener);
    // Immediately call with current state
    listener(this.getState(), []);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners
   */
  notifyListeners(changedKeys = []) {
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
  getState() {
    // TODO: Consider using a proper deep clone library for performance
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Update state and notify listeners
   */
  setState(updates, changedKeys = []) {
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

module.exports = BaseStateManager;