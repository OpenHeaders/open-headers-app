/**
 * BroadcastManager - Handles broadcasting state to WebSocket and proxy
 */
const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('BroadcastManager');

class BroadcastManager {
  constructor(electronAPI) {
    this.electronAPI = electronAPI;
  }

  /**
   * Broadcast current state to WebSocket and proxy
   */
  async broadcastState(sources, headerRules) {
    try {
      // Update WebSocket with sources
      if (this.electronAPI.updateWebSocketSources) {
        this.electronAPI.updateWebSocketSources(sources);
      }
      
      // Update proxy with header rules
      if (this.electronAPI.proxyUpdateHeaderRules) {
        await this.electronAPI.proxyUpdateHeaderRules(headerRules);
      }
      
      // Update proxy with sources
      if (this.electronAPI.proxyUpdateSources) {
        // Use bulk update if available
        this.electronAPI.proxyUpdateSources(sources);
      } else if (this.electronAPI.proxyUpdateSource) {
        // Fallback to individual updates
        for (const source of sources) {
          if (source.sourceContent) {
            this.electronAPI.proxyUpdateSource(source.sourceId, source.sourceContent);
          }
        }
      }
      
    } catch (error) {
      log.error('Failed to broadcast state:', error);
      // Don't throw - broadcasting failures shouldn't break the flow
    }
  }

  /**
   * Clear proxy rules
   */
  async clearProxyRules() {
    try {
      if (this.electronAPI.proxyClearRules) {
        await this.electronAPI.proxyClearRules();
      }
    } catch (error) {
      log.error('Failed to clear proxy rules:', error);
      // Don't throw - continue even if proxy clear fails
    }
  }
}

module.exports = BroadcastManager;