/**
 * Sources Handler for Export/Import Operations
 * 
 * This module handles the export and import of source configurations,
 * including duplicate detection and validation specific to sources.
 */

import { isSourceDuplicate } from '../utilities/DuplicateDetection';
import { validateSource } from '../utilities/ValidationUtils';
import { IMPORT_MODES } from '../core/ExportImportConfig';

import { createLogger } from '../../../utils/error-handling/logger';
const log = createLogger('SourcesHandler');

/**
 * Sources Handler Class
 * Manages export and import operations for source configurations
 */
export class SourcesHandler {
  dependencies: Record<string, any>;

  constructor(dependencies: Record<string, any>) {
    this.dependencies = dependencies;
  }

  /**
   * Exports sources data for inclusion in export file
   * @param {Object} options - Export options
   * @returns {Promise<Array|null>} - Array of sources or null if not selected
   */
  async exportSources(options: Record<string, unknown>) {
    const { selectedItems } = options as { selectedItems: Record<string, boolean> };

    if (!selectedItems.sources) {
      log.debug('Sources not selected for export');
      return null;
    }

    try {
      const sources = this.dependencies.sources || [];

      // Filter out invalid sources before export
      const validSources = sources.filter((source: Record<string, unknown>) => {
        const validation = validateSource(source);
        if (!validation.success) {
          log.warn(`Filtering out invalid source during export: ${validation.error}`, source);
          return false;
        }
        return true;
      });
      
      log.info(`Exporting ${validSources.length} valid sources (filtered ${sources.length - validSources.length} invalid)`);
      return validSources;
    } catch (error) {
      log.error('Failed to export sources:', error);
      throw new Error(`Failed to export sources: ${error.message}`);
    }
  }

  /**
   * Imports sources from import data
   * @param {Array} sourcesToImport - Sources to import
   * @param {Object} options - Import options
   * @returns {Promise<Object>} - Import statistics
   */
  async importSources(sourcesToImport: Array<Record<string, unknown>>, options: Record<string, unknown>) {
    const stats = {
      imported: 0,
      skipped: 0,
      errors: []
    };

    if (!Array.isArray(sourcesToImport) || sourcesToImport.length === 0) {
      log.debug('No sources to import');
      return stats;
    }

    log.info(`Starting import of ${sourcesToImport.length} sources in ${options.importMode} mode`);

    // Handle replace mode - clear existing sources
    if (options.importMode === IMPORT_MODES.REPLACE) {
      await this._clearExistingSources();
    }

    // Import sources one by one
    for (const source of sourcesToImport) {
      try {
        const result = await this._importSingleSource(source, options);
        if (result.imported) {
          stats.imported++;
        } else if (result.skipped) {
          stats.skipped++;
        }
      } catch (error) {
        log.error(`Failed to import source ${source.sourceId}:`, error);
        stats.errors.push({
          source: source.sourceId,
          error: error.message
        });
      }
    }

    log.info(`Sources import completed: ${stats.imported} imported, ${stats.skipped} skipped, ${stats.errors.length} errors`);
    return stats;
  }

  /**
   * Imports a single source with duplicate detection
   * @param {Object} source - Source to import
   * @param {Object} options - Import options
   * @returns {Promise<Object>} - Import result
   * @private
   */
  async _importSingleSource(source: Record<string, any>, options: Record<string, any>) {
    // Validate source structure
    const validation = validateSource(source);
    if (!validation.success) {
      throw new Error(`Invalid source structure: ${validation.error}`);
    }

    // Check for duplicates in merge mode
    if (options.importMode === IMPORT_MODES.MERGE) {
      const currentSources = this._getCurrentSources();
      const isDuplicate = isSourceDuplicate(source as any, currentSources as any);
      
      if (isDuplicate) {
        log.debug(`Skipping duplicate source: ${source.sourceId}`);
        return { skipped: true };
      }
    }

    // Import the source
    await this._addSource(source);
    log.debug(`Successfully imported source: ${source.sourceId}`);
    return { imported: true };
  }

  /**
   * Gets current sources from the application state
   * @returns {Array} - Current sources
   * @private
   */
  _getCurrentSources() {
    try {
      return this.dependencies.exportSources ? this.dependencies.exportSources() : [];
    } catch (error) {
      log.warn('Failed to get current sources:', error);
      return [];
    }
  }

  /**
   * Adds a source using the application's add source function
   * @param {Object} source - Source to add
   * @returns {Promise<boolean>} - Success status
   * @private
   */
  async _addSource(source: Record<string, unknown>) {
    // Dynamic import to avoid circular dependencies
    const mod = await import('../../../hooks/workspace/useSources') as any;
    const success = await mod.addSource(source);
    
    if (!success) {
      throw new Error('Add source operation returned false');
    }
    
    return true;
  }

  /**
   * Clears all existing sources (used in replace mode)
   * @returns {Promise<void>}
   * @private
   */
  async _clearExistingSources() {
    const currentSources = this._getCurrentSources();
    const { removeSource } = this.dependencies;
    
    if (!removeSource) {
      throw new Error('Remove source function not available');
    }

    log.info(`Clearing ${currentSources.length} existing sources`);
    
    for (const source of currentSources) {
      try {
        await removeSource(source.sourceId);
      } catch (error) {
        log.warn(`Failed to remove source ${source.sourceId}:`, error);
      }
    }
  }

  /**
   * Validates sources array for export
   * @param {Array} sources - Sources to validate
   * @returns {Object} - Validation result
   */
  validateSourcesForExport(sources: Array<Record<string, unknown>>) {
    if (!Array.isArray(sources)) {
      return {
        success: false,
        error: 'Sources must be an array'
      };
    }

    const errors = [];
    sources.forEach((source, index) => {
      const validation = validateSource(source);
      if (!validation.success) {
        errors.push(`Source ${index + 1}: ${validation.error}`);
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
   * Gets statistics about sources for reporting
   * @param {Array} sources - Sources array
   * @returns {Object} - Statistics object
   */
  getSourcesStatistics(sources: Array<Record<string, unknown>>) {
    if (!Array.isArray(sources)) {
      return { total: 0, byType: {} };
    }

    const stats: { total: number; byType: Record<string, number> } = {
      total: sources.length,
      byType: {}
    };

    sources.forEach(source => {
      const type = (source.sourceType as string) || 'unknown';
      stats.byType[type] = (stats.byType[type] || 0) + 1;
    });

    return stats;
  }
}