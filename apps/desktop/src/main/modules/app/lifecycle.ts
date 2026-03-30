import type { FSWatcher } from 'node:fs';
import { errorMessage } from '@openheaders/core';
import electron from 'electron';
import httpRequestHandlers from '@/main/modules/ipc/handlers/httpRequestHandlers';
import type { CliApiService } from '@/services/cli/CliApiService';
import { AppStateMachine } from '@/services/core/AppStateMachine';
import serviceRegistry from '@/services/core/ServiceRegistry';
import { HttpRequestService } from '@/services/http/HttpRequestService';
import totpCooldownTracker from '@/services/http/TotpCooldownTracker';
import networkService from '@/services/network/NetworkService';
import proxyService from '@/services/proxy/ProxyService';
import sourceRefreshService from '@/services/source-refresh/SourceRefreshService';
import webSocketService from '@/services/websocket/ws-service';
import GitSyncService from '@/services/workspace/git/GitSyncService';
import WorkspaceSettingsService from '@/services/workspace/WorkspaceSettingsService';
import workspaceStateService from '@/services/workspace/WorkspaceStateService';
import WorkspaceSyncScheduler from '@/services/workspace/WorkspaceSyncScheduler';
import mainLogger from '@/utils/mainLogger';
import '../../../services/video/video-export-manager'; // Side-effect: registers IPC handlers in constructor

const { createLogger } = mainLogger;
const log = createLogger('AppLifecycle');

class AppLifecycle {
  isQuitting: boolean;
  _cleanupDone: boolean;
  fileWatchers: Map<string, FSWatcher>;
  private _gitSyncService: GitSyncService | null = null;
  private _workspaceSettingsService: WorkspaceSettingsService | null = null;
  private _workspaceSyncScheduler: WorkspaceSyncScheduler | null = null;
  private _cliApiService: CliApiService | null = null;

  constructor() {
    this.isQuitting = false;
    this._cleanupDone = false;
    this.fileWatchers = new Map();
  }

  async initializeApp() {
    await AppStateMachine.initialize();

    log.info(`Process argv: ${JSON.stringify(process.argv)}`);
    log.info(`Executable path: ${process.execPath}`);

    // Settings are already loaded by SettingsCache in main.ts (Phase A).
    // First-run setup and log level are also handled there.
    AppStateMachine.settingsLoaded({});
    AppStateMachine.settingsReady();
    await this.initializeServices();
  }

  async initializeServices() {
    try {
      // Create services and store them in instance map
      const gitSyncService = new GitSyncService();
      const workspaceSettingsService = new WorkspaceSettingsService();
      // WorkspaceSyncScheduler declares its own GitSyncService interface; structurally compatible at runtime
      const workspaceSyncScheduler = new WorkspaceSyncScheduler(
        gitSyncService as ConstructorParameters<typeof WorkspaceSyncScheduler>[0],
        workspaceSettingsService as ConstructorParameters<typeof WorkspaceSyncScheduler>[1],
        networkService,
      );

      // Store services for later access
      this._gitSyncService = gitSyncService;
      this._workspaceSettingsService = workspaceSettingsService;
      this._workspaceSyncScheduler = workspaceSyncScheduler;

      // Register services with proper dependency order
      serviceRegistry.register('networkService', networkService, []);
      serviceRegistry.register('proxyService', proxyService, []);
      serviceRegistry.register('gitSyncService', gitSyncService, []);
      serviceRegistry.register('workspaceSettingsService', workspaceSettingsService, []);
      serviceRegistry.register('workspaceSyncScheduler', workspaceSyncScheduler, [
        'gitSyncService',
        'workspaceSettingsService',
        'networkService',
      ]);
      serviceRegistry.register('webSocketService', webSocketService, []);
      serviceRegistry.register('sourceRefreshService', sourceRefreshService, []);

      await serviceRegistry.initializeAll();
      log.info('All services initialized successfully');

      // Create the single HttpRequestService instance — shared by both
      // SourceRefreshService (scheduled refreshes) and HttpRequestHandlers (IPC test/initial requests)
      const httpRequestService = new HttpRequestService(webSocketService.environmentHandler, totpCooldownTracker);

      // Wire SourceRefreshService dependencies (after all services are initialized)
      sourceRefreshService.configure(networkService, httpRequestService);

      // Wire HttpRequestHandlers with same shared instance
      httpRequestHandlers.configure(httpRequestService, totpCooldownTracker);

      /** Send an IPC message to all renderer windows */
      const sendToRenderers = (channel: string, data: unknown) => {
        try {
          const { BrowserWindow } = electron;
          for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
              win.webContents.send(channel, data);
            }
          }
        } catch (_e) {
          /* non-critical */
        }
      };

      // Wire content updates: when a source is fetched, update WorkspaceStateService
      // (which owns state and broadcasts to WS/proxy/renderer via workspace:state-patch).
      // No separate renderer notification needed — the state patch carries all updated fields.
      sourceRefreshService.onContentUpdate = (sourceId, result) => {
        workspaceStateService
          .updateSourceFetchResult(sourceId, result)
          .catch((e) => log.warn(`Failed to update source fetch result for ${sourceId}:`, errorMessage(e)));
      };

