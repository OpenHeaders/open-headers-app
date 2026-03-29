import crypto from 'crypto';
import electron from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { DATA_FORMAT_VERSION } from '../../../../config/version';
import serviceRegistry from '../../../../services/core/ServiceRegistry';
import networkService from '../../../../services/network/NetworkService';
import proxyService from '../../../../services/proxy/ProxyService';
import webSocketService from '../../../../services/websocket/ws-service';
import type { ProgressStep } from '../../../../services/workspace/git/utils/GitConnectionProgress';
import type { IpcInvokeEvent, OperationResult } from '../../../../types/common';
import { errorMessage } from '../../../../types/common';
import type {
  EnvironmentConfigData,
  EnvironmentMap,
  EnvironmentSchema,
  EnvironmentSchemaVariable,
} from '../../../../types/environment';
import type { ServicesHealth, TeamWorkspaceInvite, Workspace, WorkspaceAuthData } from '../../../../types/workspace';
import mainLogger from '../../../../utils/mainLogger';
import appLifecycle from '../../app/lifecycle';
import settingsHandlers from './settingsHandlers';

const { app, shell, BrowserWindow } = electron;
const { createLogger } = mainLogger;
const log = createLogger('WorkspaceHandlers');

class WorkspaceHandlers {
  async handleDeleteWorkspaceFolder(_: IpcInvokeEvent, workspaceId: string): Promise<OperationResult> {
    try {
      const workspacePath = path.join(app.getPath('userData'), 'workspaces', workspaceId);

      // Check if directory exists first
      const exists = await fs.promises
        .access(workspacePath)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        log.info(`Workspace folder already deleted or doesn't exist: ${workspacePath}`);
        return { success: true };
      }

      // Windows file locks may require retry attempts
      const maxRetries = process.platform === 'win32' ? 3 : 1;
      let lastError: unknown;

      try {
        for (let i = 0; i < maxRetries; i++) {
          try {
            await fs.promises.rm(workspacePath, { recursive: true, force: true });
            log.info(`Deleted workspace folder: ${workspacePath}`);
            return { success: true };
          } catch (error) {
            lastError = error;
            if (process.platform === 'win32' && i < maxRetries - 1) {
              await new Promise((resolve) => setTimeout(resolve, 500));
              continue;
            }
            break;
          }
        }

        if (lastError) {
          log.error('Error deleting workspace folder after retries:', lastError);
          return { success: false, error: errorMessage(lastError) };
        }
        return { success: true };
      } catch (error: unknown) {
        log.error('Error deleting workspace folder:', error);
        return { success: false, error: errorMessage(error) };
      }
    } catch (error) {
      log.error('Error deleting workspace folder:', error);
      throw error;
    }
  }

  async handleWorkspaceTestConnection(
    event: IpcInvokeEvent,
    gitConfig: { url?: string; branch?: string; authType?: string; authData?: WorkspaceAuthData },
  ) {
    try {
      const gitSyncService = appLifecycle.getGitSyncService();
      if (!gitSyncService) return { success: false, error: 'Git sync service not ready' };

      const onProgress = (update: ProgressStep, summary: ProgressStep[]) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window && !window.isDestroyed()) {
          window.webContents.send('git-connection-progress', { update, summary });
        }
      };

      return await gitSyncService.testConnection({ ...gitConfig, url: gitConfig.url || '', onProgress });
    } catch (error: unknown) {
      log.error('Error testing workspace connection:', error);
      return { success: false, error: errorMessage(error) };
    }
  }

  async handleWorkspaceSync(_: IpcInvokeEvent, workspaceId: string) {
    try {
      const workspaceSyncScheduler = appLifecycle.getWorkspaceSyncScheduler();
      if (workspaceSyncScheduler) {
        return await workspaceSyncScheduler.manualSync(workspaceId);
      } else {
        return { success: false, error: 'Workspace sync scheduler not initialized' };
      }
    } catch (error: unknown) {
      log.error('Error syncing workspace:', error);
      return { success: false, error: errorMessage(error) };
    }
  }

  async handleWorkspaceSyncAll() {
    // syncAllWorkspaces not yet implemented on WorkspaceSyncScheduler
    return { success: false, error: 'Sync all workspaces not yet supported' };
  }

  async handleWorkspaceGetSyncStatus() {
    try {
      const workspaceSyncScheduler = appLifecycle.getWorkspaceSyncScheduler();
      if (workspaceSyncScheduler) {
        return workspaceSyncScheduler.getSyncStatus();
      }
      return {};
    } catch (error) {
      log.error('Error getting sync status:', error);
      return {};
    }
  }

  async handleWorkspaceAutoSyncEnabled() {
    try {
      const settings = await settingsHandlers.handleGetSettings();
      return settings.autoSyncWorkspaces !== false; // Default to true
    } catch (error) {
      log.error('Error checking auto-sync setting:', error);
      return true; // Default to enabled
    }
  }

  async handleWorkspaceOpenFolder(_: IpcInvokeEvent, workspaceId: string): Promise<OperationResult> {
    try {
      const workspacePath = path.join(app.getPath('userData'), 'workspaces', workspaceId);
      await shell.openPath(workspacePath);
      return { success: true };
    } catch (error: unknown) {
      log.error('Error opening workspace folder:', error);
      return { success: false, error: errorMessage(error) };
    }
  }

  async handleServicesHealthCheck() {
    try {
      const gitSyncService = appLifecycle.getGitSyncService();
      const workspaceSyncScheduler = appLifecycle.getWorkspaceSyncScheduler();
      const serviceRegistryMod = serviceRegistry;

      const health: ServicesHealth = {
        gitSync: false,
        workspaceSyncScheduler: false,
        networkService: false,
        proxyService: false,
        webSocketService: false,
        serviceRegistry: serviceRegistryMod.getStatus(),
      };

      // Check git sync service
      if (gitSyncService) {
        const gitStatus = await gitSyncService.getGitStatus();
        health.gitSync = gitStatus.isInstalled;
      }

      // Check workspace sync scheduler
      if (workspaceSyncScheduler) {
        health.workspaceSyncScheduler = true;
      }

      // Check network service
      if (networkService) {
        const networkState = networkService.getState();
        health.networkService = networkState !== null;
      }

      // Check proxy service
      if (proxyService) {
        const proxyStatus = proxyService.getStatus();
        health.proxyService = proxyStatus !== null;
      }

      // Check WebSocket service
      if (webSocketService) {
        const wsStatus = webSocketService.getConnectionStatus();
        health.webSocketService = wsStatus !== null;
      }

      return health;
    } catch (error: unknown) {
      log.error('Health check error:', error);
      return { error: errorMessage(error) };
    }
  }

  async handleWsGetConnectionStatus() {
    try {
      if (!webSocketService) {
        return {
          totalConnections: 0,
          browserCounts: {},
          clients: [],
          wsServerRunning: false,
          wsPort: 59210,
        };
      }
      return webSocketService.getConnectionStatus();
    } catch (error: unknown) {
      log.error('Error getting WebSocket connection status:', error);
      return {
        totalConnections: 0,
        browserCounts: {},
        clients: [],
        wsServerRunning: false,
        error: errorMessage(error),
      };
    }
  }

  async handleInitializeWorkspaceSync(_event: IpcInvokeEvent, workspaceId: string): Promise<OperationResult> {
    try {
      log.info(`Initializing workspace sync for workspace: ${workspaceId}`);

      const workspaceSyncScheduler = appLifecycle.getWorkspaceSyncScheduler();
      if (workspaceSyncScheduler) {
        await workspaceSyncScheduler.onWorkspaceSwitch(workspaceId);
      }

      return { success: true, message: 'Workspace sync initialized successfully' };
    } catch (error: unknown) {
      log.error('Error initializing workspace sync:', error);
      return { success: false, error: errorMessage(error) };
    }
  }

  async handleGenerateTeamWorkspaceInvite(_: IpcInvokeEvent, workspaceData: Workspace & { includeAuthData?: boolean }) {
    try {
      log.info('Generating team workspace invite for:', workspaceData.name);

      // Create invite data
      const inviteData: TeamWorkspaceInvite = {
        version: DATA_FORMAT_VERSION,
        workspaceName: workspaceData.name,
        description: workspaceData.description,
        repoUrl: workspaceData.gitUrl || '',
        branch: workspaceData.gitBranch || 'main',
        configPath: workspaceData.gitPath || 'config/open-headers.json',
        authType: workspaceData.authType || 'none',
        inviterName: await this.getUserName(),
        inviteId: this.generateInviteId(),
        createdAt: new Date().toISOString(),
      };

      // Include auth data if requested
      if (workspaceData.includeAuthData && workspaceData.authData) {
        inviteData.authData = workspaceData.authData;
        log.info('Including authentication data in invite');
      }

      // Create unified payload format
      const payload = {
        action: 'team-invite',
        version: DATA_FORMAT_VERSION,
        data: inviteData,
      };

      // Compress the payload for smaller URLs
      const payloadJson = JSON.stringify(payload);
      const compressed = zlib.gzipSync(payloadJson, { level: 9 });
      const payloadParam = compressed.toString('base64url');

      // Generate both app and web links using compressed format
      const appLink = `openheaders://open?payload=${payloadParam}`;
      const webLink = `https://openheaders.io/join?payload=${payloadParam}`;

      // Log compression info
      const originalSize = Buffer.from(payloadJson).toString('base64').length;
      log.info(`Compressed team invite: ${originalSize} -> ${payloadParam.length} bytes`);

      log.info('Generated invite links successfully');

      return {
        success: true,
        inviteData,
        links: {
          appLink,
          webLink,
        },
      };
    } catch (error: unknown) {
      log.error('Error generating team workspace invite:', error);
      return {
        success: false,
        error: errorMessage(error),
      };
    }
  }

  async getUserName(): Promise<string> {
    try {
      // Try to get user name from Git config first
      const gitSyncService = appLifecycle.getGitSyncService();
      if (gitSyncService) {
        const gitStatus = await gitSyncService.getGitStatus();
        if (gitStatus.isInstalled) {
          // GitStatus doesn't include user info; fall through to system user
        }
      }

      // Fallback to system user name
      return os.userInfo().username || 'Unknown User';
    } catch (error) {
      log.warn('Failed to get user name:', error);
      return 'Unknown User';
    }
  }

  generateInviteId(): string {
    // Generate a unique invite ID for tracking/analytics
    return crypto.randomBytes(8).toString('hex');
  }

  async handleGenerateEnvironmentConfigLink(
    _: IpcInvokeEvent,
    environmentData: { environments?: EnvironmentMap; environmentSchema?: EnvironmentSchema; includeValues?: boolean },
  ) {
    try {
      log.info('Generating environment config share link');

      // Create environment data object (similar to export format)
      const envConfigData: EnvironmentConfigData = {
        version: DATA_FORMAT_VERSION,
        // Removed exportedAt to save space
      };

      // Add environment schema if present
      if (environmentData.environmentSchema) {
        envConfigData.environmentSchema = environmentData.environmentSchema;
      }

      // Add environments if present (with option to exclude values)
      if (environmentData.environments) {
        if (environmentData.includeValues) {
          // Include actual values but remove updatedAt timestamps
          const envs: EnvironmentMap = {};
          Object.entries(environmentData.environments).forEach(([envName, vars]) => {
            envs[envName] = {};
            Object.entries(vars).forEach(([varName, varData]) => {
              // Copy only essential fields (value and isSecret)
              envs[envName][varName] = {
                value: varData.value,
                isSecret: varData.isSecret || false,
              };
            });
          });
          envConfigData.environments = envs;
        } else {
          // Only include structure (schema) from environments
          const schema: EnvironmentSchema = envConfigData.environmentSchema ?? { environments: {} };

          // Extract schema from environment values
          Object.entries(environmentData.environments).forEach(([envName, vars]) => {
            if (!schema.environments[envName]) {
              schema.environments[envName] = { variables: [] };
            }

            // Extract variable names and isSecret flags
            Object.entries(vars).forEach(([varName, varData]) => {
              const existingVar = schema.environments[envName].variables.find(
                (v: EnvironmentSchemaVariable) => v.name === varName,
              );

              if (!existingVar) {
                schema.environments[envName].variables.push({
                  name: varName,
                  isSecret: varData.isSecret ?? false,
                });
              }
            });
          });
          envConfigData.environmentSchema = schema;
        }
      }

      // Create unified payload format
      const payload = {
        action: 'environment-import',
        version: DATA_FORMAT_VERSION,
        data: envConfigData,
      };

      // Always compress the payload for smaller URLs
      const payloadJson = JSON.stringify(payload);

      // Compress with maximum compression level
      const compressed = zlib.gzipSync(payloadJson, { level: 9 });
      const compressedBase64 = compressed.toString('base64url'); // base64url is URL-safe

      // Always use compressed format
      const appLink = `openheaders://open?payload=${compressedBase64}`;
      const dataSize = compressedBase64.length;

      // Log compression ratio
      const originalBase64Size = Buffer.from(payloadJson).toString('base64').length;
      const compressionRatio = ((1 - dataSize / originalBase64Size) * 100).toFixed(1);
      log.info(
        `Compressed payload: ${payloadJson.length} bytes JSON -> ${dataSize} bytes compressed (${compressionRatio}% reduction)`,
      );

      // Web link mirrors the app link
      const webLink = `https://openheaders.io/open?payload=${compressedBase64}`;

      log.info(`Generated environment config links successfully (size: ${dataSize} bytes)`);

      return {
        success: true,
        envConfigData,
        links: {
          appLink,
          webLink,
          dataSize,
        },
      };
    } catch (error: unknown) {
      log.error('Error generating environment config link:', error);
      return {
        success: false,
        error: errorMessage(error),
      };
    }
  }
}

const workspaceHandlers = new WorkspaceHandlers();

export { WorkspaceHandlers };
export default workspaceHandlers;
