/**
 * SourceManager - Manages HTTP, File, and Environment sources
 */
import { createLogger } from '../../utils/error-handling/logger';
const log = createLogger('SourceManager');

interface StorageAPI {
  loadFromStorage: (...args: any[]) => Promise<any>;
  saveToStorage: (...args: any[]) => Promise<any>;
}

interface EnvironmentService {
  waitForReady: (timeout: number) => Promise<boolean>;
  getAllVariables: () => Record<string, string>;
}

/** Source data configuration */
interface SourceData {
  sourceId?: string;
  sourceType: string;
  sourcePath: string;
  sourceMethod?: string;
  sourceName?: string;
  requestOptions?: Record<string, unknown>;
  jsonFilter?: {
    path?: string;
    [key: string]: unknown;
  };
  refreshOptions?: Record<string, unknown>;
  activationState?: string;
  missingDependencies?: string[];
  createdAt?: string;
  [key: string]: unknown;
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
  async saveSources(workspaceId: string, sources: SourceData[]) {
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
  async addSource(sources: SourceData[], sourceData: SourceData) {
    // Check for duplicates
    const isDuplicate = sources.some((src: SourceData) =>
      src.sourceType === sourceData.sourceType &&
      src.sourcePath === sourceData.sourcePath &&
      (sourceData.sourceType !== 'http' || src.sourceMethod === sourceData.sourceMethod)
    );

    if (isDuplicate) {
      throw new Error(`Source already exists: ${sourceData.sourceType.toUpperCase()} ${sourceData.sourcePath}`);
    }

    // Generate ID
    const maxId = sources.reduce((max: number, src: SourceData) => {
      const id = parseInt(src.sourceId ?? '0');
      return id > max ? id : max;
    }, 0);
    
    // Evaluate dependencies for HTTP sources
    let activationState = 'active';
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
  extractVariablesFromSource(source: SourceData): string[] {
    const variables = new Set<string>();
    const variablePattern = /\{\{(\w+)\}\}/g;
    
    // Helper to extract from any string
    const extractFromString = (str: string) => {
      if (typeof str === 'string') {
        const matches = [...str.matchAll(variablePattern)];
        matches.forEach(match => variables.add(match[1]));
      }
    };
    
    // Helper to extract from object recursively
    const extractFromObject = (obj: unknown) => {
      if (!obj || typeof obj !== 'object') return;

      if (Array.isArray(obj)) {
        obj.forEach((item: unknown) => extractFromObject(item));
      } else {
        Object.values(obj as Record<string, unknown>).forEach((value: unknown) => {
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
  async evaluateSourceDependencies(source: SourceData) {
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
  async activateReadySources(sources: SourceData[]) {
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
