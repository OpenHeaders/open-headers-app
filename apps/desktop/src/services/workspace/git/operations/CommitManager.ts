/**
 * CommitManager - Handles Git commit operations
 * Manages committing configuration changes and maintaining commit history
 */

import fs from 'node:fs';
import path from 'node:path';
import type { GitExecutor } from '@/services/workspace/git/core/GitExecutor';
import { errorMessage } from '@/types/common';
import mainLogger from '@/utils/mainLogger';

const fsPromises = fs.promises;
const { createLogger } = mainLogger;

const log = createLogger('CommitManager');

interface CommitOptions {
  repoDir: string;
  files?: Record<string, string>;
  workspaceId?: string;
  workspaceName?: string;
  configPaths?: Record<string, string>;
  message?: string;
  author?: string | null;
  email?: string | null;
}

interface CommitResult {
  success: boolean;
  commitHash?: string;
  committed?: boolean;
  message: string;
  files?: number;
  changes?: {
    modified: number;
    added: number;
    deleted: number;
  };
}

interface RepoStatus {
  hasChanges: boolean;
  modified: string[];
  added: string[];
  deleted: string[];
  renamed: string[];
  untracked: string[];
}

interface CommitInfo {
  hash: string;
  message: string;
}

interface CommitHistoryEntry {
  hash: string;
  author: string;
  email: string;
  date: Date;
  message: string;
}

class CommitManager {
  private executor: GitExecutor;

  constructor(executor: GitExecutor) {
    this.executor = executor;
  }

  /**
   * Commit configuration changes
   */
  async commitConfiguration(options: CommitOptions): Promise<CommitResult> {
    const { repoDir, files, workspaceId, workspaceName, configPaths, message, author = null, email = null } = options;

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
      const error = new Error(
        'Invalid options: either provide files for direct commit or configPaths with workspaceId and workspaceName',
      );
      log.error('Invalid commit configuration options:', error);
      throw error;
    }

