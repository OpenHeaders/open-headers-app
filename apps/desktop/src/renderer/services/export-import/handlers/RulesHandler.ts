/**
 * Rules Handler for Export/Import Operations
 *
 * This module handles the export and import of application rules.
 * All data access goes through ExportImportDependencies (backed by
 * WorkspaceStateService via IPC) — never direct file I/O.
 */

import type { HeaderRule, RulesCollection } from '../../../../types/rules';
import { createLogger } from '../../../utils/error-handling/logger';
import { IMPORT_MODES } from '../core/ExportImportConfig';
import type { ExportImportDependencies, RuleEntry } from '../core/types';

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

// Rule types enum (local — avoids importing renderer utility from a service module)
const RULE_TYPES = { HEADER: 'header', PAYLOAD: 'payload', URL: 'url' } as const;

/**
 * Rules Handler Class
 * Manages export and import operations for application rules
 */
export class RulesHandler {
  dependencies: ExportImportDependencies;

  constructor(dependencies: ExportImportDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * Exports rules data for inclusion in export file.
   * Reads from in-memory state (WorkspaceStateService) — no disk access.
   */
  async exportRules(options: ExportOptions) {
    const { selectedItems } = options;

    if (!selectedItems.rules) {
      log.debug('Rules not selected for export');
      return null;
    }

    try {
      const rules = this.dependencies.rules;
      const totalRules = rules.header.length + rules.request.length + rules.response.length;
      log.info(`Exporting ${totalRules} rules`);

      return {
        rules: { header: rules.header, request: rules.request, response: rules.response },
        rulesMetadata: { totalRules, lastUpdated: new Date().toISOString() },
      };
    } catch (error) {
      log.error('Failed to export rules:', error);
      throw new Error(`Failed to export rules: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Imports rules from import data.
   * Uses WorkspaceStateService CRUD methods via dependencies — no direct file writes.
   */
  async importRules(rulesToImport: RulesToImport, options: ImportOptions) {
    const stats: ImportStats = {
      imported: { total: 0 },
      skipped: { total: 0 },
      errors: [],
    };

    // Initialize counters for each rule type
    Object.values(RULE_TYPES).forEach((type: string) => {
      stats.imported[type] = 0;
      stats.skipped[type] = 0;
    });

    if (!rulesToImport?.rules) {
      log.debug('No rules to import');
      return stats;
    }

    const totalRulesToImport = Object.values(rulesToImport.rules).reduce(
      (sum: number, rules: RuleEntry[]) => sum + rules.length,
      0,
    );
    log.info(`Starting import of ${totalRulesToImport} rules in ${options.importMode} mode`);

    try {
      // Handle replace mode — remove all existing header rules first
      if (options.importMode === IMPORT_MODES.REPLACE) {
        await this._clearExistingHeaderRules();
      }

      // Build a set of existing rule IDs for merge duplicate detection
      const existingIds = new Set(this.dependencies.rules.header.map((r) => r.id));

      // Process header rules via WorkspaceStateService
      const headerRules = rulesToImport.rules[RULE_TYPES.HEADER];
      if (Array.isArray(headerRules) && headerRules.length > 0) {
        const typeStats = await this._importHeaderRules(headerRules, existingIds, options);
        stats.imported[RULE_TYPES.HEADER] = typeStats.imported;
        stats.skipped[RULE_TYPES.HEADER] = typeStats.skipped;
        stats.imported.total += typeStats.imported;
        stats.skipped.total += typeStats.skipped;
        stats.errors.push(...typeStats.errors);
      }

      // TODO: request/response rule types can be added here when their
      // CRUD methods are available on WorkspaceStateService.

      log.info(
        `Rules import completed: ${stats.imported.total} imported, ${stats.skipped.total} skipped, ${stats.errors.length} errors`,
      );
      return stats;
    } catch (error) {
      log.error('Failed to import rules:', error);
      throw new Error(`Failed to import rules: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Import header rules one by one via WorkspaceStateService.
   */
  private async _importHeaderRules(
    rulesToImport: RuleEntry[],
    existingIds: Set<string>,
    options: ImportOptions,
  ): Promise<TypeImportStats> {
    const stats: TypeImportStats = { imported: 0, skipped: 0, errors: [] };

    for (const rule of rulesToImport) {
      try {
        // Skip duplicates in merge mode
        if (options.importMode === IMPORT_MODES.MERGE && existingIds.has(rule.id)) {
          stats.skipped++;
          log.debug(`Skipping duplicate rule with ID: ${rule.id}`);
          continue;
        }

        // Ensure a valid ID
        const ruleToAdd: Partial<HeaderRule> = {
          ...(rule as unknown as Partial<HeaderRule>),
          id: rule.id || this._generateRuleId(),
        };

        await this.dependencies.addHeaderRule(ruleToAdd);
        stats.imported++;
      } catch (error) {
        log.error(`Failed to import rule ${rule.id || 'unknown'}:`, error);
        stats.errors.push({
          ruleType: RULE_TYPES.HEADER,
          ruleId: rule.id || 'unknown',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return stats;
  }

  /**
   * Removes all existing header rules (used in replace mode).
   */
  private async _clearExistingHeaderRules(): Promise<void> {
    const existingRules = this.dependencies.rules.header;
    log.info(`Clearing ${existingRules.length} existing header rules`);

    for (const rule of existingRules) {
      try {
        await this.dependencies.removeHeaderRule(rule.id);
      } catch (error) {
        log.warn(`Failed to remove header rule ${rule.id}:`, error);
      }
    }
  }

  /**
   * Generates a unique rule ID
   */
  private _generateRuleId(): string {
    return Date.now().toString() + Math.random().toString(36).slice(2, 11);
  }

  /**
   * Validates rules storage for export
   */
  validateRulesForExport(rulesDataInput: RulesData | undefined) {
    const rulesData = rulesDataInput;
    if (!rulesData || typeof rulesData !== 'object') {
      return { success: false, error: 'Rules data must be an object' };
    }

    if (!rulesData.rules || typeof rulesData.rules !== 'object') {
      return { success: false, error: 'Rules data must contain a rules object' };
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
      return { success: false, error: errors.join('; ') };
    }

    return { success: true };
  }

  /**
   * Gets statistics about rules for reporting
   */
  getRulesStatistics(rulesData: RulesData) {
    if (!rulesData?.rules) {
      return { total: 0, byType: {}, metadata: null };
    }

    const stats: { total: number; byType: Record<string, number>; metadata: RulesData['rulesMetadata'] } = {
      total: 0,
      byType: {},
      metadata: rulesData.rulesMetadata || rulesData.metadata,
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
   */
  analyzeRules(rulesData: RulesData) {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (!rulesData?.rules) {
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
      enabledRules += rules.filter((rule) => rule.enabled !== false).length;

      // Check for duplicate IDs within type
      const ids = rules.map((rule) => rule.id);
      const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
      if (duplicateIds.length > 0) {
        warnings.push(`Duplicate rule IDs found in ${ruleType}: ${duplicateIds.join(', ')}`);
        suggestions.push(`Fix duplicate IDs in ${ruleType} rules`);
      }

      // Check for rules without names
      const unnamedRules = rules.filter((rule) => !rule.name);
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
