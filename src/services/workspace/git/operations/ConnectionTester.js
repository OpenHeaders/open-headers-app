/**
 * ConnectionTester - Tests Git repository connections and validates access
 * Handles connection testing with various authentication methods
 */

const { createLogger } = require('../../../../utils/mainLogger');
const GitConnectionProgress = require('../utils/GitConnectionProgress');

const log = createLogger('ConnectionTester');

class ConnectionTester {
  constructor(dependencies) {
    this.executor = dependencies.executor;
    this.authManager = dependencies.authManager;
    this.configDetector = dependencies.configDetector;
    this.branchManager = dependencies.branchManager;
  }

  /**
   * Test connection to a Git repository
   * @param {Object} options - Test options
   * @returns {Promise<Object>} - Test result
   */
  async testConnection(options) {
    const {
      url,
      branch = 'main',
      authType = 'none',
      authData = {},
      configDir,
      filePath,
      checkWriteAccess = false,
      isInvite = false,
      onProgress
    } = options;

    const progress = new GitConnectionProgress(onProgress);

    log.info(`Testing connection to: ${url}`);
    progress.report('Starting connection test', 'running');

    try {
      // Mark initialization as complete
      progress.success('Starting connection test', 'Connection test initialized');
      
      // Step 1: Validate authentication data
      progress.report('Validating authentication', 'running', `Method: ${authType}`);
      
      const authValidation = this.authManager.validateAuthData(authType, authData);
      if (!authValidation.valid) {
        throw new Error(`Authentication validation failed: ${authValidation.error}`);
      }
      progress.success('Validating authentication', 'Authentication data validated');

      // Step 2: Setup authentication
      progress.report('Setting up authentication', 'running');
      const authResult = await this.authManager.setupAuth(url, authType, authData);
      const { effectiveUrl, env } = authResult;
      progress.success('Setting up authentication', 'Authentication configured');

      // Step 2a: For GitHub with token, do specific validation
      const isGitHub = url.includes('github.com');
      if (isGitHub && authType === 'token' && authData.token) {
        progress.report('Validating GitHub token', 'running', 'Checking token validity');
        const tokenValidation = await this.validateGitHubToken(authData.token);
        if (!tokenValidation.valid) {
          progress.error('Validating GitHub token', tokenValidation.error);
          throw new Error(tokenValidation.error);
        }
        progress.success('Validating GitHub token', 'Token is valid');
        
        // Step 2b: Check write permissions if needed
        if (checkWriteAccess) {
          progress.report('Checking write permissions', 'running', 'Verifying repository write access');
          const repoInfo = this.parseGitHubUrl(url);
          if (repoInfo) {
            const writeAccess = await this.checkGitHubWriteAccess(authData.token, repoInfo.owner, repoInfo.repo);
            if (!writeAccess.hasAccess) {
              progress.error('Checking write permissions', writeAccess.error);
              throw new Error(writeAccess.error);
            }
            progress.success('Checking write permissions', 'Write access confirmed');
          }
        }
      }

      try {
        // Step 3: Test repository access
        progress.report('Testing repository access', 'running', 'Checking repository availability');
        
        const accessResult = await this.testRepositoryAccess(effectiveUrl, env);
        
        if (!accessResult.accessible) {
          throw new Error(accessResult.error || 'Repository not accessible');
        }
        progress.success('Testing repository access', 'Repository is accessible');

        // Step 4: Check branch existence
        progress.report('Branch validation', 'running', `Checking branch '${branch}'`);
        
        const branchResult = await this.checkBranch(effectiveUrl, branch, env);
        
        if (branchResult.exists) {
          progress.success('Branch validation', `Branch '${branch}' found`);
        } else {
          if (isInvite) {
            // For invites, branch must exist
            progress.error('Branch validation', `Branch '${branch}' not found - required for joining workspace`);
            throw new Error(`Branch '${branch}' does not exist in the repository. Please contact the workspace administrator.`);
          } else if (checkWriteAccess) {
            // For new team workspaces, branch will be created
            progress.warning('Branch validation', `Branch '${branch}' not found (will be created automatically)`);
          } else {
            // For other cases (e.g., read-only sync)
            progress.warning('Branch validation', `Branch '${branch}' not found`);
          }
        }
        
        // Step 5: Check directory path
        const pathToCheck = filePath || configDir || 'config/';
        progress.report('Directory path validation', 'running', `Checking path '${pathToCheck}'`);
        
        // We can't check directory existence without cloning, so we'll inform based on context
        if (isInvite) {
          progress.success('Directory path validation', `Path '${pathToCheck}' must exist with configuration files`);
        } else if (checkWriteAccess) {
          progress.success('Directory path validation', `Path '${pathToCheck}' will be created if it doesn't exist`);
        } else {
          progress.success('Directory path validation', `Path '${pathToCheck}' will be checked after cloning`);
        }
        
        // Step 6: Check for configuration files
        progress.report('Configuration validation', 'running', 'Checking for configuration files');
        
        const configResult = await this.checkConfigFiles(effectiveUrl, branch, configDir || filePath);
        
        if (configResult.hasConfig === null) {
          if (isInvite) {
            progress.success('Configuration validation', 'Configuration files will be validated after joining');
          } else if (checkWriteAccess) {
            progress.success('Configuration validation', 'Configuration will be created in the repository');
          } else {
            progress.success('Configuration validation', 'Configuration check requires cloning');
          }
        } else if (configResult.hasConfig) {
          progress.success('Configuration validation', 'Configuration files found');
        } else {
          if (isInvite) {
            progress.success('Configuration validation', 'Configuration will be synchronized after joining');
          } else if (checkWriteAccess) {
            progress.warning('Configuration validation', 'No configuration files found (will be created)');
          } else {
            progress.warning('Configuration validation', 'No configuration files found');
          }
        }

        // Compile results
        const result = {
          success: true,
          accessible: true,
          authenticated: authType !== 'none',
          repository: {
            url,
            defaultBranch: accessResult.defaultBranch,
            isPrivate: accessResult.isPrivate
          },
          branch: {
            name: branch,
            exists: branchResult.exists,
            isDefault: branch === accessResult.defaultBranch,
            alternatives: branchResult.alternatives
          },
          configuration: {
            hasConfig: configResult.hasConfig,
            configFiles: configResult.files,
            configDir: configResult.configDir
          },
          warnings: this.collectWarnings(accessResult, branchResult, configResult)
        };

        progress.success('Connection test complete', 'All checks passed');

        return {
          ...result,
          progressSteps: progress.getSummary()
        };

      } finally {
        // Cleanup authentication resources
        await this.authManager.cleanup(authType, authResult);
      }

    } catch (error) {
      log.error('Connection test failed:', error);
      
      // Don't add another error step if the last step was already an error
      const summary = progress.getSummary();
      const lastStep = summary[summary.length - 1];
      if (!lastStep || lastStep.status !== 'error') {
        progress.error('Connection test failed', error.message);
      }
      
      return {
        success: false,
        accessible: false,
        error: error.message,
        errorType: this.classifyError(error),
        hint: this.getErrorHint(error),
        progressSteps: progress.getSummary()
      };
    }
  }

