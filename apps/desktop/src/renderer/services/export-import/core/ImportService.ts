/**
 * Import Service - Core import orchestration
 *
 * This service coordinates the import process across all data types,
 * handles file parsing, validation, and provides comprehensive error handling.
 */

import { errorMessage } from '../../../../types/common';
import { createLogger } from '../../../utils/error-handling/logger';
import { showMessage } from '../../../utils/ui/messageUtil';
import { IMPORT_MODES, SUCCESS_MESSAGES } from '../core/ExportImportConfig';
import { EnvironmentsHandler } from '../handlers/EnvironmentsHandler';
import { ProxyRulesHandler } from '../handlers/ProxyRulesHandler';
import { RulesHandler } from '../handlers/RulesHandler';
import { SourcesHandler } from '../handlers/SourcesHandler';
import { WorkspaceHandler } from '../handlers/WorkspaceHandler';
import { generateImportSuccessMessage, generateImportWarnings } from '../utilities/MessageGeneration';
import { validateAndParseFileContent, validateImportPayload } from '../utilities/ValidationUtils';
import type { ExportImportDependencies, ImportData, ImportOptions } from './types';

const log = createLogger('ImportService');

/** Import statistics */
interface ImportStats {
  sourcesImported: number;
  sourcesSkipped: number;
  proxyRulesImported: number;
  proxyRulesSkipped: number;
  rulesImported: { total: number; [key: string]: number };
  rulesSkipped: { total: number; [key: string]: number };
  environmentsImported: number;
  variablesCreated: number;
  errors: Array<{ error: string; context?: string }>;
  createdWorkspace?: { name?: string; type?: string; id?: string } | null;
}

/**
 * Import Service Class
 * Orchestrates the complete import process for all data types
 */
export class ImportService {
  dependencies: ExportImportDependencies;
  sourcesHandler: SourcesHandler;
  proxyRulesHandler: ProxyRulesHandler;
  rulesHandler: RulesHandler;
  environmentsHandler: EnvironmentsHandler;
  workspaceHandler: WorkspaceHandler;

  constructor(dependencies: ExportImportDependencies) {
    this.dependencies = dependencies;

    // Initialize handlers
    this.sourcesHandler = new SourcesHandler(dependencies);
    this.proxyRulesHandler = new ProxyRulesHandler(dependencies);
    this.rulesHandler = new RulesHandler(dependencies);
    this.environmentsHandler = new EnvironmentsHandler(dependencies);
    this.workspaceHandler = new WorkspaceHandler(dependencies);
  }

