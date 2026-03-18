/**
 * BroadcastManager - Handles broadcasting state to WebSocket and proxy
 */
import { createLogger } from '../../utils/error-handling/logger';
const log = createLogger('BroadcastManager');

interface BroadcastElectronAPI {
  updateWebSocketSources?: (sources: unknown) => void;
  proxyUpdateHeaderRules?: (headerRules: unknown[]) => Promise<{ success: boolean; error?: string }>;
  proxyUpdateSources?: (sources: unknown) => void;
  proxyUpdateSource?: (sourceId: string, value: unknown) => void;
  proxyClearRules?: () => Promise<{ success: boolean; error?: string }>;
}

class BroadcastManager {
  electronAPI: BroadcastElectronAPI;

  constructor(electronAPI: BroadcastElectronAPI) {
    this.electronAPI = electronAPI;
  }

  /**
   * Broadcast current state to WebSocket and proxy
   */
  async broadcastState(sources: Record<string, unknown>[], headerRules: Record<string, unknown>[], { includeWebSocket = false } = {}) {
    try {
      // WebSocket source broadcasting is normally handled by WebSocketContext
      // (with cleaning, debouncing, and change detection).
      // However, during workspace switches WebSocketContext suppresses broadcasts,
      // so the caller passes includeWebSocket: true in that case.
      if (includeWebSocket && this.electronAPI.updateWebSocketSources) {
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
            this.electronAPI.proxyUpdateSource(source.sourceId as string, source.sourceContent);
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

export default BroadcastManager;
