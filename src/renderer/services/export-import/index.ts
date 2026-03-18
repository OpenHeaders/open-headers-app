/**
 * Export/Import System - Main Entry Point
 * 
 * This module provides convenient access to all export/import functionality
 * through a clean, organized API.
 */

// Core Services
import { ExportService } from './core/ExportService';
import { ImportService } from './core/ImportService';
export { ExportService, ImportService };

// Configuration and Constants
export * from './core/ExportImportConfig';

// Handlers
export { SourcesHandler } from './handlers/SourcesHandler';
export { ProxyRulesHandler } from './handlers/ProxyRulesHandler';
export { RulesHandler } from './handlers/RulesHandler';
export { EnvironmentsHandler } from './handlers/EnvironmentsHandler';
export { WorkspaceHandler } from './handlers/WorkspaceHandler';

// Utilities
export * from './utilities/ValidationUtils';
export * from './utilities/FileOperations';
export * from './utilities/MessageGeneration';
export * from './utilities/DuplicateDetection';


/**
 * Creates both export and import services with shared dependencies
 * @param {Object} dependencies - Application dependencies
 * @returns {Object} - Object containing both services
 */
export function createExportImportServices(dependencies: { [key: string]: unknown }) {
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
export function validateDependencies(dependencies: { [key: string]: unknown }) {
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