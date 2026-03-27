/**
 * Rules Handler for Export/Import Operations
 *
 * This module handles the export and import of application rules,
 * including type-specific handling and complex merge/replace logic.
 */

import { createRulesStorage, RULE_TYPES } from '../../../utils/data-structures/rulesStructure';
import { IMPORT_MODES, EVENTS } from '../core/ExportImportConfig';
import type { ExportImportDependencies, RulesStorage, RuleEntry } from '../core/types';
import type { RulesCollection } from '../../../../types/rules';
import { createLogger } from '../../../utils/error-handling/logger';
const log = createLogger('RulesHandler');

/** Export options for rules */
interface ExportOptions {
  selectedItems: Record<string, boolean>;
}

/** Import options for rules */
interface ImportOptions {
  importMode?: string;
  selectedItems: Record<string, boolean>;
}

/** Rules to import structure */
interface RulesToImport {
  rules?: Record<string, RuleEntry[]>;
  metadata?: { totalRules?: number; lastUpdated?: string };
}


/** Import statistics per type */
interface TypeImportStats {
  imported: number;
  skipped: number;
  errors: Array<{ ruleType: string; ruleId: string; error: string }>;
}

/** Import statistics */
interface ImportStats {
  imported: Record<string, number>;
  skipped: Record<string, number>;
  errors: Array<{ ruleType: string; ruleId: string; error: string }>;
}

/** Rules data for validation/statistics */
interface RulesData {
  rules?: Record<string, RuleEntry[]> | RulesCollection;
  rulesMetadata?: { totalRules?: number; lastUpdated?: string };
  metadata?: { totalRules?: number; lastUpdated?: string };
}

/**
 * Rules Handler Class
 * Manages export and import operations for application rules
 */
export class RulesHandler {
  dependencies: ExportImportDependencies;
  activeWorkspaceId: string;

  constructor(dependencies: ExportImportDependencies) {
    this.dependencies = dependencies;
    this.activeWorkspaceId = dependencies.activeWorkspaceId;
  }

