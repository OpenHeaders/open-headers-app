/**
 * CommitManager - Handles Git commit operations
 * Manages committing configuration changes and maintaining commit history
 */

const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('../../../../utils/mainLogger');

const log = createLogger('CommitManager');

class CommitManager {
  constructor(executor) {
    this.executor = executor;
  }

  /**
   * Commit configuration changes
   * Supports two modes:
   * 1. Direct file commit: {repoDir, files, message, author, email}
   * 2. Workspace configuration: {repoDir, workspaceId, workspaceName, configPaths, message, author, email}
   * @param {Object} options - Commit options
   * @returns {Promise<Object>} - Commit result
   */
  async commitConfiguration(options) {
    const {
      repoDir,
      files,
      workspaceId,
      workspaceName,
      configPaths,
      message,
      author = null,
      email = null
    } = options;

    log.info(`Committing configuration${workspaceName ? ` for workspace: ${workspaceName}` : ''}`);

    // Validate input parameters
    if (!repoDir) {
      const error = new Error('Repository directory is required');
      log.error('Invalid commit configuration:', error);
      throw error;
    }

    // Determine which mode to use
    const isDirectFileMode = files && typeof files === 'object';
    const isWorkspaceMode = configPaths && workspaceId && workspaceName;

    if (!isDirectFileMode && !isWorkspaceMode) {
      const error = new Error('Invalid options: either provide files for direct commit or configPaths with workspaceId and workspaceName');
      log.error('Invalid commit configuration options:', error);
      throw error;
    }

    try {
      // Ensure git user is configured
      await this.ensureGitUser(repoDir, author, email);

      // Handle direct file commit mode
      if (isDirectFileMode) {
        // Write files directly
        const fs = require('fs').promises;
        const path = require('path');
        
        for (const [filename, content] of Object.entries(files)) {
          const filePath = path.join(repoDir, filename);
          const dir = path.dirname(filePath);
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(filePath, String(content), 'utf8');
          log.info(`Created file: ${filename}`);
        }

        // Stage all files
        for (const filename of Object.keys(files)) {
          await this.stageFile(repoDir, filename);
        }

        // Create commit
        const commitMessage = message || 'Update configuration';
        const commitResult = await this.createCommit(repoDir, commitMessage);

        return {
          success: true,
          commitHash: commitResult.hash,
          message: commitMessage,
          files: Object.keys(files).length
        };
      }
      
      // Handle workspace configuration mode
      if (isWorkspaceMode) {
        // Create configuration files
        await this.createConfigurationFiles(repoDir, configPaths, {
          workspaceId,
          workspaceName
        });

        // Stage configuration files
        await this.stageFiles(repoDir, configPaths);

        // Create commit
        const commitMessage = message || this.generateCommitMessage('create', workspaceName);
        const commitResult = await this.createCommit(repoDir, commitMessage);

        return {
          success: true,
          commitHash: commitResult.hash,
          message: commitMessage,
          files: Object.keys(configPaths).length
        };
      }

    } catch (error) {
      log.error('Failed to commit configuration:', error);
      throw error;
    }
  }

  /**
   * Auto-commit changes
   * @param {Object} options - Auto-commit options
   * @returns {Promise<Object>} - Commit result
   */
  async autoCommit(options) {
    const {
      repoDir,
      message = null,
      includeUntracked = true
    } = options;

    log.info('Auto-committing changes');

    try {
      // Check for changes
      const status = await this.getStatus(repoDir);
      
      if (!status.hasChanges) {
        return {
          success: true,
          committed: false,
          message: 'No changes to commit'
        };
      }

      // Stage changes
      if (includeUntracked && status.untracked.length > 0) {
        // Add untracked files
        for (const file of status.untracked) {
          await this.stageFile(repoDir, file);
        }
      }

      // Stage all modified files
      await this.executor.execute('add -u', { cwd: repoDir });

      // Generate commit message if not provided
      const commitMessage = message || this.generateAutoCommitMessage(status);
      
      // Create commit
      const commitResult = await this.createCommit(repoDir, commitMessage);

      return {
        success: true,
        committed: true,
        commitHash: commitResult.hash,
        message: commitMessage,
        changes: {
          modified: status.modified.length,
          added: status.added.length,
          deleted: status.deleted.length
        }
      };

    } catch (error) {
      log.error('Auto-commit failed:', error);
      throw error;
    }
  }