  /**
   * Test repository access
   * @param {string} url - Repository URL (with auth)
   * @param {Object} env - Environment variables
   * @returns {Promise<Object>} - Access result
   */
  async testRepositoryAccess(url, env) {
    try {
      // Use ls-remote to test access without cloning
      const { stdout } = await this.executor.execute(
        `ls-remote --heads "${url}"`,
        { env, timeout: 30000 }
      );

      // Parse output to get branch information
      const branches = this.parseLsRemoteOutput(stdout);
      
      // Determine default branch
      const defaultBranch = this.detectDefaultBranch(branches);

      return {
        accessible: true,
        branches,
        defaultBranch,
        isPrivate: true // Assume private if auth is required
      };

    } catch (error) {
      // For GitHub URLs with token authentication, authentication errors are critical
      const isGitHub = url.includes('github.com');
      const hasToken = url.includes('@') && (url.includes('x-oauth-basic') || url.includes(':x-oauth-basic@'));
      
      if (isGitHub && hasToken) {
        // For GitHub with token, don't fall back to public access test
        // The token should work or fail definitively
        if (error.message.includes('Authentication failed') || 
            error.message.includes('Invalid username or password') ||
            error.message.includes('fatal: Authentication failed') ||
            error.message.includes('remote: Invalid username or password')) {
          return {
            accessible: false,
            error: 'Invalid GitHub access token. Please check your token has the required permissions.'
          };
        }
      }
      
      // Check if it's a public repository (for non-GitHub or non-token auth)
      if (error.message.includes('Authentication failed') && (!isGitHub || !hasToken)) {
        // Try without auth to see if it's public
        try {
          const { stdout } = await this.executor.execute(
            `ls-remote --heads "${this.stripAuth(url)}"`,
            { timeout: 30000 }
          );
          
          return {
            accessible: true,
            branches: this.parseLsRemoteOutput(stdout),
            defaultBranch: this.detectDefaultBranch(this.parseLsRemoteOutput(stdout)),
            isPrivate: false
          };
        } catch (publicError) {
          // Really not accessible
          return {
            accessible: false,
            error: 'Repository requires authentication'
          };
        }
      }

      return {
        accessible: false,
        error: error.message
      };
    }
  }

