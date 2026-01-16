/**
 * Message Generation Utilities for Export/Import Operations
 * 
 * This module provides functions for generating user-friendly messages for various
 * export/import scenarios and outcomes. It creates consistent, informative messages
 * for success, error, progress, and warning situations.
 * 
 * Key features:
 * - Contextual success messages with detailed statistics
 * - Comprehensive error messages with operation context
 * - Progress tracking messages for long-running operations
 * - Warning messages for potential issues
 * - Consistent message formatting across all operations
 * - Support for both regular imports and Git sync operations
 */

import { SUCCESS_MESSAGES, FILE_FORMATS } from '../core/ExportImportConfig.js';
import { DATA_FORMAT_VERSION } from '../../../../config/version.esm.js';

/**
 * Generates a success message for export operations
 * 
 * Creates a detailed success message showing what was exported and where.
 * Handles both single-file and multi-file export formats.
 * 
 * @param {Object} options - Export options used
 * @param {Object} exportedData - Data that was exported
 * @param {Array<string>} filePaths - Paths of files that were written
 * @returns {string} - Formatted success message
 */
export function generateExportSuccessMessage(options, exportedData, filePaths) {
  const { selectedItems, fileFormat, environmentOption, includeWorkspace, includeCredentials } = options;
  const exportedItems = [];

  // Add sources info
  if (selectedItems.sources && exportedData.sources) {
    exportedItems.push(`${exportedData.sources.length} source(s)`);
  }

  // Add rules info
  if (selectedItems.rules && exportedData.rules) {
    const totalRules = Object.values(exportedData.rules).reduce((sum, ruleArray) => sum + ruleArray.length, 0);
    exportedItems.push(`${totalRules} rule(s)`);
  }

  // Add proxy rules info
  if (selectedItems.proxyRules && exportedData.proxyRules) {
    exportedItems.push(`${exportedData.proxyRules.length} proxy rule(s)`);
  }

  // Add environment info
  if (environmentOption !== 'none') {
    const envDescription = environmentOption === 'schema' ? 'environment schema' : 'environments with values';
    exportedItems.push(envDescription);
  }

  // Add workspace info
  if (includeWorkspace) {
    const workspaceDescription = includeCredentials 
      ? 'workspace configuration with credentials' 
      : 'workspace configuration';
    exportedItems.push(workspaceDescription);
  }

  // Create final message
  const itemsDescription = exportedItems.length > 0 ? exportedItems.join(', ') : 'configuration';
  
  if (fileFormat === FILE_FORMATS.SEPARATE && filePaths.length > 1) {
    return `${SUCCESS_MESSAGES.EXPORT_COMPLETE} configuration to ${filePaths.length} files`;
  } else {
    return `${SUCCESS_MESSAGES.EXPORT_COMPLETE} ${itemsDescription}`;
  }
}

/**
 * Generates a success message for import operations
 * 
 * Creates a comprehensive success message showing import statistics including
 * what was imported, what was skipped, and any new workspaces created.
 * 
 * @param {Object} importStats - Statistics about what was imported
 * @param {boolean} isGitSync - Whether this was a Git sync operation
 * @returns {string} - Formatted success message
 */
export function generateImportSuccessMessage(importStats, isGitSync = false) {
  const {
    sourcesImported = 0,
    sourcesSkipped = 0,
    proxyRulesImported = 0,
    proxyRulesSkipped = 0,
    rulesImported = { total: 0 },
    rulesSkipped = { total: 0 },
    environmentsImported = 0,
    createdWorkspace = null
  } = importStats;

  const messages = [];

  // Add sources info
  if (sourcesImported > 0) {
    messages.push(`${sourcesImported} source(s)`);
  }
  if (sourcesSkipped > 0) {
    messages.push(`${sourcesSkipped} duplicate source(s) skipped`);
  }

  // Add rules info
  if (rulesImported.total > 0) {
    const ruleDetails = Object.entries(rulesImported)
      .filter(([type, count]) => type !== 'total' && count > 0)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    messages.push(`${rulesImported.total} rule(s) (${ruleDetails})`);
  }
  if (rulesSkipped.total > 0) {
    messages.push(`${rulesSkipped.total} duplicate rule(s) skipped`);
  }

  // Add proxy rules info
  if (proxyRulesImported > 0) {
    messages.push(`${proxyRulesImported} proxy rule(s)`);
  }
  if (proxyRulesSkipped > 0) {
    messages.push(`${proxyRulesSkipped} duplicate proxy rule(s) skipped`);
  }

  // Add environments info
  if (environmentsImported > 0) {
    messages.push(`${environmentsImported} environment(s)`);
  }

  // Add workspace info
  if (createdWorkspace) {
    messages.push(`workspace "${createdWorkspace.name}"`);
  }

  if (messages.length === 0) {
    return 'No new data was imported';
  }

  const messagePrefix = isGitSync ? SUCCESS_MESSAGES.GIT_SYNC_COMPLETE : SUCCESS_MESSAGES.IMPORT_COMPLETE;
  return `${messagePrefix}: ${messages.join(', ')}`;
}

