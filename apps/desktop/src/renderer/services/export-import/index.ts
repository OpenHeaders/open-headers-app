/**
 * Export/Import System - Main Entry Point
 *
 * This module provides convenient access to all export/import functionality
 * through a clean, organized API.
 */

// Core Services
import { ExportService } from './core/ExportService';
import { ImportService } from './core/ImportService';

// Configuration and Constants
export * from './core/ExportImportConfig';

// Shared types
export type {
  EnvironmentVariable,
  ExportData,
  ExportImportDependencies,
  ExportOptions,
  ImportData,
  ImportOptions,
  RuleEntry,
  RulesStorage,
} from './core/types';
export { EnvironmentsHandler } from './handlers/EnvironmentsHandler';
export { ProxyRulesHandler } from './handlers/ProxyRulesHandler';
export { RulesHandler } from './handlers/RulesHandler';
// Handlers
export { SourcesHandler } from './handlers/SourcesHandler';
export { WorkspaceHandler } from './handlers/WorkspaceHandler';
export * from './utilities/DuplicateDetection';
export * from './utilities/FileOperations';
export * from './utilities/MessageGeneration';
// Utilities
export * from './utilities/ValidationUtils';
export { ExportService, ImportService };

/**
 * Creates both export and import services with shared dependencies
 * @param {Object} dependencies - Application dependencies
 * @returns {Object} - Object containing both services
 */
import type { ExportImportDependencies } from './core/types';

export function createExportImportServices(dependencies: ExportImportDependencies) {
  return {
    exportService: new ExportService(dependencies),
    importService: new ImportService(dependencies),
  };
}

/**
 * Validates application dependencies for export/import operations
 * @param {Object} dependencies - Dependencies to validate
 * @returns {Object} - Validation result
 */
export function validateDependencies(dependencies: ExportImportDependencies) {
  const required: (keyof ExportImportDependencies)[] = [
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
    'generateEnvironmentSchema',
  ];

  const missing = required.filter((dep) => !dependencies[dep]);

  // Allow appVersion to be empty string during initial load
  if (!Object.hasOwn(dependencies, 'appVersion')) {
    missing.push('appVersion');
  }

  if (missing.length > 0) {
    return {
      success: false,
      error: `Missing required dependencies: ${missing.join(', ')}`,
    };
  }

  return { success: true };
}