  /**
   * Check if branch exists and get alternatives
   * @param {string} url - Repository URL
   * @param {string} branch - Branch name
   * @param {Object} env - Environment variables
   * @returns {Promise<Object>} - Branch check result
   */
  async checkBranch(url, branch, env) {
    try {
      const { stdout } = await this.executor.execute(
        `ls-remote --heads "${url}" "${branch}"`,
        { env, timeout: 15000 }
      );

      const exists = stdout.trim().length > 0;

      if (!exists) {
        // Get all branches to suggest alternatives
        const { stdout: allBranches } = await this.executor.execute(
          `ls-remote --heads "${url}"`,
          { env, timeout: 15000 }
        );

        const branches = this.parseLsRemoteOutput(allBranches);
        const alternatives = this.suggestAlternativeBranches(branch, branches);

        return {
          exists: false,
          alternatives
        };
      }

      return {
        exists: true,
        alternatives: []
      };

    } catch (error) {
      log.error('Failed to check branch:', error);
      return {
        exists: false,
        error: error.message,
        alternatives: []
      };
    }
  }

  /**
   * Check for configuration files in repository
   * @param {string} url - Repository URL
   * @param {string} branch - Branch name
   * @param {string} configDir - Expected config directory
   * @returns {Promise<Object>} - Config check result
   */
  async checkConfigFiles(url, branch, configDir) {
    try {
      // We can't directly check files without cloning
      // So we'll return a basic result indicating we need to clone to check
      return {
        hasConfig: null, // Unknown until cloned
        requiresClone: true,
        configDir: configDir || '.openheaders',
        files: [],
        note: 'Configuration files can only be verified after cloning'
      };

    } catch (error) {
      return {
        hasConfig: false,
        error: error.message,
        files: []
      };
    }
  }

