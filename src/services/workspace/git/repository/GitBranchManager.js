/**
 * GitBranchManager - Handles Git branch operations
 * Manages branch creation, switching, merging, and deletion
 */

const { createLogger } = require('../../../../utils/mainLogger');

const log = createLogger('GitBranchManager');

class GitBranchManager {
  constructor(executor) {
    this.executor = executor;
  }

  /**
   * Create a new branch
   * @param {string} repoDir - Repository directory
   * @param {string} branchName - Name of the new branch
   * @param {string} baseBranch - Base branch to create from (optional)
   * @returns {Promise<Object>} - Creation result
   */
  async createBranch(repoDir, branchName, baseBranch = null) {
    log.info(`Creating branch '${branchName}' in ${repoDir}`);

    try {
      if (baseBranch) {
        // Create from specific branch
        await this.executor.execute(
          `checkout -b ${branchName} ${baseBranch}`,
          { cwd: repoDir }
        );
      } else {
        // Create from current HEAD
        await this.executor.execute(
          `checkout -b ${branchName}`,
          { cwd: repoDir }
        );
      }

      return {
        success: true,
        branch: branchName,
        message: `Created branch '${branchName}'`
      };
    } catch (error) {
      if (error.message.includes('already exists')) {
        throw new Error(`Branch '${branchName}' already exists`);
      }
      throw error;
    }
  }

  /**
   * Switch to a different branch
   * @param {string} repoDir - Repository directory
   * @param {string} branchName - Branch to switch to
   * @returns {Promise<Object>} - Switch result
   */
  async switchBranch(repoDir, branchName) {
    log.info(`Switching to branch '${branchName}' in ${repoDir}`);

    try {
      await this.executor.execute(
        `checkout ${branchName}`,
        { cwd: repoDir }
      );

      return {
        success: true,
        branch: branchName,
        message: `Switched to branch '${branchName}'`
      };
    } catch (error) {
      if (error.message.includes('did not match any file')) {
        throw new Error(`Branch '${branchName}' does not exist`);
      }
      throw error;
    }
  }

  /**
   * List all branches
   * @param {string} repoDir - Repository directory
   * @param {boolean} includeRemote - Include remote branches
   * @returns {Promise<Object>} - List of branches
   */
  async listBranches(repoDir, includeRemote = false) {
    try {
      const localBranches = await this.getLocalBranches(repoDir);
      const result = {
        current: localBranches.current,
        local: localBranches.branches
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
   * @param {string} repoDir - Repository directory
   * @returns {Promise<Object>} - Local branches
   */
  async getLocalBranches(repoDir) {
    const { stdout } = await this.executor.execute(
      'branch',
      { cwd: repoDir }
    );

    const branches = [];
    let current = null;

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
   * @param {string} repoDir - Repository directory
   * @returns {Promise<string[]>} - Remote branches
   */
  async getRemoteBranches(repoDir) {
    const { stdout } = await this.executor.execute(
      'branch -r',
      { cwd: repoDir }
    );

    return stdout
      .trim()
      .split('\n')
      .map(line => line.trim())
      .filter(branch => branch && !branch.includes('HEAD'));
  }

  /**
   * Delete a branch
   * @param {string} repoDir - Repository directory
   * @param {string} branchName - Branch to delete
   * @param {boolean} force - Force deletion
   * @returns {Promise<Object>} - Deletion result
   */
  async deleteBranch(repoDir, branchName, force = false) {
    log.info(`Deleting branch '${branchName}' in ${repoDir}`);

    try {
      const deleteFlag = force ? '-D' : '-d';
      await this.executor.execute(
        `branch ${deleteFlag} ${branchName}`,
        { cwd: repoDir }
      );

      return {
        success: true,
        branch: branchName,
        message: `Deleted branch '${branchName}'`
      };
    } catch (error) {
      if (error.message.includes('not fully merged')) {
        throw new Error(`Branch '${branchName}' has unmerged changes. Use force to delete.`);
      }
      throw error;
    }
  }

  /**
   * Check if branch exists locally
   * @param {string} repoDir - Repository directory
   * @param {string} branchName - Branch name
   * @returns {Promise<boolean>} - Whether branch exists
   */
  async branchExists(repoDir, branchName) {
    try {
      const { branches } = await this.getLocalBranches(repoDir);
      return branches.includes(branchName);
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if branch exists on remote
   * @param {string} repoDir - Repository directory
   * @param {string} branchName - Branch name
   * @param {string} remote - Remote name (default: origin)
   * @returns {Promise<boolean>} - Whether branch exists on remote
   */
  async remoteBranchExists(repoDir, branchName, remote = 'origin') {
    try {
      const { stdout } = await this.executor.execute(
        `ls-remote --heads ${remote} ${branchName}`,
        { cwd: repoDir, timeout: 15000 }
      );
      return stdout.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create branch for workspace
   * @param {string} repoDir - Repository directory
   * @param {string} workspaceId - Workspace ID
   * @param {string} baseBranch - Base branch (optional)
   * @returns {Promise<string>} - Created branch name
   */
  async createWorkspaceBranch(repoDir, workspaceId, baseBranch = null) {
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
   * @param {string} repoDir - Repository directory
   * @param {string} branchName - Branch name
   * @returns {Promise<Object>} - Branch information
   */
  async getBranchInfo(repoDir, branchName) {
    try {
      // Get commit info for branch
      const { stdout: commitInfo } = await this.executor.execute(
        `log ${branchName} -1 --pretty=format:"%H|%an|%ae|%at|%s"`,
        { cwd: repoDir }
      );

      const [hash, author, email, timestamp, message] = commitInfo.split('|');

      // Check if branch has upstream
      let upstream = null;
      try {
        const { stdout: upstreamInfo } = await this.executor.execute(
          `rev-parse --abbrev-ref ${branchName}@{upstream}`,
          { cwd: repoDir }
        );
        upstream = upstreamInfo.trim();
      } catch (error) {
        // No upstream configured
      }

      // Get ahead/behind counts if upstream exists
      let ahead = 0;
      let behind = 0;
      if (upstream) {
        try {
          const { stdout: counts } = await this.executor.execute(
            `rev-list --left-right --count ${branchName}...${upstream}`,
            { cwd: repoDir }
          );
          const [a, b] = counts.trim().split('\t').map(n => parseInt(n) || 0);
          ahead = a;
          behind = b;
        } catch (error) {
          // Ignore count errors
        }
      }

      return {
        name: branchName,
        commit: {
          hash,
          author,
          email,
          date: new Date(parseInt(timestamp) * 1000),
          message
        },
        upstream,
        ahead,
        behind
      };
    } catch (error) {
      log.error(`Failed to get info for branch '${branchName}':`, error);
      throw error;
    }
  }
}

module.exports = GitBranchManager;