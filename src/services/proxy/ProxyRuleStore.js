const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const { createLogger } = require('../../utils/mainLogger');
const atomicWriter = require('../../utils/atomicFileWriter');

class ProxyRuleStore {
  constructor() {
    this.log = createLogger('ProxyRuleStore');
    this.currentWorkspaceId = null;
    this.rules = [];
  }

  /**
   * Set the current workspace ID for workspace-specific rule storage
   */
  setWorkspace(workspaceId) {
    this.currentWorkspaceId = workspaceId;
  }

  /**
   * Get the workspace-specific rules path
   */
  getRulesPath() {
    if (!this.currentWorkspaceId) {
      // Fallback to global rules for backward compatibility
      return path.join(app.getPath('userData'), 'proxy-rules.json');
    }
    // Store rules in workspace-specific directory
    return path.join(app.getPath('userData'), 'workspaces', this.currentWorkspaceId, 'proxy-rules.json');
  }

  async load() {
    try {
      const rulesPath = this.getRulesPath();
      const rules = await atomicWriter.readJson(rulesPath);
      if (rules !== null) {
        this.rules = rules;
        this.log.debug(`Loaded ${this.rules.length} proxy rules from ${rulesPath}`);
      } else {
        this.rules = [];
        this.log.debug('No proxy rules found, starting with empty set');
      }
    } catch (error) {
      this.log.error('Error loading proxy rules:', error);
      this.rules = [];
    }
  }

  async save() {
    try {
      const rulesPath = this.getRulesPath();
      // Ensure the workspace directory exists
      const dir = path.dirname(rulesPath);
      await fs.mkdir(dir, { recursive: true });
      
      await atomicWriter.writeJson(rulesPath, this.rules, { pretty: true });
      this.log.debug(`Saved ${this.rules.length} proxy rules to ${rulesPath}`);
    } catch (error) {
      this.log.error('Error saving proxy rules:', error);
    }
  }

  async saveRule(rule) {
    const existingIndex = this.rules.findIndex(r => r.id === rule.id);
    if (existingIndex >= 0) {
      this.rules[existingIndex] = rule;
    } else {
      this.rules.push({
        ...rule,
        id: rule.id || Date.now().toString()
      });
    }
    await this.save();
  }

  async deleteRule(ruleId) {
    this.rules = this.rules.filter(r => r.id !== ruleId);
    await this.save();
  }

  getRules() {
    return this.rules;
  }
}

module.exports = ProxyRuleStore;