/**
 * GitRepositoryManager - Handles Git repository operations
 * Manages clone, pull, push, and other repository-level operations
 */

const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('../../../../utils/mainLogger');

const log = createLogger('GitRepositoryManager');

class GitRepositoryManager {
  constructor(executor, authManager) {
    this.executor = executor;
    this.authManager = authManager;
  }

  /**
   * Clone a repository
   * @param {Object} options - Clone options
   * @returns {Promise<Object>} - Clone result
   */
  async cloneRepository(options) {
    const {
      url,
      targetDir,
      branch = 'main',
      authType = 'none',
      authData = {},
      depth = 1,
      sparse = false,
      sparsePatterns = [],
      progressCallback = () => {}
    } = options;

    log.info(`Cloning repository: ${url} to ${targetDir}`);
    progressCallback({ phase: 'clone', message: 'Preparing to clone repository...' });

    // Setup authentication
    const authResult = await this.authManager.setupAuth(url, authType, authData);
    const { effectiveUrl, env } = authResult;

    try {
      // Ensure target directory doesn't exist
      await this.ensureCleanDirectory(targetDir);

      // Build clone command
      let cloneCommand = `clone --progress`;
      
      if (depth > 0) {
        cloneCommand += ` --depth ${depth}`;
      }

      if (sparse) {
        cloneCommand += ' --no-checkout --filter=blob:none';
      }

      // Only specify branch if provided in options (not the default)
      if (options.branch) {
        cloneCommand += ` --branch ${branch}`;
      }
      
      cloneCommand += ` "${effectiveUrl}" "${targetDir}"`;

      // Execute clone
      progressCallback({ phase: 'clone', message: 'Cloning repository...' });
      
      const result = await this.executor.execute(cloneCommand, {
        env,
        timeout: 300000, // 5 minutes for clone
        maxBuffer: 50 * 1024 * 1024 // 50MB
      });

      log.info('Clone completed successfully');

      // Setup sparse checkout if needed
      if (sparse && sparsePatterns.length > 0) {
        await this.setupSparseCheckout(targetDir, sparsePatterns, env, progressCallback);
      }

      // Get the actual branch that was cloned if we didn't specify one
      let actualBranch = branch;
      if (!options.branch) {
        try {
          const { stdout } = await this.executor.execute(
            'rev-parse --abbrev-ref HEAD',
            { cwd: targetDir, env }
          );
          actualBranch = stdout.trim();
        } catch (error) {
          log.warn('Could not determine cloned branch:', error);
        }
      }

      return {
        success: true,
        directory: targetDir,
        branch: actualBranch
      };

    } catch (error) {
      log.error('Clone failed:', error);
      
      // Cleanup on failure
      await this.cleanupDirectory(targetDir);
      
      throw error;
    } finally {
      // Cleanup auth resources
      await this.authManager.cleanup(authType, authResult);
    }
  }

  /**
   * Pull changes from remote repository
   * @param {Object} options - Pull options
   * @returns {Promise<Object>} - Pull result
   */
  async pullRepository(options) {
    const {
      repoDir,
      branch = 'main',
      authType = 'none',
      authData = {},
      progressCallback = () => {}
    } = options;

    log.info(`Pulling changes in: ${repoDir}, branch: ${branch}`);
    progressCallback({ phase: 'pull', message: 'Checking repository status...' });

    // Get repository URL for authentication
    const repoUrl = await this.getRepositoryUrl(repoDir);
    
    // Setup authentication - for operations on existing repo we don't need URL
    const authResult = await this.authManager.setupAuth(repoUrl, authType, authData);
    const { env } = authResult;

    try {
      // Check if branch exists on remote
      log.info(`[pullRepository] Checking if branch '${branch}' exists on remote`);
      const { stdout: remoteBranches } = await this.executor.execute(
        'ls-remote --heads origin',
        { cwd: repoDir, env, timeout: 15000 }
      );

      const branchExists = remoteBranches.includes(`refs/heads/${branch}`);
      log.info(`[pullRepository] Branch '${branch}' exists on remote: ${branchExists}`);

      if (!branchExists) {
        // Handle non-existent branch
        log.info(`[pullRepository] Branch '${branch}' does not exist on remote`);
        
        // Check if repository is empty
        const isEmptyRepo = !remoteBranches.trim();
        
        if (isEmptyRepo) {
          log.info('[pullRepository] Repository is empty, creating new branch');
          await this.executor.execute(`checkout -b ${branch}`, { cwd: repoDir, env });
          return {
            success: true,
            changes: false,
            message: 'Created new branch in empty repository'
          };
        } else {
          // Get default branch and create new branch from it
          log.info('[pullRepository] Creating new branch from default branch');
          const defaultBranch = await this.getDefaultBranch(repoDir, env);
          
          await this.executor.execute(`fetch origin ${defaultBranch}:${defaultBranch}`, {
            cwd: repoDir,
            env,
            timeout: 30000
          });
          
          await this.executor.execute(`checkout -b ${branch} origin/${defaultBranch}`, {
            cwd: repoDir,
            env
          });
          
          return {
            success: true,
            changes: true,
            message: `Created branch '${branch}' from '${defaultBranch}'`
          };
        }
      }

      // Normal pull for existing branch
      progressCallback({ phase: 'pull', message: 'Fetching latest changes...' });
      
      // Fetch specific branch
      await this.executor.execute(`fetch origin ${branch}`, {
        cwd: repoDir,
        env,
        timeout: 30000
      });

      // Check if we need to pull
      const { stdout: status } = await this.executor.execute(
        `rev-list HEAD...origin/${branch} --count`,
        { cwd: repoDir, env }
      );

      const behind = parseInt(status.trim()) || 0;

      if (behind === 0) {
        log.info('Already up to date');
        return {
          success: true,
          changes: false,
          message: 'Already up to date'
        };
      }

      // Pull changes
      progressCallback({ phase: 'pull', message: `Pulling ${behind} new commits...` });
      
      await this.executor.execute(`pull origin ${branch}`, {
        cwd: repoDir,
        env,
        timeout: 60000
      });

      return {
        success: true,
        changes: true,
        message: `Pulled ${behind} new commits`
      };

    } catch (error) {
      log.error('Pull failed:', error);
      throw error;
    } finally {
      await this.authManager.cleanup(authType, authResult);
    }
  }