  /**
   * Executes the complete import process
   * @param {Object} importOptions - Import configuration options
   * @returns {Promise<void>}
   */
  async execute(importOptions: ImportOptions) {
    const startTime = Date.now();
    log.info('Starting import process', { mode: importOptions.importMode, isGitSync: importOptions.isGitSync });

    try {
      // Validate import options
      this._validateImportOptions(importOptions);

      // Parse and validate file content
      const { importData, envData } = await this._parseImportFiles(importOptions);

      // Validate import payload
      this._validateImportPayload(importData);

      // Show warnings if any
      this._showImportWarnings(importData, importOptions);

      // Handle workspace import first (if present)
      const workspaceStats = await this._handleWorkspaceImport(importData, importOptions);

      // Import all data types
      const importStats = await this._importAllDataTypes(importData, envData, importOptions);

      // Merge workspace stats
      if (workspaceStats.createdWorkspace) {
        importStats.createdWorkspace = workspaceStats.createdWorkspace;
      }

      // Emit final events and show success message
      await this._finalizeImport(importStats, importOptions);

      const duration = Date.now() - startTime;
      log.info(`Import completed successfully in ${duration}ms`, importStats);
    } catch (error) {
      log.error('Import process failed:', error);
      showMessage('error', `Import failed: ${errorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Parses and validates import files
   * @param {Object} importOptions - Import options
   * @returns {Promise<Object>} - Parsed import data and environment data
   * @private
   */
  async _parseImportFiles(importOptions: ImportOptions) {
    // Parse main file content
    const mainFileResult = validateAndParseFileContent(importOptions.fileContent);
    if (!mainFileResult.success) {
      throw new Error(`Main file parsing failed: ${mainFileResult.error}`);
    }

    if (!mainFileResult.data) {
      throw new Error('Main file parsing returned no data');
    }
    const importData = mainFileResult.data as ImportData;
    let envData: ImportData | null = null;

    // Parse environment file if provided
    if (importOptions.envFileContent) {
      const envFileResult = validateAndParseFileContent(importOptions.envFileContent);
      if (!envFileResult.success) {
        throw new Error(`Environment file parsing failed: ${envFileResult.error}`);
      }
      envData = (envFileResult.data as ImportData) ?? null;
    }

    // Merge environment data if from separate file
    if (envData) {
      if (envData.environmentSchema) {
        importData.environmentSchema = envData.environmentSchema as ImportData['environmentSchema'];
      }
      if (envData.environments) {
        importData.environments = envData.environments as ImportData['environments'];
      }
    }

    log.debug('Import files parsed successfully', {
      hasMainData: !!importData,
      hasEnvData: !!envData,
      version: importData.version,
    });

    return { importData, envData };
  }

  /**
   * Handles workspace import if workspace data is present
   * @param {Object} importData - Import data
   * @param {Object} importOptions - Import options
   * @returns {Promise<Object>} - Workspace import statistics
   * @private
   */
  async _handleWorkspaceImport(importData: ImportData, importOptions: ImportOptions) {
    if (!importOptions.workspaceInfo && !importData.workspace) {
      return { createdWorkspace: null };
    }

    const workspaceInfo = importOptions.workspaceInfo || importData.workspace;
    return await this.workspaceHandler.importWorkspace(workspaceInfo ?? null, importOptions);
  }

  /**
   * Imports all selected data types
   * @param {Object} importData - Import data
   * @param {Object} envData - Environment data (if separate)
   * @param {Object} importOptions - Import options
   * @returns {Promise<Object>} - Combined import statistics
   * @private
   */
  async _importAllDataTypes(importData: ImportData, _envData: ImportData | null, importOptions: ImportOptions) {
    const { selectedItems } = importOptions;

    const allStats: ImportStats = {
      sourcesImported: 0,
      sourcesSkipped: 0,
      proxyRulesImported: 0,
      proxyRulesSkipped: 0,
      rulesImported: { total: 0 },
      rulesSkipped: { total: 0 },
      environmentsImported: 0,
      variablesCreated: 0,
      errors: [],
    };

    // Import sources
    if (selectedItems.sources && importData.sources) {
      const sourcesStats = await this.sourcesHandler.importSources(importData.sources, importOptions);
      allStats.sourcesImported = sourcesStats.imported;
      allStats.sourcesSkipped = sourcesStats.skipped;
      allStats.errors.push(...sourcesStats.errors);
    }

    // Import proxy rules
    if (selectedItems.proxyRules && importData.proxyRules) {
      const proxyStats = await this.proxyRulesHandler.importProxyRules(importData.proxyRules, importOptions);
      allStats.proxyRulesImported = proxyStats.imported;
      allStats.proxyRulesSkipped = proxyStats.skipped;
      allStats.errors.push(...proxyStats.errors);
    }

    // Import rules
    if (selectedItems.rules && (importData.rules || importData.rulesMetadata)) {
      const rulesData = {
        rules: importData.rules,
        metadata: importData.rulesMetadata,
      };
      const rulesStats = await this.rulesHandler.importRules(rulesData, importOptions);
      allStats.rulesImported = { total: 0, ...rulesStats.imported };
      allStats.rulesSkipped = { total: 0, ...rulesStats.skipped };
      allStats.errors.push(...rulesStats.errors);
    }

    // Import environments
    if (selectedItems.environments) {
      // Cast through intermediate type for handler-specific ImportData compatibility
      const envStats = await this.environmentsHandler.importEnvironments(importData, importOptions);
      allStats.environmentsImported = envStats.environmentsImported;
      allStats.variablesCreated = envStats.variablesCreated;
      allStats.errors.push(...envStats.errors);
    }

    return allStats;
  }

  /**
   * Finalizes the import process with events and messages
   * @param {Object} importStats - Import statistics
   * @param {Object} importOptions - Import options
   * @returns {Promise<void>}
   * @private
   */
  async _finalizeImport(importStats: ImportStats, importOptions: ImportOptions) {
    const hasImportedData = this._hasImportedData(importStats);

    if (hasImportedData) {
      // Generate and show success message (includes variable count)
      const successMessage = generateImportSuccessMessage(importStats, importOptions.isGitSync);
      showMessage('success', successMessage);

      // Show workspace sync success message for Git sync operations
      if (importOptions.isGitSync) {
        showMessage('success', SUCCESS_MESSAGES.WORKSPACE_SYNC_SUCCESS);
      }
    } else {
      showMessage('warning', 'No new data was imported');
    }

    // Log any errors that occurred during import
    if (importStats.errors && importStats.errors.length > 0) {
      log.warn(`Import completed with ${importStats.errors.length} errors:`, importStats.errors);
    }
  }

  /**
   * Shows import warnings if any potential issues are detected
   * @param {Object} importData - Import data to analyze
   * @param {Object} importOptions - Import options
   * @private
   */
  _showImportWarnings(importData: ImportData, importOptions: ImportOptions) {
    const warnings = generateImportWarnings(importData, importOptions);
    if (warnings) {
      showMessage('warning', warnings);
    }
  }

  /**
   * Validates import options
   * @param {Object} importOptions - Import options to validate
   * @throws {Error} - If validation fails
   * @private
   */
  _validateImportOptions(importOptions: ImportOptions) {
    if (!importOptions || typeof importOptions !== 'object') {
      throw new Error('Import options must be provided as an object');
    }

    const { fileContent, selectedItems, importMode } = importOptions;

    if (!fileContent || typeof fileContent !== 'string') {
      throw new Error('File content must be provided as a string');
    }

    if (!selectedItems || typeof selectedItems !== 'object') {
      throw new Error('Selected items must be specified');
    }

    if (importMode && !Object.values(IMPORT_MODES).includes(importMode)) {
      throw new Error(`Invalid import mode: ${importMode}`);
    }

    // Check if at least one item is selected
    const hasSelection = Object.values(selectedItems).some((selected) => selected === true);
    if (!hasSelection) {
      throw new Error('At least one data type must be selected for import');
    }
  }

  /**
   * Validates the complete import payload
   * @param {Object} importData - Import data to validate
   * @throws {Error} - If validation fails
   * @private
   */
  _validateImportPayload(importData: ImportData) {
    const validation = validateImportPayload(importData);
    if (!validation.success) {
      throw new Error(`Import data validation failed: ${validation.error}`);
    }

    if (validation.warnings && validation.warnings.length > 0) {
      log.warn('Import validation warnings:', validation.warnings);
    }
  }

  /**
   * Checks if any data was actually imported
   * @param {Object} importStats - Import statistics
   * @returns {boolean} - Whether any data was imported
   * @private
   */
  _hasImportedData(importStats: ImportStats) {
    return (
      importStats.sourcesImported > 0 ||
      importStats.proxyRulesImported > 0 ||
      importStats.rulesImported.total > 0 ||
      importStats.environmentsImported > 0 ||
      !!importStats.createdWorkspace
    );
  }

  /**
   * Gets import statistics for reporting
   * @param {Object} importStats - Import statistics to analyze
   * @returns {Object} - Comprehensive import statistics
   */
  getImportStatistics(importStats: ImportStats) {
    const stats = {
      totalImported: 0,
      totalSkipped: 0,
      totalErrors: importStats.errors ? importStats.errors.length : 0,
      dataTypes: {} as {
        sources?: { imported: number; skipped: number };
        proxyRules?: { imported: number; skipped: number };
        rules?: { imported: number; skipped: number; byType: Record<string, number> };
        environments?: { environmentsImported: number; variablesCreated: number };
        workspace?: { created: boolean; name: string; type: string };
      },
    };

    // Sources statistics
    if (importStats.sourcesImported || importStats.sourcesSkipped) {
      stats.dataTypes.sources = {
        imported: importStats.sourcesImported || 0,
        skipped: importStats.sourcesSkipped || 0,
      };
      stats.totalImported += stats.dataTypes.sources.imported;
      stats.totalSkipped += stats.dataTypes.sources.skipped;
    }

    // Proxy rules statistics
    if (importStats.proxyRulesImported || importStats.proxyRulesSkipped) {
      stats.dataTypes.proxyRules = {
        imported: importStats.proxyRulesImported || 0,
        skipped: importStats.proxyRulesSkipped || 0,
      };
      stats.totalImported += stats.dataTypes.proxyRules.imported;
      stats.totalSkipped += stats.dataTypes.proxyRules.skipped;
    }

    // Rules statistics
    if (importStats.rulesImported?.total) {
      stats.dataTypes.rules = {
        imported: importStats.rulesImported.total,
        skipped: importStats.rulesSkipped ? importStats.rulesSkipped.total : 0,
        byType: { ...importStats.rulesImported },
      };
      delete stats.dataTypes.rules.byType?.total;
      stats.totalImported += stats.dataTypes.rules.imported ?? 0;
      stats.totalSkipped += stats.dataTypes.rules.skipped ?? 0;
    }

    // Environment statistics
    if (importStats.environmentsImported || importStats.variablesCreated) {
      stats.dataTypes.environments = {
        environmentsImported: importStats.environmentsImported || 0,
        variablesCreated: importStats.variablesCreated || 0,
      };
    }

    // Workspace statistics
    if (importStats.createdWorkspace) {
      stats.dataTypes.workspace = {
        created: true,
        name: importStats.createdWorkspace.name ?? '',
        type: importStats.createdWorkspace.type ?? '',
      };
    }

    return stats;
  }
}
