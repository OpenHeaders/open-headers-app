/**
 * Configuration and constants for the Export/Import system
 * 
 * This module centralizes all configuration options, constants, and shared
 * settings used across the export/import functionality.
 */

/**
 * Export file format options
 */
export const FILE_FORMATS = {
  SINGLE: 'single',
  SEPARATE: 'separate'
};

/**
 * Import modes for handling existing data
 */
export const IMPORT_MODES = {
  MERGE: 'merge',
  REPLACE: 'replace'
};


/**
 * File dialog filters for export/import operations
 */
export const FILE_FILTERS = {
  JSON: [
    { name: 'JSON Files', extensions: ['json'] },
    { name: 'All Files', extensions: ['*'] }
  ]
};

/**
 * Default configuration values
 */
export const DEFAULTS = {
  APP_VERSION: '3.0.0',
  ENVIRONMENT_NAME: 'Default',
  WORKSPACE_TYPE: 'git',
  WORKSPACE_BRANCH: 'main',
  WORKSPACE_PATH: 'config/open-headers.json',
  AUTH_TYPE: 'none',
  AUTO_SYNC: true
};

/**
 * Event names for custom events dispatched during import/export
 */
export const EVENTS = {
  WORKSPACE_DATA_REFRESH: 'workspace-data-refresh-needed',
  PROXY_RULES_UPDATED: 'proxy-rules-updated',
  RULES_UPDATED: 'rules-updated',
  ENVIRONMENT_VARIABLES_CHANGED: 'environment-variables-changed'
};

/**
 * Error messages used across the export/import system
 */
export const ERROR_MESSAGES = {
  INVALID_FILE_FORMAT: 'Invalid import file format',
  EXPORT_FAILED: 'Error exporting data',
  IMPORT_FAILED: 'Error importing data',
  FILE_OPERATION_FAILED: 'File operation failed',
  WORKSPACE_CREATION_FAILED: 'Failed to create workspace from import',
  ENVIRONMENT_CREATION_FAILED: 'Failed to create environment',
  NO_DATA_IMPORTED: 'No new data was imported'
};

/**
 * Success message templates
 */
export const SUCCESS_MESSAGES = {
  EXPORT_COMPLETE: 'Successfully exported',
  IMPORT_COMPLETE: 'Import complete',
  GIT_SYNC_COMPLETE: 'Git sync complete',
  WORKSPACE_SYNC_SUCCESS: 'Workspace synced successfully',
  ENVIRONMENT_VARIABLES_CREATED: 'Created environment variable(s). Please configure their values in the Environments tab.'
};


/**
 * Validation rules for import data
 */
export const VALIDATION_RULES = {
  REQUIRED_FIELDS: {
    WORKSPACE: ['name', 'type'],
    ENVIRONMENT_VARIABLE: ['name'],
    PROXY_RULE: [], // Proxy rules validate differently - either domains or headerRuleId
    SOURCE: ['sourceId', 'sourceType', 'sourcePath']
  },
  MAX_NAME_LENGTH: 255,
  SUPPORTED_VERSIONS: ['1.0.0', '2.0.0', '3.0.0']
};