  /**
   * Push changes to remote repository
   * @param {Object} options - Push options
   * @returns {Promise<Object>} - Push result
   */
  async pushRepository(options) {
    const {
      repoDir,
      branch = 'main',
      authType = 'none',
      authData = {},
      force = false,
      setUpstream = false,
      progressCallback = () => {}
    } = options;

    log.info(`Pushing changes from: ${repoDir}, branch: ${branch}`);
    progressCallback({ phase: 'push', message: 'Preparing to push changes...' });

    // Get repository URL for authentication
    const repoUrl = await this.getRepositoryUrl(repoDir);
    
    // Setup authentication - for operations on existing repo we don't need URL
    const authResult = await this.authManager.setupAuth(repoUrl, authType, authData);
    const { env } = authResult;

    try {
      let unpushedCount = 0;
      
      // Check if we have commits to push
      // If setUpstream is true, this is a new branch and origin/branch won't exist
      if (!setUpstream) {
        try {
          const { stdout: unpushed } = await this.executor.execute(
            `rev-list origin/${branch}..HEAD --count`,
            { cwd: repoDir, env }
          );
          unpushedCount = parseInt(unpushed.trim()) || 0;
          
          if (unpushedCount === 0 && !force) {
            log.info('No changes to push');
            return {
              success: true,
              pushed: false,
              message: 'No changes to push'
            };
          }
        } catch (error) {
          // If the command fails, it might be because origin/branch doesn't exist
          log.warn(`Could not count unpushed commits: ${error.message}`);
          // Continue with push anyway
          unpushedCount = 1; // Assume at least one commit
        }
      } else {
        // For new branches, count all commits
        try {
          const { stdout: allCommits } = await this.executor.execute(
            `rev-list HEAD --count`,
            { cwd: repoDir, env }
          );
          unpushedCount = parseInt(allCommits.trim()) || 1;
        } catch (error) {
          unpushedCount = 1; // Default to 1
        }
      }

      // Build push command
      let pushCommand = 'push origin';
      
      if (force) {
        pushCommand += ' --force';
      }
      
      if (setUpstream) {
        pushCommand += ' --set-upstream';
      }

      pushCommand += ` ${branch}`;

      // Execute push
      progressCallback({ 
        phase: 'push', 
        message: `Pushing ${unpushedCount} commits...` 
      });

      await this.executor.execute(pushCommand, {
        cwd: repoDir,
        env,
        timeout: 120000 // 2 minutes for push
      });

      // Add delay after push to allow GitHub to process the new branch
      if (setUpstream) {
        log.info('Waiting for GitHub to process new branch...');
        progressCallback({ 
          phase: 'push', 
          message: 'Waiting for remote to process new branch...' 
        });
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
      }

      return {
        success: true,
        pushed: true,
        message: `Pushed ${unpushedCount} commits`,
        commits: unpushedCount
      };

    } catch (error) {
      log.error('Push failed:', error);
      throw error;
    } finally {
      await this.authManager.cleanup(authType, authResult);
    }
  }

