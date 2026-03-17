/**
 * Workspace Handler for Export/Import Operations
 * 
 * This module handles the export and import of workspace configurations,
 * including Git integration, authentication data, and workspace creation.
 */

import { validateWorkspaceConfig } from '../utilities/ValidationUtils.js';
import { isWorkspaceNameDuplicate, generateUniqueName } from '../utilities/DuplicateDetection.js';
import { DEFAULTS } from '../core/ExportImportConfig.js';

const { createLogger } = require('../../../utils/error-handling/logger');
const log = createLogger('WorkspaceHandler');

/**
 * Workspace Handler Class
 * Manages export and import operations for workspace configurations
 */
export class WorkspaceHandler {
  constructor(dependencies) {
    this.dependencies = dependencies;
  }

  /**
   * Exports workspace data for inclusion in export file
   * @param {Object} options - Export options
   * @returns {Promise<Object|null>} - Workspace data or null if not selected
   */
  async exportWorkspace(options) {
    const { includeWorkspace, includeCredentials, currentWorkspace } = options;
    
    if (!includeWorkspace || !currentWorkspace) {
      log.debug('Workspace not selected for export or no current workspace');
      return null;
    }

    try {
      const workspaceData = {
        name: currentWorkspace.name,
        description: currentWorkspace.description,
        type: currentWorkspace.type || DEFAULTS.WORKSPACE_TYPE,
        gitUrl: currentWorkspace.gitUrl,
        gitBranch: currentWorkspace.gitBranch || DEFAULTS.WORKSPACE_BRANCH,
        gitPath: currentWorkspace.gitPath || DEFAULTS.WORKSPACE_PATH,
        authType: currentWorkspace.authType || DEFAULTS.AUTH_TYPE,
        autoSync: currentWorkspace.autoSync !== false
      };
      
      // Only include credentials if explicitly requested
      if (includeCredentials && currentWorkspace.authData) {
        workspaceData.authData = this._sanitizeAuthData(currentWorkspace.authData);
      }

      log.info(`Exporting workspace configuration: ${workspaceData.name} (${workspaceData.type})`);
      return workspaceData;
    } catch (error) {
      log.error('Failed to export workspace:', error);
      throw new Error(`Failed to export workspace: ${error.message}`);
    }
  }

  /**
   * Imports workspace data and creates a new workspace
   * @param {Object} workspaceInfo - Workspace information to import
   * @param {Object} options - Import options
   * @returns {Promise<Object>} - Import statistics with created workspace info
   */
  async importWorkspace(workspaceInfo, options) {
    const stats = {
      createdWorkspace: null,
      errors: []
    };

    if (!workspaceInfo) {
      log.debug('No workspace data to import');
      return stats;
    }

    // Validate workspace configuration
    const validation = validateWorkspaceConfig(workspaceInfo);
    if (!validation.success) {
      const error = new Error(`Invalid workspace configuration: ${validation.error}`);
      log.error('Failed to import workspace:', error);
      stats.errors.push({
        workspace: workspaceInfo.name,
        error: error.message
      });
      return stats;
    }

    try {
      // Create the workspace
      const workspace = await this._createWorkspaceFromImport(workspaceInfo, options);
      stats.createdWorkspace = workspace;

      // Switch to the new workspace if creation was successful
      if (workspace && options.switchToNewWorkspace !== false) {
        await this._switchToWorkspace(workspace);
      }

      log.info(`Successfully imported and created workspace: ${workspace.name}`);
      return stats;
    } catch (error) {
      log.error('Failed to import workspace:', error);
      stats.errors.push({
        workspace: workspaceInfo.name,
        error: error.message
      });
      return stats;
    }
  }

  /**
   * Creates a new workspace from import data
   * @param {Object} workspaceInfo - Workspace information
   * @param {Object} options - Import options
   * @returns {Promise<Object>} - Created workspace object
   * @private
   */
  async _createWorkspaceFromImport(workspaceInfo, options) {
    const { workspaces, createWorkspace } = this.dependencies;
    
    // Check if workspace with same name exists and generate unique name if needed
    let workspaceName = workspaceInfo.name;
    if (isWorkspaceNameDuplicate(workspaceName, workspaces)) {
      workspaceName = generateUniqueName(
        workspaceInfo.name, 
        workspaces.map(w => w.name), 
        'Imported'
      );
      log.info(`Workspace name '${workspaceInfo.name}' already exists, using '${workspaceName}'`);
    }
    
    // Prepare workspace object
    const workspace = {
      id: this._generateWorkspaceId(),
      name: workspaceName,
      description: workspaceInfo.description || '',
      type: workspaceInfo.type || DEFAULTS.WORKSPACE_TYPE,
      gitUrl: workspaceInfo.gitUrl,
      gitBranch: workspaceInfo.gitBranch || DEFAULTS.WORKSPACE_BRANCH,
      gitPath: workspaceInfo.gitPath || DEFAULTS.WORKSPACE_PATH,
      authType: workspaceInfo.authType || DEFAULTS.AUTH_TYPE,
      autoSync: workspaceInfo.autoSync !== false,
      createdAt: new Date().toISOString(),
      importedFrom: options.isGitSync ? 'git-sync' : 'manual-import'
    };

    // Include auth data if provided and credentials are allowed
    if (workspaceInfo.authData && this._shouldImportCredentials(options)) {
      workspace.authData = this._validateAndSanitizeAuthData(workspaceInfo.authData);
    }

    // Create the workspace using the dependency function
    const createdWorkspace = await createWorkspace(workspace);
    
    if (!createdWorkspace) {
      throw new Error('Workspace creation function returned null');
    }

    return createdWorkspace;
  }

