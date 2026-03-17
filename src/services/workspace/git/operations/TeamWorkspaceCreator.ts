/**
 * TeamWorkspaceCreator - Business logic for creating team workspaces
 * Handles the complete workflow of setting up a new team workspace
 */

import path from 'path';
import fs from 'fs';
import mainLogger from '../../../../utils/mainLogger.js';

const fsPromises = fs.promises;
const { createLogger } = mainLogger;

const log = createLogger('TeamWorkspaceCreator');

interface Dependencies {
  repositoryManager: any;
  branchManager: any;
  sparseCheckoutManager: any;
  commitManager: any;
  configDetector: any;
  configValidator: any;
}

interface CreateOptions {
  workspaceId: string;
  workspaceName: string;
  repositoryUrl: string;
  branch?: string;
  configDir?: string;
  authType?: string;
  authData?: Record<string, any>;
  progressCallback?: (progress: any) => void;
  tempDir: string;
}

interface InvitationOptions {
  invitationCode: string;
  repositoryUrl: string;
  branch: string;
  workspaceId: string;
  workspaceName: string;
  authType?: string;
  authData?: Record<string, any>;
  progressCallback?: (progress: any) => void;
  tempDir: string;
}

interface CreateResult {
  success: boolean;
  workspaceId: string;
  workspaceName: string;
  repositoryUrl: string;
  branch: string;
  configPaths: Record<string, string>;
  tempDir: string;
  message: string;
  fromInvite?: boolean;
}

class TeamWorkspaceCreator {
  private repositoryManager: any;
  private branchManager: any;
  private sparseCheckoutManager: any;
  private commitManager: any;
  private configDetector: any;
  private configValidator: any;

  constructor(dependencies: Dependencies) {
    this.repositoryManager = dependencies.repositoryManager;
    this.branchManager = dependencies.branchManager;
    this.sparseCheckoutManager = dependencies.sparseCheckoutManager;
    this.commitManager = dependencies.commitManager;
    this.configDetector = dependencies.configDetector;
    this.configValidator = dependencies.configValidator;
  }

  /**
   * Create a new team workspace
   */
  async createTeamWorkspace(options: CreateOptions): Promise<CreateResult> {
    const {
      workspaceId,
      workspaceName,
      repositoryUrl,
      branch = 'main',
      configDir = '.openheaders',
      authType = 'none',
      authData = {},
      progressCallback = () => {}
    } = options;

    log.info(`Creating team workspace: ${workspaceName} (${workspaceId})`);

    // Use consistent directory naming for workspace repositories
    const tempDir = path.join(options.tempDir, `workspace-${workspaceId}`);

    try {
      // Step 1: Clone repository
      progressCallback({
        phase: 'clone',
        step: 1,
        totalSteps: 6,
        message: 'Cloning repository...'
      });

      const cloneResult = await this.repositoryManager.cloneRepository({
        url: repositoryUrl,
        targetDir: tempDir,
        branch,
        authType,
        authData,
        depth: 10, // Shallow clone for initial setup
        progressCallback: (progress: any) => {
          progressCallback({
            ...progress,
            step: 1,
            totalSteps: 6
          });
        }
      });

      // Step 2: Create workspace branch
      progressCallback({
        phase: 'branch',
        step: 2,
        totalSteps: 6,
        message: 'Creating workspace branch...'
      });

      const workspaceBranch = await this.branchManager.createWorkspaceBranch(
        tempDir,
        workspaceId,
        branch
      );

      // Step 3: Setup initial configuration
      progressCallback({
        phase: 'config',
        step: 3,
        totalSteps: 6,
        message: 'Setting up configuration...'
      });

      const configSetup = await this.setupInitialConfig({
        repoDir: tempDir,
        workspaceId,
        workspaceName,
        configDir
      });

      // Step 4: Configure sparse checkout if needed
      progressCallback({
        phase: 'sparse',
        step: 4,
        totalSteps: 6,
        message: 'Configuring sparse checkout...'
      });

      if (configSetup.hasSparsePatterns) {
        await this.sparseCheckoutManager.initialize(
          tempDir,
          configSetup.sparsePatterns
        );
      }

      // Step 5: Commit initial configuration
      progressCallback({
        phase: 'commit',
        step: 5,
        totalSteps: 6,
        message: 'Committing configuration...'
      });

      const commitResult = await this.commitManager.commitConfiguration({
        repoDir: tempDir,
        workspaceId,
        workspaceName,
        configPaths: configSetup.configPaths,
        message: `Initial configuration for workspace: ${workspaceName}`
      });

      // Step 6: Push to remote
      progressCallback({
        phase: 'push',
        step: 6,
        totalSteps: 6,
        message: 'Pushing to remote repository...'
      });

      await this.repositoryManager.pushRepository({
        repoDir: tempDir,
        branch: workspaceBranch,
        authType,
        authData,
        progressCallback: (progress: any) => {
          progressCallback({
            ...progress,
            step: 6,
            totalSteps: 6
          });
        }
      });

      return {
        success: true,
        workspaceId,
        workspaceName,
        repositoryUrl,
        branch: workspaceBranch,
        configPaths: configSetup.configPaths,
        tempDir,
        message: 'Team workspace created successfully'
      };

    } catch (error) {
      log.error('Failed to create team workspace:', error);

      // Cleanup on failure
      await this.cleanup(tempDir);

      throw error;
    }
  }

