/**
 * SourceManager - Manages HTTP, File, and Environment sources
 */
const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('SourceManager');

class SourceManager {
  constructor(storageAPI, environmentService) {
    this.storageAPI = storageAPI;
    this.environmentService = environmentService;
  }

  /**
   * Load sources for a workspace
   */
  async loadSources(workspaceId) {
    try {
      const data = await this.storageAPI.loadFromStorage(`workspaces/${workspaceId}/sources.json`);
      if (!data) return [];
      
      const sources = JSON.parse(data);
      
      // Evaluate dependencies for each source
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        
        if (source.sourceType === 'http') {
          const deps = await this.evaluateSourceDependencies(source);
          sources[i] = {
            ...source,
            activationState: deps.ready ? 'active' : 'waiting_for_deps',
            missingDependencies: deps.missing
          };
        } else {
          sources[i] = {
            ...source,
            activationState: 'active',
            missingDependencies: []
          };
        }
      }
      
      return sources;
    } catch (error) {
      log.error(`Failed to load sources for workspace ${workspaceId}:`, error);
      return [];
    }
  }

  /**
   * Save sources
   */
  async saveSources(workspaceId, sources) {
    try {
      const path = `workspaces/${workspaceId}/sources.json`;
      await this.storageAPI.saveToStorage(path, JSON.stringify(sources));
      log.debug('Sources saved');
    } catch (error) {
      log.error('Failed to save sources:', error);
      throw error;
    }
  }

  /**
   * Add a new source
   */
  async addSource(sources, sourceData) {
    // Check for duplicates
    const isDuplicate = sources.some(src =>
      src.sourceType === sourceData.sourceType &&
      src.sourcePath === sourceData.sourcePath &&
      (sourceData.sourceType !== 'http' || src.sourceMethod === sourceData.sourceMethod)
    );

    if (isDuplicate) {
      throw new Error(`Source already exists: ${sourceData.sourceType.toUpperCase()} ${sourceData.sourcePath}`);
    }

    // Generate ID
    const maxId = sources.reduce((max, src) => {
      const id = parseInt(src.sourceId);
      return id > max ? id : max;
    }, 0);
    
    // Evaluate dependencies for HTTP sources
    let activationState = 'active';
    let missingDependencies = [];
    
    if (sourceData.sourceType === 'http') {
      const deps = await this.evaluateSourceDependencies(sourceData);
      activationState = deps.ready ? 'active' : 'waiting_for_deps';
      missingDependencies = deps.missing;
    }
    
    const newSource = {
      ...sourceData,
      sourceId: String(maxId + 1),
      createdAt: new Date().toISOString(),
      activationState,
      missingDependencies
    };
    
    return newSource;
  }

  /**
   * Extract environment variables from source configuration
   */
  extractVariablesFromSource(source) {
    const variables = new Set();
    const variablePattern = /\{\{(\w+)\}\}/g;
    
    // Helper to extract from any string
    const extractFromString = (str) => {
      if (typeof str === 'string') {
        const matches = [...str.matchAll(variablePattern)];
        matches.forEach(match => variables.add(match[1]));
      }
    };
    
    // Helper to extract from object recursively
    const extractFromObject = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      
      if (Array.isArray(obj)) {
        obj.forEach(item => extractFromObject(item));
      } else {
        Object.values(obj).forEach(value => {
          if (typeof value === 'string') {
            extractFromString(value);
          } else if (typeof value === 'object') {
            extractFromObject(value);
          }
        });
      }
    };
    
    // Extract from URL
    extractFromString(source.sourcePath);
    
    // Extract from request options
    if (source.requestOptions) {
      extractFromObject(source.requestOptions);
    }
    
    // Extract from JSON filter
    if (source.jsonFilter?.path) {
      extractFromString(source.jsonFilter.path);
    }
    
    return Array.from(variables);
  }

  /**
   * Evaluate if a source has all required dependencies
   */
  async evaluateSourceDependencies(source) {
    if (source.sourceType !== 'http') {
      return { ready: true, missing: [] };
    }
    
    const requiredVars = this.extractVariablesFromSource(source);
    
    // Wait for environment service to be ready before checking variables
    try {
      await this.environmentService.waitForReady(3000);
    } catch (error) {
      log.debug('Environment service not ready when evaluating source dependencies:', error.message);
      // If service isn't ready, consider all required vars as missing
      return {
        ready: false,
        missing: Array.from(requiredVars)
      };
    }
    
    const availableVars = this.environmentService.getAllVariables();
    
    const missing = requiredVars.filter(varName => {
      const value = availableVars[varName];
      // Consider empty strings as missing too
      return !value || value === '';
    });
    
    return {
      ready: missing.length === 0,
      missing
    };
  }

  /**
   * Check and activate sources that have their dependencies met
   */
  async activateReadySources(sources) {
    let activatedCount = 0;
    const updatedSources = [...sources];
    let hasChanges = false;
    
    for (let i = 0; i < updatedSources.length; i++) {
      const source = updatedSources[i];
      
      // Only check sources that are waiting for dependencies
      if (source.activationState === 'waiting_for_deps') {
        const deps = await this.evaluateSourceDependencies(source);
        
        if (deps.ready) {
          // Activate the source
          updatedSources[i] = {
            ...source,
            activationState: 'active',
            missingDependencies: []
          };
          activatedCount++;
          hasChanges = true;
          
          log.info(`Source ${source.sourceId} activated - all dependencies resolved`);
          
          // Dispatch activation event
          window.dispatchEvent(new CustomEvent('source-activated', {
            detail: { sourceId: source.sourceId, source: updatedSources[i] }
          }));
        } else if (JSON.stringify(source.missingDependencies) !== JSON.stringify(deps.missing)) {
          // Update missing dependencies list if it changed
          updatedSources[i] = {
            ...source,
            missingDependencies: deps.missing
          };
          hasChanges = true;
        }
      }
    }
    
    if (activatedCount > 0) {
      log.info(`Activated ${activatedCount} sources after dependency resolution`);
    }
    
    return { sources: updatedSources, hasChanges, activatedCount };
  }
}

module.exports = SourceManager;