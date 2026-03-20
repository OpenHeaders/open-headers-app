/**
 * WebSocket Source Handler
 * Manages source updates, broadcasting, workspace switching, and initial data loading
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import mainLogger from '../../utils/mainLogger';
import { errorMessage } from '../../types/common';
import type { Workspace } from '../../types/workspace';
import type { Source } from '../../types/source';

const { createLogger } = mainLogger;
const log = createLogger('WSSourceHandler');

interface RulesUpdateMessage {
    type: 'rules-update';
    data?: { rules?: Record<string, unknown>; version?: string };
}

interface SourceServiceLike {
    on?(event: string, handler: () => void): void;
    getAllSources?(): Source[];
}

interface WSServiceLike {
    rules: Record<string, unknown>;
    sources: Source[];
    appDataPath: string | null;
    sourceService: SourceServiceLike | null;
    ruleHandler: { broadcastRules(): void };
    _broadcastToAll(message: string): number;
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

                        const workspaceList = JSON.parse(await fs.promises.readFile(workspacesPath, 'utf8')).workspaces || [];
                        const activeWorkspace = workspaceList.find((w: Workspace) => w.id === activeWorkspaceId);

                        if (activeWorkspace && (activeWorkspace.type === 'git' || activeWorkspace.type === 'team')) {
                            const sourcesPath = path.join(this.wsService.appDataPath, 'workspaces', activeWorkspaceId, 'sources.json');
                            if (fs.existsSync(sourcesPath)) {
                                const sourcesData = await fs.promises.readFile(sourcesPath, 'utf8');
                                const freshSources = JSON.parse(sourcesData) || [];
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
        if (!Array.isArray(newSources)) return true;
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
                const rulesStorage = JSON.parse(rulesData);
                this.wsService.rules = rulesStorage.rules || {};
                log.info(`Loaded ${Object.keys(this.wsService.rules).length} rule types from workspace ${workspaceId}`);
            } else {
                log.info(`No rules found for workspace ${workspaceId}, using empty rules`);
                this.wsService.rules = {};
            }

            const sourcesPath = path.join(appDataPath, 'workspaces', workspaceId, 'sources.json');
            if (fs.existsSync(sourcesPath)) {
                const sourcesData = await fs.promises.readFile(sourcesPath, 'utf8');
                this.wsService.sources = JSON.parse(sourcesData) || [];
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
        } catch (error) {
            log.error(`Error loading data for workspace ${workspaceId}:`, error);
            this.wsService.rules = {};
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
                const rulesStorage = JSON.parse(rulesData);
                this.wsService.rules = rulesStorage.rules || {};
                log.info(`Loaded ${Object.keys(this.wsService.rules).length} rule types from workspace`);
            } else {
                log.info(`No rules file found at ${rulesPath}, starting with empty rules`);
                this.wsService.rules = {};
            }

            const sourcesPath = path.join(appDataPath, 'workspaces', activeWorkspaceId, 'sources.json');
            if (fs.existsSync(sourcesPath)) {
                const sourcesData = await fs.promises.readFile(sourcesPath, 'utf8');
                this.wsService.sources = JSON.parse(sourcesData) || [];
                log.info(`Loaded ${this.wsService.sources.length} sources from workspace`);
            } else {
                log.info(`No sources file found at ${sourcesPath}, starting with empty sources`);
                this.wsService.sources = [];
            }
        } catch (error) {
            log.error('Error loading initial data:', error);
            this.wsService.rules = {};
            this.wsService.sources = [];
        }
    }
}

export { WSSourceHandler };
export default WSSourceHandler;
