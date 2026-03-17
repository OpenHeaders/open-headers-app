/**
 * Export/Import System - Main Entry Point
 * 
 * This module provides convenient access to all export/import functionality
 * through a clean, organized API.
 */

// Core Services
export { ExportService } from './core/ExportService.js';
export { ImportService } from './core/ImportService.js';

// Configuration and Constants
export * from './core/ExportImportConfig.js';

// Handlers
export { SourcesHandler } from './handlers/SourcesHandler.js';
export { ProxyRulesHandler } from './handlers/ProxyRulesHandler.js';
export { RulesHandler } from './handlers/RulesHandler.js';
export { EnvironmentsHandler } from './handlers/EnvironmentsHandler.js';
export { WorkspaceHandler } from './handlers/WorkspaceHandler.js';

// Utilities
export * from './utilities/ValidationUtils.js';
export * from './utilities/FileOperations.js';
export * from './utilities/MessageGeneration.js';
export * from './utilities/DuplicateDetection.js';


/**
 * Creates both export and import services with shared dependencies
 * @param {Object} dependencies - Application dependencies
 * @returns {Object} - Object containing both services
 */
export function createExportImportServices(dependencies) {
  // Import locally to avoid warnings about import usage
  const { ExportService } = require('./core/ExportService.js');
  const { ImportService } = require('./core/ImportService.js');
  
  return {
    exportService: new ExportService(dependencies),
    importService: new ImportService(dependencies)
  };
}

/**
 * Validates application dependencies for export/import operations
 * @param {Object} dependencies - Dependencies to validate
 * @returns {Object} - Validation result
 */
export function validateDependencies(dependencies) {
  const required = [
    'sources', 
    'activeWorkspaceId',
    'exportSources',
    'removeSource',
    'workspaces',
    'createWorkspace',
    'switchWorkspace',
    'environments',
    'createEnvironment',
    'setVariable',
    'generateEnvironmentSchema'
  ];

  // appVersion can be empty string initially, so check differently
  const missing = required.filter(dep => !dependencies[dep]);
  
  // Allow appVersion to be empty string during initial load
  if (!dependencies.hasOwnProperty('appVersion')) {
    missing.push('appVersion');
  }
  
  if (missing.length > 0) {
    return {
      success: false,
      error: `Missing required dependencies: ${missing.join(', ')}`
    };
  }

  return { success: true };
}