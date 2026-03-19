/**
 * SourceManager - Manages HTTP, File, and Environment sources
 */
import { createLogger } from '../../utils/error-handling/logger';
import type { Source, SourceRequestOptions, ActivationState } from '../../../types/source';
const log = createLogger('SourceManager');

interface StorageAPI {
  loadFromStorage: (filename: string) => Promise<string | null>;
  saveToStorage: (filename: string, content: string) => Promise<void>;
}

interface EnvironmentService {
  waitForReady: (timeout: number) => Promise<boolean>;
  getAllVariables: () => Record<string, string>;
}

class SourceManager {
  storageAPI: StorageAPI;
  environmentService: EnvironmentService;

  constructor(storageAPI: StorageAPI, environmentService: EnvironmentService) {
    this.storageAPI = storageAPI;
    this.environmentService = environmentService;
  }

  /**
   * Load sources for a workspace
   */
  async loadSources(workspaceId: string) {
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
  async saveSources(workspaceId: string, sources: Source[]) {
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
  async addSource(sources: Source[], sourceData: Source) {
    // Check for duplicates
    const isDuplicate = sources.some((src: Source) =>
      src.sourceType === sourceData.sourceType &&
      src.sourcePath === sourceData.sourcePath &&
      (sourceData.sourceType !== 'http' || src.sourceMethod === sourceData.sourceMethod)
    );

    if (isDuplicate) {
      throw new Error(`Source already exists: ${sourceData.sourceType.toUpperCase()} ${sourceData.sourcePath}`);
    }

    // Generate ID
    const maxId = sources.reduce((max: number, src: Source) => {
      const id = parseInt(src.sourceId ?? '0');
      return id > max ? id : max;
    }, 0);
    
    // Evaluate dependencies for HTTP sources
    let activationState: ActivationState = 'active';
    let missingDependencies: string[] = [];

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
  extractVariablesFromSource(source: Source): string[] {
    const variables = new Set<string>();
    const variablePattern = /\{\{(\w+)\}\}/g;

    const extractFromString = (str: string) => {
      for (const match of str.matchAll(variablePattern)) {
        variables.add(match[1]);
      }
    };

    // Extract from URL
    if (source.sourcePath) extractFromString(source.sourcePath);

    // Extract from request options — walk typed fields directly
    const opts = source.requestOptions;
    if (opts) {
      if (opts.body) extractFromString(opts.body);
      if (opts.contentType) extractFromString(opts.contentType);
      if (opts.totpSecret) extractFromString(opts.totpSecret);
      if (opts.headers) {
        for (const header of opts.headers) {
          extractFromString(header.key);
          extractFromString(header.value);
        }
      }
      if (opts.queryParams) {
        for (const param of opts.queryParams) {
          extractFromString(param.key);
          extractFromString(param.value);
        }
      }
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
  async evaluateSourceDependencies(source: Source) {
    if (source.sourceType !== 'http') {
      return { ready: true, missing: [] };
    }
    
    const requiredVars = this.extractVariablesFromSource(source);
    
    // Wait for environment service to be ready before checking variables
    try {
      await this.environmentService.waitForReady(3000);
    } catch (error) {
      log.debug('Environment service not ready when evaluating source dependencies:', error instanceof Error ? error.message : String(error));
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
  async activateReadySources(sources: Source[]) {
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

export default SourceManager;
