/**
 * ConnectionTester - Tests Git repository connections and validates access
 * Handles connection testing with various authentication methods
 */

import electron from 'electron';
import mainLogger from '../../../../utils/mainLogger';
import GitConnectionProgress from '../utils/GitConnectionProgress';
import type { ProgressStep } from '../utils/GitConnectionProgress';
import type { GitExecutor } from '../core/GitExecutor';
import type GitAuthenticator from '../auth/GitAuthenticator';
import type { ConfigFileDetector } from '../../ConfigFileDetector';
import type { GitBranchManager } from '../repository/GitBranchManager';
import type { WorkspaceAuthData } from '../../../../types/workspace';

const { net } = electron;
const { createLogger } = mainLogger;

const log = createLogger('ConnectionTester');

interface ConnectionTestOptions {
  url: string;
  branch?: string;
  authType?: string;
  authData?: WorkspaceAuthData;
  configDir?: string;
  filePath?: string;
  checkWriteAccess?: boolean;
  isInvite?: boolean;
  onProgress?: (update: ProgressStep, summary: ProgressStep[]) => void;
}

interface ConnectionTestResult {
  success: boolean;
  accessible: boolean;
  authenticated?: boolean;
  repository?: {
    url: string;
    defaultBranch: string;
    isPrivate: boolean;
  };
  branch?: {
    name: string;
    exists: boolean;
    isDefault: boolean;
    alternatives: string[];
  };
  configuration?: {
    hasConfig: boolean | null;
    configFiles: string[];
    configDir: string;
  };
  warnings?: string[];
  error?: string;
  errorType?: string;
  hint?: string;
  progressSteps?: ProgressStep[];
}

interface RepositoryAccessResult {
  accessible: boolean;
  branches?: string[];
  defaultBranch?: string;
  isPrivate?: boolean;
  error?: string;
}

interface Dependencies {
  executor: GitExecutor;
  authManager: GitAuthenticator;
  configDetector: ConfigFileDetector;
  branchManager: GitBranchManager;
}

class ConnectionTester {
  private executor: GitExecutor;
  private authManager: GitAuthenticator;
  private configDetector: ConfigFileDetector;
  private branchManager: GitBranchManager;

  constructor(dependencies: Dependencies) {
    this.executor = dependencies.executor;
    this.authManager = dependencies.authManager;
    this.configDetector = dependencies.configDetector;
    this.branchManager = dependencies.branchManager;
  }