    try {
      // Ensure git user is configured
      await this.ensureGitUser(repoDir, author, email);

      // Handle direct file commit mode
      if (isDirectFileMode) {
        // Write files directly
        for (const [filename, content] of Object.entries(files!)) {
          const filePath = path.join(repoDir, filename);
          const dir = path.dirname(filePath);
          await fsPromises.mkdir(dir, { recursive: true });
          await fsPromises.writeFile(filePath, String(content), 'utf8');
          log.info(`Created file: ${filename}`);
        }

        // Stage all files
        for (const filename of Object.keys(files!)) {
          await this.stageFile(repoDir, filename);
        }

        // Create commit
        const commitMessage = message || 'Update configuration';
        const commitResult = await this.createCommit(repoDir, commitMessage);

        return {
          success: true,
          commitHash: commitResult.hash,
          message: commitMessage,
          files: Object.keys(files!).length,
        };
      }

      // Handle workspace configuration mode
      if (isWorkspaceMode) {
        // Create configuration files
        await this.createConfigurationFiles(repoDir, configPaths!, {
          workspaceId: workspaceId!,
          workspaceName: workspaceName!,
        });

        // Stage configuration files
        await this.stageFiles(repoDir, configPaths!);

        // Create commit
        const commitMessage = message || this.generateCommitMessage('create', workspaceName!);
        const commitResult = await this.createCommit(repoDir, commitMessage);

        return {
          success: true,
          commitHash: commitResult.hash,
          message: commitMessage,
          files: Object.keys(configPaths!).length,
        };
      }

      // Should never reach here due to validation above
      throw new Error('Unexpected state in commitConfiguration');
    } catch (error) {
      log.error('Failed to commit configuration:', error);
      throw error;
    }
  }

  /**
   * Auto-commit changes
   */
  async autoCommit(options: {
    repoDir: string;
    message?: string | null;
    includeUntracked?: boolean;
  }): Promise<CommitResult> {
    const { repoDir, message = null, includeUntracked = true } = options;

    log.info('Auto-committing changes');

    try {
      // Check for changes
      const status = await this.getStatus(repoDir);

      if (!status.hasChanges) {
        return {
          success: true,
          committed: false,
          message: 'No changes to commit',
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
          deleted: status.deleted.length,
        },
      };
    } catch (error) {
      log.error('Auto-commit failed:', error);
      throw error;
    }
  }

  /**
   * Create a commit
   */
  async createCommit(repoDir: string, message: string): Promise<CommitInfo> {
    try {
      // Create commit
      await this.executor.execute(`commit -m "${this.escapeMessage(message)}"`, { cwd: repoDir });

      // Get commit hash
      const { stdout: hash } = await this.executor.execute('rev-parse HEAD', { cwd: repoDir });

      return {
        hash: hash.trim(),
        message,
      };
    } catch (error) {
      if (errorMessage(error).includes('nothing to commit')) {
        throw new Error('No changes staged for commit');
      }
      throw error;
    }
  }

  /**
   * Stage files for commit
   */
  async stageFiles(repoDir: string, configPaths: Record<string, string>): Promise<void> {
    for (const [, filePath] of Object.entries(configPaths)) {
      if (filePath) {
        const relativePath = path.relative(repoDir, String(filePath));
        await this.stageFile(repoDir, String(relativePath));
      }
    }
  }

  /**
   * Stage a single file
   */
  async stageFile(repoDir: string, filePath: string): Promise<void> {
    try {
      await this.executor.execute(`add "${filePath}"`, { cwd: repoDir });
    } catch (error) {
      log.error(`Failed to stage file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Get repository status
   */
  async getStatus(repoDir: string): Promise<RepoStatus> {
    const { stdout } = await this.executor.execute('status --porcelain', { cwd: repoDir });

    const status: RepoStatus = {
      hasChanges: false,
      modified: [],
      added: [],
      deleted: [],
      renamed: [],
      untracked: [],
    };

    const lines = stdout
      .trim()
      .split('\n')
      .filter((line) => line);

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
   */
  async createConfigurationFiles(
    repoDir: string,
    configPaths: Record<string, string>,
    metadata: { workspaceId: string; workspaceName: string },
  ): Promise<void> {
    // Create directories
    const dirs = new Set<string>();
    for (const filePath of Object.values(configPaths)) {
      if (filePath) {
        dirs.add(path.dirname(String(filePath)));
      }
    }

    for (const dir of dirs) {
      await fsPromises.mkdir(dir, { recursive: true });
    }

    // Create default configuration files
    const defaults = {
      headers: {
        version: '1.0.0',
        headers: [],
      },
      environments: {
        version: '1.0.0',
        environments: [],
      },
      proxy: {
        version: '1.0.0',
        rules: [],
      },
      rules: {
        version: '1.0.0',
        rules: [],
      },
      metadata: {
        workspaceId: metadata.workspaceId,
        workspaceName: metadata.workspaceName,
        createdAt: new Date().toISOString(),
        version: '1.0.0',
        configPaths: Object.keys(configPaths).reduce((acc: Record<string, string>, key) => {
          if (key !== 'metadata') {
            acc[key] = path.relative(repoDir, String(configPaths[key])).replace(/\\/g, '/');
          }
          return acc;
        }, {}),
      },
    };

    // Write configuration files
    for (const [key, filePath] of Object.entries(configPaths)) {
      const defaultContent = defaults[key as keyof typeof defaults];
      if (filePath && defaultContent) {
        const exists = await this.fileExists(String(filePath));
        if (!exists) {
          await fsPromises.writeFile(String(filePath), JSON.stringify(defaultContent, null, 2), 'utf8');
          log.info(`Created ${key} configuration at: ${filePath}`);
        }
      }
    }
  }

  /**
   * Ensure Git user configuration
   */
  async ensureGitUser(repoDir: string, author: string | null, email: string | null): Promise<void> {
    try {
      // Check if user is already configured
      const { stdout: currentUser } = await this.executor.execute('config user.name', { cwd: repoDir });

      const { stdout: currentEmail } = await this.executor.execute('config user.email', { cwd: repoDir });

      // Set user if not configured
      if (!currentUser.trim() && author) {
        await this.executor.execute(`config user.name "${author}"`, { cwd: repoDir });
      }

      if (!currentEmail.trim() && email) {
        await this.executor.execute(`config user.email "${email}"`, { cwd: repoDir });
      }

      // Use defaults if still not set
      if (!currentUser.trim() && !author) {
        await this.executor.execute('config user.name "OpenHeaders User"', { cwd: repoDir });
      }

      if (!currentEmail.trim() && !email) {
        await this.executor.execute('config user.email "user@openheaders.io"', { cwd: repoDir });
      }
    } catch (error) {
      log.warn('Failed to configure Git user:', error);
    }
  }

  /**
   * Generate commit message
   */
  generateCommitMessage(action: string, workspaceName: string): string {
    const templates: Record<string, string> = {
      create: `feat: Create workspace configuration for ${workspaceName}`,
      update: `feat: Update workspace configuration for ${workspaceName}`,
      sync: `sync: Synchronize workspace ${workspaceName}`,
      'auto-sync': `chore: Auto-sync workspace ${workspaceName}`,
    };

    return templates[action] || `chore: Update workspace ${workspaceName}`;
  }

  /**
   * Generate auto-commit message
   */
  generateAutoCommitMessage(status: RepoStatus): string {
    const changes: string[] = [];

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
   */
  escapeMessage(message: string): string {
    return message.replace(/"/g, '\\"').replace(/\$/g, '\\$');
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fsPromises.access(String(filePath));
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Get commit history
   */
  async getHistory(repoDir: string, limit = 10): Promise<CommitHistoryEntry[]> {
    try {
      const { stdout } = await this.executor.execute(`log -${limit} --pretty=format:"%H|%an|%ae|%at|%s"`, {
        cwd: repoDir,
      });

      const commits: CommitHistoryEntry[] = [];
      const lines = stdout
        .trim()
        .split('\n')
        .filter((line) => line);

      for (const line of lines) {
        const [hash, author, email, timestamp, message] = line.split('|');
        commits.push({
          hash,
          author,
          email,
          date: new Date(parseInt(timestamp, 10) * 1000),
          message,
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
   */
  async hasUncommittedChanges(repoDir: string): Promise<boolean> {
    const status = await this.getStatus(repoDir);
    return status.hasChanges;
  }
}

export type { CommitHistoryEntry, CommitInfo, CommitOptions, CommitResult, RepoStatus };
export { CommitManager };
export default CommitManager;