  /**
   * Switches to the newly created workspace
   * @param {Object} workspace - Workspace to switch to
   * @returns {Promise<void>}
   * @private
   */
  async _switchToWorkspace(workspace) {
    try {
      const { switchWorkspace } = this.dependencies;
      if (switchWorkspace) {
        await switchWorkspace(workspace.id, workspace);
        log.debug(`Switched to imported workspace: ${workspace.name}`);
      }
    } catch (error) {
      log.warn(`Failed to switch to imported workspace: ${error.message}`);
      // Don't throw - workspace was created successfully, switching is optional
    }
  }

  /**
   * Determines if credentials should be imported based on options
   * @param {Object} options - Import options
   * @returns {boolean} - Whether to import credentials
   * @private
   */
  _shouldImportCredentials(options) {
    // For Git sync operations, always import credentials if present
    if (options.isGitSync) {
      return true;
    }
    
    // For manual imports, respect the includeCredentials option
    return options.includeCredentials === true;
  }

  /**
   * Sanitizes authentication data for export
   * @param {Object} authData - Authentication data to sanitize
   * @returns {Object} - Sanitized authentication data
   * @private
   */
  _sanitizeAuthData(authData) {
    if (!authData || typeof authData !== 'object') {
      return {};
    }

    const sanitized = { ...authData };
    
    // Remove any potentially sensitive debugging information
    delete sanitized.debugInfo;
    delete sanitized.lastError;
    delete sanitized.internalTokens;
    
    // Ensure tokens are properly structured
    if (sanitized.tokens && typeof sanitized.tokens === 'object') {
      // Only include essential token fields, not internal metadata
      const { accessToken, refreshToken, expiresAt, tokenType } = sanitized.tokens;
      sanitized.tokens = { accessToken, refreshToken, expiresAt, tokenType };
    }

    return sanitized;
  }

  /**
   * Validates and sanitizes authentication data for import
   * @param {Object} authData - Authentication data to validate
   * @returns {Object} - Validated and sanitized authentication data
   * @private
   */
  _validateAndSanitizeAuthData(authData) {
    if (!authData || typeof authData !== 'object') {
      throw new Error('Authentication data must be an object');
    }

    const validated = this._sanitizeAuthData(authData);
    
    // Validate required fields based on auth type
    if (validated.type === 'oauth' && (!validated.tokens || !validated.tokens.accessToken)) {
      throw new Error('OAuth authentication data missing required tokens');
    }
    
    if (validated.type === 'personal-token' && !validated.token) {
      throw new Error('Personal token authentication data missing token');
    }

    return validated;
  }

  /**
   * Generates a unique workspace ID
   * @returns {string} - Unique workspace ID
   * @private
   */
  _generateWorkspaceId() {
    return Date.now().toString() + Math.random().toString(36).slice(2, 11);
  }

  /**
   * Gets statistics about workspace for reporting
   * @param {Object} workspaceData - Workspace data object
   * @returns {Object} - Statistics object
   */
  getWorkspaceStatistics(workspaceData) {
    if (!workspaceData) {
      return { 
        hasWorkspace: false 
      };
    }

    return {
      hasWorkspace: true,
      name: workspaceData.name,
      type: workspaceData.type,
      hasGitUrl: !!workspaceData.gitUrl,
      hasAuthData: !!workspaceData.authData,
      authType: workspaceData.authType,
      autoSync: workspaceData.autoSync
    };
  }

  /**
   * Validates workspace data for export
   * @param {Object} workspaceData - Workspace data to validate
   * @returns {Object} - Validation result
   */
  validateWorkspaceForExport(workspaceData) {
    if (!workspaceData) {
      return { success: true }; // No workspace data is valid
    }

    return validateWorkspaceConfig(workspaceData);
  }




}