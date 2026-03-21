/**
 * Proxy Rules Handler for Export/Import Operations
 *
 * This module handles the export and import of proxy rule configurations,
 * including complex duplicate detection based on URL patterns and headers.
 */

import { isProxyRuleDuplicate } from '../utilities/DuplicateDetection';
import type { ExportImportDependencies, ExportOptions } from '../core/types';
import { validateProxyRule } from '../utilities/ValidationUtils';
import { IMPORT_MODES, EVENTS } from '../core/ExportImportConfig';
import type { ProxyRule } from '../../../../types/proxy';

import { createLogger } from '../../../utils/error-handling/logger';
const log = createLogger('ProxyRulesHandler');

/**
 * Proxy Rules Handler Class
 * Manages export and import operations for proxy rule configurations
 */
export class ProxyRulesHandler {
  dependencies: ExportImportDependencies;

  constructor(dependencies: ExportImportDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * Exports proxy rules data for inclusion in export file
   * @param {Object} options - Export options
   * @returns {Promise<Array|null>} - Array of proxy rules or null if not selected
   */
  async exportProxyRules(options: ExportOptions): Promise<ProxyRule[] | null> {
    const { selectedItems } = options;

    if (!selectedItems.proxyRules) {
      log.debug('Proxy rules not selected for export');
      return null;
    }

    try {
      const proxyRules = await window.electronAPI.proxyGetRules();

      // Filter out invalid proxy rules before export
      const validProxyRules = proxyRules.filter(rule => {
        const validation = validateProxyRule(rule);
        if (!validation.success) {
          log.warn(`Filtering out invalid proxy rule during export: ${validation.error}`, rule);
          return false;
        }
        return true;
      });

      log.info(`Exporting ${validProxyRules.length} valid proxy rules (filtered ${proxyRules.length - validProxyRules.length} invalid)`);
      return validProxyRules;
    } catch (error) {
      log.error('Failed to export proxy rules:', error);
      throw new Error(`Failed to export proxy rules: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Imports proxy rules from import data
   * @param {Array} rulesToImport - Proxy rules to import
   * @param {Object} options - Import options
   * @returns {Promise<Object>} - Import statistics
   */
  async importProxyRules(rulesToImport: ProxyRule[] | null, options: { importMode?: string }) {
    const stats: { imported: number; skipped: number; errors: Array<{ pattern: string; error: string }> } = {
      imported: 0,
      skipped: 0,
      errors: []
    };

    if (!Array.isArray(rulesToImport) || rulesToImport.length === 0) {
      log.debug('No proxy rules to import');
      return stats;
    }

    log.info(`Starting import of ${rulesToImport.length} proxy rules in ${options.importMode} mode`);

    // Handle replace mode - clear existing rules
    if (options.importMode === IMPORT_MODES.REPLACE) {
      await this._clearExistingProxyRules();
    }

    // Get existing rules for duplicate detection (only needed in merge mode)
    let existingRules: ProxyRule[] = [];
    if (options.importMode === IMPORT_MODES.MERGE) {
      existingRules = await this._getExistingProxyRules();
    }

    // Import rules one by one
    for (const rule of rulesToImport) {
      try {
        const result = await this._importSingleProxyRule(rule, existingRules, options);
        if (result.imported) {
          stats.imported++;
        } else if (result.skipped) {
          stats.skipped++;
        }
      } catch (error) {
        log.error(`Failed to import proxy rule ${rule.id}:`, error);
        stats.errors.push({
          pattern: rule.name || rule.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Emit event to refresh UI if rules were imported
    if (stats.imported > 0) {
      this._emitProxyRulesUpdatedEvent(stats);
    }

    log.info(`Proxy rules import completed: ${stats.imported} imported, ${stats.skipped} skipped, ${stats.errors.length} errors`);
    return stats;
  }

  /**
   * Imports a single proxy rule with duplicate detection
   * @param {Object} rule - Proxy rule to import
   * @param {Array} existingRules - Existing proxy rules for duplicate detection
   * @param {Object} options - Import options
   * @returns {Promise<Object>} - Import result
   * @private
   */
  async _importSingleProxyRule(rule: ProxyRule, existingRules: ProxyRule[], options: { importMode?: string }) {
    // Validate rule structure
    const validation = validateProxyRule(rule);
    if (!validation.success) {
      throw new Error(`Invalid proxy rule structure: ${validation.error}`);
    }

    // Check for duplicates in merge mode
    if (options.importMode === IMPORT_MODES.MERGE) {
      const isDuplicate = isProxyRuleDuplicate(rule, existingRules);

      if (isDuplicate) {
        log.debug(`Skipping duplicate proxy rule: ${rule.id}`);
        return { skipped: true };
      }
    }

    // Import the rule
    await this._saveProxyRule(rule);
    log.debug(`Successfully imported proxy rule: ${rule.id}`);
    return { imported: true };
  }

  /**
   * Gets existing proxy rules from the system
   * @returns {Promise<Array>} - Array of existing proxy rules
   * @private
   */
  async _getExistingProxyRules() {
    try {
      return await window.electronAPI.proxyGetRules();
    } catch (error) {
      log.warn('Could not fetch existing proxy rules, continuing without duplicate check:', error);
      return [];
    }
  }

  /**
   * Saves a proxy rule using the system API
   * @param {Object} rule - Proxy rule to save
   * @returns {Promise<void>}
   * @private
   */
  async _saveProxyRule(rule: ProxyRule) {
    const saveResult = await window.electronAPI.proxySaveRule(rule);

    if (!saveResult || !saveResult.success) {
      throw new Error('Proxy rule save operation failed');
    }
  }

  /**
   * Clears all existing proxy rules (used in replace mode)
   * @returns {Promise<void>}
   * @private
   */
  async _clearExistingProxyRules() {
    try {
      const existingRules = await this._getExistingProxyRules();
      log.info(`Clearing ${existingRules.length} existing proxy rules`);

      for (const rule of existingRules) {
        try {
          await window.electronAPI.proxyDeleteRule(rule.id);
        } catch (error) {
          log.warn(`Failed to delete proxy rule ${rule.id}:`, error);
        }
      }
    } catch (error) {
      throw new Error(`Failed to clear existing proxy rules: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Emits an event to notify the UI that proxy rules have been updated
   * @param {Object} stats - Import statistics
   * @private
   */
  _emitProxyRulesUpdatedEvent(stats: { imported: number; skipped: number }) {
    try {
      window.dispatchEvent(new CustomEvent(EVENTS.PROXY_RULES_UPDATED, {
        detail: {
          imported: stats.imported,
          skipped: stats.skipped,
          source: 'import'
        }
      }));
    } catch (error) {
      log.warn('Failed to emit proxy rules updated event:', error);
    }
  }

  /**
   * Validates proxy rules array for export
   * @param {Array} rules - Proxy rules to validate
   * @returns {Object} - Validation result
   */
  validateProxyRulesForExport(rules: ProxyRule[] | undefined) {
    if (!Array.isArray(rules)) {
      return {
        success: false,
        error: 'Proxy rules must be an array'
      };
    }

    const errors: string[] = [];
    rules.forEach((rule, index) => {
      const validation = validateProxyRule(rule);
      if (!validation.success) {
        errors.push(`Proxy rule ${index + 1}: ${validation.error}`);
      }
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
   * Gets statistics about proxy rules for reporting
   * @param {Array} rules - Proxy rules array
   * @returns {Object} - Statistics object
   */
  getProxyRulesStatistics(rules: ProxyRule[] | undefined) {
    if (!Array.isArray(rules)) {
      return {
        total: 0,
        withHeaders: 0,
        patterns: [],
        averageHeadersPerRule: 0
      };
    }

    const stats: { total: number; withHeaders: number; patterns: string[]; totalHeaders: number; averageHeadersPerRule?: number } = {
      total: rules.length,
      withHeaders: 0,
      patterns: [] as string[],
      totalHeaders: 0
    };

    rules.forEach(rule => {
      if (rule.domains && rule.domains.length > 0) {
        stats.patterns.push(rule.domains.join(', '));
      }

      if (rule.headerName) {
        stats.withHeaders++;
        stats.totalHeaders++;
      }
    });

    stats.averageHeadersPerRule = stats.withHeaders > 0
      ? Math.round(stats.totalHeaders / stats.withHeaders * 100) / 100
      : 0;

    return stats;
  }

  /**
   * Analyzes proxy rules for potential conflicts or issues
   * @param {Array} rules - Proxy rules to analyze
   * @returns {Object} - Analysis result with warnings and suggestions
   */
  analyzeProxyRules(rules: ProxyRule[] | undefined) {
    if (!Array.isArray(rules)) {
      return { warnings: [], suggestions: [] };
    }

    const warnings: string[] = [];
    const suggestions: string[] = [];
    const patternCounts: Record<string, number> = {};

    // Check for duplicate domain patterns
    rules.forEach(rule => {
      const key = rule.domains?.join(',') || rule.name || rule.id;
      patternCounts[key] = (patternCounts[key] || 0) + 1;
    });

    Object.entries(patternCounts).forEach(([pattern, count]) => {
      if (count > 1) {
        warnings.push(`Pattern "${pattern}" appears ${count} times`);
        suggestions.push(`Consider consolidating rules with pattern "${pattern}"`);
      }
    });

    // Check for rules without domain restrictions
    rules.forEach((rule, index) => {
      if (!rule.domains || rule.domains.length === 0) {
        warnings.push(`Rule ${index + 1} has no domain restrictions and may affect all requests`);
        suggestions.push(`Consider adding domain restrictions for rule ${index + 1}`);
      }
    });

    // Check for rules without header names
    const rulesWithoutHeaders = rules.filter(rule => !rule.headerName);
    if (rulesWithoutHeaders.length > 0) {
      warnings.push(`${rulesWithoutHeaders.length} rule(s) have no header name configured`);
      suggestions.push('Rules without header names may not have any effect');
    }

    return { warnings, suggestions };
  }

}
