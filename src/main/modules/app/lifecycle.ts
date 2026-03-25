import fs from 'fs';
import electron from 'electron';
import mainLogger from '../../../utils/mainLogger';
import { errorMessage } from '../../../types/common';
import { AppStateMachine } from '../../../services/core/AppStateMachine';
import serviceRegistry from '../../../services/core/ServiceRegistry';
import GitSyncService from '../../../services/workspace/git/GitSyncService';
import WorkspaceSettingsService from '../../../services/workspace/WorkspaceSettingsService';
import WorkspaceSyncScheduler from '../../../services/workspace/WorkspaceSyncScheduler';
import networkService from '../../../services/network/NetworkService';
import proxyService from '../../../services/proxy/ProxyService';
import webSocketService from '../../../services/websocket/ws-service';
import sourceRefreshService from '../../../services/source-refresh/SourceRefreshService';
import type { CliApiService } from '../../../services/cli/CliApiService';
import '../../../services/video/video-export-manager'; // Side-effect: registers IPC handlers in constructor

const { createLogger } = mainLogger;
const log = createLogger('AppLifecycle');

class AppLifecycle {
    isQuitting: boolean;
    _cleanupDone: boolean;
    fileWatchers: Map<string, fs.FSWatcher>;
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
                networkService
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
            serviceRegistry.register('workspaceSyncScheduler', workspaceSyncScheduler, ['gitSyncService', 'workspaceSettingsService', 'networkService']);
            serviceRegistry.register('webSocketService', webSocketService, []);
            serviceRegistry.register('sourceRefreshService', sourceRefreshService, []);

            await serviceRegistry.initializeAll();
            log.info('All services initialized successfully');

            // Wire SourceRefreshService dependencies (after all services are initialized)
            sourceRefreshService.configure(
                webSocketService.environmentHandler,
                networkService
            );

            /** Send an IPC message to all renderer windows */
            const sendToRenderers = (channel: string, data: unknown) => {
                try {
                    const { BrowserWindow } = electron;
                    for (const win of BrowserWindow.getAllWindows()) {
                        if (!win.isDestroyed()) {
                            win.webContents.send(channel, data);
                        }
                    }
                } catch (_e) { /* non-critical */ }
            };

            // Wire content updates: when a source is fetched, update WS service and re-broadcast
            sourceRefreshService.onContentUpdate = (sourceId, result) => {
                const sources = webSocketService.sources;
                const source = sources.find(s => s.sourceId === sourceId);
                if (source) {
                    source.sourceContent = result.content;
                    source.originalResponse = result.originalResponse;
                    source.responseHeaders = result.headers;
                    source.isFiltered = result.isFiltered;
                    source.filteredWith = result.filteredWith ?? null;
                    source.needsInitialFetch = false;

                    webSocketService.sourceHandler.broadcastSources();
                    webSocketService.ruleHandler.broadcastRules();
                }

                sendToRenderers('source-refresh:content-updated', {
                    sourceId,
                    content: result.content,
                    originalResponse: result.originalResponse,
                    headers: result.headers,
                    isFiltered: result.isFiltered,
                    filteredWith: result.filteredWith,
                    lastRefresh: Date.now()
                });
            };

            sourceRefreshService.onStatusChange = (sourceId, status) => {
                sendToRenderers('source-refresh:status-changed', { sourceId, status });
            };

            sourceRefreshService.onScheduleUpdate = (sourceId, lastRefresh, nextRefresh) => {
                sendToRenderers('source-refresh:schedule-updated', { sourceId, lastRefresh, nextRefresh });
            };

            // Store on webSocketService so WSSourceHandler can access it
            webSocketService.sourceRefreshService = sourceRefreshService;

            // Now that callbacks are wired, sync any sources that were loaded during initializeAll.
            // loadInitialData ran before configure(), so schedule events were lost — replay them now.
            for (const source of webSocketService.sources) {
                if (source.sourceType === 'http') {
                    sourceRefreshService.updateSource(source).catch(err => {
                        log.warn(`Failed to sync initial source ${source.sourceId}:`, errorMessage(err));
                    });
                }
            }

            log.info('SourceRefreshService wired into WebSocket service');

            AppStateMachine.servicesReady(serviceRegistry.getAllServices());

            const workspacesData = await workspaceSettingsService.loadWorkspacesData();
            const activeWorkspaceId = workspacesData.activeWorkspaceId || 'default-personal';

            log.info(`Initial workspace: ${activeWorkspaceId}`);

            // Initialize proxy service with current workspace
            try {
                await proxyService.switchWorkspace(activeWorkspaceId);
                log.info(`Proxy service initialized with workspace: ${activeWorkspaceId}`);
            } catch (error) {
                log.error('Failed to initialize proxy service workspace:', error);
            }

            await workspaceSyncScheduler.onWorkspaceSwitch(activeWorkspaceId);

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
            new Promise<void>(resolve => setTimeout(() => {
                log.warn('Shutdown cleanup timed out after 5s, proceeding with exit');
                resolve();
            }, 5000))
        ]);
    }

    /**
     * Perform actual cleanup of all services and resources
     * @private
     */
    async _performCleanup() {
        for (const watcher of this.fileWatchers.values()) {
            try { watcher.close(); } catch (e) { /* ignore */ }
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