  /**
   * Test connection to a Git repository
   */
  async testConnection(options: ConnectionTestOptions): Promise<ConnectionTestResult> {
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
          progress.error('Validating GitHub token', tokenValidation.error!);
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
              progress.error('Checking write permissions', writeAccess.error!);
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
            progress.error('Branch validation', `Branch '${branch}' not found - required for joining workspace`);
            throw new Error(`Branch '${branch}' does not exist in the repository. Please contact the workspace administrator.`);
          } else if (checkWriteAccess) {
            progress.warning('Branch validation', `Branch '${branch}' not found (will be created automatically)`);
          } else {
            progress.warning('Branch validation', `Branch '${branch}' not found`);
          }
        }

        // Step 5: Check directory path
        const pathToCheck = filePath || configDir || 'config/';
        progress.report('Directory path validation', 'running', `Checking path '${pathToCheck}'`);

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
        const result: ConnectionTestResult = {
          success: true,
          accessible: true,
          authenticated: authType !== 'none',
          repository: {
            url,
            defaultBranch: accessResult.defaultBranch || 'main',
            isPrivate: accessResult.isPrivate ?? true
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
        progress.error('Connection test failed', (error as Error).message);
      }

      return {
        success: false,
        accessible: false,
        error: (error as Error).message,
        errorType: this.classifyError(error as Error),
        hint: this.getErrorHint(error as Error),
        progressSteps: progress.getSummary()
      };
    }
  }

  /**
   * Test repository access
   */
  async testRepositoryAccess(url: string, env: NodeJS.ProcessEnv): Promise<RepositoryAccessResult> {
    try {
      const { stdout } = await this.executor.execute(
        `ls-remote --heads "${url}"`,
        { env, timeout: 30000 }
      );

      const branches = this.parseLsRemoteOutput(stdout);
      const defaultBranch = this.detectDefaultBranch(branches);

      return {
        accessible: true,
        branches,
        defaultBranch,
        isPrivate: true
      };

    } catch (error) {
      const isGitHub = url.includes('github.com');
      const hasToken = url.includes('@') && (url.includes('x-oauth-basic') || url.includes(':x-oauth-basic@'));

      if (isGitHub && hasToken) {
        if ((error as Error).message.includes('Authentication failed') ||
            (error as Error).message.includes('Invalid username or password') ||
            (error as Error).message.includes('fatal: Authentication failed') ||
            (error as Error).message.includes('remote: Invalid username or password')) {
          return {
            accessible: false,
            error: 'Invalid GitHub access token. Please check your token has the required permissions.'
          };
        }
      }

      if ((error as Error).message.includes('Authentication failed') && (!isGitHub || !hasToken)) {
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
          return {
            accessible: false,
            error: 'Repository requires authentication'
          };
        }
      }

      return {
        accessible: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Check if branch exists and get alternatives
   */
  async checkBranch(url: string, branch: string, env: NodeJS.ProcessEnv): Promise<{ exists: boolean; alternatives: string[]; error?: string }> {
    try {
      const { stdout } = await this.executor.execute(
        `ls-remote --heads "${url}" "${branch}"`,
        { env, timeout: 15000 }
      );

      const exists = stdout.trim().length > 0;

      if (!exists) {
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
        error: (error as Error).message,
        alternatives: []
      };
    }
  }

  /**
   * Check for configuration files in repository
   */
  async checkConfigFiles(url: string, branch: string, configDir?: string): Promise<{ hasConfig: boolean | null; requiresClone?: boolean; configDir: string; files: string[]; note?: string; error?: string }> {
    try {
      return {
        hasConfig: null,
        requiresClone: true,
        configDir: configDir || '.openheaders',
        files: [],
        note: 'Configuration files can only be verified after cloning'
      };

    } catch (error) {
      return {
        hasConfig: false,
        error: (error as Error).message,
        configDir: configDir || '.openheaders',
        files: []
      };
    }
  }

  /**
   * Parse ls-remote output
   */
  parseLsRemoteOutput(output: string): string[] {
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
      .filter((branch): branch is string => branch !== null);
  }

  /**
   * Detect default branch from branch list
   */
  detectDefaultBranch(branches: string[]): string {
    const defaults = ['main', 'master', 'develop', 'development'];

    for (const defaultName of defaults) {
      if (branches.includes(defaultName)) {
        return defaultName;
      }
    }

    return branches[0] || 'main';
  }

  /**
   * Suggest alternative branches
   */
  suggestAlternativeBranches(requestedBranch: string, availableBranches: string[]): string[] {
    const alternatives: string[] = [];
    const requested = requestedBranch.toLowerCase();

    for (const branch of availableBranches) {
      const branchLower = branch.toLowerCase();

      if (branchLower === requested) {
        alternatives.unshift(branch);
        continue;
      }

      if (branchLower.includes(requested) || requested.includes(branchLower)) {
        alternatives.push(branch);
      }
    }

    const defaults = ['main', 'master'];
    for (const defaultBranch of defaults) {
      if (availableBranches.includes(defaultBranch) && !alternatives.includes(defaultBranch)) {
        alternatives.push(defaultBranch);
      }
    }

    return alternatives.slice(0, 5);
  }

  /**
   * Classify error type
   */
  classifyError(error: Error): string {
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
   */
  getErrorHint(error: Error): string {
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
   */
  collectWarnings(accessResult: RepositoryAccessResult, branchResult: { exists: boolean; alternatives: string[]; name?: string }, configResult: { hasConfig: boolean | null; requiresClone?: boolean }): string[] {
    const warnings: string[] = [];

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
   */
  stripAuth(url: string): string {
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
   */
  parseGitHubUrl(url: string): { owner: string; repo: string } | null {
    try {
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
   */
  async checkGitHubWriteAccess(token: string, owner: string, repo: string): Promise<{ hasAccess: boolean; error?: string }> {
    return new Promise((resolve) => {
      const request = net.request({
        method: 'GET',
        protocol: 'https:',
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}`
      });

      request.setHeader('Authorization', `token ${token}`);
      request.setHeader('User-Agent', 'OpenHeaders-App');
      request.setHeader('Accept', 'application/vnd.github.v3+json');

      const timeoutId = setTimeout(() => {
        request.abort();
        log.error('GitHub write access check timed out');
        resolve({
          hasAccess: false,
          error: 'Timeout while checking repository permissions'
        });
      }, 10000);

      request.on('response', (res: Electron.IncomingMessage) => {
        let data = '';

        res.on('data', (chunk: Buffer) => {
          data += chunk;
        });

        res.on('end', () => {
          clearTimeout(timeoutId);
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
              resolve({
                hasAccess: false,
                error: 'Token only has read access to the repository. Write permissions are required to create and manage workspaces.'
              });
            } else if (permissions.push === true || permissions.admin === true) {
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

      request.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        log.error('Failed to check GitHub write access:', error);
        resolve({
          hasAccess: false,
          error: 'Network error while checking repository permissions'
        });
      });

      request.end();
    });
  }

  /**
   * Validate GitHub token by making a simple API call
   */
  async validateGitHubToken(token: string): Promise<{ valid: boolean; error?: string }> {
    return new Promise((resolve) => {
      const request = net.request({
        method: 'GET',
        protocol: 'https:',
        hostname: 'api.github.com',
        path: '/user'
      });

      request.setHeader('Authorization', `token ${token}`);
      request.setHeader('User-Agent', 'OpenHeaders-App');
      request.setHeader('Accept', 'application/vnd.github.v3+json');

      const timeoutId = setTimeout(() => {
        request.abort();
        log.error('GitHub token validation timed out');
        resolve({ valid: true }); // Let git handle it
      }, 10000);

      request.on('response', (res: Electron.IncomingMessage) => {
        const statusCode = res.statusCode;

        // Consume response data to free up memory
        res.on('data', () => {});
        res.on('end', () => {
          clearTimeout(timeoutId);
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

      request.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        log.error('Failed to validate GitHub token:', error);
        resolve({ valid: true });
      });

      request.end();
    });
  }
}

export { ConnectionTester };
export type { ConnectionTestOptions, ConnectionTestResult };
export default ConnectionTester;
