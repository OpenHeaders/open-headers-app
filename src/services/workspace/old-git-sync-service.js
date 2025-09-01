const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { app } = require('electron');
const GitAutoInstaller = require('./git-auto-installer');
const { analyzeConfigFile, readAndValidateMultiFileConfig } = require('../../utils/configValidator');
const { parseConfigPath, getSearchPatterns, getPathErrorMessage } = require('./config-path-parser');
const { detectAndValidateConfig } = require('./config-file-detector');
const GitConnectionProgress = require('./git-connection-progress');
const { createLogger } = require('../../utils/mainLogger');

const execAsync = promisify(exec);
const log = createLogger('GitSyncService');

// Constants
const COMMAND_TIMEOUT = {
  SHORT: 15000,    // 15 seconds
  MEDIUM: 30000,   // 30 seconds
  LONG: 60000      // 60 seconds
};

const CLEANUP_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB
const WINDOWS_RETRY_COUNT = 3;
const WINDOWS_RETRY_DELAY = 500; // milliseconds

// Common Git executable paths
const COMMON_GIT_PATHS = [
  '/usr/bin/git',
  '/usr/local/bin/git',
  '/opt/homebrew/bin/git', // Apple Silicon Macs
  '/opt/local/bin/git', // MacPorts
  'C:\\Program Files\\Git\\cmd\\git.exe',
  'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
];

// Utility to execute commands with proper type handling
const runCommand = (command, options = {}) => {
  // Type assertion to handle IDE false positive about execAsync signature
  const exec = /** @type {function(string, object): Promise<{stdout: string, stderr: string}>} */ (execAsync);
  return exec(command, options);
};

class GitSyncService {
  constructor() {
    this.tempDir = path.join(app.getPath('userData'), 'workspace-sync');
    this.sshDir = path.join(app.getPath('userData'), 'ssh-keys');
    this.gitPath = null;
    this.gitAutoInstaller = new GitAutoInstaller();
    this.initPromise = this.initialize();
    this.initialized = false;
    this.initializationError = null;
  }
  
  async initialize() {
    try {
      await this.ensureDirectories();
      
      // First try to find Git
      await this.findGitExecutable();
      
      // If Git not found, log it but don't auto-install (let UI handle it)
      if (!this.gitPath) {
        if (process.platform === 'win32' && app.isPackaged) {
          // In production on Windows, portable Git should be bundled
          log.error('Portable Git not found in bundled resources');
        } else {
          log.info('Git not found. Installation can be triggered from the UI when needed.');
        }
      }
      
      this.initialized = true;
    } catch (error) {
      this.initializationError = error;
      throw error;
    }
  }
  
  async ensureInitialized() {
    if (this.initialized) {
      return;
    }
    
    if (this.initializationError) {
      throw new Error(`GitSyncService initialization failed: ${this.initializationError.message}`);
    }
    
    // Wait for initialization to complete
    log.debug('Waiting for Git service initialization...');
    await this.initPromise;
    
    if (!this.initialized) {
      throw new Error('GitSyncService failed to initialize');
    }
    
    log.debug('Git service initialization completed successfully');
  }
  
  async findGitExecutable() {
    
    // Check if git is in PATH first (prefer system Git if available)
    try {
      const command = process.platform === 'win32' ? 'where git' : 'which git';
      const { stdout } = await runCommand(command, { timeout: 5000 }); // 5 second timeout
      if (stdout.trim()) {
        this.gitPath = stdout.trim().split('\n')[0]; // Take first result on Windows
        log.info('Found git in PATH:', this.gitPath);
        return;
      }
    } catch (error) {
      // Not in PATH, check common locations
    }
    
    // Check common paths
    for (const gitPath of COMMON_GIT_PATHS) {
      try {
        await fs.access(gitPath, fs.constants.X_OK);
        this.gitPath = gitPath;
        log.info('Found git at:', gitPath);
        return;
      } catch (error) {
        // Continue checking
      }
    }
    
    // Finally, check for bundled portable Git (Windows only) as fallback
    if (process.platform === 'win32') {
      try {
        // In production, look for portable Git in resources
        const portableGitPath = app.isPackaged 
          ? path.join(process.resourcesPath, 'git', 'bin', 'git.exe')
          : path.join(__dirname, '..', '..', 'build', 'portable', 'PortableGit', 'bin', 'git.exe');
        
        await fs.access(portableGitPath, fs.constants.X_OK);
        this.gitPath = portableGitPath;
        log.info('Using bundled portable Git as fallback:', this.gitPath);
        return;
      } catch (error) {
        // Portable Git not found
      }
    }
    
    log.error('Git executable not found. Git operations will fail.');
    log.error('Please install Git from https://git-scm.com/');
    log.error('Common installation paths checked:', COMMON_GIT_PATHS.join(', '));
  }