  /**
   * Create a commit
   * @param {string} repoDir - Repository directory
   * @param {string} message - Commit message
   * @returns {Promise<Object>} - Commit info
   */
  async createCommit(repoDir, message) {
    try {
      // Create commit
      await this.executor.execute(
        `commit -m "${this.escapeMessage(message)}"`,
        { cwd: repoDir }
      );

      // Get commit hash
      const { stdout: hash } = await this.executor.execute(
        'rev-parse HEAD',
        { cwd: repoDir }
      );

      return {
        hash: hash.trim(),
        message
      };

    } catch (error) {
      if (error.message.includes('nothing to commit')) {
        throw new Error('No changes staged for commit');
      }
      throw error;
    }
  }

  /**
   * Stage files for commit
   * @param {string} repoDir - Repository directory
   * @param {Object} configPaths - Configuration file paths
   */
  async stageFiles(repoDir, configPaths) {
    for (const [, filePath] of Object.entries(configPaths)) {
      if (filePath) {
        const relativePath = path.relative(repoDir, String(filePath));
        await this.stageFile(repoDir, String(relativePath));
      }
    }
  }

  /**
   * Stage a single file
   * @param {string} repoDir - Repository directory
   * @param {string} filePath - File path to stage
   */
  async stageFile(repoDir, filePath) {
    try {
      await this.executor.execute(
        `add "${filePath}"`,
        { cwd: repoDir }
      );
    } catch (error) {
      log.error(`Failed to stage file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Get repository status
   * @param {string} repoDir - Repository directory
   * @returns {Promise<Object>} - Status information
   */
  async getStatus(repoDir) {
    const { stdout } = await this.executor.execute(
      'status --porcelain',
      { cwd: repoDir }
    );

    const status = {
      hasChanges: false,
      modified: [],
      added: [],
      deleted: [],
      renamed: [],
      untracked: []
    };

    const lines = stdout.trim().split('\n').filter(line => line);
    
    for (const line of lines) {
      status.hasChanges = true;
      const statusCode = line.substring(0, 2);
      const file = line.substring(3);

      if (statusCode === '??') {
        status.untracked.push(file);
      } else if (statusCode.includes('M')) {
        status.modified.push(file);
      } else if (statusCode.includes('A')) {
        status.added.push(file);
      } else if (statusCode.includes('D')) {
        status.deleted.push(file);
      } else if (statusCode.includes('R')) {
        status.renamed.push(file);
      }
    }

    return status;
  }

  /**
   * Create configuration files
   * @param {string} repoDir - Repository directory
   * @param {Object} configPaths - Configuration file paths
   * @param {Object} metadata - Workspace metadata
   */
  async createConfigurationFiles(repoDir, configPaths, metadata) {
    // Create directories
    const dirs = new Set();
    for (const filePath of Object.values(configPaths)) {
      if (filePath) {
        dirs.add(path.dirname(String(filePath)));
      }
    }

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    // Create default configuration files
    const defaults = {
      headers: {
        version: '1.0.0',
        headers: []
      },
      environments: {
        version: '1.0.0',
        environments: []
      },
      proxy: {
        version: '1.0.0',
        rules: []
      },
      rules: {
        version: '1.0.0',
        rules: []
      },
      metadata: {
        workspaceId: metadata.workspaceId,
        workspaceName: metadata.workspaceName,
        createdAt: new Date().toISOString(),
        version: '1.0.0',
        configPaths: Object.keys(configPaths).reduce((acc, key) => {
          if (key !== 'metadata') {
            acc[key] = path.relative(repoDir, String(configPaths[key])).replace(/\\/g, '/');
          }
          return acc;
        }, {})
      }
    };

    // Write configuration files
    for (const [key, filePath] of Object.entries(configPaths)) {
      if (filePath && defaults[key]) {
        const exists = await this.fileExists(String(filePath));
        if (!exists) {
          await fs.writeFile(
            String(filePath),
            JSON.stringify(defaults[key], null, 2),
            'utf8'
          );
          log.info(`Created ${key} configuration at: ${filePath}`);
        }
      }
    }
  }

  /**
   * Ensure Git user configuration
   * @param {string} repoDir - Repository directory
   * @param {string|null} author - Author name
   * @param {string|null} email - Author email
   */
  async ensureGitUser(repoDir, author, email) {
    try {
      // Check if user is already configured
      const { stdout: currentUser } = await this.executor.execute(
        'config user.name',
        { cwd: repoDir }
      );

      const { stdout: currentEmail } = await this.executor.execute(
        'config user.email',
        { cwd: repoDir }
      );

      // Set user if not configured
      if (!currentUser.trim() && author) {
        await this.executor.execute(
          `config user.name "${author}"`,
          { cwd: repoDir }
        );
      }

      if (!currentEmail.trim() && email) {
        await this.executor.execute(
          `config user.email "${email}"`,
          { cwd: repoDir }
        );
      }

      // Use defaults if still not set
      if (!currentUser.trim() && !author) {
        await this.executor.execute(
          'config user.name "OpenHeaders User"',
          { cwd: repoDir }
        );
      }

      if (!currentEmail.trim() && !email) {
        await this.executor.execute(
          'config user.email "user@openheaders.io"',
          { cwd: repoDir }
        );
      }

    } catch (error) {
      log.warn('Failed to configure Git user:', error);
    }
  }

  /**
   * Generate commit message
   * @param {string} action - Action type
   * @param {string} workspaceName - Workspace name
   * @returns {string} - Commit message
   */
  generateCommitMessage(action, workspaceName) {
    const templates = {
      create: `feat: Create workspace configuration for ${workspaceName}`,
      update: `feat: Update workspace configuration for ${workspaceName}`,
      sync: `sync: Synchronize workspace ${workspaceName}`,
      'auto-sync': `chore: Auto-sync workspace ${workspaceName}`
    };

    return templates[action] || `chore: Update workspace ${workspaceName}`;
  }

  /**
   * Generate auto-commit message
   * @param {Object} status - Repository status
   * @returns {string} - Commit message
   */
  generateAutoCommitMessage(status) {
    const changes = [];
    
    if (status.modified.length > 0) {
      changes.push(`${status.modified.length} modified`);
    }
    if (status.added.length > 0) {
      changes.push(`${status.added.length} added`);
    }
    if (status.deleted.length > 0) {
      changes.push(`${status.deleted.length} deleted`);
    }

    const changesSummary = changes.join(', ');
    return `chore: Auto-commit configuration changes (${changesSummary})`;
  }

  /**
   * Escape commit message for shell
   * @param {string} message - Commit message
   * @returns {string} - Escaped message
   */
  escapeMessage(message) {
    return message.replace(/"/g, '\\"').replace(/\$/g, '\\$');
  }

  /**
   * Check if file exists
   * @param {string} filePath - File path
   * @returns {Promise<boolean>} - Whether file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(String(filePath));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get commit history
   * @param {string} repoDir - Repository directory
   * @param {number} limit - Number of commits to retrieve
   * @returns {Promise<Object[]>} - Commit history
   */
  async getHistory(repoDir, limit = 10) {
    try {
      const { stdout } = await this.executor.execute(
        `log -${limit} --pretty=format:"%H|%an|%ae|%at|%s"`,
        { cwd: repoDir }
      );

      const commits = [];
      const lines = stdout.trim().split('\n').filter(line => line);

      for (const line of lines) {
        const [hash, author, email, timestamp, message] = line.split('|');
        commits.push({
          hash,
          author,
          email,
          date: new Date(parseInt(timestamp) * 1000),
          message
        });
      }

      return commits;

    } catch (error) {
      log.error('Failed to get commit history:', error);
      return [];
    }
  }

  /**
   * Check if there are uncommitted changes
   * @param {string} repoDir - Repository directory
   * @returns {Promise<boolean>} - Whether there are uncommitted changes
   */
  async hasUncommittedChanges(repoDir) {
    const status = await this.getStatus(repoDir);
    return status.hasChanges;
  }
}

module.exports = CommitManager;