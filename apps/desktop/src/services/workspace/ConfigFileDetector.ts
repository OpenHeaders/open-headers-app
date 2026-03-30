/**
 * ConfigFileDetector - Detects OpenHeaders configuration files in repositories
 * Searches for various configuration file patterns and validates them
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ConfigData } from '../../utils/configValidator';
import mainLogger from '../../utils/mainLogger';

const { createLogger } = mainLogger;
const log = createLogger('ConfigFileDetector');

// Type definitions
interface DetectedFile {
  path: string;
  relativePath: string;
  type: string;
  valid: boolean;
  data?: ConfigData;
  error?: string;
}

interface DetectionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Common configuration file patterns
const CONFIG_PATTERNS: string[] = [
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
  'workspaces/*/metadata.json',
];

class ConfigFileDetector {
  /**
   * Detect configuration files in a repository
   */
  async detectConfigFiles(repoDir: string): Promise<DetectedFile[]> {
    log.info(`Detecting configuration files in: ${repoDir}`);

    const detectedFiles: DetectedFile[] = [];

    for (const pattern of CONFIG_PATTERNS) {
      const files = await this.searchPattern(repoDir, pattern);
      detectedFiles.push(...files);
    }

    // Remove duplicates
    const uniqueFiles = Array.from(new Set(detectedFiles.map((f) => f.path))).map(
      (filePath) => detectedFiles.find((f) => f.path === filePath)!,
    );

    log.info(`Found ${uniqueFiles.length} configuration files`);
    return uniqueFiles;
  }

  /**
   * Search for files matching a pattern
   */
  async searchPattern(baseDir: string, pattern: string): Promise<DetectedFile[]> {
    const foundFiles: DetectedFile[] = [];

    // Handle wildcards in pattern
    if (pattern.includes('*')) {
      const parts = pattern.split('/');
      const wildcardIndex = parts.findIndex((p) => p.includes('*'));

      if (wildcardIndex >= 0) {
        const basePath = parts.slice(0, wildcardIndex).join('/');
        const remainingPattern = parts.slice(wildcardIndex + 1).join('/');

        try {
          const dirs = await this.findDirectories(path.join(baseDir, basePath), parts[wildcardIndex]);

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
   */
  async findDirectories(basePath: string, pattern: string): Promise<string[]> {
    const dirs: string[] = [];

    try {
      const entries = await fs.promises.readdir(basePath, { withFileTypes: true });

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
   */
  matchPattern(name: string, pattern: string): boolean {
    // Simple wildcard matching
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return regex.test(name);
  }

  /**
   * Analyze a configuration file
   */
  async analyzeFile(filePath: string, baseDir: string): Promise<DetectedFile> {
    const relativePath = path.relative(baseDir, filePath);

    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const data = JSON.parse(content) as ConfigData;

      // Determine file type
      const type = this.detectFileType(data, relativePath);

      return {
        path: filePath,
        relativePath,
        type,
        valid: true,
        data,
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return {
        path: filePath,
        relativePath,
        type: 'unknown',
        valid: false,
        error: errMsg,
      };
    }
  }

  /**
   * Detect configuration file type
   */
  detectFileType(data: ConfigData, relativePath: string): string {
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
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Find workspace configurations
   */
  async findWorkspaceConfigs(repoDir: string): Promise<DetectedFile[]> {
    const configs = await this.detectConfigFiles(repoDir);
    return configs.filter((config) => config.type === 'workspace-metadata');
  }

  /**
   * Validate detected configuration files
   */
  validateDetectedFiles(configFiles: DetectedFile[]): DetectionValidationResult {
    const result: DetectionValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // Check for required files
    const types = configFiles.map((f) => f.type);

    if (!types.includes('workspace-metadata') && !types.includes('combined')) {
      result.warnings.push('No workspace metadata or combined configuration found');
    }

    // Check for invalid files
    const invalidFiles = configFiles.filter((f) => !f.valid);
    if (invalidFiles.length > 0) {
      result.valid = false;
      invalidFiles.forEach((file) => {
        result.errors.push(`Invalid file ${file.relativePath}: ${file.error}`);
      });
    }

    return result;
  }
}

export { CONFIG_PATTERNS, ConfigFileDetector, type DetectedFile, type DetectionValidationResult };
export default ConfigFileDetector;