  async ensureDirectories() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      await fs.mkdir(this.sshDir, { recursive: true });
    } catch (error) {
      log.error('Failed to create directories:', error);
    }
  }

  /**
   * Test Git connection with various auth methods and verify config file
   * @param {Object} params - Test connection parameters
   * @param {string} params.url - Repository URL
   * @param {string} params.branch - Branch name
   * @param {string} params.authType - Authentication type
   * @param {Object} params.authData - Authentication data
   * @param {string} params.filePath - Configuration file path
   * @param {Function} params.onProgress - Progress callback
   * @param {boolean} params.checkWriteAccess - Whether to check write permissions
   * @returns {Promise<Object>} - Test result
   */
  async testConnection({ url, branch = 'main', authType = 'none', authData = {}, filePath = 'config/open-headers.json', onProgress, checkWriteAccess = false }) {
    const progress = new GitConnectionProgress(onProgress);
    
    // First, ensure service is initialized
    progress.report('Initializing Git service', 'running');
    try {
      // Add timeout to prevent hanging
      const initPromise = this.ensureInitialized();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Git service initialization timed out after 10 seconds')), 10000);
      });
      
      await Promise.race([initPromise, timeoutPromise]);
      progress.success('Initializing Git service', `Git path: ${this.gitPath || 'Using system Git'}`);
    } catch (error) {
      progress.error('Initializing Git service', 'Service initialization failed');
      return {
        success: false,
        error: `Git service initialization failed: ${error.message}`,
        progressSteps: progress.getSummary()
      };
    }
    
    // Check if Git is available
    if (!this.gitPath) {
      progress.error('Git check', 'Git executable not found');
      return {
        success: false,
        error: 'Git executable not found. Please install Git and ensure it is in your PATH.',
        progressSteps: progress.getSummary()
      };
    }
    
    try {
      let effectiveUrl = url;
      const env = { ...process.env };

      // Setup authentication
      progress.report('Setting up authentication', 'running', `Method: ${authType}`);
      switch (authType) {
        case 'token':
          try {
            effectiveUrl = this.getAuthUrl(url, authData.token, authData.tokenType);
            progress.success('Setting up authentication', 'Token authentication configured');
          } catch (error) {
            progress.error('Setting up authentication', 'Token authentication setup failed');
            return {
              success: false,
              error: `Token authentication setup failed: ${error.message}`,
              progressSteps: progress.getSummary()
            };
          }
          break;

        case 'ssh-key':
          try {
            env.GIT_SSH_COMMAND = await this.setupSSHCommand(authData.sshKey, authData.sshPassphrase);
            progress.success('Setting up authentication', 'SSH key authentication configured');
          } catch (error) {
            progress.error('Setting up authentication', 'SSH key setup failed');
            return {
              success: false,
              error: `SSH key setup failed: ${error.message}`,
              progressSteps: progress.getSummary()
            };
          }
          break;

        case 'basic':
          try {
            effectiveUrl = this.getBasicAuthUrl(url, authData.username, authData.password);
            progress.success('Setting up authentication', 'Basic authentication configured');
          } catch (error) {
            progress.error('Setting up authentication', 'Basic authentication setup failed');
            return {
              success: false,
              error: `Basic authentication setup failed: ${error.message}`,
              progressSteps: progress.getSummary()
            };
          }
          break;

        case 'none':
        default:
          progress.success('Setting up authentication', 'Using system Git configuration');
          break;
      }

      // Test by listing remote branches
      const gitExecutable = this.gitPath || 'git';
      const gitCommand = `${gitExecutable} ls-remote --heads "${effectiveUrl}"`;
      
      // Provide the command for manual testing (with sanitized URL)
      const safeUrl = url; // Original URL without auth
      const manualCommand = authType === 'token' 
        ? `git ls-remote --heads "${safeUrl}" (with token in Git credentials)`
        : `git ls-remote --heads "${safeUrl}"`;
      
      progress.report('Testing repository connection', 'running', `Command: ${manualCommand}`);
      
      let stdout;
      try {
        const result = await runCommand(gitCommand, {
          timeout: COMMAND_TIMEOUT.SHORT,
          env
        });
        stdout = result.stdout;
      } catch (error) {
        progress.error('Testing repository connection', 'Failed to connect to repository');
        return {
          success: false,
          error: `Failed to connect to repository: ${error.message}`,
          progressSteps: progress.getSummary()
        };
      }
      
      progress.success('Testing repository connection', 'Repository is accessible');

      // Check if branch exists
      const branches = stdout.split('\n').filter(line => line.trim());
      const branchExists = branches.some(line => line.includes(`refs/heads/${branch}`));

      if (!branchExists) {
        // For write access checks (new team workspaces), non-existent branches are OK
        // since they'll be created during commit
        if (checkWriteAccess) {
          progress.success('Branch validation', `Branch '${branch}' will be created on first commit`);
          progress.report('Write permissions', 'info', `Note: The branch '${branch}' does not exist yet and will be created when you save your configuration`);
        } else if (branch !== 'main' && branch !== 'master') {
          // For read-only access (existing workspaces), branch must exist
          // Try master if main doesn't exist
          const masterExists = branches.some(line => line.includes('refs/heads/master'));
          if (masterExists) {
            progress.error('Branch validation', `Branch '${branch}' not found, but 'master' exists`);
            return {
              success: false,
              error: `Branch '${branch}' not found in repository. The repository has a 'master' branch instead. Please update your branch setting to 'master'.`,
              progressSteps: progress.getSummary()
            };
          }
          progress.error('Branch validation', `Branch '${branch}' not found`);
          return {
            success: false,
            error: `Branch '${branch}' not found in repository`,
            progressSteps: progress.getSummary()
          };
        }
      } else {
        // Branch exists
        progress.success('Branch validation', `Branch '${branch}' found`);
      }

      // Parse the config path to handle different formats (only after repo is accessible)
      progress.report('Parsing configuration path', 'running', `Input: ${filePath}`);
      let parsedPath, searchPatterns;
      try {
        parsedPath = parseConfigPath(filePath);
        searchPatterns = getSearchPatterns(parsedPath);
        progress.success('Parsing configuration path', `Type: ${parsedPath.type}`);
      } catch (error) {
        progress.error('Parsing configuration path', 'Failed to parse configuration path');
        return {
          success: false,
          error: `Failed to parse configuration path: ${error.message}`,
          progressSteps: progress.getSummary()
        };
      }

      // For large repos, we'll use a more efficient approach
      // Note: Git archive doesn't support wildcards, so we skip it for folder/pattern-based paths
      if (parsedPath.type === 'single' || parsedPath.type === 'comma-separated') {
        try {
          // Try single file first (for single type or first file of comma-separated)
          const fileToCheck = parsedPath.type === 'comma-separated' ? parsedPath.configPath : parsedPath.primaryPath;
          const archiveCommand = `${gitExecutable} archive --remote="${effectiveUrl}" "${branch}" "${fileToCheck}" | tar -xO`;
          
          progress.report('Fetching configuration file', 'running', `File: ${fileToCheck}`);
          const { stdout: fileContent } = await runCommand(archiveCommand, { 
            env, 
            timeout: COMMAND_TIMEOUT.SHORT,
            maxBuffer: MAX_BUFFER_SIZE
          });

          // Check if we got any content
          if (!fileContent || fileContent.trim() === '') {
            progress.error('Fetching configuration file', 'File is empty or not found');
            return {
              success: false,
              error: `Configuration file '${fileToCheck}' is empty or not found in the repository`,
              progressSteps: progress.getSummary()
            };
          }

          progress.success('Fetching configuration file', `Content retrieved (${fileContent.length} bytes)`);

          // If we got content, validate it using shared logic
          const validationResult = await analyzeConfigFile(fileContent);
          
          if (validationResult.valid) {
            // Check write access if requested
            if (checkWriteAccess) {
              progress.report('Checking write permissions', 'running');
              const writeCheck = await this.checkWritePermissions({ 
                url, 
                branch, 
                authType, 
                authData 
              });
              
              if (!writeCheck.success) {
                progress.error('Checking write permissions', writeCheck.error);
                return {
                  success: false,
                  error: `Write permission check failed: ${writeCheck.error}`,
                  readAccess: true,
                  writeAccess: false,
                  configFileValid: true,
                  validationDetails: validationResult,
                  progressSteps: progress.getSummary()
                };
              }
              
              progress.success('Checking write permissions', 'Write access confirmed');
            }
            
            return { 
              success: true, 
              branches: branches.length,
              configFileValid: true,
              readAccess: true,
              writeAccess: checkWriteAccess ? true : undefined,
              message: `Connection successful! Configuration verified with ${validationResult.sourceCount || 0} sources, ${validationResult.ruleCount || 0} rules, ${validationResult.proxyRuleCount || 0} proxy rules, and ${validationResult.variableCount || 0} environment variables.`,
              validationDetails: validationResult,
              progressSteps: progress.getSummary()
            };
          } else {
            progress.error('Configuration validation', validationResult.error);
            return {
              success: false,
              error: validationResult.error,
              validationDetails: validationResult,
              progressSteps: progress.getSummary()
            };
          }
        } catch (archiveError) {
          // Git archive failed - return error immediately instead of continuing
          progress.error('Fetching configuration file', `Git archive failed: ${archiveError.message}`);
          return {
            success: false,
            error: archiveError.message,
            progressSteps: progress.getSummary()
          };
        }
      }
      
      // If we get here, either git archive isn't supported or we need pattern-based search
      // Fall back to sparse checkout
      progress.report('Setting up sparse checkout', 'running', 'Creating temporary repository');
      const testRepoId = `test-${Date.now()}`;
      const testRepoDir = path.join(this.tempDir, testRepoId);
      let fetchBranch = branch; // Initialize fetchBranch at the outer scope

      try {
          // Create test directory
          try {
            await fs.mkdir(testRepoDir, { recursive: true });
            progress.report('Setting up sparse checkout', 'running', 'Created test directory');
          } catch (error) {
            progress.error('Setting up sparse checkout', 'Failed to create test directory');
            return {
              success: false,
              error: `Failed to create test directory: ${error.message}`,
              progressSteps: progress.getSummary()
            };
          }

          // Initialize empty repo
          try {
            await runCommand(`${gitExecutable} init`, { cwd: testRepoDir, env });
            progress.report('Setting up sparse checkout', 'running', 'Initialized Git repository');
          } catch (error) {
            progress.error('Setting up sparse checkout', 'Failed to initialize Git repository');
            return {
              success: false,
              error: `Failed to initialize Git repository: ${error.message}`,
              progressSteps: progress.getSummary()
            };
          }
          
          // Configure sparse checkout to only get the config file(s)
          try {
            await runCommand(`${gitExecutable} config core.sparseCheckout true`, { cwd: testRepoDir, env });
            progress.report('Setting up sparse checkout', 'running', 'Configured sparse checkout');
          } catch (error) {
            progress.error('Setting up sparse checkout', 'Failed to configure sparse checkout');
            return {
              success: false,
              error: `Failed to configure sparse checkout: ${error.message}`,
              progressSteps: progress.getSummary()
            };
          }
          
          // Write sparse-checkout file
          const sparseCheckoutPath = path.join(testRepoDir, '.git', 'info', 'sparse-checkout');
          
          // Write sparse checkout patterns based on parsed path
          let sparsePatterns = [];
          
          try {
            await fs.mkdir(path.dirname(sparseCheckoutPath), { recursive: true });
            
            if (parsedPath.type === 'folder') {
              // Include the whole folder and ensure it's included with both patterns
              sparsePatterns.push(`${parsedPath.folderPath}/*`);
              // Also add without trailing asterisk to ensure directory itself is included
              sparsePatterns.push(parsedPath.folderPath);
            } else if (parsedPath.type === 'comma-separated') {
              // Include both specific files and their directories
              const dir1 = path.dirname(parsedPath.configPath);
              const dir2 = path.dirname(parsedPath.envPath);
              sparsePatterns.push(`${dir1}/*`);
              if (dir1 !== dir2) {
                sparsePatterns.push(`${dir2}/*`);
              }
            } else if (parsedPath.type === 'base-path') {
              // Include the directory to catch all matching files
              const dir = path.dirname(parsedPath.primaryPath);
              sparsePatterns.push(`${dir}/*`);
              sparsePatterns.push(dir);
            } else {
              // Single file - include directory for potential multi-file format
              const configDir = path.dirname(filePath);
              if (configDir && configDir !== '.') {
                sparsePatterns.push(`${configDir}/*`);
                sparsePatterns.push(configDir);
              } else {
                sparsePatterns.push(filePath);
              }
            }
            
            await fs.writeFile(sparseCheckoutPath, sparsePatterns.join('\n'));
            progress.report('Setting up sparse checkout', 'running', 'Created sparse checkout patterns');
          } catch (error) {
            progress.error('Setting up sparse checkout', 'Failed to create sparse checkout file');
            return {
              success: false,
              error: `Failed to create sparse checkout file: ${error.message}`,
              progressSteps: progress.getSummary()
            };
          }
          
          // Add remote
          try {
            await runCommand(`${gitExecutable} remote add origin "${effectiveUrl}"`, { cwd: testRepoDir, env });
            progress.report('Setting up sparse checkout', 'running', 'Added remote origin');
          } catch (error) {
            progress.error('Setting up sparse checkout', 'Failed to add remote');
            return {
              success: false,
              error: `Failed to add Git remote: ${error.message}`,
              progressSteps: progress.getSummary()
            };
          }
          
          // Fetch with depth 1 (only latest commit)
          fetchBranch = branch; // Update the outer scope variable
          let checkoutCommand = `${gitExecutable} checkout origin/${branch}`;
          
          // For non-existent branches with write access, fetch a default branch
          if (!branchExists && checkWriteAccess) {
            // Try to find a default branch to fetch from
            const defaultBranches = branches.filter(line => 
              line.includes('refs/heads/main') || 
              line.includes('refs/heads/master')
            );
            
            if (defaultBranches.length > 0) {
              fetchBranch = defaultBranches[0].includes('main') ? 'main' : 'master';
              checkoutCommand = `${gitExecutable} checkout -b temp-branch origin/${fetchBranch}`;
              progress.report('Setting up sparse checkout', 'running', `Fetching default branch '${fetchBranch}' since '${branch}' will be created later`);
            } else {
              // No default branch found, try HEAD
              fetchBranch = 'HEAD';
              checkoutCommand = `${gitExecutable} checkout FETCH_HEAD`;
              progress.report('Setting up sparse checkout', 'running', 'Fetching HEAD since no default branch found');
            }
          }
          
          try {
            await runCommand(`${gitExecutable} fetch --depth 1 origin "${fetchBranch}"`, { 
              cwd: testRepoDir, 
              env,
              timeout: COMMAND_TIMEOUT.LONG
            });
            progress.report('Setting up sparse checkout', 'running', 'Fetched branch data');
          } catch (error) {
            progress.error('Setting up sparse checkout', 'Failed to fetch branch');
            return {
              success: false,
              error: `Failed to fetch branch '${fetchBranch}': ${error.message}`,
              progressSteps: progress.getSummary()
            };
          }
          
          // Checkout the branch
          try {
            await runCommand(checkoutCommand, { cwd: testRepoDir, env });
            progress.success('Setting up sparse checkout', 'Repository checked out');
          } catch (error) {
            progress.error('Setting up sparse checkout', 'Failed to checkout branch');
            return {
              success: false,
              error: `Failed to checkout: ${error.message}`,
              progressSteps: progress.getSummary()
            };
          }

          // Debug: Check what files were actually checked out
          log.info('=== Git Sparse Checkout Debug ===');
          log.info(`Test repo directory: ${testRepoDir}`);
          
          try {
            const { stdout: lsOutput } = await runCommand(`ls -la`, { cwd: testRepoDir, env });
            log.info('Files in test repo after checkout:');
            log.info(lsOutput);
            
            // Check if config directory exists
            // Extract the directory from the parsed path
            let checkDir = 'config';
            if (parsedPath.type === 'folder') {
              checkDir = parsedPath.folderPath;
            } else if (parsedPath.basePath) {
              checkDir = parsedPath.basePath;
            } else if (parsedPath.type === 'single') {
              checkDir = path.dirname(parsedPath.primaryPath);
            }
            
            const configDirPath = path.join(testRepoDir, checkDir);
            const configExists = await fs.access(configDirPath).then(() => true).catch(() => false);
            log.info(`Config directory exists: ${configExists} (checking: ${checkDir})`);
            
            if (configExists) {
              const { stdout: configLsOutput } = await runCommand(`ls -la "${checkDir}/"`, { cwd: testRepoDir, env });
              log.info(`Files in ${checkDir} directory:`);
              log.info(configLsOutput);
              
              // For write access checks (new team workspaces), check if config files already exist
              if (checkWriteAccess) {
                try {
                  const files = await fs.readdir(configDirPath);
                  const configFiles = files.filter(f => 
                    f === 'open-headers-config.json' || 
                    f === 'open-headers-env.json' ||
                    f === 'open-headers.json' ||
                    (f.includes('open-headers') && f.endsWith('.json'))
                  );
                  
                  if (configFiles.length > 0) {
                    progress.error('Verifying checkout', `Configuration files already exist in ${checkDir}`);
                    return {
                      success: false,
                      error: `Configuration files already exist in '${checkDir}' directory: ${configFiles.join(', ')}. Please use a different directory path or branch to avoid overwriting existing team configuration.`,
                      progressSteps: progress.getSummary()
                    };
                  }
                  
                  progress.success('Verifying checkout', `${checkDir} directory found - no conflicting config files`);
                } catch (error) {
                  log.error(`Error checking existing files: ${error.message}`);
                  progress.error('Verifying checkout', 'Failed to check existing files');
                  return {
                    success: false,
                    error: `Failed to check existing files in ${checkDir}: ${error.message}`,
                    progressSteps: progress.getSummary()
                  };
                }
              } else {
                progress.success('Verifying checkout', `${checkDir} directory found`);
              }
            } else {
              // For write access checks (new team workspaces), missing directories are OK
              // since they'll be created during commit
              if (checkWriteAccess) {
                log.info(`${checkDir} directory not found, but will be created during commit`);
                progress.success('Verifying checkout', `${checkDir} directory will be created on first commit`);
                progress.report('Directory validation', 'info', `Note: The directory '${checkDir}' does not exist yet and will be created when you save your configuration`);
              } else {
                log.error(`${checkDir} directory NOT found after sparse checkout!`);
                progress.error('Verifying checkout', `${checkDir} directory not found`);
                return {
                  success: false,
                  error: `Configuration directory '${checkDir}' not found in the repository. The repository may not contain the expected configuration files.`,
                  progressSteps: progress.getSummary()
                };
              }
            }
            
            // Check sparse-checkout file content
            const { stdout: sparseContent } = await runCommand(`cat .git/info/sparse-checkout`, { cwd: testRepoDir, env });
            log.info('Sparse checkout patterns:');
            log.info(sparseContent);
            
            // Also log the exact Git commands we used
            log.info('Git commands executed:');
            log.info(`1. git init`);
            log.info(`2. git config core.sparseCheckout true`);
            log.info(`3. Sparse patterns written: ${sparsePatterns.join(', ')}`);
            log.info(`4. git remote add origin [URL]`);
            log.info(`5. git fetch --depth 1 origin ${branch}`);
            log.info(`6. git checkout origin/${branch}`);
            
          } catch (debugErr) {
            log.error('Debug check failed:', debugErr);
          }
          
          log.info('=== End Git Sparse Checkout Debug ===');

          // For write access checks, skip config file detection entirely
          // since we expect files to not exist
          let validationResult;
          
          if (checkWriteAccess) {
            // We already checked for existing config files during "Verifying checkout" step
            // No need to check again - just create the validation result
            progress.success('Searching for configuration files', 'Ready for new configuration');
            progress.success('Configuration validation', 'New workspace ready');
            
            // Create a dummy validation result for write access
            validationResult = {
              success: true,
              details: { rawData: {}, summary: { sources: 0, rules: 0, proxyRules: 0, variables: 0 } },
              message: 'New workspace - configuration will be created on first commit'
            };
          } else {
            // For read access, we need to find and validate config files
            progress.report('Searching for configuration files', 'running', `Path type: ${parsedPath.type}`);
            
            // Log what we're looking for
            const searchInfo = [];
            if (searchPatterns.configFiles && searchPatterns.configFiles.length > 0) {
              searchInfo.push(`Config files: ${searchPatterns.configFiles.join(', ')}`);
            }
            if (searchPatterns.envFiles && searchPatterns.envFiles.length > 0) {
              searchInfo.push(`Env files: ${searchPatterns.envFiles.join(', ')}`);
            }
            
            try {
              progress.report('File search patterns', 'running', searchInfo.join('; '));
              validationResult = await detectAndValidateConfig(testRepoDir, searchPatterns);
              progress.success('File search patterns', 'Config files found and validated');
              progress.success('Searching for configuration files', 'Found valid configuration');
            } catch (error) {
              progress.error('Searching for configuration files', 'Config files not found or invalid');
              
              if (error.message.includes('not found')) {
                // Try to list available files to help user
                const availableFiles = [];
                
                try {
                  // Use the branch that was actually fetched (fetchBranch) instead of the requested branch
                  // which might not exist yet for write access checks
                  const listBranch = branchExists ? branch : fetchBranch;
                  const { stdout: fileList } = await runCommand(
                    `${gitExecutable} ls-tree -r origin/${listBranch} --name-only`, 
                    { cwd: testRepoDir, env }
                  );
                  
                  const files = fileList.split('\n').filter(f => f.trim());
                  const jsonFiles = files.filter(f => f.endsWith('.json'));
                  
                  // Find files in relevant directories
                  const relevantDirs = new Set();
                  if (parsedPath.type === 'folder') {
                    relevantDirs.add(parsedPath.folderPath);
                  } else if (parsedPath.basePath) {
                    relevantDirs.add(parsedPath.basePath);
                  }
                  
                  for (const file of jsonFiles) {
                    for (const dir of relevantDirs) {
                      if (file.startsWith(dir)) {
                        availableFiles.push(file);
                      }
                    }
                  }
                } catch (e) {
                  // Ignore errors listing files
                }
                
                // Provide hint about debug documentation
                const debugHint = 'See docs/GIT-WORKSPACE-DEBUG.md for manual debugging commands';
                
                progress.error('File search patterns', `No matching files found`);
                
                return {
                  success: false,
                  error: getPathErrorMessage(parsedPath, availableFiles),
                  availableFiles: availableFiles.length > 0 ? availableFiles : undefined,
                  debugHint: debugHint,
                  progressSteps: progress.getSummary()
                };
              }
              
              // For other errors, return general error response
              progress.error('File search patterns', error.message);
              return {
                success: false,
                error: error.message,
                progressSteps: progress.getSummary()
              };
            }
          }
          
          if (validationResult && validationResult.success) {
            // Only show validation message for read access since write access already showed it
            if (!checkWriteAccess) {
              progress.success('Configuration validation', 'Valid Open Headers configuration found');
            }
            
            // Check write access if requested
            if (checkWriteAccess) {
              progress.report('Checking write permissions', 'running');
              const writeCheck = await this.checkWritePermissions({ 
                url, 
                branch, 
                authType, 
                authData 
              });
              
              if (!writeCheck.success) {
                progress.error('Checking write permissions', writeCheck.error);
                return {
                  success: false,
                  error: `Write permission check failed: ${writeCheck.error}`,
                  readAccess: true,
                  writeAccess: false,
                  configFileValid: true,
                  validationDetails: validationResult.details,
                  progressSteps: progress.getSummary()
                };
              }
              
              progress.success('Checking write permissions', 'Write access confirmed');
            }
            
            // Build success message based on what was found/will be created
            let successMessage = validationResult.message || `Connection successful! Configuration verified with ${validationResult.details?.summary?.sources || 0} sources, ${validationResult.details?.summary?.rules || 0} rules, ${validationResult.details?.summary?.proxyRules || 0} proxy rules, and ${validationResult.details?.summary?.variables || 0} environment variables.`;
            
            if (checkWriteAccess) {
              const willCreateBranch = !branchExists;
              const willCreateDir = !await fs.access(path.join(testRepoDir, parsedPath.folderPath || parsedPath.basePath || path.dirname(parsedPath.primaryPath || filePath))).then(() => true).catch(() => false);
              
              if (willCreateBranch || willCreateDir) {
                successMessage = 'Connection successful! Repository is accessible and you have write permissions. ';
                if (willCreateBranch && willCreateDir) {
                  successMessage += `Both the branch '${branch}' and configuration directory will be created when you save your workspace configuration.`;
                } else if (willCreateBranch) {
                  successMessage += `The branch '${branch}' will be created when you save your workspace configuration.`;
                } else if (willCreateDir) {
                  successMessage += `The configuration directory will be created when you save your workspace configuration.`;
                }
              }
            }
            
            return { 
              success: true, 
              branches: branches.length,
              configFileValid: true,
              readAccess: true,
              writeAccess: checkWriteAccess ? true : undefined,
              message: successMessage,
              validationDetails: validationResult.details,
              progressSteps: progress.getSummary()
            };
          } else if (validationResult) {
            progress.error('Configuration validation', validationResult.error);
            return {
              success: false,
              error: validationResult.error,
              validationDetails: validationResult.details,
              progressSteps: progress.getSummary()
            };
          }
      } catch (error) {
        // This error is already handled in the detectAndValidateConfig catch block above
        if (error instanceof SyntaxError) {
          return {
            success: false,
            error: `Configuration file contains invalid JSON`
          };
        } else if (error.message && error.message.includes('Invalid')) {
          // This catches validation errors from our validator
          return {
            success: false,
            error: error.message
          };
        }
        
        // For other errors, return general error response
        return {
          success: false,
          error: error.message
        };
      } finally {
        // Clean up test repository
        try {
          await fs.rm(testRepoDir, { recursive: true, force: true });
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    } catch (error) {
      // Parse common Git errors
      let errorMessage = error.message || 'Failed to connect to repository';
      let debugHint = '';
      
      if (errorMessage.includes('Permission denied') || errorMessage.includes('Authentication failed')) {
        errorMessage = 'Authentication failed. Please check your credentials.';
        debugHint = 'For GitHub: Ensure your token has "repo" scope. For private repos, the token needs read access.';
        progress.error('Authentication', 'Credentials were rejected');
      } else if (errorMessage.includes('Could not resolve host')) {
        errorMessage = 'Could not connect to the Git server. Please check the URL.';
        debugHint = 'Verify the repository URL is correct and you have internet connection.';
        progress.error('Connection', 'Failed to reach Git server');
      } else if (errorMessage.includes('Repository not found')) {
        errorMessage = 'Repository not found. Please check the URL and permissions.';
        debugHint = 'Ensure the repository exists and your token/credentials have access to it.';
        progress.error('Repository access', 'Repository not found or no access');
      } else {
        progress.error('Git operation', errorMessage);
      }

      return {
        success: false,
        error: errorMessage,
        debugHint,
        progressSteps: progress.getSummary()
      };
    }
  }

  /**
   * Sync workspace from Git repository
   */
  async syncWorkspace({ url, branch = 'main', path: filePath = 'config/open-headers.json', authType = 'none', authData = {} }) {
    // Ensure service is initialized
    await this.ensureInitialized();
    
    // Parse the config path to handle different formats
    const parsedPath = parseConfigPath(filePath);
    const searchPatterns = getSearchPatterns(parsedPath);
    
    // Check if Git is available
    if (!this.gitPath) {
      return {
        success: false,
        error: 'Git executable not found. Please install Git and ensure it is in your PATH.'
      };
    }
    
    const repoHash = crypto.createHash('md5').update(url).digest('hex');
    const repoDir = path.join(this.tempDir, repoHash);

    try {
      let effectiveUrl = url;
      const env = { ...process.env };
      
      // Setup authentication
      switch (authType) {
        case 'token':
          effectiveUrl = this.getAuthUrl(url, authData.token, authData.tokenType);
          break;

        case 'ssh-key':
          const sshCommand = await this.setupSSHCommand(authData.sshKey, authData.sshPassphrase);
          env.GIT_SSH_COMMAND = sshCommand;
          break;

        case 'basic':
          effectiveUrl = this.getBasicAuthUrl(url, authData.username, authData.password);
          break;
      }

      let needsClone = true;

      // Check if repo already exists
      try {
        await fs.access(path.join(repoDir, '.git'));
        needsClone = false;
      } catch {
        // Repo doesn't exist, will clone
      }

      if (needsClone) {
        // Clone repository (sparse checkout - only config directory)
        await this.cloneRepository(effectiveUrl, repoDir, branch, env, filePath);
      } else {
        // Pull latest changes (maintains sparse checkout)
        await this.pullRepository(repoDir, branch, effectiveUrl, env, filePath);
      }

      // Get current commit hash
      const gitExecutable = this.gitPath || 'git';
      const { stdout: commitHash } = await runCommand(`${gitExecutable} rev-parse HEAD`, { cwd: repoDir });

      // Get commit info
      const { stdout: commitInfo } = await runCommand(`${gitExecutable} log -1 --format="%an|%ae|%at|%s"`, { cwd: repoDir });
      const [author, email, timestamp, message] = commitInfo.trim().split('|');

      // Read configuration using the new detection logic
      let configData;
      
      const validationResult = await detectAndValidateConfig(repoDir, searchPatterns);
      
      if (!validationResult.success) {
        const error = new Error(validationResult.error);
        if (error.message.includes('not found')) {
          // Provide helpful error message
          const availableFiles = [];
          try {
            const relevantDirs = new Set();
            if (parsedPath.type === 'folder') {
              relevantDirs.add(parsedPath.folderPath);
            } else if (parsedPath.basePath) {
              relevantDirs.add(parsedPath.basePath);
            }
            
            for (const dir of relevantDirs) {
              const dirPath = path.join(repoDir, dir);
              try {
                const files = await fs.readdir(dirPath);
                files.filter(f => f.endsWith('.json')).forEach(f => {
                  availableFiles.push(path.join(dir, f));
                });
              } catch (e) {
                // Directory doesn't exist
              }
            }
          } catch (e) {
            // Ignore errors listing files
          }
          
          return {
            success: false,
            error: getPathErrorMessage(parsedPath, availableFiles)
          };
        }
        return {
          success: false,
          error: error.message
        };
      }
      
      configData = validationResult.details.rawData;

      return {
        success: true,
        data: configData,
        commitHash: commitHash.trim(),
        commitInfo: {
          author,
          email,
          timestamp: parseInt(timestamp) * 1000, // Convert to milliseconds
          message
        }
      };
    } catch (error) {
      log.error('Git sync error:', error);
      return {
        success: false,
        error: error.message || 'Failed to sync workspace'
      };
    }
  }

  /**
   * Read multi-file configuration format (separate config and env schema files)
   * This format is created when users choose "Separate files" during export
   */
  async readMultiFileConfig(repoDir) {
    const configDir = path.join(repoDir, 'config');
    
    // Helper function to read files with the current context
    const readFile = async (path, options = {}) => {
      if (options.list) {
        return await fs.readdir(path);
      }
      return await fs.readFile(path, 'utf8');
    };
    
    // Use the shared validation logic for multi-file configs
    const result = await readAndValidateMultiFileConfig(readFile, configDir);
    
    if (result.success) {
      return {
        config: result.config,
        validationDetails: result.validationResults
      };
    } else {
      log.debug('Multi-file config validation failed:', result.error);
      return null;
    }
  }

  /**
   * Clone a Git repository with sparse checkout for config directory only
   */
  async cloneRepository(url, targetDir, branch, env = {}, configPath = 'config/open-headers.json') {
    log.info(`[cloneRepository] Starting clone operation`);
    log.info(`[cloneRepository] URL: ${url}`);
    log.info(`[cloneRepository] Target Dir: ${targetDir}`);
    log.info(`[cloneRepository] Branch: ${branch}`);
    log.info(`[cloneRepository] Config Path: ${configPath}`);
    
    // Parse the config path to determine what to include
    const parsedPath = parseConfigPath(configPath);
    
    // Ensure parent directory exists
    await fs.mkdir(targetDir, { recursive: true });

    const gitExecutable = this.gitPath || 'git';
    log.info(`[cloneRepository] Using git executable: ${gitExecutable}`);
    
    try {
      // Initialize empty repository
      log.info(`[cloneRepository] Initializing empty repository`);
      try {
        await runCommand(`${gitExecutable} init`, { cwd: targetDir, env });
      } catch (initError) {
        log.error(`[cloneRepository] Failed to init repository: ${initError.message}`);
        throw new Error(`Failed to initialize Git repository: ${initError.message}`);
      }
      
      // Configure sparse checkout to only get config directory
      log.info(`[cloneRepository] Configuring sparse checkout`);
      try {
        await runCommand(`${gitExecutable} config core.sparseCheckout true`, { cwd: targetDir, env });
      } catch (configError) {
        log.error(`[cloneRepository] Failed to configure sparse checkout: ${configError.message}`);
        throw new Error(`Failed to configure sparse checkout: ${configError.message}`);
      }
      
      // Set up sparse-checkout file based on parsed path
      const sparseCheckoutPath = path.join(targetDir, '.git', 'info', 'sparse-checkout');
      await fs.mkdir(path.dirname(sparseCheckoutPath), { recursive: true });
      
      // Determine what to include in sparse checkout
      let sparsePatterns = [];
      if (parsedPath.type === 'folder') {
        sparsePatterns.push(`${parsedPath.folderPath}/*`);
        sparsePatterns.push(parsedPath.folderPath);
      } else if (parsedPath.type === 'comma-separated') {
        // Include directories of both files
        const dir1 = path.dirname(parsedPath.configPath);
        const dir2 = path.dirname(parsedPath.envPath);
        sparsePatterns.push(`${dir1}/*`);
        sparsePatterns.push(dir1);
        if (dir1 !== dir2) {
          sparsePatterns.push(`${dir2}/*`);
          sparsePatterns.push(dir2);
        }
      } else {
        // Default to config directory
        const configDir = parsedPath.basePath || 'config';
        sparsePatterns.push(`${configDir}/*`);
        sparsePatterns.push(configDir);
      }
      
      await fs.writeFile(sparseCheckoutPath, sparsePatterns.join('\n'));
      
      // Add remote
      log.info(`[cloneRepository] Adding remote origin with URL: ${url}`);
      try {
        await runCommand(`${gitExecutable} remote add origin "${url}"`, { cwd: targetDir, env });
        
        // Verify the remote was added correctly
        const { stdout: remoteUrl } = await runCommand(`${gitExecutable} remote get-url origin`, { cwd: targetDir, env });
        log.info(`[cloneRepository] Remote URL verified as: ${remoteUrl.trim()}`);
      } catch (remoteError) {
        log.error(`[cloneRepository] Failed to add remote: ${remoteError.message}`);
        throw new Error(`Failed to add Git remote: ${remoteError.message}`);
      }
      
      // Check if the branch exists
      log.info(`[cloneRepository] Checking remote branches for repository`);
      const { stdout: remoteBranches } = await runCommand(
        `${gitExecutable} ls-remote --heads origin`,
        { cwd: targetDir, env, timeout: COMMAND_TIMEOUT.SHORT }
      );
      
      const branches = remoteBranches.split('\n').filter(line => line.trim());
      log.info(`[cloneRepository] Found ${branches.length} branches in repository`);
      branches.forEach(b => log.info(`[cloneRepository] Branch: ${b}`));
      
      const branchExists = branches.some(line => line.includes(`refs/heads/${branch}`));
      log.info(`[cloneRepository] Branch '${branch}' exists: ${branchExists}`);
      
      if (branchExists) {
        // Branch exists, fetch and checkout normally
        log.info(`[cloneRepository] Fetching existing branch '${branch}'`);
        await runCommand(`${gitExecutable} fetch --depth 1 origin "${branch}"`, { 
          cwd: targetDir, 
          env,
          timeout: COMMAND_TIMEOUT.LONG
        });
        
        log.info(`[cloneRepository] Checking out branch '${branch}'`);
        await runCommand(`${gitExecutable} checkout -b "${branch}" "origin/${branch}"`, { cwd: targetDir, env });
      } else {
        // Branch doesn't exist, need to handle different scenarios
        
        // Check if repository has any branches at all
        if (branches.length === 0) {
          // Empty repository - create orphan branch
          log.info(`[cloneRepository] Repository appears to be empty. Creating orphan branch '${branch}'`);
          await runCommand(`${gitExecutable} checkout --orphan "${branch}"`, { cwd: targetDir, env });
          
          // Create an initial empty commit to establish the branch
          log.info(`[cloneRepository] Creating initial empty commit`);
          await runCommand(`${gitExecutable} commit --allow-empty -m "Initial commit"`, { cwd: targetDir, env });
        } else {
          // Repository has branches, fetch a default one and create new branch from it
          let defaultBranch = 'main';
          const hasMain = branches.some(line => line.includes('refs/heads/main'));
          const hasMaster = branches.some(line => line.includes('refs/heads/master'));
          
          log.info(`[cloneRepository] Repository has branches. Main exists: ${hasMain}, Master exists: ${hasMaster}`);
          
          if (!hasMain && hasMaster) {
            defaultBranch = 'master';
          } else if (!hasMain && !hasMaster && branches.length > 0) {
            // Use first available branch
            const match = branches[0].match(/refs\/heads\/(.+)$/);
            defaultBranch = match ? match[1] : 'HEAD';
            log.info(`[cloneRepository] Using first available branch: ${defaultBranch}`);
          }
          
          // Fetch the default branch
          log.info(`[cloneRepository] Fetching default branch '${defaultBranch}' to create new branch '${branch}'`);
          try {
            await runCommand(`${gitExecutable} fetch --depth 1 origin "${defaultBranch}"`, { 
              cwd: targetDir, 
              env,
              timeout: COMMAND_TIMEOUT.LONG
            });
          } catch (fetchError) {
            log.error(`[cloneRepository] Failed to fetch branch '${defaultBranch}': ${fetchError.message}`);
            throw new Error(`Failed to fetch branch '${defaultBranch}': ${fetchError.message}`);
          }
          
          // Create and checkout the new branch
          log.info(`[cloneRepository] Creating new branch '${branch}' from FETCH_HEAD`);
          await runCommand(`${gitExecutable} checkout -b "${branch}" FETCH_HEAD`, { cwd: targetDir, env });
          
          log.info(`[cloneRepository] Successfully created new branch '${branch}' from '${defaultBranch}'`);
        }
      }
      
      log.info(`[cloneRepository] Sparse clone completed: only ${sparsePatterns.join(', ')} from ${url}`);
    } catch (error) {
      log.error(`[cloneRepository] Clone operation failed:`, error);
      log.error(`[cloneRepository] Error stack:`, error.stack);
      
      // Provide more specific error messages
      if (error.message.includes('couldn\'t find remote ref')) {
        const branchMatch = error.message.match(/couldn't find remote ref (.+)/);
        const missingBranch = branchMatch ? branchMatch[1] : branch;
        throw new Error(`The branch '${missingBranch}' does not exist in the repository. Please check your branch name or create the branch first.`);
      } else if (error.message.includes('Repository not found') || error.message.includes('Authentication failed')) {
        throw new Error(`Cannot access repository. Please check the URL and your authentication credentials.`);
      }
      
      throw error;
    }
  }

  /**
   * Pull latest changes from repository (maintaining sparse checkout)
   */
  async pullRepository(repoDir, branch, authUrl, env = {}, configPath = 'config/open-headers.json') {
    log.info(`[pullRepository] Starting pull operation`);
    log.info(`[pullRepository] Repo Dir: ${repoDir}`);
    log.info(`[pullRepository] Branch: ${branch}`);
    log.info(`[pullRepository] Config Path: ${configPath}`);
    
    const gitExecutable = this.gitPath || 'git';
    
    try {
      // Parse the config path to determine what to include
      const parsedPath = parseConfigPath(configPath);
    
      // Ensure sparse checkout is still enabled (in case it was disabled somehow)
      await runCommand(`${gitExecutable} config core.sparseCheckout true`, { cwd: repoDir, env });
    
      // Verify sparse-checkout file still exists and contains proper patterns
      const sparseCheckoutPath = path.join(repoDir, '.git', 'info', 'sparse-checkout');
      let needsRecreation = false;
      try {
        const content = await fs.readFile(sparseCheckoutPath, 'utf8');
        // If sparse checkout file is empty or doesn't match our expectations, recreate it
        if (!content.trim()) {
          needsRecreation = true;
        }
      } catch (error) {
        // File doesn't exist or can't be read
        needsRecreation = true;
      }
      
      if (needsRecreation) {
        // Recreate sparse-checkout file if missing or empty
        await fs.mkdir(path.dirname(sparseCheckoutPath), { recursive: true });
        
        // Determine what to include in sparse checkout (same logic as cloneRepository)
        let sparsePatterns = [];
        if (parsedPath.type === 'folder') {
          sparsePatterns.push(`${parsedPath.folderPath}/*`);
        } else if (parsedPath.type === 'comma-separated') {
          // Include directories of both files
          const dir1 = path.dirname(parsedPath.configPath);
          const dir2 = path.dirname(parsedPath.envPath);
          sparsePatterns.push(`${dir1}/*`);
          if (dir1 !== dir2) {
            sparsePatterns.push(`${dir2}/*`);
          }
        } else {
          // Default to config directory
          const configDir = parsedPath.basePath || 'config';
          sparsePatterns.push(`${configDir}/*`);
        }
        
        await fs.writeFile(sparseCheckoutPath, sparsePatterns.join('\n'));
      }

      // Set remote URL (in case auth changed)
      await runCommand(`${gitExecutable} remote set-url origin "${authUrl}"`, { cwd: repoDir, env });

      // Check if the branch exists on remote
      log.info(`[pullRepository] Checking if branch '${branch}' exists on remote`);
      const { stdout: remoteBranches } = await runCommand(
        `${gitExecutable} ls-remote --heads origin`,
        { cwd: repoDir, env, timeout: COMMAND_TIMEOUT.SHORT }
      );
      
      const branches = remoteBranches.split('\n').filter(line => line.trim());
      const branchExists = branches.some(line => line.includes(`refs/heads/${branch}`));
      log.info(`[pullRepository] Branch '${branch}' exists on remote: ${branchExists}`);
      
      if (branchExists) {
        // Branch exists, fetch it normally
        log.info(`[pullRepository] Fetching branch '${branch}'`);
        await runCommand(`${gitExecutable} fetch --depth 1 origin "${branch}"`, { 
          cwd: repoDir, 
          env, 
          timeout: COMMAND_TIMEOUT.MEDIUM
        });

        // Try to checkout branch
        try {
          await runCommand(`${gitExecutable} checkout "${branch}"`, { cwd: repoDir, env });
        } catch (error) {
          // If branch doesn't exist locally, create it tracking remote
          await runCommand(`${gitExecutable} checkout -b "${branch}" "origin/${branch}"`, { cwd: repoDir, env });
        }

        // Reset to match remote (safer than pull --force with sparse checkout)
        await runCommand(`${gitExecutable} reset --hard "origin/${branch}"`, { 
          cwd: repoDir,
          env
        });

        log.info(`[pullRepository] Sparse pull completed: only configured files updated from ${branch}`);
      } else {
        // Branch doesn't exist on remote - need to create it
        log.info(`[pullRepository] Branch '${branch}' doesn't exist on remote, creating it locally`);
        
        // Check if repository has any branches at all
        if (branches.length === 0) {
          // Empty repository - just create the branch locally
          log.info(`[pullRepository] Repository appears to be empty. Creating branch '${branch}' locally`);
          try {
            const { stdout: currentBranch } = await runCommand(`${gitExecutable} rev-parse --abbrev-ref HEAD`, { cwd: repoDir, env });
            if (currentBranch.trim() !== branch) {
              await runCommand(`${gitExecutable} checkout -b "${branch}"`, { cwd: repoDir, env });
            }
          } catch (e) {
            // Might be in detached HEAD state or no commits yet
            await runCommand(`${gitExecutable} checkout -b "${branch}"`, { cwd: repoDir, env });
          }
        } else {
          // Repository has branches, fetch a default one to create new branch from
          let defaultBranch = 'main';
          const hasMain = branches.some(line => line.includes('refs/heads/main'));
          const hasMaster = branches.some(line => line.includes('refs/heads/master'));
          
          if (!hasMain && hasMaster) {
            defaultBranch = 'master';
          } else if (!hasMain && !hasMaster && branches.length > 0) {
            // Use first available branch
            const match = branches[0].match(/refs\/heads\/(.+)$/);
            defaultBranch = match ? match[1] : 'HEAD';
          }
          
          log.info(`[pullRepository] Fetching default branch '${defaultBranch}' to create new branch from`);
          await runCommand(`${gitExecutable} fetch --depth 1 origin "${defaultBranch}"`, { 
            cwd: repoDir, 
            env, 
            timeout: COMMAND_TIMEOUT.MEDIUM
          });
          
          // Create and checkout the new branch from the fetched branch
          try {
            // Check if we're already on a branch
            const { stdout: currentBranch } = await runCommand(`${gitExecutable} rev-parse --abbrev-ref HEAD`, { cwd: repoDir, env });
            if (currentBranch.trim() === branch) {
              log.info(`[pullRepository] Already on branch '${branch}'`);
            } else {
              // Try to checkout existing local branch or create new one
              try {
                await runCommand(`${gitExecutable} checkout "${branch}"`, { cwd: repoDir, env });
              } catch (e) {
                await runCommand(`${gitExecutable} checkout -b "${branch}" FETCH_HEAD`, { cwd: repoDir, env });
              }
            }
          } catch (error) {
            log.error(`[pullRepository] Error checking out branch: ${error.message}`);
            throw error;
          }
        }
        
        log.info(`[pullRepository] Created new branch '${branch}' locally`);
      }
    } catch (error) {
      log.error(`[pullRepository] Pull operation failed:`, error);
      log.error(`[pullRepository] Error stack:`, error.stack);
      
      // Provide more specific error messages
      if (error.message.includes('couldn\'t find remote ref')) {
        const branchMatch = error.message.match(/couldn't find remote ref (.+)/);
        const missingBranch = branchMatch ? branchMatch[1] : branch;
        throw new Error(`The branch '${missingBranch}' does not exist in the repository. Please check your branch name.`);
      } else if (error.message.includes('Repository not found') || error.message.includes('Authentication failed')) {
        throw new Error(`Cannot access repository. Please check the URL and your authentication credentials.`);
      }
      
      throw error;
    }
  }

  /**
   * Setup SSH command for Git operations
   */
  async setupSSHCommand(sshKeyContent, passphrase) {
    if (!sshKeyContent || sshKeyContent.trim() === '') {
      throw new Error('SSH key content is required');
    }

    try {
      // Generate unique filename for this SSH key
      const keyHash = crypto.createHash('md5').update(sshKeyContent).digest('hex');
      const keyPath = path.join(this.sshDir, `key_${keyHash}`);

      // Write SSH key to file with proper permissions
      await fs.writeFile(keyPath, sshKeyContent, { mode: 0o600 });

      // Build SSH command
      let sshCommand = `ssh -i "${keyPath}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`;

      // Add passphrase if provided
      if (passphrase) {
        // For passphrase-protected keys, we need to use ssh-agent or expect
        // This is a simplified version - in production you might want to use ssh-agent
        log.warn('SSH keys with passphrases require additional setup');
      }

      return sshCommand;
    } catch (error) {
      throw new Error(`Failed to setup SSH key: ${error.message}`);
    }
  }

  /**
   * Get authenticated URL for token-based auth
   */
  getAuthUrl(url, token, tokenType = 'auto') {
    if (!token) {
      throw new Error('Access token is required for token authentication');
    }
    if (!url) {
      throw new Error('Repository URL is required');
    }

    try {
      const urlObj = new URL(url);
      
      // Auto-detect token type based on hostname if not specified
      if (tokenType === 'auto') {
        if (urlObj.hostname === 'github.com' || urlObj.hostname.includes('github')) {
          tokenType = 'github';
        } else if (urlObj.hostname.includes('gitlab')) {
          tokenType = 'gitlab';
        } else if (urlObj.hostname.includes('bitbucket')) {
          tokenType = 'bitbucket';
        } else if (urlObj.hostname.includes('azure') || urlObj.hostname.includes('visualstudio')) {
          tokenType = 'azure';
        } else {
          tokenType = 'generic';
        }
      }

      // Handle different Git providers
      switch (tokenType) {
        case 'github':
          // GitHub: use token as username with x-oauth-basic password
          urlObj.username = token;
          urlObj.password = 'x-oauth-basic';
          break;
          
        case 'gitlab':
          // GitLab: use oauth2 as username and token as password
          urlObj.username = 'oauth2';
          urlObj.password = token;
          break;
          
        case 'bitbucket':
          // Bitbucket: use x-token-auth as username
          urlObj.username = 'x-token-auth';
          urlObj.password = token;
          break;
          
        case 'azure':
          // Azure DevOps: use token as password with any username
          urlObj.username = 'token';
          urlObj.password = token;
          break;
          
        case 'generic':
        default:
          // Generic: use token as password
          urlObj.username = 'token';
          urlObj.password = token;
          break;
      }

      return urlObj.toString();
    } catch (error) {
      throw new Error(`Failed to parse Git URL: ${error.message}`);
    }
  }

  /**
   * Get basic auth URL
   */
  getBasicAuthUrl(url, username, password) {
    if (!username || !password) {
      throw new Error('Username and password are required for basic authentication');
    }
    if (!url) {
      throw new Error('Repository URL is required');
    }

    try {
      const urlObj = new URL(url);
      urlObj.username = username;
      urlObj.password = password;
      return urlObj.toString();
    } catch (error) {
      throw new Error(`Failed to parse Git URL: ${error.message}`);
    }
  }

  /**
   * Get Git installation status
   */
  async getGitStatus() {
    await this.ensureInitialized();
    return {
      gitPath: this.gitPath,
      isInstalled: !!this.gitPath,
      platform: process.platform
    };
  }

  /**
   * Check if user has write permissions to repository
   * @param {Object} params - Parameters for checking write access
   * @param {string} params.url - Repository URL
   * @param {string} params.branch - Branch name
   * @param {string} params.authType - Authentication type
   * @param {Object} params.authData - Authentication data
   * @returns {Promise<Object>} - Result object with success status
   */
  async checkWritePermissions({ url, branch = 'main', authType = 'none', authData = {} }) {
    await this.ensureInitialized();
    
    if (!this.gitPath) {
      return {
        success: false,
        error: 'Git executable not found'
      };
    }

    const repoHash = this.getRepoHash(url);
    const repoDir = path.join(this.tempDir, `write-test-${repoHash}`);

    try {
      let effectiveUrl = url;
      const env = { ...process.env };
      
      // Setup authentication
      switch (authType) {
        case 'token':
          effectiveUrl = this.getAuthUrl(url, authData.token, authData.tokenType);
          break;
        case 'ssh-key':
          env.GIT_SSH_COMMAND = await this.setupSSHCommand(authData.sshKey, authData.sshPassphrase);
          break;
        case 'basic':
          effectiveUrl = this.getBasicAuthUrl(url, authData.username, authData.password);
          break;
      }

      // Clone repository (minimal depth)
      await fs.mkdir(repoDir, { recursive: true });
      const gitExecutable = this.gitPath || 'git';
      
      // Initialize and add remote
      await runCommand(`${gitExecutable} init`, { cwd: repoDir, env });
      await runCommand(`${gitExecutable} remote add origin "${effectiveUrl}"`, { cwd: repoDir, env });
      
      // First check what branches exist
      const { stdout: remoteBranches } = await runCommand(
        `${gitExecutable} ls-remote --heads "${effectiveUrl}"`,
        { env, timeout: COMMAND_TIMEOUT.SHORT }
      );
      
      const branches = remoteBranches.split('\n').filter(line => line.trim());
      const branchExists = branches.some(line => line.includes(`refs/heads/${branch}`));
      
      // Fetch an existing branch to set up the repository
      let fetchBranch = branch;
      if (!branchExists) {
        // Branch doesn't exist, find a default branch to fetch
        const defaultBranches = branches.filter(line => 
          line.includes('refs/heads/main') || 
          line.includes('refs/heads/master')
        );
        
        if (defaultBranches.length > 0) {
          fetchBranch = defaultBranches[0].includes('main') ? 'main' : 'master';
        } else if (branches.length > 0) {
          // Use first available branch
          const match = branches[0].match(/refs\/heads\/(.+)$/);
          fetchBranch = match ? match[1] : 'HEAD';
        } else {
          // No branches at all, use HEAD
          fetchBranch = 'HEAD';
        }
      }
      
      // Fetch the branch that exists
      await runCommand(`${gitExecutable} fetch --depth 1 origin "${fetchBranch}"`, { 
        cwd: repoDir, 
        env,
        timeout: COMMAND_TIMEOUT.MEDIUM
      });
      
      // Create a new branch for testing if needed
      if (!branchExists) {
        await runCommand(`${gitExecutable} checkout -b "${branch}" FETCH_HEAD`, { cwd: repoDir, env });
      } else {
        await runCommand(`${gitExecutable} checkout -b "${branch}" origin/${branch}`, { cwd: repoDir, env });
      }

      // Create a test file
      const testFile = path.join(repoDir, '.open-headers-write-test');
      await fs.writeFile(testFile, `Write test at ${new Date().toISOString()}`);
      
      // Try to push (dry-run)
      try {
        await runCommand(`${gitExecutable} add .`, { cwd: repoDir, env });
        await runCommand(`${gitExecutable} commit -m "Test write permissions"`, { cwd: repoDir, env });
        
        // Use --dry-run to test without actually pushing
        await runCommand(`${gitExecutable} push --dry-run origin HEAD:${branch}`, { 
          cwd: repoDir, 
          env,
          timeout: COMMAND_TIMEOUT.SHORT
        });
        
        return { success: true };
      } catch (pushError) {
        if (pushError.message.includes('dry run')) {
          // This is expected for dry-run
          return { success: true };
        }
        return {
          success: false,
          error: 'No write permissions to repository',
          details: pushError.message
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    } finally {
      // Clean up test repository
      try {
        await fs.rm(repoDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Create a new branch if it doesn't exist
   * @param {Object} params - Parameters for creating branch
   * @param {string} params.url - Repository URL
   * @param {string} params.branch - New branch name
   * @param {string} params.fromBranch - Base branch (default: main)
   * @param {string} params.authType - Authentication type
   * @param {Object} params.authData - Authentication data
   * @returns {Promise<Object>} - Result object
   */
  async createBranch({ url, branch, fromBranch = 'main', authType = 'none', authData = {} }) {
    await this.ensureInitialized();
    
    if (!this.gitPath) {
      return {
        success: false,
        error: 'Git executable not found'
      };
    }

    const repoHash = this.getRepoHash(url);
    const repoDir = path.join(this.tempDir, repoHash);

    try {
      let effectiveUrl = url;
      const env = { ...process.env };
      
      // Setup authentication
      switch (authType) {
        case 'token':
          effectiveUrl = this.getAuthUrl(url, authData.token, authData.tokenType);
          break;
        case 'ssh-key':
          env.GIT_SSH_COMMAND = await this.setupSSHCommand(authData.sshKey, authData.sshPassphrase);
          break;
        case 'basic':
          effectiveUrl = this.getBasicAuthUrl(url, authData.username, authData.password);
          break;
      }

      const gitExecutable = this.gitPath || 'git';
      
      // Check if we already have the repo cloned
      let needsClone = true;
      try {
        await fs.access(path.join(repoDir, '.git'));
        needsClone = false;
      } catch {
        // Repo doesn't exist, will clone
      }

      if (needsClone) {
        await fs.mkdir(repoDir, { recursive: true });
        await runCommand(`${gitExecutable} init`, { cwd: repoDir, env });
        await runCommand(`${gitExecutable} remote add origin "${effectiveUrl}"`, { cwd: repoDir, env });
      }

      // Fetch the base branch
      await runCommand(`${gitExecutable} fetch origin "${fromBranch}"`, { 
        cwd: repoDir, 
        env,
        timeout: COMMAND_TIMEOUT.MEDIUM
      });

      // Create and checkout new branch
      await runCommand(`${gitExecutable} checkout -b "${branch}" "origin/${fromBranch}"`, { cwd: repoDir, env });

      // Push the new branch
      await runCommand(`${gitExecutable} push -u origin "${branch}"`, { 
        cwd: repoDir, 
        env,
        timeout: COMMAND_TIMEOUT.MEDIUM
      });

      return { success: true, message: `Branch '${branch}' created successfully` };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create branch: ${error.message}`
      };
    }
  }

  /**
   * Commit configuration files to repository
   * @param {Object} params - Parameters for committing
   * @param {string} params.url - Repository URL
   * @param {string} params.branch - Branch name
   * @param {string} params.path - Configuration path
   * @param {Object} params.files - Files to commit (key: filename, value: content)
   * @param {string} params.message - Commit message
   * @param {string} params.authType - Authentication type
   * @param {Object} params.authData - Authentication data
   * @param {Function} params.onProgress - Progress callback
   * @returns {Promise<Object>} - Result object with commit info
   */
  async commitConfiguration({ url, branch = 'main', path: configPath = 'config', files, message, authType = 'none', authData = {}, onProgress }) {
    await this.ensureInitialized();
    
    if (!this.gitPath) {
      return {
        success: false,
        error: 'Git executable not found'
      };
    }

    const progress = new GitConnectionProgress(onProgress);
    progress.report('Preparing repository', 'running');

    const repoHash = this.getRepoHash(url);
    const repoDir = path.join(this.tempDir, repoHash);

    try {
      let effectiveUrl = url;
      const env = { ...process.env };
      
      // Setup authentication
      progress.report('Setting up authentication', 'running');
      switch (authType) {
        case 'token':
          effectiveUrl = this.getAuthUrl(url, authData.token, authData.tokenType);
          break;
        case 'ssh-key':
          env.GIT_SSH_COMMAND = await this.setupSSHCommand(authData.sshKey, authData.sshPassphrase);
          break;
        case 'basic':
          effectiveUrl = this.getBasicAuthUrl(url, authData.username, authData.password);
          break;
      }
      progress.success('Setting up authentication', 'Authentication configured');

      const gitExecutable = this.gitPath || 'git';
      
      // Check if we already have the repo cloned
      let needsClone = true;
      try {
        await fs.access(path.join(repoDir, '.git'));
        needsClone = false;
      } catch {
        // Repo doesn't exist, will clone
      }

      if (needsClone) {
        progress.report('Cloning repository', 'running');
        log.info(`[commitConfiguration] Starting clone - URL: ${url}, Branch: ${branch}, Path: ${configPath}`);
        try {
          await this.cloneRepository(effectiveUrl, repoDir, branch, env, configPath);
          progress.success('Cloning repository', 'Repository cloned');
        } catch (cloneError) {
          log.error(`[commitConfiguration] Clone failed:`, cloneError);
          log.error(`[commitConfiguration] Clone error details: ${cloneError.message}`);
          throw cloneError;
        }
      } else {
        progress.report('Updating repository', 'running');
        log.info(`[commitConfiguration] Updating existing repo - Branch: ${branch}`);
        try {
          await this.pullRepository(repoDir, branch, effectiveUrl, env, configPath);
          progress.success('Updating repository', 'Repository updated');
        } catch (pullError) {
          log.error(`[commitConfiguration] Pull failed:`, pullError);
          log.error(`[commitConfiguration] Pull error details: ${pullError.message}`);
          throw pullError;
        }
      }

      // Create config directory if it doesn't exist
      const fullConfigPath = path.join(repoDir, configPath);
      await fs.mkdir(fullConfigPath, { recursive: true });

      // Write all files
      progress.report('Writing configuration files', 'running');
      const writtenFiles = [];
      for (const [filename, content] of Object.entries(files)) {
        const filePath = path.join(fullConfigPath, filename);
        const jsonContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        await fs.writeFile(filePath, jsonContent, 'utf8');
        writtenFiles.push(path.join(configPath, filename));
      }
      progress.success('Writing configuration files', `Wrote ${writtenFiles.length} files`);

      // Stage files
      progress.report('Staging changes', 'running');
      await runCommand(`${gitExecutable} add "${configPath}"`, { cwd: repoDir, env });
      progress.success('Staging changes', 'Changes staged');

      // Check if there are changes to commit
      const { stdout: statusOutput } = await runCommand(`${gitExecutable} status --porcelain`, { cwd: repoDir, env });
      if (!statusOutput.trim()) {
        return {
          success: true,
          noChanges: true,
          message: 'No changes to commit - files are already up to date'
        };
      }

      // Commit changes
      progress.report('Creating commit', 'running');
      const commitMessage = message || `Update Open Headers configuration\n\nUpdated files:\n${writtenFiles.map(f => `- ${f}`).join('\n')}`;
      await runCommand(`${gitExecutable} commit -m "${commitMessage}"`, { cwd: repoDir, env });
      progress.success('Creating commit', 'Commit created');

      // Push changes (use -u flag to set upstream for new branches)
      progress.report('Pushing changes', 'running');
      await runCommand(`${gitExecutable} push -u origin "${branch}"`, { 
        cwd: repoDir, 
        env,
        timeout: COMMAND_TIMEOUT.LONG
      });
      progress.success('Pushing changes', 'Changes pushed successfully');

      // Get commit info
      const { stdout: commitHash } = await runCommand(`${gitExecutable} rev-parse HEAD`, { cwd: repoDir, env });
      const { stdout: commitInfo } = await runCommand(`${gitExecutable} log -1 --format="%an|%ae|%at|%s"`, { cwd: repoDir, env });
      const [author, email, timestamp, subject] = commitInfo.trim().split('|');

      return {
        success: true,
        commitHash: commitHash.trim(),
        commitInfo: {
          author,
          email,
          timestamp: parseInt(timestamp) * 1000,
          message: subject
        },
        files: writtenFiles,
        progressSteps: progress.getSummary()
      };
    } catch (error) {
      progress.error('Git operation failed', error.message);
      return {
        success: false,
        error: error.message,
        progressSteps: progress.getSummary()
      };
    }
  }

  /**
   * Generate a unique hash for a repository URL
   */
  getRepoHash(url) {
    return crypto.createHash('md5').update(url).digest('hex');
  }
  
  /**
   * Clean up old repositories and SSH keys
   */
  async cleanup() {
    try {
      // Clean old repos
      const repoDirs = await fs.readdir(this.tempDir);
      const now = Date.now();
      const maxAge = CLEANUP_MAX_AGE;

      for (const dir of repoDirs) {
        const dirPath = path.join(this.tempDir, dir);
        const stats = await fs.stat(dirPath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.rm(dirPath, { recursive: true, force: true });
        }
      }

      // Clean old SSH keys
      const sshKeys = await fs.readdir(this.sshDir);
      for (const key of sshKeys) {
        const keyPath = path.join(this.sshDir, key);
        const stats = await fs.stat(keyPath);
        
        if (now - stats.atime.getTime() > maxAge) {
          await fs.unlink(keyPath);
        }
      }
    } catch (error) {
      log.error('Cleanup error:', error);
    }
  }

  /**
   * Clean up a specific repository by Git URL
   */
  async cleanupRepository(gitUrl) {
    try {
      const repoHash = this.getRepoHash(gitUrl);
      const repoDir = path.join(this.tempDir, repoHash);
      
      // Helper function to remove directory with OS-specific handling
      const removeDirectory = async (dirPath, description) => {
        try {
          await fs.access(dirPath);
        } catch (error) {
          if (error.code === 'ENOENT') {
            log.debug(`${description} not found: ${dirPath}`);
            return;
          }
          throw error;
        }
        
        // On Windows, Git might leave behind read-only files in .git folder
        if (process.platform === 'win32') {
          try {
            // Try to remove read-only attributes on Windows
            await runCommand(`attrib -r "${dirPath}\\*.*" /s`).catch(() => {
              // Ignore attribute errors, just try our best
            });
          } catch (e) {
            // Ignore attribute errors
          }
        }
        
        // Try to remove with retries for locked files
        const maxRetries = process.platform === 'win32' ? WINDOWS_RETRY_COUNT : 1;
        let lastError;
        
        for (let i = 0; i < maxRetries; i++) {
          try {
            await fs.rm(dirPath, { recursive: true, force: true, maxRetries: 3 });
            log.info(`Cleaned up ${description}: ${dirPath}`);
            return;
          } catch (error) {
            lastError = error;
            if (process.platform === 'win32' && i < maxRetries - 1) {
              // Wait before retry on Windows
              await new Promise(resolve => setTimeout(resolve, WINDOWS_RETRY_DELAY));
            }
          }
        }
        
        throw lastError || new Error(`Failed to remove ${description}`);
      };
      
      // Remove main repository
      await removeDirectory(repoDir, 'repository');
      
      // Also clean up any test repositories
      try {
        const repoDirs = await fs.readdir(this.tempDir);
        
        for (const dir of repoDirs) {
          if (dir.startsWith('test-')) {
            const testRepoPath = path.join(this.tempDir, dir);
            try {
              await removeDirectory(testRepoPath, 'test repository');
            } catch (error) {
              // Log but don't fail if we can't remove a test repo
              log.error(`Failed to remove test repository ${dir}:`, error.message);
            }
          }
        }
      } catch (error) {
        // If we can't read the directory, that's okay
        log.debug('Could not read temp directory for test repositories');
      }
    } catch (error) {
      log.error('Failed to cleanup repository:', error);
      throw error;
    }
  }
}

module.exports = GitSyncService;