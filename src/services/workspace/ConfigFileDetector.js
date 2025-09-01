/**
 * ConfigFileDetector - Detects OpenHeaders configuration files in repositories
 * Searches for various configuration file patterns and validates them
 */

const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('../../utils/mainLogger');

const log = createLogger('ConfigFileDetector');

// Common configuration file patterns
const CONFIG_PATTERNS = [
  // OpenHeaders specific
  '.openheaders/config.json',
  '.openheaders/*/config.json',
  'openheaders.json',
  '.openheaders.json',
  
  // Generic config locations
  'config/openheaders.json',
  '.config/openheaders.json',
  'configs/openheaders.json',
  
  // Workspace specific
  '.openheaders/workspaces/*/metadata.json',
  'workspaces/*/metadata.json'
];

class ConfigFileDetector {
  /**
   * Detect configuration files in a repository
   * @param {string} repoDir - Repository directory
   * @returns {Promise<Object[]>} - Detected config files
   */
  async detectConfigFiles(repoDir) {
    log.info(`Detecting configuration files in: ${repoDir}`);
    
    const detectedFiles = [];
    
    for (const pattern of CONFIG_PATTERNS) {
      const files = await this.searchPattern(repoDir, pattern);
      detectedFiles.push(...files);
    }
    
    // Remove duplicates
    const uniqueFiles = Array.from(new Set(detectedFiles.map(f => f.path)))
      .map(filePath => detectedFiles.find(f => f.path === filePath));
    
    log.info(`Found ${uniqueFiles.length} configuration files`);
    return uniqueFiles;
  }

  /**
   * Search for files matching a pattern
   * @param {string} baseDir - Base directory
   * @param {string} pattern - File pattern
   * @returns {Promise<Object[]>} - Found files
   */
  async searchPattern(baseDir, pattern) {
    const foundFiles = [];
    
    // Handle wildcards in pattern
    if (pattern.includes('*')) {
      const parts = pattern.split('/');
      const wildcardIndex = parts.findIndex(p => p.includes('*'));
      
      if (wildcardIndex >= 0) {
        const basePath = parts.slice(0, wildcardIndex).join('/');
        const remainingPattern = parts.slice(wildcardIndex + 1).join('/');
        
        try {
          const dirs = await this.findDirectories(
            path.join(baseDir, basePath),
            parts[wildcardIndex]
          );
          
          for (const dir of dirs) {
            const filePath = path.join(dir, remainingPattern);
            if (await this.fileExists(filePath)) {
              foundFiles.push(await this.analyzeFile(filePath, baseDir));
            }
          }
        } catch (error) {
          // Directory doesn't exist, continue
        }
      }
    } else {
      // Direct file path
      const filePath = path.join(baseDir, pattern);
      if (await this.fileExists(filePath)) {
        foundFiles.push(await this.analyzeFile(filePath, baseDir));
      }
    }
    
    return foundFiles;
  }

  /**
   * Find directories matching a pattern
   * @param {string} basePath - Base path
   * @param {string} pattern - Directory pattern
   * @returns {Promise<string[]>} - Found directories
   */
  async findDirectories(basePath, pattern) {
    const dirs = [];
    
    try {
      const entries = await fs.readdir(basePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (pattern === '*' || this.matchPattern(entry.name, pattern)) {
            dirs.push(path.join(basePath, entry.name));
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist
    }
    
    return dirs;
  }

  /**
   * Match a name against a pattern
   * @param {string} name - Name to match
   * @param {string} pattern - Pattern with wildcards
   * @returns {boolean} - Whether matches
   */
  matchPattern(name, pattern) {
    // Simple wildcard matching
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    return regex.test(name);
  }

  /**
   * Analyze a configuration file
   * @param {string} filePath - File path
   * @param {string} baseDir - Base directory
   * @returns {Promise<Object>} - File analysis
   */
  async analyzeFile(filePath, baseDir) {
    const relativePath = path.relative(baseDir, filePath);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);
      
      // Determine file type
      const type = this.detectFileType(data, relativePath);
      
      return {
        path: filePath,
        relativePath,
        type,
        valid: true,
        data
      };
    } catch (error) {
      return {
        path: filePath,
        relativePath,
        type: 'unknown',
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Detect configuration file type
   * @param {Object} data - File data
   * @param {string} relativePath - Relative path
   * @returns {string} - File type
   */
  detectFileType(data, relativePath) {
    // Check for workspace metadata
    if (data.workspaceId && data.workspaceName) {
      return 'workspace-metadata';
    }
    
    // Check for headers configuration
    if (data.headers && Array.isArray(data.headers)) {
      return 'headers';
    }
    
    // Check for environments
    if (data.environments && Array.isArray(data.environments)) {
      return 'environments';
    }
    
    // Check for proxy rules
    if (data.rules && Array.isArray(data.rules) && relativePath.includes('proxy')) {
      return 'proxy';
    }
    
    // Check for general rules
    if (data.rules && Array.isArray(data.rules)) {
      return 'rules';
    }
    
    // Check for combined config
    if (data.sources || data.proxy || data.headers) {
      return 'combined';
    }
    
    return 'unknown';
  }

  /**
   * Check if file exists
   * @param {string} filePath - File path
   * @returns {Promise<boolean>} - Whether file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Find workspace configurations
   * @param {string} repoDir - Repository directory
   * @returns {Promise<Object[]>} - Workspace configurations
   */
  async findWorkspaceConfigs(repoDir) {
    const configs = await this.detectConfigFiles(repoDir);
    return configs.filter(config => config.type === 'workspace-metadata');
  }

  /**
   * Validate detected configuration files
   * @param {Object[]} configFiles - Detected config files
   * @returns {Object} - Validation result
   */
  validateDetectedFiles(configFiles) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };
    
    // Check for required files
    const types = configFiles.map(f => f.type);
    
    if (!types.includes('workspace-metadata') && !types.includes('combined')) {
      result.warnings.push('No workspace metadata or combined configuration found');
    }
    
    // Check for invalid files
    const invalidFiles = configFiles.filter(f => !f.valid);
    if (invalidFiles.length > 0) {
      result.valid = false;
      invalidFiles.forEach(file => {
        result.errors.push(`Invalid file ${file.relativePath}: ${file.error}`);
      });
    }
    
    return result;
  }
}

module.exports = ConfigFileDetector;