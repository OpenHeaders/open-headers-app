/**
 * RulesManager - Manages header rules and proxy rules
 */
const { createLogger } = require('../../utils/error-handling/logger');
const { DATA_FORMAT_VERSION } = require('../../../config/version');
const log = createLogger('RulesManager');

class RulesManager {
  constructor(storageAPI, electronAPI) {
    this.storageAPI = storageAPI;
    this.electronAPI = electronAPI;
  }

  /**
   * Load rules for a workspace
   */
  async loadRules(workspaceId) {
    try {
      const data = await this.storageAPI.loadFromStorage(`workspaces/${workspaceId}/rules.json`);
      if (data) {
        const rulesStorage = JSON.parse(data);
        return rulesStorage.rules || { header: [], request: [], response: [] };
      }
      return { header: [], request: [], response: [] };
    } catch (error) {
      log.error(`Failed to load rules for workspace ${workspaceId}:`, error);
      return { header: [], request: [], response: [] };
    }
  }

  /**
   * Save rules
   */
  async saveRules(workspaceId, rules) {
    try {
      const rulesStorage = {
        version: DATA_FORMAT_VERSION,
        rules,
        metadata: {
          totalRules: Object.values(rules).reduce((sum, ruleArray) => sum + ruleArray.length, 0),
          lastUpdated: new Date().toISOString()
        }
      };
      
      const path = `workspaces/${workspaceId}/rules.json`;
      await this.storageAPI.saveToStorage(path, JSON.stringify(rulesStorage));
      
      // Update WebSocket for browser extension
      if (this.electronAPI && this.electronAPI.updateWebSocketSources) {
        const { exportForExtension } = await import('../../utils/data-structures/rulesStructure');
        this.electronAPI.updateWebSocketSources({
          type: 'rules-update',
          data: exportForExtension(rulesStorage)
        });
      }
      
      log.debug('Rules saved and synced');
    } catch (error) {
      log.error('Failed to save rules:', error);
      throw error;
    }
  }

  /**
   * Load proxy rules for a workspace
   */
  async loadProxyRules(workspaceId) {
    try {
      const data = await this.storageAPI.loadFromStorage(`workspaces/${workspaceId}/proxy-rules.json`);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      log.error(`Failed to load proxy rules for workspace ${workspaceId}:`, error);
      return [];
    }
  }

  /**
   * Save proxy rules
   */
  async saveProxyRules(workspaceId, proxyRules) {
    try {
      const path = `workspaces/${workspaceId}/proxy-rules.json`;
      await this.storageAPI.saveToStorage(path, JSON.stringify(proxyRules));
      log.debug('Proxy rules saved');
    } catch (error) {
      log.error('Failed to save proxy rules:', error);
      throw error;
    }
  }

  /**
   * Add a header rule
   */
  addHeaderRule(rules, ruleData) {
    const newRule = {
      ...ruleData,
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    };
    
    return {
      ...rules,
      header: [...rules.header, newRule]
    };
  }

  /**
   * Update a header rule
   */
  updateHeaderRule(rules, ruleId, updates) {
    return {
      ...rules,
      header: rules.header.map(rule =>
        rule.id === ruleId
          ? { ...rule, ...updates, updatedAt: new Date().toISOString() }
          : rule
      )
    };
  }

  /**
   * Remove a header rule
   */
  removeHeaderRule(rules, ruleId) {
    return {
      ...rules,
      header: rules.header.filter(rule => rule.id !== ruleId)
    };
  }

  /**
   * Sync proxy rule with proxy manager
   */
  async syncProxyRule(rule, action) {
    if (!this.electronAPI) return;

    try {
      if (action === 'add' && this.electronAPI.proxySaveRule) {
        await this.electronAPI.proxySaveRule(rule);
      } else if (action === 'remove' && this.electronAPI.proxyDeleteRule) {
        await this.electronAPI.proxyDeleteRule(rule.id);
      }
    } catch (error) {
      log.error(`Failed to sync proxy rule (${action}):`, error);
      throw error;
    }
  }
}

module.exports = RulesManager;