  /**
   * Create workspace from invitation
   */
  async createFromInvitation(options: InvitationOptions): Promise<CreateResult> {
    const {
      invitationCode,
      repositoryUrl,
      branch,
      workspaceId,
      workspaceName,
      authType = 'none',
      authData = {},
      progressCallback = () => {}
    } = options;

    log.info(`Creating workspace from invitation: ${invitationCode}`);

    const tempDir = path.join(options.tempDir, `workspace-invite-${Date.now()}`);

    try {
      // Step 1: Clone repository with specific branch
      progressCallback({
        phase: 'clone',
        step: 1,
        totalSteps: 4,
        message: 'Cloning shared repository...'
      });

      await this.repositoryManager.cloneRepository({
        url: repositoryUrl,
        targetDir: tempDir,
        branch,
        authType,
        authData,
        depth: 10,
        progressCallback: (progress: any) => {
          progressCallback({
            ...progress,
            step: 1,
            totalSteps: 4
          });
        }
      });

      // Step 2: Verify configuration exists
      progressCallback({
        phase: 'verify',
        step: 2,
        totalSteps: 4,
        message: 'Verifying workspace configuration...'
      });

      const configResult = await this.verifyWorkspaceConfig(tempDir, workspaceId);

      if (!configResult.exists) {
        throw new Error('Workspace configuration not found in repository');
      }

      // Step 3: Setup sparse checkout for workspace files
      progressCallback({
        phase: 'sparse',
        step: 3,
        totalSteps: 4,
        message: 'Setting up workspace files...'
      });

      if (configResult.sparsePatterns.length > 0) {
        await this.sparseCheckoutManager.initialize(
          tempDir,
          configResult.sparsePatterns
        );
      }

      // Step 4: Validate configuration
      progressCallback({
        phase: 'validate',
        step: 4,
        totalSteps: 4,
        message: 'Validating configuration...'
      });

      const validation = await this.configValidator.validateAll(
        configResult.configPaths,
        tempDir
      );

      if (!validation.valid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      return {
        success: true,
        workspaceId,
        workspaceName,
        repositoryUrl,
        branch,
        configPaths: configResult.configPaths,
        tempDir,
        fromInvite: true,
        message: 'Successfully joined team workspace'
      };

    } catch (error) {
      log.error('Failed to create workspace from invitation:', error);

      // Cleanup on failure
      await this.cleanup(tempDir);

      throw error;
    }
  }

  /**
   * Setup initial configuration for new workspace
   */
  async setupInitialConfig(options: { repoDir: string; workspaceId: string; workspaceName: string; configDir: string }): Promise<any> {
    const { repoDir, workspaceId, workspaceName, configDir } = options;

    // Detect existing config files
    const detectedConfigs = await this.configDetector.detectConfigFiles(repoDir);

    // Create workspace-specific config paths
    const workspaceConfigDir = path.join(configDir, 'workspaces', workspaceId);
    const configPaths: Record<string, string> = {
      headers: path.join(workspaceConfigDir, 'headers.json'),
      environments: path.join(workspaceConfigDir, 'environments.json'),
      proxy: path.join(workspaceConfigDir, 'proxy-rules.json'),
      rules: path.join(workspaceConfigDir, 'rules.json'),
      metadata: path.join(workspaceConfigDir, 'metadata.json')
    };

    // Create metadata file
    const metadata = {
      workspaceId,
      workspaceName,
      createdAt: new Date().toISOString(),
      version: '1.0.0',
      configPaths: Object.keys(configPaths).reduce((acc: Record<string, string>, key) => {
        acc[key] = path.relative(repoDir, configPaths[key]).replace(/\\/g, '/');
        return acc;
      }, {})
    };

    // Create sparse checkout patterns
    const sparsePatterns = this.sparseCheckoutManager.createWorkspacePatterns(configPaths);

    // If there are existing config files, include them in sparse patterns
    if (detectedConfigs.length > 0) {
      for (const config of detectedConfigs) {
        const pattern = this.sparseCheckoutManager.pathToPattern(config.path);
        if (pattern && !sparsePatterns.includes(pattern)) {
          sparsePatterns.push(pattern);
        }
      }
    }

    return {
      configPaths,
      metadata,
      detectedConfigs,
      sparsePatterns,
      hasSparsePatterns: sparsePatterns.length > 1 // More than just root files
    };
  }

  /**
   * Verify workspace configuration exists
   */
  async verifyWorkspaceConfig(repoDir: string, workspaceId: string): Promise<any> {
    const possiblePaths = [
      `.openheaders/workspaces/${workspaceId}`,
      `.config/openheaders/workspaces/${workspaceId}`,
      `workspaces/${workspaceId}`
    ];

    for (const basePath of possiblePaths) {
      const metadataPath = path.join(repoDir, basePath, 'metadata.json');

      try {
        const metadata = await this.configValidator.loadJson(metadataPath);

        if (metadata && metadata.workspaceId === workspaceId) {
          // Found valid workspace config
          const configPaths: Record<string, string> = {};

          for (const [key, relativePath] of Object.entries(metadata.configPaths || {})) {
            configPaths[key] = path.join(repoDir, relativePath as string);
          }

          const sparsePatterns = this.sparseCheckoutManager.createWorkspacePatterns(configPaths);

          return {
            exists: true,
            basePath,
            configPaths,
            metadata,
            sparsePatterns
          };
        }
      } catch (error) {
        // Continue checking other paths
      }
    }

    return {
      exists: false,
      configPaths: {},
      sparsePatterns: []
    };
  }

  /**
   * Cleanup temporary directory
   */
  async cleanup(dir: string | null): Promise<void> {
    if (!dir) return;

    try {
      await fsPromises.rm(dir, { recursive: true, force: true });
    } catch (error) {
      log.error(`Failed to cleanup directory ${dir}:`, error);
    }
  }

  /**
   * Validate creation options
   */
  validateOptions(options: Record<string, any>): void {
    const required = ['workspaceId', 'workspaceName', 'repositoryUrl'];

    for (const field of required) {
      if (!options[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate workspace ID format
    if (!/^[a-zA-Z0-9-_]+$/.test(options.workspaceId)) {
      throw new Error('Invalid workspace ID format. Use only letters, numbers, hyphens, and underscores.');
    }

    // Validate repository URL
    try {
      new URL(options.repositoryUrl);
    } catch (error) {
      throw new Error('Invalid repository URL');
    }
  }
}

export { TeamWorkspaceCreator };
export type { Dependencies, CreateOptions, InvitationOptions, CreateResult };
export default TeamWorkspaceCreator;
