/**
 * Export Service - Core export orchestration
 * 
 * This service coordinates the export process across all data types,
 * handles file operations, and provides comprehensive error handling.
 */

import { SourcesHandler } from '../handlers/SourcesHandler.js';
import { ProxyRulesHandler } from '../handlers/ProxyRulesHandler.js';
import { RulesHandler } from '../handlers/RulesHandler.js';
import { EnvironmentsHandler } from '../handlers/EnvironmentsHandler.js';
import { WorkspaceHandler } from '../handlers/WorkspaceHandler.js';
import { 
  generateTimestampedFilename, 
  handleSingleFileExport, 
  handleMultiFileExport 
} from '../utilities/FileOperations.js';
import { generateExportSuccessMessage } from '../utilities/MessageGeneration.js';
import { showMessage } from '../../../utils/ui/messageUtil';
import { FILE_FORMATS, DEFAULTS } from './ExportImportConfig.js';

const { createLogger } = require('../../../utils/error-handling/logger');
const log = createLogger('ExportService');

/**
 * Export Service Class
 * Orchestrates the complete export process for all data types
 */
export class ExportService {
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
   * Executes the complete export process
   * @param {Object} exportOptions - Export configuration options
   * @returns {Promise<void>}
   */
  async execute(exportOptions) {
    const startTime = Date.now();
    log.info('Starting export process', { options: this._sanitizeOptionsForLogging(exportOptions) });

    try {
      // Validate export options
      this._validateExportOptions(exportOptions);

      // Gather all export data
      const exportData = await this._gatherExportData(exportOptions);

      // Validate collected data
      this._validateExportData(exportData, exportOptions);

      // Handle file export based on format
      const writtenFiles = await this._handleFileExport(exportData, exportOptions);

      // Generate and show success message
      const successMessage = generateExportSuccessMessage(exportOptions, exportData, writtenFiles);
      showMessage('success', successMessage);

      const duration = Date.now() - startTime;
      log.info(`Export completed successfully in ${duration}ms`, { 
        files: writtenFiles.length,
        size: this._calculateExportSize(exportData)
      });

    } catch (error) {
      log.error('Export process failed:', error);
      showMessage('error', `Export failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gathers export data from all selected data types
   * @param {Object} exportOptions - Export configuration options
   * @returns {Promise<Object>} - Collected export data
   * @private
   */
  async _gatherExportData(exportOptions) {
    const { selectedItems, appVersion } = exportOptions;
    
    const exportData = {
      version: appVersion || DEFAULTS.APP_VERSION
    };

    log.debug('Gathering export data for selected items:', selectedItems);

    // Collect data from each handler in parallel for better performance
    const gatherPromises = [];

    if (selectedItems.sources) {
      gatherPromises.push(
        this.sourcesHandler.exportSources(exportOptions)
          .then(data => ({ key: 'sources', data }))
      );
    }

    if (selectedItems.proxyRules) {
      gatherPromises.push(
        this.proxyRulesHandler.exportProxyRules(exportOptions)
          .then(data => ({ key: 'proxyRules', data }))
      );
    }

    if (selectedItems.rules) {
      gatherPromises.push(
        this.rulesHandler.exportRules(exportOptions)
          .then(data => ({ key: 'rules', data }))
      );
    }

    // Environment data export
    const environmentData = await this.environmentsHandler.exportEnvironments(exportOptions);
    if (environmentData) {
      Object.assign(exportData, environmentData);
    }

    // Workspace data export
    const workspaceData = await this.workspaceHandler.exportWorkspace(exportOptions);
    if (workspaceData) {
      exportData.workspace = workspaceData;
    }

    // Wait for all data gathering to complete
    const results = await Promise.all(gatherPromises);
    
    // Merge results into export data
    results.forEach(({ key, data }) => {
      if (data !== null) {
        if (key === 'rules' && data.rules && data.rulesMetadata) {
          exportData.rules = data.rules;
          exportData.rulesMetadata = data.rulesMetadata;
        } else {
          exportData[key] = data;
        }
      }
    });

    const itemCount = this._countExportItems(exportData);
    log.info(`Gathered export data: ${itemCount} total items`);

    return exportData;
  }

  /**
   * Handles file export based on the selected format
   * @param {Object} exportData - Data to export
   * @param {Object} exportOptions - Export configuration options
   * @returns {Promise<Array<string>>} - Array of written file paths
   * @private
   */
  async _handleFileExport(exportData, exportOptions) {
    const { fileFormat } = exportOptions;

    if (fileFormat === FILE_FORMATS.SINGLE) {
      return await this._handleSingleFileExport(exportData);
    } else {
      return await this._handleSeparateFilesExport(exportData, exportOptions);
    }
  }

  /**
   * Handles single file export
   * @param {Object} exportData - Data to export
   * @returns {Promise<Array<string>>} - Array with single file path
   * @private
   */
  async _handleSingleFileExport(exportData) {
    const filename = generateTimestampedFilename('open-headers-config', '', 'json');
    
    const filePath = await handleSingleFileExport({
      filename,
      data: exportData
    });

    return [filePath];
  }

  /**
   * Handles separate files export
   * @param {Object} exportData - Data to export
   * @param {Object} exportOptions - Export configuration options
   * @returns {Promise<Array<string>>} - Array of written file paths
   * @private
   */
  async _handleSeparateFilesExport(exportData, exportOptions) {
    const { environmentOption } = exportOptions;
    
    // Separate environment data for separate file
    let environmentData = null;
    const mainData = { ...exportData };
    
    if (environmentOption !== 'none' && (exportData.environmentSchema || exportData.environments)) {
      environmentData = {};
      if (exportData.environmentSchema) {
        environmentData.environmentSchema = exportData.environmentSchema;
        delete mainData.environmentSchema;
      }
      if (exportData.environments) {
        environmentData.environments = exportData.environments;
        delete mainData.environments;
      }
    }

    const mainFilename = generateTimestampedFilename('open-headers-config', '', 'json');
    const envFilename = environmentData ? generateTimestampedFilename('open-headers-env', '', 'json') : null;

    return await handleMultiFileExport({
      title: 'Export Configuration',
      mainFilename,
      environmentFilename: envFilename,
      mainData,
      environmentData
    });
  }

  /**
   * Validates export options
   * @param {Object} exportOptions - Export options to validate
   * @throws {Error} - If validation fails
   * @private
   */
  _validateExportOptions(exportOptions) {
    if (!exportOptions || typeof exportOptions !== 'object') {
      throw new Error('Export options must be provided as an object');
    }

    const { selectedItems, fileFormat } = exportOptions;

    if (!selectedItems || typeof selectedItems !== 'object') {
      throw new Error('Selected items must be specified');
    }

    // Check if at least one item is selected
    const hasSelection = Object.values(selectedItems).some(selected => selected === true);
    if (!hasSelection) {
      throw new Error('At least one data type must be selected for export');
    }

    if (fileFormat && !Object.values(FILE_FORMATS).includes(fileFormat)) {
      throw new Error(`Invalid file format: ${fileFormat}`);
    }
  }

  /**
   * Validates collected export data
   * @param {Object} exportData - Export data to validate
   * @param {Object} exportOptions - Export options for context
   * @throws {Error} - If validation fails
   * @private
   */
  _validateExportData(exportData, exportOptions) {
    const { selectedItems } = exportOptions;
    const validationErrors = [];

    // Validate each data type if it was selected
    if (selectedItems.sources && exportData.sources) {
      const validation = this.sourcesHandler.validateSourcesForExport(exportData.sources);
      if (!validation.success) {
        validationErrors.push(`Sources validation failed: ${validation.error}`);
      }
    }

    if (selectedItems.proxyRules && exportData.proxyRules) {
      const validation = this.proxyRulesHandler.validateProxyRulesForExport(exportData.proxyRules);
      if (!validation.success) {
        validationErrors.push(`Proxy rules validation failed: ${validation.error}`);
      }
    }

    if (selectedItems.rules && (exportData.rules || exportData.rulesMetadata)) {
      const rulesData = { rules: exportData.rules, rulesMetadata: exportData.rulesMetadata };
      const validation = this.rulesHandler.validateRulesForExport(rulesData);
      if (!validation.success) {
        validationErrors.push(`Rules validation failed: ${validation.error}`);
      }
    }

    if (exportData.environmentSchema || exportData.environments) {
      const envData = { 
        environmentSchema: exportData.environmentSchema, 
        environments: exportData.environments 
      };
      const validation = this.environmentsHandler.validateEnvironmentsForExport(envData);
      if (!validation.success) {
        validationErrors.push(`Environments validation failed: ${validation.error}`);
      }
    }

    if (exportData.workspace) {
      const validation = this.workspaceHandler.validateWorkspaceForExport(exportData.workspace);
      if (!validation.success) {
        validationErrors.push(`Workspace validation failed: ${validation.error}`);
      }
    }

    if (validationErrors.length > 0) {
      throw new Error(`Export data validation failed: ${validationErrors.join('; ')}`);
    }
  }

  /**
   * Counts the total number of items in export data
   * @param {Object} exportData - Export data to count
   * @returns {number} - Total item count
   * @private
   */
  _countExportItems(exportData) {
    let count = 0;

    if (exportData.sources && Array.isArray(exportData.sources)) {
      count += exportData.sources.length;
    }

    if (exportData.proxyRules && Array.isArray(exportData.proxyRules)) {
      count += exportData.proxyRules.length;
    }

    if (exportData.rules && typeof exportData.rules === 'object') {
      count += Object.values(exportData.rules).reduce((sum, rules) => 
        sum + (Array.isArray(rules) ? rules.length : 0), 0);
    }

    if (exportData.environments && typeof exportData.environments === 'object') {
      count += Object.values(exportData.environments).reduce((sum, env) => {
        if (env && typeof env === 'object' && !Array.isArray(env)) {
          return sum + Object.keys(env).length;
        }
        return sum;
      }, 0);
    }

    if (exportData.workspace) {
      count += 1;
    }

    return count;
  }

  /**
   * Calculates approximate size of export data
   * @param {Object} exportData - Export data to measure
   * @returns {string} - Human-readable size estimate
   * @private
   */
  _calculateExportSize(exportData) {
    try {
      const jsonString = JSON.stringify(exportData);
      const bytes = new Blob([jsonString]).size;
      
      if (bytes < 1024) return `${bytes} bytes`;
      if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
      return `${Math.round(bytes / (1024 * 1024) * 100) / 100} MB`;
    } catch (error) {
      return 'unknown size';
    }
  }

  /**
   * Sanitizes export options for logging (removes sensitive data)
   * @param {Object} exportOptions - Export options to sanitize
   * @returns {Object} - Sanitized options for logging
   * @private
   */
  _sanitizeOptionsForLogging(exportOptions) {
    const sanitized = { ...exportOptions };
    
    // Remove potentially sensitive workspace data
    if (sanitized.currentWorkspace && sanitized.currentWorkspace.authData) {
      sanitized.currentWorkspace = {
        ...sanitized.currentWorkspace,
        authData: '[REDACTED]'
      };
    }

    return sanitized;
  }

  /**
   * Gets export statistics for reporting
   * @param {Object} exportData - Export data to analyze
   * @returns {Object} - Comprehensive export statistics
   */
  getExportStatistics(exportData) {
    const stats = {
      version: exportData.version,
      totalItems: this._countExportItems(exportData),
      estimatedSize: this._calculateExportSize(exportData),
      dataTypes: {}
    };

    if (exportData.sources) {
      stats.dataTypes.sources = this.sourcesHandler.getSourcesStatistics(exportData.sources);
    }

    if (exportData.proxyRules) {
      stats.dataTypes.proxyRules = this.proxyRulesHandler.getProxyRulesStatistics(exportData.proxyRules);
    }

    if (exportData.rules || exportData.rulesMetadata) {
      const rulesData = { rules: exportData.rules, rulesMetadata: exportData.rulesMetadata };
      stats.dataTypes.rules = this.rulesHandler.getRulesStatistics(rulesData);
    }

    if (exportData.environmentSchema || exportData.environments) {
      const envData = { 
        environmentSchema: exportData.environmentSchema, 
        environments: exportData.environments 
      };
      stats.dataTypes.environments = this.environmentsHandler.getEnvironmentStatistics(envData);
    }

    if (exportData.workspace) {
      stats.dataTypes.workspace = this.workspaceHandler.getWorkspaceStatistics(exportData.workspace);
    }

    return stats;
  }

}