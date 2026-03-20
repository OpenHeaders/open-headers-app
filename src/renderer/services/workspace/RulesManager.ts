/**
 * RulesManager - Manages header rules and proxy rules
 */
import { createLogger } from '../../utils/error-handling/logger';
import { DATA_FORMAT_VERSION } from '../../../config/version';
import type { Source } from '../../../types/source';
import type { ProxyRule } from '../../../types/proxy';
const log = createLogger('RulesManager');

interface StorageAPI {
  loadFromStorage: (filename: string) => Promise<string | null>;
  saveToStorage: (filename: string, content: string) => Promise<void>;
}

interface RulesElectronAPI {
  updateWebSocketSources?: (sources: Source[] | { type: 'rules-update'; data: Record<string, unknown> }) => void;
  proxySaveRule?: (rule: ProxyRule) => Promise<{ success: boolean; error?: string }>;
  proxyDeleteRule?: (ruleId: string) => Promise<{ success: boolean; error?: string }>;
}

interface HeaderRule {
  id: string;
  [key: string]: unknown;
}

interface RulesCollection {
  header: HeaderRule[];
  request: HeaderRule[];
  response: HeaderRule[];
  [key: string]: HeaderRule[];
}

class RulesManager {
  storageAPI: StorageAPI;
  electronAPI: RulesElectronAPI;

  constructor(storageAPI: StorageAPI, electronAPI: RulesElectronAPI) {
    this.storageAPI = storageAPI;
    this.electronAPI = electronAPI;
  }

  /**
   * Load rules for a workspace
   */
  async loadRules(workspaceId: string): Promise<RulesCollection> {
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
  async saveRules(workspaceId: string, rules: RulesCollection) {
    try {
      const rulesStorage = {
        version: DATA_FORMAT_VERSION,
        rules,
        metadata: {
          totalRules: Object.values(rules).reduce((sum: number, ruleArray: HeaderRule[]) => sum + ruleArray.length, 0),
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
  async loadProxyRules(workspaceId: string): Promise<ProxyRule[]> {
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
  async saveProxyRules(workspaceId: string, proxyRules: ProxyRule[]) {
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
  addHeaderRule(rules: RulesCollection, ruleData: Record<string, unknown>) {
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
  updateHeaderRule(rules: RulesCollection, ruleId: string, updates: Record<string, unknown>) {
    return {
      ...rules,
      header: rules.header.map((rule: HeaderRule) =>
        rule.id === ruleId
          ? { ...rule, ...updates, updatedAt: new Date().toISOString() }
          : rule
      )
    };
  }

  /**
   * Remove a header rule
   */
  removeHeaderRule(rules: RulesCollection, ruleId: string) {
    return {
      ...rules,
      header: rules.header.filter((rule: HeaderRule) => rule.id !== ruleId)
    };
  }

  /**
   * Sync proxy rule with proxy manager
   */
  async syncProxyRule(rule: ProxyRule, action: 'add' | 'remove') {
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

export default RulesManager;
