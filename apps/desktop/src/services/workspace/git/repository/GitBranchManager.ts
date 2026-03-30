/**
 * GitBranchManager - Handles Git branch operations
 * Manages branch creation, switching, merging, and deletion
 */

import { errorMessage } from '../../../../types/common';
import mainLogger from '../../../../utils/mainLogger';
import type { GitExecutor } from '../core/GitExecutor';

const { createLogger } = mainLogger;

const log = createLogger('GitBranchManager');

interface BranchResult {
  success: boolean;
  branch: string;
  message: string;
}

interface BranchListResult {
  current: string | null;
  local: string[];
  remote?: string[];
}

interface BranchInfo {
  name: string;
  commit: {
    hash: string;
    author: string;
    email: string;
    date: Date;
    message: string;
  };
  upstream: string | null;
  ahead: number;
  behind: number;
}

class GitBranchManager {
  private executor: GitExecutor;

  constructor(executor: GitExecutor) {
    this.executor = executor;
  }

  /**
   * Create a new branch
   */
  async createBranch(repoDir: string, branchName: string, baseBranch: string | null = null): Promise<BranchResult> {
    log.info(`Creating branch '${branchName}' in ${repoDir}`);

    try {
      if (baseBranch) {
        // Create from specific branch
        await this.executor.execute(`checkout -b ${branchName} ${baseBranch}`, { cwd: repoDir });
      } else {
        // Create from current HEAD
        await this.executor.execute(`checkout -b ${branchName}`, { cwd: repoDir });
      }

      return {
        success: true,
        branch: branchName,
        message: `Created branch '${branchName}'`,
      };
    } catch (error) {
      if (errorMessage(error).includes('already exists')) {
        throw new Error(`Branch '${branchName}' already exists`);
      }
      throw error;
    }
  }

  /**
   * Switch to a different branch
   */
  async switchBranch(repoDir: string, branchName: string): Promise<BranchResult> {
    log.info(`Switching to branch '${branchName}' in ${repoDir}`);

    try {
      await this.executor.execute(`checkout ${branchName}`, { cwd: repoDir });

      return {
        success: true,
        branch: branchName,
        message: `Switched to branch '${branchName}'`,
      };
    } catch (error) {
      if (errorMessage(error).includes('did not match any file')) {
        throw new Error(`Branch '${branchName}' does not exist`);
      }
      throw error;
    }
  }

  /**
   * List all branches
   */
  async listBranches(repoDir: string, includeRemote = false): Promise<BranchListResult> {
    try {
      const localBranches = await this.getLocalBranches(repoDir);
      const result: BranchListResult = {
        current: localBranches.current,
        local: localBranches.branches,
      };

      if (includeRemote) {
        const remoteBranches = await this.getRemoteBranches(repoDir);
        result.remote = remoteBranches;
      }

      return result;
    } catch (error) {
      log.error('Failed to list branches:', error);
      throw error;
    }
  }

  /**
   * Get local branches
   */
  async getLocalBranches(repoDir: string): Promise<{ branches: string[]; current: string | null }> {
    const { stdout } = await this.executor.execute('branch', { cwd: repoDir });

    const branches: string[] = [];
    let current: string | null = null;

    const lines = stdout.trim().split('\n');
    for (const line of lines) {
      const isCurrent = line.startsWith('*');
      const branch = line.replace(/^\*?\s+/, '').trim();

      branches.push(branch);
      if (isCurrent) {
        current = branch;
      }
    }

    return { branches, current };
  }

  /**
   * Get remote branches
   */
  async getRemoteBranches(repoDir: string): Promise<string[]> {
    const { stdout } = await this.executor.execute('branch -r', { cwd: repoDir });

    return stdout
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter((branch) => branch && !branch.includes('HEAD'));
  }

  /**
   * Delete a branch
   */
  async deleteBranch(repoDir: string, branchName: string, force = false): Promise<BranchResult> {
    log.info(`Deleting branch '${branchName}' in ${repoDir}`);

    try {
      const deleteFlag = force ? '-D' : '-d';
      await this.executor.execute(`branch ${deleteFlag} ${branchName}`, { cwd: repoDir });

      return {
        success: true,
        branch: branchName,
        message: `Deleted branch '${branchName}'`,
      };
    } catch (error) {
      if (errorMessage(error).includes('not fully merged')) {
        throw new Error(`Branch '${branchName}' has unmerged changes. Use force to delete.`);
      }
      throw error;
    }
  }

  /**
   * Check if branch exists locally
   */
  async branchExists(repoDir: string, branchName: string): Promise<boolean> {
    try {
      const { branches } = await this.getLocalBranches(repoDir);
      return branches.includes(branchName);
    } catch (_error) {
      return false;
    }
  }

  /**
   * Check if branch exists on remote
   */
  async remoteBranchExists(repoDir: string, branchName: string, remote = 'origin'): Promise<boolean> {
    try {
      const { stdout } = await this.executor.execute(`ls-remote --heads ${remote} ${branchName}`, {
        cwd: repoDir,
        timeout: 15000,
      });
      return stdout.trim().length > 0;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Create branch for workspace
   */
  async createWorkspaceBranch(repoDir: string, workspaceId: string, baseBranch: string | null = null): Promise<string> {
    const branchName = `workspace/${workspaceId}`;

    // Check if branch already exists
    if (await this.branchExists(repoDir, branchName)) {
      log.info(`Branch '${branchName}' already exists, switching to it`);
      await this.switchBranch(repoDir, branchName);
      return branchName;
    }

    // Create new branch
    await this.createBranch(repoDir, branchName, baseBranch);
    return branchName;
  }

  /**
   * Get branch info
   */
  async getBranchInfo(repoDir: string, branchName: string): Promise<BranchInfo> {
    try {
      // Get commit info for branch
      const { stdout: commitInfo } = await this.executor.execute(
        `log ${branchName} -1 --pretty=format:"%H|%an|%ae|%at|%s"`,
        { cwd: repoDir },
      );

      const [hash, author, email, timestamp, message] = commitInfo.split('|');

      // Check if branch has upstream
      let upstream: string | null = null;
      try {
        const { stdout: upstreamInfo } = await this.executor.execute(
          `rev-parse --abbrev-ref ${branchName}@{upstream}`,
          { cwd: repoDir },
        );
        upstream = upstreamInfo.trim();
      } catch (_error) {
        // No upstream configured
      }

      // Get ahead/behind counts if upstream exists
      let ahead = 0;
      let behind = 0;
      if (upstream) {
        try {
          const { stdout: counts } = await this.executor.execute(
            `rev-list --left-right --count ${branchName}...${upstream}`,
            { cwd: repoDir },
          );
          const [a, b] = counts
            .trim()
            .split('\t')
            .map((n) => parseInt(n, 10) || 0);
          ahead = a;
          behind = b;
        } catch (_error) {
          // Ignore count errors
        }
      }

      return {
        name: branchName,
        commit: {
          hash,
          author,
          email,
          date: new Date(parseInt(timestamp, 10) * 1000),
          message,
        },
        upstream,
        ahead,
        behind,
      };
    } catch (error) {
      log.error(`Failed to get info for branch '${branchName}':`, error);
      throw error;
    }
  }
}

export type { BranchInfo, BranchListResult, BranchResult };
export { GitBranchManager };
export default GitBranchManager;
