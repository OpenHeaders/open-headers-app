/**
 * Import Service - Core import orchestration
 * 
 * This service coordinates the import process across all data types,
 * handles file parsing, validation, and provides comprehensive error handling.
 */

import { SourcesHandler } from '../handlers/SourcesHandler.js';
import { ProxyRulesHandler } from '../handlers/ProxyRulesHandler.js';
import { RulesHandler } from '../handlers/RulesHandler.js';
import { EnvironmentsHandler } from '../handlers/EnvironmentsHandler.js';
import { WorkspaceHandler } from '../handlers/WorkspaceHandler.js';

import { validateAndParseFileContent, validateImportPayload } from '../utilities/ValidationUtils.js';
import { 
  generateImportSuccessMessage, 
  generateImportWarnings,
  generateEnvironmentVariablesMessage
} from '../utilities/MessageGeneration.js';
import { showMessage } from '../../../utils/ui/messageUtil';
import { IMPORT_MODES, SUCCESS_MESSAGES, EVENTS } from '../core/ExportImportConfig.js';

const { createLogger } = require('../../../utils/error-handling/logger');
const log = createLogger('ImportService');

/**
 * Import Service Class
 * Orchestrates the complete import process for all data types
 */
export class ImportService {
  constructor(dependencies) {
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
  async execute(importOptions) {
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
      showMessage('error', `Import failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parses and validates import files
   * @param {Object} importOptions - Import options
   * @returns {Promise<Object>} - Parsed import data and environment data
   * @private
   */
  async _parseImportFiles(importOptions) {
    // Parse main file content
    const mainFileResult = validateAndParseFileContent(importOptions.fileContent);
    if (!mainFileResult.success) {
      throw new Error(`Main file parsing failed: ${mainFileResult.error}`);
    }

    const importData = mainFileResult.data;
    let envData = null;

    // Parse environment file if provided
    if (importOptions.envFileContent) {
      const envFileResult = validateAndParseFileContent(importOptions.envFileContent);
      if (!envFileResult.success) {
        throw new Error(`Environment file parsing failed: ${envFileResult.error}`);
      }
      envData = envFileResult.data;
    }

    // Merge environment data if from separate file
    if (envData) {
      if (envData.environmentSchema) {
        importData.environmentSchema = envData.environmentSchema;
      }
      if (envData.environments) {
        importData.environments = envData.environments;
      }
    }

    log.debug('Import files parsed successfully', {
      hasMainData: !!importData,
      hasEnvData: !!envData,
      version: importData.version
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
  async _handleWorkspaceImport(importData, importOptions) {
    if (!importOptions.workspaceInfo && !importData.workspace) {
      return { createdWorkspace: null };
    }

    const workspaceInfo = importOptions.workspaceInfo || importData.workspace;
    return await this.workspaceHandler.importWorkspace(workspaceInfo, importOptions);
  }

  /**
   * Imports all selected data types
   * @param {Object} importData - Import data
   * @param {Object} envData - Environment data (if separate)
   * @param {Object} importOptions - Import options
   * @returns {Promise<Object>} - Combined import statistics
   * @private
   */
  async _importAllDataTypes(importData, envData, importOptions) {
    const { selectedItems } = importOptions;
    
    const allStats = {
      sourcesImported: 0,
      sourcesSkipped: 0,
      proxyRulesImported: 0,
      proxyRulesSkipped: 0,
      rulesImported: { total: 0 },
      rulesSkipped: { total: 0 },
      environmentsImported: 0,
      variablesCreated: 0,
      errors: []
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
        metadata: importData.rulesMetadata
      };
      const rulesStats = await this.rulesHandler.importRules(rulesData, importOptions);
      allStats.rulesImported = rulesStats.imported;
      allStats.rulesSkipped = rulesStats.skipped;
      allStats.errors.push(...rulesStats.errors);
    }

    // Import environments
    if (selectedItems.environments) {
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
  async _finalizeImport(importStats, importOptions) {
    const hasImportedData = this._hasImportedData(importStats);

    if (hasImportedData) {
      // Generate and show success message
      const successMessage = generateImportSuccessMessage(importStats, importOptions.isGitSync);
      showMessage('success', successMessage);

      // Show environment variables message if any were created
      if (importStats.variablesCreated > 0) {
        const envMessage = generateEnvironmentVariablesMessage(importStats.variablesCreated);
        if (envMessage) {
          showMessage('info', envMessage);
        }
      }

      // Emit workspace data refresh event if needed
      if (importStats.environmentsImported > 0 || importStats.rulesImported.total > 0) {
        this._emitWorkspaceDataRefreshEvent();
      }

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
  _showImportWarnings(importData, importOptions) {
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
  _validateImportOptions(importOptions) {
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
    const hasSelection = Object.values(selectedItems).some(selected => selected === true);
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
  _validateImportPayload(importData) {
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
  _hasImportedData(importStats) {
    return importStats.sourcesImported > 0 ||
           importStats.proxyRulesImported > 0 ||
           importStats.rulesImported.total > 0 ||
           importStats.environmentsImported > 0 ||
           !!importStats.createdWorkspace;
  }

  /**
   * Emits workspace data refresh event
   * @private
   */
  _emitWorkspaceDataRefreshEvent() {
    try {
      window.dispatchEvent(new CustomEvent(EVENTS.WORKSPACE_DATA_REFRESH, {
        detail: { workspaceId: this.dependencies.activeWorkspaceId }
      }));
    } catch (error) {
      log.warn('Failed to emit workspace data refresh event:', error);
    }
  }

  /**
   * Gets import statistics for reporting
   * @param {Object} importStats - Import statistics to analyze
   * @returns {Object} - Comprehensive import statistics
   */
  getImportStatistics(importStats) {
    const stats = {
      totalImported: 0,
      totalSkipped: 0,
      totalErrors: importStats.errors ? importStats.errors.length : 0,
      dataTypes: {}
    };

    // Sources statistics
    if (importStats.sourcesImported || importStats.sourcesSkipped) {
      stats.dataTypes.sources = {
        imported: importStats.sourcesImported || 0,
        skipped: importStats.sourcesSkipped || 0
      };
      stats.totalImported += stats.dataTypes.sources.imported;
      stats.totalSkipped += stats.dataTypes.sources.skipped;
    }

    // Proxy rules statistics
    if (importStats.proxyRulesImported || importStats.proxyRulesSkipped) {
      stats.dataTypes.proxyRules = {
        imported: importStats.proxyRulesImported || 0,
        skipped: importStats.proxyRulesSkipped || 0
      };
      stats.totalImported += stats.dataTypes.proxyRules.imported;
      stats.totalSkipped += stats.dataTypes.proxyRules.skipped;
    }

    // Rules statistics
    if (importStats.rulesImported && importStats.rulesImported.total) {
      stats.dataTypes.rules = {
        imported: importStats.rulesImported.total,
        skipped: importStats.rulesSkipped ? importStats.rulesSkipped.total : 0,
        byType: { ...importStats.rulesImported }
      };
      delete stats.dataTypes.rules.byType.total;
      stats.totalImported += stats.dataTypes.rules.imported;
      stats.totalSkipped += stats.dataTypes.rules.skipped;
    }

    // Environment statistics
    if (importStats.environmentsImported || importStats.variablesCreated) {
      stats.dataTypes.environments = {
        environmentsImported: importStats.environmentsImported || 0,
        variablesCreated: importStats.variablesCreated || 0
      };
    }

    // Workspace statistics
    if (importStats.createdWorkspace) {
      stats.dataTypes.workspace = {
        created: true,
        name: importStats.createdWorkspace.name,
        type: importStats.createdWorkspace.type
      };
    }

    return stats;
  }

}