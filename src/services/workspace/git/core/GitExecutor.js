/**
 * GitExecutor - Low-level Git command execution
 * Handles running git commands with proper error handling and logging
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const { createLogger } = require('../../../../utils/mainLogger');

const execAsync = promisify(exec);
const log = createLogger('GitExecutor');

// Command timeout constants
const COMMAND_TIMEOUT = {
  SHORT: 15000,    // 15 seconds
  MEDIUM: 30000,   // 30 seconds
  LONG: 60000      // 60 seconds
};

const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB

class GitExecutor {
  constructor(gitPath = null) {
    this.gitPath = gitPath;
  }

  /**
   * Execute a git command with proper error handling
   * @param {string} command - Git command to execute
   * @param {Object} options - Execution options
   * @returns {Promise<{stdout: string, stderr: string}>}
   */
  async execute(command, options = {}) {
    const gitExecutable = this.gitPath || 'git';
    
    // Quote the git executable if it contains spaces
    const quotedGitExecutable = gitExecutable.includes(' ') ? `"${gitExecutable}"` : gitExecutable;
    
    // Disable credential helpers to prevent popups
    const gitConfigOptions = '-c credential.helper= -c core.askpass= -c credential.interactive=false';
    
    let fullCommand;
    if (command.startsWith(gitExecutable)) {
      // Insert config options after the git executable (only first occurrence)
      const gitExecRegex = new RegExp(`^${gitExecutable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
      fullCommand = command.replace(gitExecRegex, `${quotedGitExecutable} ${gitConfigOptions}`);
    } else {
      fullCommand = `${quotedGitExecutable} ${gitConfigOptions} ${command}`;
    }

    // Set environment variables to disable Git credential prompts
    // These work across Windows, Mac, and Linux
    const env = {
      ...process.env,
      ...options.env,
      GIT_TERMINAL_PROMPT: '0',  // Prevents Git from prompting in terminal
      GIT_ASKPASS: '',           // Disables GUI password prompts
      SSH_ASKPASS: '',           // Disables SSH password prompts
      // Only set SSH command options if not already provided
      ...(options.env?.GIT_SSH_COMMAND ? {} : {
        GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o StrictHostKeyChecking=no'
      })
    };

    const execOptions = {
      timeout: options.timeout || COMMAND_TIMEOUT.MEDIUM,
      maxBuffer: options.maxBuffer || MAX_BUFFER_SIZE,
      env,
      cwd: options.cwd,
      ...options
    };

    log.debug(`Executing: ${fullCommand}`, { cwd: execOptions.cwd });

    try {
      return await execAsync(fullCommand, execOptions);
    } catch (error) {
      log.error(`Command failed: ${fullCommand}`, error);
      throw this.enhanceError(error, fullCommand);
    }
  }




  /**
   * Enhance error with more context
   * @param {Error} error - Original error
   * @param {string} command - Command that failed
   * @returns {Error} - Enhanced error
   */
  enhanceError(error, command) {
    const enhancedError = new Error(error.message);
    enhancedError.command = command;
    enhancedError.code = error.code;
    enhancedError.killed = error.killed;
    enhancedError.signal = error.signal;
    enhancedError.originalError = error;
    
    // Add common git error interpretations
    if (error.message.includes('Permission denied')) {
      enhancedError.type = 'AUTH_ERROR';
      enhancedError.friendlyMessage = 'Authentication failed. Please check your credentials.';
    } else if (error.message.includes('Could not resolve host')) {
      enhancedError.type = 'NETWORK_ERROR';
      enhancedError.friendlyMessage = 'Could not connect to the Git server. Please check the URL.';
    } else if (error.message.includes('Repository not found')) {
      enhancedError.type = 'REPO_NOT_FOUND';
      enhancedError.friendlyMessage = 'Repository not found. Please check the URL and permissions.';
    } else if (error.message.includes('couldn\'t find remote ref')) {
      enhancedError.type = 'BRANCH_NOT_FOUND';
      enhancedError.friendlyMessage = 'Branch not found in the repository.';
    }

    return enhancedError;
  }

  /**
   * Set the git executable path
   * @param {string} gitPath - Path to git executable
   */
  setGitPath(gitPath) {
    this.gitPath = gitPath;
  }
}

module.exports = { GitExecutor, COMMAND_TIMEOUT };