  /**
   * Get repository status
   * @param {string} repoDir - Repository directory
   * @returns {Promise<Object>} - Repository status
   */
  async getStatus(repoDir) {
    try {
      // Get current branch
      const { stdout: branch } = await this.executor.execute(
        'rev-parse --abbrev-ref HEAD',
        { cwd: repoDir }
      );

      // Get status
      const { stdout: status } = await this.executor.execute(
        'status --porcelain',
        { cwd: repoDir }
      );

      // Get last commit
      const { stdout: lastCommit } = await this.executor.execute(
        'log -1 --pretty=format:"%H|%an|%ae|%at|%s"',
        { cwd: repoDir }
      );

      const [hash, author, email, timestamp, message] = lastCommit.split('|');

      return {
        branch: branch.trim(),
        hasChanges: status.trim().length > 0,
        changes: this.parseStatusOutput(status),
        lastCommit: {
          hash,
          author,
          email,
          date: new Date(parseInt(timestamp) * 1000),
          message
        }
      };

    } catch (error) {
      log.error('Failed to get repository status:', error);
      throw error;
    }
  }

  /**
   * Parse git status output
   * @param {string} status - Git status output
   * @returns {Object} - Parsed status
   */
  parseStatusOutput(status) {
    const changes = {
      modified: [],
      added: [],
      deleted: [],
      renamed: [],
      untracked: []
    };

    const lines = status.trim().split('\n').filter(line => line);

    for (const line of lines) {
      const statusCode = line.substring(0, 2);
      const file = line.substring(3);

      if (statusCode.includes('M')) changes.modified.push(file);
      else if (statusCode.includes('A')) changes.added.push(file);
      else if (statusCode.includes('D')) changes.deleted.push(file);
      else if (statusCode.includes('R')) changes.renamed.push(file);
      else if (statusCode === '??') changes.untracked.push(file);
    }

    return changes;
  }

  /**
   * Setup sparse checkout
   * @param {string} repoDir - Repository directory
   * @param {string[]} patterns - Sparse checkout patterns
   * @param {Object} env - Environment variables
   * @param {Function} progressCallback - Progress callback
   */
  async setupSparseCheckout(repoDir, patterns, env, progressCallback) {
    log.info('Setting up sparse checkout with patterns:', patterns);
    progressCallback({ phase: 'sparse', message: 'Configuring sparse checkout...' });

    // Enable sparse checkout
    await this.executor.execute('sparse-checkout init --cone', {
      cwd: repoDir,
      env
    });

    // Set patterns
    const patternsStr = patterns.join(' ');
    await this.executor.execute(`sparse-checkout set ${patternsStr}`, {
      cwd: repoDir,
      env
    });

    // Checkout files
    await this.executor.execute('checkout', {
      cwd: repoDir,
      env
    });
  }

  /**
   * Get default branch name
   * @param {string} repoDir - Repository directory
   * @param {Object} env - Environment variables
   * @returns {Promise<string>} - Default branch name
   */
  async getDefaultBranch(repoDir, env) {
    try {
      const { stdout } = await this.executor.execute(
        'symbolic-ref refs/remotes/origin/HEAD',
        { cwd: repoDir, env }
      );
      return stdout.trim().replace('refs/remotes/origin/', '');
    } catch (error) {
      // Fallback to common defaults
      const { stdout: branches } = await this.executor.execute(
        'ls-remote --heads origin',
        { cwd: repoDir, env }
      );

      if (branches.includes('refs/heads/main')) return 'main';
      if (branches.includes('refs/heads/master')) return 'master';
      
      throw new Error('Could not determine default branch');
    }
  }

  /**
   * Ensure directory is clean for cloning
   * @param {string} dir - Directory path
   */
  async ensureCleanDirectory(dir) {
    try {
      const stats = await fs.stat(dir);
      if (stats.isDirectory()) {
        const files = await fs.readdir(dir);
        if (files.length > 0) {
          throw new Error(`Directory ${dir} is not empty`);
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // Directory doesn't exist, create it
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Cleanup directory
   * @param {string} dir - Directory to cleanup
   */
  async cleanupDirectory(dir) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (error) {
      log.error(`Failed to cleanup directory ${dir}:`, error);
    }
  }

  /**
   * Get repository URL from existing repository
   * @param {string} repoDir - Repository directory
   * @returns {Promise<string>} - Repository URL
   */
  async getRepositoryUrl(repoDir) {
    try {
      const { stdout } = await this.executor.execute(
        'config --get remote.origin.url',
        { cwd: repoDir }
      );
      return stdout.trim();
    } catch (error) {
      log.error('Failed to get repository URL:', error);
      return null;
    }
  }
}

module.exports = GitRepositoryManager;