      sourceRefreshService.onStatusChange = (sourceId, status) => {
        sendToRenderers('source-refresh:status-changed', { sourceId, status });
      };

      sourceRefreshService.onScheduleUpdate = (sourceId, lastRefresh, nextRefresh) => {
        sendToRenderers('source-refresh:schedule-updated', { sourceId, lastRefresh, nextRefresh });
      };

      log.info('SourceRefreshService configured');

      // Configure and initialize WorkspaceStateService — the single owner of workspace state.
      // This must happen after all services are initialized so it can broadcast to them.
      workspaceStateService.configure({
        webSocketService,
        proxyService,
        sourceRefreshService,
        syncScheduler: workspaceSyncScheduler as Parameters<typeof workspaceStateService.configure>[0]['syncScheduler'],
      });

      serviceRegistry.registerInitialized('workspaceStateService', workspaceStateService);

      // Wire rule toggle: extensions send toggleRule via WS → delegate to
      // WorkspaceStateService (single state owner) for persistence + broadcast.
      webSocketService.ruleHandler.onRuleToggle = (ruleId, updates) =>
        workspaceStateService.updateHeaderRule(ruleId, updates);
      webSocketService.ruleHandler.onRuleToggleBatch = (updates) =>
        workspaceStateService.updateHeaderRulesBatch(updates);
      webSocketService.ruleHandler.onRuleDelete = (ruleId) => workspaceStateService.removeHeaderRule(ruleId);

      // Initialize: loads workspaces + active workspace data, starts auto-save,
      // broadcasts to WS/proxy. App is operational even without a renderer window.
      await workspaceStateService.initialize();
      webSocketService.markStateReady();
      log.info('WorkspaceStateService initialized — app is operational');

      // Wire sync scheduler → WorkspaceStateService:
      // 1. Sync status: scheduler pushes status to WorkspaceStateService (single owner
      //    of workspaces.json). This ensures the renderer sees sync status updates.
      // 2. Data changes: merge synced data directly into in-memory state (not disk
      //    reload) so concurrent CRUD changes are preserved.
      workspaceSyncScheduler.setSyncStatusOwner(workspaceStateService);
      workspaceSyncScheduler.onSyncDataChanged = (workspaceId, data) =>
        workspaceStateService.onSyncDataChanged(workspaceId, data);

      AppStateMachine.servicesReady(serviceRegistry.getAllServices());

      // Start CLI API server (non-blocking — app works without it)
      // Lazy import to avoid circular dependency (CliSetupHandler requires lifecycle)
      try {
        const { CliApiService } = await import('../../../services/cli/CliApiService');
        const { CliSetupHandler } = await import('../../../services/cli/CliSetupHandler');
        const cliApiService = new CliApiService();
        const cliSetupHandler = new CliSetupHandler();
        cliApiService.setSetupHandler(cliSetupHandler);
        this._cliApiService = cliApiService;
        await cliApiService.start();

        // Register late so shutdownAll() calls stop() automatically
        serviceRegistry.registerInitialized('cliApiService', cliApiService);
      } catch (error: unknown) {
        log.warn('CLI API server failed to start (non-critical):', errorMessage(error));
      }
    } catch (error) {
      log.error('Failed to initialize services:', error);
      throw error; // Re-throw to indicate critical failure
    }
  }

  async beforeQuit() {
    if (this._cleanupDone) return; // Prevent double cleanup (installUpdate + before-quit event)
    this._cleanupDone = true;
    this.isQuitting = true;
    AppStateMachine.shutdown();

    // Wrap cleanup in a timeout to prevent hanging on exit
    // (e.g., a service.stop() waiting for connections that never drain)
    await Promise.race([
      this._performCleanup(),
      new Promise<void>((resolve) =>
        setTimeout(() => {
          log.warn('Shutdown cleanup timed out after 5s, proceeding with exit');
          resolve();
        }, 5000),
      ),
    ]);
  }

  /**
   * Perform actual cleanup of all services and resources
   * @private
   */
  async _performCleanup() {
    for (const watcher of this.fileWatchers.values()) {
      try {
        watcher.close();
      } catch (_e) {
        /* ignore */
      }
    }

    try {
      await serviceRegistry.shutdownAll();
      log.info('All services shut down successfully');
      AppStateMachine.terminate();
    } catch (error) {
      log.error('Error shutting down services:', error);
      AppStateMachine.error(error);
    }
  }

  getGitSyncService(): GitSyncService | null {
    return this._gitSyncService;
  }

  getWorkspaceSettingsService(): WorkspaceSettingsService | null {
    return this._workspaceSettingsService;
  }

  getWorkspaceSyncScheduler(): WorkspaceSyncScheduler | null {
    return this._workspaceSyncScheduler;
  }

  getCliApiService(): CliApiService | null {
    return this._cliApiService;
  }

  isCleanupDone() {
    return this._cleanupDone;
  }

  isQuittingApp() {
    return this.isQuitting;
  }

  setQuitting(value: boolean) {
    this.isQuitting = value;
  }

  getFileWatchers() {
    return this.fileWatchers;
  }

  // Dock visibility is now handled in main.ts Phase A using SettingsCache
}

const appLifecycle = new AppLifecycle();

export { AppLifecycle };
export default appLifecycle;
