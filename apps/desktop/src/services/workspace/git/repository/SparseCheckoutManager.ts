/**
 * SparseCheckoutManager - Handles Git sparse checkout operations
 * Manages selective file checkout for large repositories
 */

import path from 'node:path';
import type { GitExecutor } from '@/services/workspace/git/core/GitExecutor';
import mainLogger from '@/utils/mainLogger';

const { createLogger } = mainLogger;

const log = createLogger('SparseCheckoutManager');

interface SparseCheckoutResult {
  success: boolean;
  enabled?: boolean;
  patterns?: string[];
}

class SparseCheckoutManager {
  private executor: GitExecutor;

  constructor(executor: GitExecutor) {
    this.executor = executor;
  }

  /**
   * Initialize sparse checkout in a repository
   */
  async initialize(repoDir: string, patterns: string[] = []): Promise<SparseCheckoutResult> {
    log.info('Initializing sparse checkout');

    try {
      // Enable sparse checkout
      await this.executor.execute('config core.sparseCheckout true', { cwd: repoDir });

      // Initialize sparse checkout (cone mode for better performance)
      await this.executor.execute('sparse-checkout init --cone', { cwd: repoDir });

      // Set initial patterns if provided
      if (patterns.length > 0) {
        await this.setPatterns(repoDir, patterns);
      }

      return {
        success: true,
        enabled: true,
        patterns,
      };
    } catch (error) {
      log.error('Failed to initialize sparse checkout:', error);
      throw error;
    }
  }

  /**
   * Set sparse checkout patterns
   */
  async setPatterns(repoDir: string, patterns: string[]): Promise<SparseCheckoutResult> {
    log.info('Setting sparse checkout patterns:', patterns);

    if (!patterns || patterns.length === 0) {
      throw new Error('At least one pattern is required');
    }

    try {
      // Validate patterns
      this.validatePatterns(patterns);

      // Set patterns using sparse-checkout command
      const patternsStr = patterns.map((p) => `"${p}"`).join(' ');
      await this.executor.execute(`sparse-checkout set ${patternsStr}`, { cwd: repoDir });

      // Apply changes
      await this.executor.execute('read-tree -m -u HEAD', { cwd: repoDir });

      return {
        success: true,
        patterns,
      };
    } catch (error) {
      log.error('Failed to set sparse checkout patterns:', error);
      throw error;
    }
  }

  /**
   * Add patterns to sparse checkout
   */
  async addPatterns(repoDir: string, patterns: string[]): Promise<SparseCheckoutResult> {
    log.info('Adding sparse checkout patterns:', patterns);

    try {
      // Get current patterns
      const currentPatterns = await this.getPatterns(repoDir);

      // Merge with new patterns (avoid duplicates)
      const newPatterns = [...new Set([...currentPatterns, ...patterns])];

      // Set merged patterns
      return await this.setPatterns(repoDir, newPatterns);
    } catch (error) {
      log.error('Failed to add sparse checkout patterns:', error);
      throw error;
    }
  }

  /**
   * Remove patterns from sparse checkout
   */
  async removePatterns(repoDir: string, patterns: string[]): Promise<SparseCheckoutResult> {
    log.info('Removing sparse checkout patterns:', patterns);

    // Get current patterns
    const currentPatterns = await this.getPatterns(repoDir);

    // Remove specified patterns
    const newPatterns = currentPatterns.filter((p) => !patterns.includes(p));

    if (newPatterns.length === 0) {
      throw new Error('Cannot remove all patterns. Use disable() instead.');
    }

    // Set new patterns
    return await this.setPatterns(repoDir, newPatterns);
  }

  /**
   * Get current sparse checkout patterns
   */
  async getPatterns(repoDir: string): Promise<string[]> {
    try {
      const { stdout } = await this.executor.execute('sparse-checkout list', { cwd: repoDir });

      return stdout
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);
    } catch (error) {
      log.error('Failed to get sparse checkout patterns:', error);
      return [];
    }
  }

  /**
   * Check if sparse checkout is enabled
   */
  async isEnabled(repoDir: string): Promise<boolean> {
    try {
      const { stdout } = await this.executor.execute('config --get core.sparseCheckout', { cwd: repoDir });
      return stdout.trim() === 'true';
    } catch (_error) {
      return false;
    }
  }

  /**
   * Disable sparse checkout
   */
  async disable(repoDir: string): Promise<SparseCheckoutResult> {
    log.info('Disabling sparse checkout');

    try {
      // Disable sparse checkout
      await this.executor.execute('sparse-checkout disable', { cwd: repoDir });

      return {
        success: true,
        enabled: false,
      };
    } catch (error) {
      log.error('Failed to disable sparse checkout:', error);
      throw error;
    }
  }

  /**
   * Validate sparse checkout patterns
   */
  validatePatterns(patterns: string[]): void {
    for (const pattern of patterns) {
      if (pattern.length === 0) {
        throw new Error(`Invalid pattern: ${pattern}`);
      }

      // Check for dangerous patterns
      if (pattern === '/' || pattern === '/*') {
        throw new Error('Pattern would include entire repository. Use disable() instead.');
      }

      // Warn about patterns that might not work as expected
      if (pattern.includes('..')) {
        log.warn(`Pattern '${pattern}' contains '..', which may not work as expected`);
      }
    }
  }

  /**
   * Create patterns for workspace configuration
   */
  createWorkspacePatterns(configPaths: Record<string, string>): string[] {
    const patterns = new Set<string>();

    // Always include root files (README, LICENSE, etc)
    patterns.add('/*');

    // Add each config path
    for (const [_key, configPath] of Object.entries(configPaths)) {
      if (configPath) {
        // Convert path to sparse checkout pattern
        const pattern = this.pathToPattern(configPath);
        if (pattern) {
          patterns.add(pattern);
        }
      }
    }

    return Array.from(patterns);
  }

  /**
   * Convert file path to sparse checkout pattern
   */
  pathToPattern(filePath: string): string | null {
    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Get directory containing the file
    const dir = path.dirname(normalizedPath);

    if (dir === '.' || dir === '/') {
      // File is in root, already covered by '/*'
      return null;
    }

    // Return directory pattern
    return `/${dir}/`;
  }

  /**
   * Optimize patterns for cone mode
   */
  optimizePatternsForCone(patterns: string[]): string[] {
    // Cone mode works with directory patterns
    // Convert file patterns to directory patterns
    const optimized = new Set<string>();

    for (const pattern of patterns) {
      if (pattern.endsWith('/')) {
        // Already a directory pattern
        optimized.add(pattern);
      } else if (pattern.includes('/')) {
        // File pattern - convert to directory
        const dir = path.dirname(pattern);
        optimized.add(dir.startsWith('/') ? `${dir}/` : `/${dir}/`);
      } else {
        // Top-level pattern
        optimized.add(`/${pattern}/`);
      }
    }

    return Array.from(optimized);
  }
}

export type { SparseCheckoutResult };
export { SparseCheckoutManager };
export default SparseCheckoutManager;