  /**
   * Exports rules data for inclusion in export file
   * @param {Object} options - Export options
   * @returns {Promise<Object|null>} - Rules data object or null if not selected
   */
  async exportRules(options: ExportOptions) {
    const { selectedItems } = options;

    if (!selectedItems.rules) {
      log.debug('Rules not selected for export');
      return null;
    }

    try {
      let rulesStorage = createRulesStorage();

      const rulesPath = `workspaces/${this.activeWorkspaceId}/rules.json`;
      const rulesData = await window.electronAPI.loadFromStorage(rulesPath);

      if (rulesData) {
        rulesStorage = JSON.parse(rulesData);
      }

      const totalRules = Object.values(rulesStorage.rules).reduce((sum, rules) => sum + rules.length, 0);
      log.info(`Exporting ${totalRules} rules across ${Object.keys(rulesStorage.rules).length} types`);

      return {
        rules: rulesStorage.rules,
        rulesMetadata: rulesStorage.metadata
      };
    } catch (error) {
      log.error('Failed to export rules:', error);
      throw new Error(`Failed to export rules: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Imports rules from import data
   * @param {Object} rulesToImport - Rules storage object to import
   * @param {Object} options - Import options
   * @returns {Promise<Object>} - Import statistics
   */
  async importRules(rulesToImport: RulesToImport, options: ImportOptions) {
    const stats: {
      imported: Record<string, number>;
      skipped: Record<string, number>;
      errors: Array<{ ruleType: string; ruleId: string; error: string }>;
    } = {
      imported: { total: 0 },
      skipped: { total: 0 },
      errors: []
    };

    // Initialize counters for each rule type
    Object.values(RULE_TYPES).forEach((type: string) => {
      stats.imported[type] = 0;
      stats.skipped[type] = 0;
    });

    if (!rulesToImport || !rulesToImport.rules) {
      log.debug('No rules to import');
      return stats;
    }

    const totalRulesToImport = Object.values(rulesToImport.rules).reduce((sum: number, rules: RuleEntry[]) => sum + rules.length, 0);
    log.info(`Starting import of ${totalRulesToImport} rules in ${options.importMode} mode`);

    try {
      // Get existing rules storage
      let existingRulesStorage = await this._getExistingRulesStorage();

      // Handle replace mode - clear all rules
      if (options.importMode === IMPORT_MODES.REPLACE) {
        existingRulesStorage = createRulesStorage();
      }

      // Process each rule type
      for (const [ruleType, rulesToImportForType] of Object.entries(rulesToImport.rules)) {
        const typeStats = await this._importRulesOfType(
          ruleType,
          rulesToImportForType,
          existingRulesStorage,
          options
        );

        stats.imported[ruleType] = typeStats.imported;
        stats.skipped[ruleType] = typeStats.skipped;
        stats.imported.total += typeStats.imported;
        stats.skipped.total += typeStats.skipped;
        stats.errors.push(...typeStats.errors);
      }

      // Update metadata
      existingRulesStorage.metadata.totalRules = existingRulesStorage.rules.header.length
        + existingRulesStorage.rules.request.length + existingRulesStorage.rules.response.length;
      existingRulesStorage.metadata.lastUpdated = new Date().toISOString();

      // Save the updated rules
      await this._saveRulesStorage(existingRulesStorage);

      // Emit event for UI updates
      if (stats.imported.total > 0) {
        this._emitRulesUpdatedEvent(stats);
      }

      log.info(`Rules import completed: ${stats.imported.total} imported, ${stats.skipped.total} skipped, ${stats.errors.length} errors`);
      return stats;
    } catch (error) {
      log.error('Failed to import rules:', error);
      throw new Error(`Failed to import rules: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Imports rules of a specific type
   * @param {string} ruleType - Type of rules to import
   * @param {Array} rulesToImport - Rules to import
   * @param {Object} existingRulesStorage - Existing rules storage
   * @param {Object} options - Import options
   * @returns {Promise<Object>} - Import statistics for this type
   * @private
   */
  async _importRulesOfType(ruleType: string, rulesToImport: RuleEntry[], existingRulesStorage: RulesStorage, options: ImportOptions): Promise<TypeImportStats> {
    const stats: TypeImportStats = {
      imported: 0,
      skipped: 0,
      errors: []
    };

    if (!Array.isArray(rulesToImport) || rulesToImport.length === 0) {
      return stats;
    }

    log.debug(`Importing ${rulesToImport.length} rules of type: ${ruleType}`);

    if (options.importMode === IMPORT_MODES.REPLACE) {
      // Replace mode: use imported rules directly
      existingRulesStorage.rules[ruleType] = [...rulesToImport];
      stats.imported = rulesToImport.length;
    } else {
      // Merge mode: check for duplicates
      const existingRules = existingRulesStorage.rules[ruleType] || [];
      const existingIds = new Set(existingRules.map((r: RuleEntry) => r.id));

      for (const rule of rulesToImport) {
        try {
          if (existingIds.has(rule.id)) {
            stats.skipped++;
            log.debug(`Skipping duplicate rule with ID: ${rule.id}`);
            continue;
          }

          // Ensure the rule has a valid ID
          const ruleToAdd = {
            ...rule,
            id: rule.id || this._generateRuleId()
          };

          existingRulesStorage.rules[ruleType].push(ruleToAdd);
          stats.imported++;
        } catch (error) {
          log.error(`Failed to import rule ${rule.id || 'unknown'}:`, error);
          stats.errors.push({
            ruleType,
            ruleId: rule.id || 'unknown',
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    return stats;
  }

  /**
   * Gets existing rules storage from the workspace
   * @returns {Promise<Object>} - Existing rules storage
   * @private
   */
  async _getExistingRulesStorage() {
    try {
      const rulesPath = `workspaces/${this.activeWorkspaceId}/rules.json`;
      const existingRulesData = await window.electronAPI.loadFromStorage(rulesPath);

      if (existingRulesData) {
        return JSON.parse(existingRulesData);
      }
    } catch (error) {
      log.debug('No existing rules found, creating new storage');
    }

    return createRulesStorage();
  }

  /**
   * Saves rules storage to the workspace
   * @param {Object} rulesStorage - Rules storage to save
   * @returns {Promise<void>}
   * @private
   */
  async _saveRulesStorage(rulesStorage: RulesStorage) {
    try {
      const rulesPath = `workspaces/${this.activeWorkspaceId}/rules.json`;
      await window.electronAPI.saveToStorage(rulesPath, JSON.stringify(rulesStorage));
    } catch (error) {
      throw new Error(`Failed to save rules storage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Emits an event to notify the UI that rules have been updated
   * @param {Object} stats - Import statistics
   * @private
   */
  _emitRulesUpdatedEvent(stats: ImportStats) {
    try {
      window.dispatchEvent(new CustomEvent(EVENTS.RULES_UPDATED, {
        detail: {
          imported: stats.imported,
          skipped: stats.skipped,
          source: 'import'
        }
      }));
    } catch (error) {
      log.warn('Failed to emit rules updated event:', error);
    }
  }

  /**
   * Generates a unique rule ID
   * @returns {string} - Unique rule ID
   * @private
   */
  _generateRuleId() {
    return Date.now().toString() + Math.random().toString(36).slice(2, 11);
  }

  /**
   * Validates rules storage for export
   * @param {Object} rulesData - Rules data to validate
   * @returns {Object} - Validation result
   */
  validateRulesForExport(rulesDataInput: RulesData | undefined) {
    const rulesData = rulesDataInput;
    if (!rulesData || typeof rulesData !== 'object') {
      return {
        success: false,
        error: 'Rules data must be an object'
      };
    }

    if (!rulesData.rules || typeof rulesData.rules !== 'object') {
      return {
        success: false,
        error: 'Rules data must contain a rules object'
      };
    }

    const errors: string[] = [];
    Object.entries(rulesData.rules).forEach(([ruleType, rules]) => {
      if (!Array.isArray(rules)) {
        errors.push(`Rules for type ${ruleType} must be an array`);
        return;
      }

      rules.forEach((rule, index) => {
        if (!rule.id) {
          errors.push(`Rule ${index + 1} of type ${ruleType} is missing an ID`);
        }
      });
    });

    if (errors.length > 0) {
      return {
        success: false,
        error: errors.join('; ')
      };
    }

    return { success: true };
  }

  /**
   * Gets statistics about rules for reporting
   * @param {Object} rulesData - Rules data object
   * @returns {Object} - Statistics object
   */
  getRulesStatistics(rulesData: RulesData) {
    if (!rulesData || !rulesData.rules) {
      return {
        total: 0,
        byType: {},
        metadata: null
      };
    }

    const stats: { total: number; byType: Record<string, number>; metadata: RulesData['rulesMetadata'] } = {
      total: 0,
      byType: {},
      metadata: rulesData.rulesMetadata || rulesData.metadata
    };

    Object.entries(rulesData.rules).forEach(([ruleType, rules]) => {
      const count = Array.isArray(rules) ? rules.length : 0;
      stats.byType[ruleType] = count;
      stats.total += count;
    });

    return stats;
  }


  /**
   * Analyzes rules for potential issues or conflicts
   * @param {Object} rulesData - Rules data to analyze
   * @returns {Object} - Analysis result with warnings and suggestions
   */
  analyzeRules(rulesData: RulesData) {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (!rulesData || !rulesData.rules) {
      return { warnings, suggestions };
    }

    let totalRules = 0;
    let enabledRules = 0;

    Object.entries(rulesData.rules).forEach(([ruleType, rules]) => {
      if (!Array.isArray(rules)) {
        warnings.push(`Rules for type ${ruleType} is not an array`);
        return;
      }

      totalRules += rules.length;
      enabledRules += rules.filter(rule => rule.enabled !== false).length;

      // Check for duplicate IDs within type
      const ids = rules.map(rule => rule.id);
      const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
      if (duplicateIds.length > 0) {
        warnings.push(`Duplicate rule IDs found in ${ruleType}: ${duplicateIds.join(', ')}`);
        suggestions.push(`Fix duplicate IDs in ${ruleType} rules`);
      }

      // Check for rules without names
      const unnamedRules = rules.filter(rule => !rule.name);
      if (unnamedRules.length > 0) {
        warnings.push(`${unnamedRules.length} unnamed rule(s) in ${ruleType}`);
        suggestions.push(`Add names to rules in ${ruleType} for better organization`);
      }
    });

    // Check for large rule sets
    if (totalRules > 100) {
      warnings.push(`Large number of rules (${totalRules}) may impact performance`);
      suggestions.push('Consider organizing rules by priority or frequency of use');
    }

    // Check for disabled rules
    const disabledCount = totalRules - enabledRules;
    if (disabledCount > 0) {
      warnings.push(`${disabledCount} rule(s) are disabled`);
      suggestions.push('Review disabled rules and remove if no longer needed');
    }

    return { warnings, suggestions };
  }
}
