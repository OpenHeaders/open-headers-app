/**
 * WebSocket Source Handler
 * Manages source updates, broadcasting, workspace switching, and initial data loading
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import mainLogger from '../../utils/mainLogger';
import atomicWriter from '../../utils/atomicFileWriter';
import { errorMessage } from '../../types/common';
import { isSyncableWorkspace } from '../../types/workspace';
import type { Workspace } from '../../types/workspace';
import type { Source } from '../../types/source';
import type { RulesCollection, RulesStorage } from '../../types/rules';
import type { SourceRefreshService } from '../source-refresh/SourceRefreshService';

const { createLogger } = mainLogger;
const log = createLogger('WSSourceHandler');

interface RulesUpdateMessage {
    type: 'rules-update';
    data?: RulesStorage;
}

interface SourceServiceLike {
    on?(event: string, handler: () => void): void;
    getAllSources?(): Source[];
}

interface WSServiceLike {
    rules: RulesCollection;
    sources: Source[];
    appDataPath: string | null;
    sourceService: SourceServiceLike | null;
    ruleHandler: { broadcastRules(): void };
    _broadcastToAll(message: string): number;
    sourceRefreshService: SourceRefreshService | null;
}

class WSSourceHandler {
    wsService: WSServiceLike;

    constructor(wsService: WSServiceLike) {
        this.wsService = wsService;
    }

    /**
     * Update sources and broadcast to all clients
     */
    updateSources(sources: Source[] | RulesUpdateMessage): void {
        if (!Array.isArray(sources)) {
            if (sources.data?.rules) {
                this.wsService.rules = sources.data.rules;
                this.wsService.ruleHandler.broadcastRules();
            }
            return;
        }

        const sourceArray = sources;
        log.info(`Sources updated: ${sourceArray.length} sources received`);

        const contentChanged = this._hasSourceContentChanged(sourceArray);
        this.wsService.sources = sourceArray;

        if (!contentChanged) {
            log.info('Source content unchanged, skipping broadcast');
            return;
        }

        this.broadcastSources();

        if (this.wsService.rules && Object.keys(this.wsService.rules).length > 0) {
            this.wsService.ruleHandler.broadcastRules();
        }

        // Notify SourceRefreshService of new/updated sources
        this._syncSourcesToRefreshService(sourceArray);
    }

    /**
     * Sync sources to SourceRefreshService for scheduling and eager fetching.
     *
     * The WebSocket broadcast receives CLEANED sources (stripped of refreshOptions,
     * requestOptions, etc.) which are fine for the browser extension but insufficient
     * for scheduling. So we read full source data from disk instead.
     */
    private _syncSourcesToRefreshService(broadcastedSources: Source[]): void {
        const refreshService = this.wsService.sourceRefreshService;
        if (!refreshService) return;
        if (!this.wsService.appDataPath) return;

        const currentHttpIds = new Set<string>();
        for (const source of broadcastedSources) {
            if (source.sourceType === 'http') {
                currentHttpIds.add(source.sourceId);
            }
        }

        // Read full sources from disk (includes refreshOptions, requestOptions, etc.)
        this._loadFullSourcesFromDisk().then(fullSources => {
            for (const source of fullSources) {
                if (source.sourceType === 'http') {
                    // Merge: use disk data for config, but keep broadcast content if fresher
                    const broadcasted = broadcastedSources.find(s => s.sourceId === source.sourceId);
                    if (broadcasted?.sourceContent && !source.sourceContent) {
                        source.sourceContent = broadcasted.sourceContent;
                    }
                    refreshService.updateSource(source).catch(err => {
                        log.warn(`Failed to sync source ${source.sourceId} to refresh service:`, err);
                    });
                }
            }

            refreshService.removeSourcesNotIn(currentHttpIds).catch(err => {
                log.warn('Failed to clean up removed sources from refresh service:', err);
            });
        }).catch(err => {
            log.warn('Failed to load full sources from disk for refresh service:', err);
        });
    }

    /**
     * Load full source data from disk (with refreshOptions, requestOptions, etc.)
     * Uses atomicWriter to avoid reading partially-written files.
     */
    private async _loadFullSourcesFromDisk(): Promise<Source[]> {
        const appDataPath = this.wsService.appDataPath;
        if (!appDataPath) return [];

        const workspacesPath = path.join(appDataPath, 'workspaces.json');
        let activeWorkspaceId = 'default-personal';

        try {
            const workspaces = await atomicWriter.readJson<{ activeWorkspaceId?: string }>(workspacesPath);
            if (workspaces?.activeWorkspaceId) {
                activeWorkspaceId = workspaces.activeWorkspaceId;
            }
        } catch (_e) { /* use default */ }

        const sourcesPath = path.join(appDataPath, 'workspaces', activeWorkspaceId, 'sources.json');
        try {
            return await atomicWriter.readJson<Source[]>(sourcesPath) ?? [];
        } catch (_e) {
            return [];
        }
    }

    /**
     * Send sources to a specific client
     */
    async sendSourcesToClient(ws: WebSocket): Promise<void> {
        return new Promise(async (resolve, reject) => {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket not in OPEN state'));
                return;
            }

            try {
                if (this.wsService.appDataPath) {
                    try {
                        const workspacesPath = path.join(this.wsService.appDataPath, 'workspaces.json');
                        let activeWorkspaceId = 'default-personal';

                        if (fs.existsSync(workspacesPath)) {
                            const workspacesData = await fs.promises.readFile(workspacesPath, 'utf8');
                            const workspaces = JSON.parse(workspacesData);
                            if (workspaces.activeWorkspaceId) {
                                activeWorkspaceId = workspaces.activeWorkspaceId;
                            }
                        }

                        const workspacesJson: { workspaces?: Workspace[] } = JSON.parse(await fs.promises.readFile(workspacesPath, 'utf8'));
                        const workspaceList = workspacesJson.workspaces ?? [];
                        const activeWorkspace = workspaceList.find(w => w.id === activeWorkspaceId);

                        if (activeWorkspace && isSyncableWorkspace(activeWorkspace)) {
                            const sourcesPath = path.join(this.wsService.appDataPath, 'workspaces', activeWorkspaceId, 'sources.json');
                            if (fs.existsSync(sourcesPath)) {
                                const sourcesData = await fs.promises.readFile(sourcesPath, 'utf8');
                                const freshSources: Source[] = JSON.parse(sourcesData) ?? [];
                                log.info(`Reloaded ${freshSources.length} sources from disk for git workspace ${activeWorkspaceId}`);
                                this.wsService.sources = freshSources;
                            }
                        }
                    } catch (error) {
                        log.warn('Failed to reload sources from disk:', error);
                    }
                }

                const message = JSON.stringify({
                    type: 'sourcesInitial',
                    sources: this.wsService.sources
                });

                ws.send(message, (error: Error | undefined) => {
                    if (error) {
                        log.error('Error sending sources to client:', error);
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Check whether any source's content has changed
     */
    _hasSourceContentChanged(newSources: Source[]): boolean {
        const current = this.wsService.sources;
        if (!current || current.length !== newSources.length) return true;

        const oldMap = new Map<string, string>();
        for (const s of current) {
            oldMap.set(s.sourceId, s.sourceContent || '');
        }

        for (const s of newSources) {
            const oldContent = oldMap.get(s.sourceId);
            if (oldContent === undefined || oldContent !== (s.sourceContent || '')) return true;
        }

        return false;
    }

    /**
     * Broadcast sources to all connected clients
     */
    broadcastSources(): void {
        const message = JSON.stringify({
            type: 'sourcesUpdated',
            sources: this.wsService.sources
        });
        this.wsService._broadcastToAll(message);
    }

    /**
     * Handle workspace switch - reload rules and sources from new workspace
     */
    async onWorkspaceSwitch(workspaceId: string): Promise<void> {
        try {
            log.info(`WebSocket service switching to workspace: ${workspaceId}`);
            const appDataPath = this.wsService.appDataPath!;

            const rulesPath = path.join(appDataPath, 'workspaces', workspaceId, 'rules.json');
            if (fs.existsSync(rulesPath)) {
                const rulesData = await fs.promises.readFile(rulesPath, 'utf8');
                const rulesStorage: Partial<RulesStorage> = JSON.parse(rulesData);
                this.wsService.rules = rulesStorage.rules ?? { header: [], request: [], response: [] };
                log.info(`Loaded ${Object.keys(this.wsService.rules).length} rule types from workspace ${workspaceId}`);
            } else {
                log.info(`No rules found for workspace ${workspaceId}, using empty rules`);
                this.wsService.rules = { header: [], request: [], response: [] };
            }

            const sourcesPath = path.join(appDataPath, 'workspaces', workspaceId, 'sources.json');
            if (fs.existsSync(sourcesPath)) {
                const sourcesData = await fs.promises.readFile(sourcesPath, 'utf8');
                const parsedSources: Source[] = JSON.parse(sourcesData);
                this.wsService.sources = parsedSources ?? [];
                log.info(`Loaded ${this.wsService.sources.length} sources from workspace ${workspaceId}`);
            } else {
                log.info(`No sources found for workspace ${workspaceId}, using empty sources`);
                this.wsService.sources = [];
            }

            // Proxy is already configured by workspaceHandlers.handleWorkspaceSwitched()
            // which loads env vars, sources, and rules for proxy before calling us.
            // Here we only broadcast to WebSocket clients.
            this.wsService.ruleHandler.broadcastRules();
            this.broadcastSources();

            // Re-sync sources to SourceRefreshService for the new workspace
            const refreshService = this.wsService.sourceRefreshService;
            if (refreshService) {
                await refreshService.clearAllSources();
                this._syncSourcesToRefreshService(this.wsService.sources);
            }
        } catch (error) {
            log.error(`Error loading data for workspace ${workspaceId}:`, error);
            this.wsService.rules = { header: [], request: [], response: [] };
            this.wsService.sources = [];
            this.wsService.ruleHandler.broadcastRules();
            this.broadcastSources();
        }
    }

    /**
     * Register for source service events
     */
    registerSourceEvents(): void {
        const sourceService = this.wsService.sourceService;
        if (!sourceService) return;

        try {
            if (typeof sourceService.on === 'function') {
                const handler = () => this._updateAndBroadcast();
                sourceService.on('source:updated', handler);
                sourceService.on('source:removed', handler);
                sourceService.on('sources:loaded', handler);
            }
            log.info('Registered for source service events');
        } catch (error) {
            log.error('Error registering for source service events:', error);
        }
    }

    /**
     * Update from source service and broadcast
     */
    _updateAndBroadcast(): void {
        const sourceService = this.wsService.sourceService;
        if (!sourceService) return;

        try {
            if (typeof sourceService.getAllSources === 'function') {
                this.wsService.sources = sourceService.getAllSources();
            }
            this.broadcastSources();
        } catch (error) {
            log.error('Error updating and broadcasting sources:', error);
        }
    }

    /**
     * Load initial data (rules and sources) from storage
     */
    async loadInitialData(): Promise<void> {
        try {
            const appDataPath = this.wsService.appDataPath;
            if (!appDataPath) return;

            const workspacesPath = path.join(appDataPath, 'workspaces.json');
            let activeWorkspaceId = 'default-personal';

            try {
                if (fs.existsSync(workspacesPath)) {
                    const workspacesData = await fs.promises.readFile(workspacesPath, 'utf8');
                    const workspaces = JSON.parse(workspacesData);
                    if (workspaces.activeWorkspaceId) {
                        activeWorkspaceId = workspaces.activeWorkspaceId;
                    }
                }
            } catch (error: unknown) {
                log.warn('Could not read active workspace, using default:', errorMessage(error));
            }

            const rulesPath = path.join(appDataPath, 'workspaces', activeWorkspaceId, 'rules.json');
            if (fs.existsSync(rulesPath)) {
                const rulesData = await fs.promises.readFile(rulesPath, 'utf8');
                const rulesStorage: Partial<RulesStorage> = JSON.parse(rulesData);
                this.wsService.rules = rulesStorage.rules ?? { header: [], request: [], response: [] };
                log.info(`Loaded ${Object.keys(this.wsService.rules).length} rule types from workspace`);
            } else {
                log.info(`No rules file found at ${rulesPath}, starting with empty rules`);
                this.wsService.rules = { header: [], request: [], response: [] };
            }

            const sourcesPath = path.join(appDataPath, 'workspaces', activeWorkspaceId, 'sources.json');
            if (fs.existsSync(sourcesPath)) {
                const sourcesData = await fs.promises.readFile(sourcesPath, 'utf8');
                const parsedSources: Source[] = JSON.parse(sourcesData);
                this.wsService.sources = parsedSources ?? [];
                log.info(`Loaded ${this.wsService.sources.length} sources from workspace`);
            } else {
                log.info(`No sources file found at ${sourcesPath}, starting with empty sources`);
                this.wsService.sources = [];
            }
            // Sync loaded sources to SourceRefreshService
            this._syncSourcesToRefreshService(this.wsService.sources);
        } catch (error) {
            log.error('Error loading initial data:', error);
            this.wsService.rules = { header: [], request: [], response: [] };
            this.wsService.sources = [];
        }
    }
}

export { WSSourceHandler };
export default WSSourceHandler;