  /**
   * Parse ls-remote output
   * @param {string} output - ls-remote output
   * @returns {string[]} - Branch names
   */
  parseLsRemoteOutput(output) {
    return output
      .trim()
      .split('\n')
      .filter(line => line)
      .map(line => {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          return parts[1].replace('refs/heads/', '');
        }
        return null;
      })
      .filter(branch => branch);
  }

  /**
   * Detect default branch from branch list
   * @param {string[]} branches - List of branches
   * @returns {string} - Default branch name
   */
  detectDefaultBranch(branches) {
    // Common default branch names in order of preference
    const defaults = ['main', 'master', 'develop', 'development'];
    
    for (const defaultName of defaults) {
      if (branches.includes(defaultName)) {
        return defaultName;
      }
    }

    // Return first branch if no common default found
    return branches[0] || 'main';
  }

  /**
   * Suggest alternative branches
   * @param {string} requestedBranch - Requested branch name
   * @param {string[]} availableBranches - Available branches
   * @returns {string[]} - Suggested alternatives
   */
  suggestAlternativeBranches(requestedBranch, availableBranches) {
    const alternatives = [];
    const requested = requestedBranch.toLowerCase();

    // Find similar branch names
    for (const branch of availableBranches) {
      const branchLower = branch.toLowerCase();
      
      // Exact match (different case)
      if (branchLower === requested) {
        alternatives.unshift(branch);
        continue;
      }

      // Partial match
      if (branchLower.includes(requested) || requested.includes(branchLower)) {
        alternatives.push(branch);
      }
    }

    // Add default branches if not already included
    const defaults = ['main', 'master'];
    for (const defaultBranch of defaults) {
      if (availableBranches.includes(defaultBranch) && !alternatives.includes(defaultBranch)) {
        alternatives.push(defaultBranch);
      }
    }

    return alternatives.slice(0, 5); // Return top 5 suggestions
  }

  /**
   * Classify error type
   * @param {Error} error - Error object
   * @returns {string} - Error type
   */
  classifyError(error) {
    const message = error.message.toLowerCase();

    if (message.includes('permission denied') || 
        message.includes('authentication') ||
        message.includes('unauthorized')) {
      return 'AUTH_ERROR';
    }

    if (message.includes('could not resolve host') ||
        message.includes('network') ||
        message.includes('timeout')) {
      return 'NETWORK_ERROR';
    }

    if (message.includes('repository not found') ||
        message.includes('does not exist')) {
      return 'NOT_FOUND';
    }

    if (message.includes('invalid') ||
        message.includes('malformed')) {
      return 'INVALID_URL';
    }

    return 'UNKNOWN_ERROR';
  }

  /**
   * Get error hint for user
   * @param {Error} error - Error object
   * @returns {string} - Helpful hint
   */
  getErrorHint(error) {
    const errorType = this.classifyError(error);

    switch (errorType) {
      case 'AUTH_ERROR':
        return 'Please check your authentication credentials and repository permissions.';
      
      case 'NETWORK_ERROR':
        return 'Please check your internet connection and the repository URL.';
      
      case 'NOT_FOUND':
        return 'The repository was not found. Please verify the URL is correct.';
      
      case 'INVALID_URL':
        return 'The repository URL appears to be invalid. Please check the format.';
      
      default:
        return 'An unexpected error occurred. Please check the repository URL and try again.';
    }
  }

  /**
   * Collect warnings from test results
   * @param {Object} accessResult - Access test result
   * @param {Object} branchResult - Branch test result
   * @param {Object} configResult - Config test result
   * @returns {string[]} - Warning messages
   */
  collectWarnings(accessResult, branchResult, configResult) {
    const warnings = [];

    if (!branchResult.exists) {
      warnings.push(`Branch '${branchResult.name || 'specified'}' does not exist`);
      if (branchResult.alternatives.length > 0) {
        warnings.push(`Available branches: ${branchResult.alternatives.join(', ')}`);
      }
    }

    if (accessResult.isPrivate === false) {
      warnings.push('This is a public repository - no authentication required');
    }

    if (configResult.requiresClone) {
      warnings.push('Configuration files will be verified after cloning');
    }

    return warnings;
  }

  /**
   * Strip authentication from URL
   * @param {string} url - URL with potential auth
   * @returns {string} - URL without auth
   */
  stripAuth(url) {
    try {
      const urlObj = new URL(url);
      urlObj.username = '';
      urlObj.password = '';
      return urlObj.toString();
    } catch (error) {
      return url;
    }
  }

  /**
   * Parse GitHub URL to extract owner and repo
   * @param {string} url - GitHub repository URL
   * @returns {Object|null} - Parsed info or null
   */
  parseGitHubUrl(url) {
    try {
      // Handle various GitHub URL formats
      const patterns = [
        /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/,
        /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/,
        /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/
      ];
      
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          return {
            owner: match[1],
            repo: match[2]
          };
        }
      }
      return null;
    } catch (error) {
      log.error('Failed to parse GitHub URL:', error);
      return null;
    }
  }

  /**
   * Check if token has write access to a GitHub repository
   * @param {string} token - GitHub access token
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @returns {Promise<Object>} - Access check result
   */
  async checkGitHubWriteAccess(token, owner, repo) {
    return new Promise((resolve) => {
      const https = require('https');
      
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}`,
        method: 'GET',
        headers: {
          'Authorization': `token ${token}`,
          'User-Agent': 'OpenHeaders-App',
          'Accept': 'application/vnd.github.v3+json'
        },
        timeout: 10000
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode === 404) {
              resolve({
                hasAccess: false,
                error: `Repository ${owner}/${repo} not found or you don't have access to it.`
              });
              return;
            }
            
            if (res.statusCode === 403) {
              resolve({
                hasAccess: false,
                error: 'Access denied. Token may lack required permissions or rate limit exceeded.'
              });
              return;
            }
            
            if (res.statusCode !== 200) {
              resolve({
                hasAccess: false,
                error: `Failed to check repository access: HTTP ${res.statusCode}`
              });
              return;
            }
            
            const repoData = JSON.parse(data);
            const permissions = repoData.permissions;
            
            if (!permissions) {
              // No permissions field means read-only access
              resolve({
                hasAccess: false,
                error: 'Token only has read access to the repository. Write permissions are required to create and manage workspaces.'
              });
            } else if (permissions.push === true || permissions.admin === true) {
              // Has write access
              resolve({ hasAccess: true });
            } else {
              resolve({
                hasAccess: false,
                error: 'Token does not have write permissions to the repository. Please ensure the token has "repo" scope.'
              });
            }
          } catch (error) {
            log.error('Failed to parse GitHub API response:', error);
            resolve({
              hasAccess: false,
              error: 'Failed to verify repository permissions'
            });
          }
        });
      });

      req.on('error', (error) => {
        log.error('Failed to check GitHub write access:', error);
        resolve({
          hasAccess: false,
          error: 'Network error while checking repository permissions'
        });
      });

      req.on('timeout', () => {
        req.destroy();
        log.error('GitHub write access check timed out');
        resolve({
          hasAccess: false,
          error: 'Timeout while checking repository permissions'
        });
      });

      req.end();
    });
  }

  /**
   * Validate GitHub token by making a simple API call
   * @param {string} token - GitHub access token
   * @returns {Promise<Object>} - Validation result
   */
  async validateGitHubToken(token) {
    return new Promise((resolve) => {
      const https = require('https');
      
      const options = {
        hostname: 'api.github.com',
        path: '/user',
        method: 'GET',
        headers: {
          'Authorization': `token ${token}`,
          'User-Agent': 'OpenHeaders-App',
          'Accept': 'application/vnd.github.v3+json'
        },
        timeout: 10000
      };

      const req = https.request(options, (res) => {
        const statusCode = res.statusCode;
        
        // Consume response data to free up memory
        res.on('data', () => {});
        res.on('end', () => {
          if (statusCode === 200) {
            resolve({ valid: true });
          } else if (statusCode === 401) {
            resolve({ 
              valid: false, 
              error: 'Invalid GitHub access token. Please check your token is correct and not expired.' 
            });
          } else if (statusCode === 403) {
            resolve({ 
              valid: false, 
              error: 'GitHub API rate limit exceeded or token lacks required permissions.' 
            });
          } else {
            resolve({ 
              valid: false, 
              error: `GitHub API returned unexpected status: ${statusCode}` 
            });
          }
        });
      });

      req.on('error', (error) => {
        log.error('Failed to validate GitHub token:', error);
        // Network error - let the regular git command handle it
        resolve({ valid: true });
      });

      req.on('timeout', () => {
        req.destroy();
        log.error('GitHub token validation timed out');
        resolve({ valid: true }); // Let git handle it
      });

      req.end();
    });
  }
}

module.exports = ConnectionTester;