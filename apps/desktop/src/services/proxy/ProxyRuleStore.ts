import electron from 'electron';
import fs from 'fs';
import path from 'path';
import atomicWriter from '../../utils/atomicFileWriter';
import mainLogger from '../../utils/mainLogger';

const { app } = electron;
const { createLogger } = mainLogger;

const fsPromises = fs.promises;

import type { ProxyRule } from '../../types/proxy';

export type { ProxyRule } from '../../types/proxy';

class ProxyRuleStore {
  private log = createLogger('ProxyRuleStore');
  currentWorkspaceId: string | null = null;
  rules: ProxyRule[] = [];

  /**
   * Set the current workspace ID for workspace-specific rule storage.
   */
  setWorkspace(workspaceId: string): void {
    this.currentWorkspaceId = workspaceId;
  }

  /**
   * Get the workspace-specific rules path.
   */
  getRulesPath(): string {
    if (!this.currentWorkspaceId) {
      return path.join(app.getPath('userData'), 'proxy-rules.json');
    }
    return path.join(app.getPath('userData'), 'workspaces', this.currentWorkspaceId, 'proxy-rules.json');
  }

  async load(): Promise<void> {
    try {
      const rulesPath = this.getRulesPath();
      const rules = await atomicWriter.readJson(rulesPath);
      if (rules !== null) {
        this.rules = rules as ProxyRule[];
        this.log.debug(`Loaded ${this.rules.length} proxy rules from ${rulesPath}`);
      } else {
        this.rules = [];
        this.log.debug('No proxy rules found, starting with empty set');
      }
    } catch (error: unknown) {
      this.log.error('Error loading proxy rules:', error);
      this.rules = [];
    }
  }

  async save(): Promise<void> {
    try {
      const rulesPath = this.getRulesPath();
      const dir = path.dirname(rulesPath);
      await fsPromises.mkdir(dir, { recursive: true });
      await atomicWriter.writeJson(rulesPath, this.rules, { pretty: true });
      this.log.debug(`Saved ${this.rules.length} proxy rules to ${rulesPath}`);
    } catch (error: unknown) {
      this.log.error('Error saving proxy rules:', error);
    }
  }

  async saveRule(rule: ProxyRule): Promise<void> {
    const existingIndex = this.rules.findIndex((r) => r.id === rule.id);
    if (existingIndex >= 0) {
      this.rules[existingIndex] = rule;
    } else {
      this.rules.push({
        ...rule,
        id: rule.id || Date.now().toString(),
      });
    }
    await this.save();
  }

  async deleteRule(ruleId: string): Promise<void> {
    this.rules = this.rules.filter((r) => r.id !== ruleId);
    await this.save();
  }

  getRules(): ProxyRule[] {
    return this.rules;
  }
}

export { ProxyRuleStore };
export default ProxyRuleStore;
