/**
 * SparseCheckoutManager - Handles Git sparse checkout operations
 * Manages selective file checkout for large repositories
 */

const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('../../../../utils/mainLogger');

const log = createLogger('SparseCheckoutManager');

class SparseCheckoutManager {
  constructor(executor) {
    this.executor = executor;
  }

  /**
   * Initialize sparse checkout in a repository
   * @param {string} repoDir - Repository directory
   * @param {string[]} patterns - Initial patterns (optional)
   * @returns {Promise<Object>} - Initialization result
   */
  async initialize(repoDir, patterns = []) {
    log.info('Initializing sparse checkout');

    try {
      // Enable sparse checkout
      await this.executor.execute(
        'config core.sparseCheckout true',
        { cwd: repoDir }
      );

      // Initialize sparse checkout (cone mode for better performance)
      await this.executor.execute(
        'sparse-checkout init --cone',
        { cwd: repoDir }
      );

      // Set initial patterns if provided
      if (patterns.length > 0) {
        await this.setPatterns(repoDir, patterns);
      }

      return {
        success: true,
        enabled: true,
        patterns
      };
    } catch (error) {
      log.error('Failed to initialize sparse checkout:', error);
      throw error;
    }
  }

  /**
   * Set sparse checkout patterns
   * @param {string} repoDir - Repository directory
   * @param {string[]} patterns - Patterns to set
   * @returns {Promise<Object>} - Set result
   */
  async setPatterns(repoDir, patterns) {
    log.info('Setting sparse checkout patterns:', patterns);

    if (!patterns || patterns.length === 0) {
      throw new Error('At least one pattern is required');
    }

    try {
      // Validate patterns
      this.validatePatterns(patterns);

      // Set patterns using sparse-checkout command
      const patternsStr = patterns.map(p => `"${p}"`).join(' ');
      await this.executor.execute(
        `sparse-checkout set ${patternsStr}`,
        { cwd: repoDir }
      );

      // Apply changes
      await this.executor.execute(
        'read-tree -m -u HEAD',
        { cwd: repoDir }
      );

      return {
        success: true,
        patterns
      };
    } catch (error) {
      log.error('Failed to set sparse checkout patterns:', error);
      throw error;
    }
  }

  /**
   * Add patterns to sparse checkout
   * @param {string} repoDir - Repository directory
   * @param {string[]} patterns - Patterns to add
   * @returns {Promise<Object>} - Add result
   */
  async addPatterns(repoDir, patterns) {
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
   * @param {string} repoDir - Repository directory
   * @param {string[]} patterns - Patterns to remove
   * @returns {Promise<Object>} - Remove result
   */
  async removePatterns(repoDir, patterns) {
    log.info('Removing sparse checkout patterns:', patterns);

    try {
      // Get current patterns
      const currentPatterns = await this.getPatterns(repoDir);
      
      // Remove specified patterns
      const newPatterns = currentPatterns.filter(p => !patterns.includes(p));
      
      if (newPatterns.length === 0) {
        throw new Error('Cannot remove all patterns. Use disable() instead.');
      }
      
      // Set new patterns
      return await this.setPatterns(repoDir, newPatterns);
    } catch (error) {
      log.error('Failed to remove sparse checkout patterns:', error);
      throw error;
    }
  }

  /**
   * Get current sparse checkout patterns
   * @param {string} repoDir - Repository directory
   * @returns {Promise<string[]>} - Current patterns
   */
  async getPatterns(repoDir) {
    try {
      const { stdout } = await this.executor.execute(
        'sparse-checkout list',
        { cwd: repoDir }
      );

      return stdout
        .trim()
        .split('\n')
        .filter(line => line.length > 0);
    } catch (error) {
      log.error('Failed to get sparse checkout patterns:', error);
      return [];
    }
  }

  /**
   * Check if sparse checkout is enabled
   * @param {string} repoDir - Repository directory
   * @returns {Promise<boolean>} - Whether sparse checkout is enabled
   */
  async isEnabled(repoDir) {
    try {
      const { stdout } = await this.executor.execute(
        'config --get core.sparseCheckout',
        { cwd: repoDir }
      );
      return stdout.trim() === 'true';
    } catch (error) {
      return false;
    }
  }

  /**
   * Disable sparse checkout
   * @param {string} repoDir - Repository directory
   * @returns {Promise<Object>} - Disable result
   */
  async disable(repoDir) {
    log.info('Disabling sparse checkout');

    try {
      // Disable sparse checkout
      await this.executor.execute(
        'sparse-checkout disable',
        { cwd: repoDir }
      );

      return {
        success: true,
        enabled: false
      };
    } catch (error) {
      log.error('Failed to disable sparse checkout:', error);
      throw error;
    }
  }

  /**
   * Validate sparse checkout patterns
   * @param {string[]} patterns - Patterns to validate
   * @throws {Error} - If patterns are invalid
   */
  validatePatterns(patterns) {
    for (const pattern of patterns) {
      if (typeof pattern !== 'string' || pattern.length === 0) {
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
   * @param {Object} configPaths - Configuration paths object
   * @returns {string[]} - Sparse checkout patterns
   */
  createWorkspacePatterns(configPaths) {
    const patterns = new Set();

    // Always include root files (README, LICENSE, etc)
    patterns.add('/*');

    // Add each config path
    for (const [key, configPath] of Object.entries(configPaths)) {
      if (configPath && typeof configPath === 'string') {
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
   * @param {string} filePath - File path
   * @returns {string} - Sparse checkout pattern
   */
  pathToPattern(filePath) {
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
   * Get sparse checkout status
   * @param {string} repoDir - Repository directory
   * @returns {Promise<Object>} - Sparse checkout status
   */
  async getStatus(repoDir) {
    try {
      const enabled = await this.isEnabled(repoDir);
      
      if (!enabled) {
        return {
          enabled: false,
          patterns: [],
          mode: 'none'
        };
      }

      const patterns = await this.getPatterns(repoDir);
      
      // Check if using cone mode
      let mode = 'legacy';
      try {
        const { stdout } = await this.executor.execute(
          'config --get core.sparseCheckoutCone',
          { cwd: repoDir }
        );
        if (stdout.trim() === 'true') {
          mode = 'cone';
        }
      } catch (error) {
        // Config not set, using legacy mode
      }

      return {
        enabled,
        patterns,
        mode
      };
    } catch (error) {
      log.error('Failed to get sparse checkout status:', error);
      throw error;
    }
  }

  /**
   * Optimize patterns for cone mode
   * @param {string[]} patterns - Original patterns
   * @returns {string[]} - Optimized patterns
   */
  optimizePatternsForCone(patterns) {
    // Cone mode works with directory patterns
    // Convert file patterns to directory patterns
    const optimized = new Set();

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

module.exports = SparseCheckoutManager;