/**
 * Generates a detailed import summary for logging
 * 
 * Creates a structured summary suitable for logging and debugging.
 * Includes all import statistics in a compact format.
 * 
 * @param {Object} importStats - Statistics about what was imported
 * @returns {string} - Detailed summary for logging
 */
export function generateImportSummary(importStats) {
  const {
    sourcesImported = 0,
    sourcesSkipped = 0,
    proxyRulesImported = 0,
    proxyRulesSkipped = 0,
    rulesImported = { total: 0 },
    rulesSkipped = { total: 0 },
    environmentsImported = 0,
    variablesCreated = 0,
    createdWorkspace = null
  } = importStats;

  const details = [
    `Sources: ${sourcesImported} imported, ${sourcesSkipped} skipped`,
    `Rules: ${rulesImported.total} imported, ${rulesSkipped.total} skipped`,
    `Proxy Rules: ${proxyRulesImported} imported, ${proxyRulesSkipped} skipped`,
    `Environments: ${environmentsImported} imported`,
    `Variables Created: ${variablesCreated}`,
    `Workspace Created: ${createdWorkspace ? createdWorkspace.name : 'None'}`
  ];

  return `Import Summary: ${details.join(' | ')}`;
}

/**
 * Generates a warning message for potentially problematic imports
 * 
 * Analyzes import data and options to identify potential issues such as
 * version mismatches, large datasets, or destructive operations.
 * 
 * @param {Object} importData - The import data being processed
 * @param {Object} options - Import options
 * @returns {string|null} - Warning message or null if no warnings
 */
export function generateImportWarnings(importData, options) {
  const warnings = [];

  // Check for version compatibility
  if (importData.version && importData.version !== DATA_FORMAT_VERSION) {
    warnings.push(`Import data is from version ${importData.version}, some features may not work correctly`);
  }

  // Check for large datasets
  const totalItems = (importData.sources?.length || 0) + 
                    (importData.proxyRules?.length || 0) + 
                    (Object.values(importData.rules || {}).reduce((sum, rules) => sum + rules.length, 0));
  
  if (totalItems > 100) {
    warnings.push(`Large dataset detected (${totalItems} items), import may take longer than usual`);
  }

  // Check for replace mode on large datasets
  if (options.importMode === 'replace' && totalItems > 50) {
    warnings.push('Replace mode will delete all existing data before importing');
  }

  // Check for workspace credentials
  if (importData.workspace?.authData && !options.includeCredentials) {
    warnings.push('Workspace contains authentication data that will be imported');
  }

  return warnings.length > 0 ? warnings.join('; ') : null;
}

/**
 * Generates an environment variables creation message
 * 
 * Creates a message informing users about environment variables that were created
 * during import, including which environments were affected.
 * 
 * @param {number} count - Number of variables created
 * @param {Array<string>} environmentNames - Names of environments affected
 * @returns {string|null} - Formatted message or null if no variables created
 */
export function generateEnvironmentVariablesMessage(count, environmentNames = []) {
  if (count === 0) {
    return null;
  }

  const envDescription = environmentNames.length > 0 
    ? ` in ${environmentNames.join(', ')}` 
    : '';

  return `Created ${count} environment variable(s)${envDescription}. ${SUCCESS_MESSAGES.ENVIRONMENT_VARIABLES_CREATED}`;
}

/**
 * Generates error messages with context
 * 
 * Creates detailed error messages that include contextual information about
 * the failed operation, such as file names, data types, and processing steps.
 * 
 * @param {Error} error - The error that occurred
 * @param {string} operation - The operation that failed ('export' or 'import')
 * @param {Object} context - Additional context about the operation
 * @returns {string} - Formatted error message
 */
export function generateErrorMessage(error, operation, context = {}) {
  const baseMessage = operation === 'export' 
    ? 'Error exporting data' 
    : 'Error importing data';

  const contextInfo = [];
  
  if (context.fileName) {
    contextInfo.push(`file: ${context.fileName}`);
  }
  
  if (context.dataType) {
    contextInfo.push(`type: ${context.dataType}`);
  }

  if (context.step) {
    contextInfo.push(`step: ${context.step}`);
  }

  const contextString = contextInfo.length > 0 ? ` (${contextInfo.join(', ')})` : '';
  
  return `${baseMessage}${contextString}: ${error.message}`;
}

/**
 * Generates progress messages for long-running operations
 * 
 * Creates progress messages with percentage completion for operations that
 * process multiple items, preventing UI freezing during large imports.
 * 
 * @param {string} operation - Current operation
 * @param {number} current - Current progress
 * @param {number} total - Total items to process
 * @param {string} itemType - Type of items being processed
 * @returns {string} - Progress message
 */
export function generateProgressMessage(operation, current, total, itemType = 'items') {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  return `${operation} ${itemType}: ${current}/${total} (${percentage}%)`;
}

