/**
 * WorkspaceStateService — main-process owner of all workspace state.
 *
 * Runs independently of the renderer window. Owns:
 *  - Workspace list, active workspace, sources, rules, proxy rules, sync status
 *  - Persistence (direct fs reads/writes via atomicWriter)
 *  - Auto-save (dirty tracking + periodic flush)
 *  - Workspace switching orchestration
 *  - Broadcasting to WebSocket/proxy/renderer
 *  - Source dependency evaluation (env var readiness)
 *  - File/env source content refresh
 *
 * The renderer hydrates from this service on window open and receives
 * incremental state patches via IPC. All mutations flow through IPC invokes.
 */

import electron from 'electron';
import fs from 'fs';
import path from 'path';
import mainLogger from '../../utils/mainLogger';
import atomicWriter from '../../utils/atomicFileWriter';
import { DATA_FORMAT_VERSION } from '../../config/version';
import { errorMessage } from '../../types/common';
import type { Source, SourceUpdate, ActivationState, RefreshOptions } from '../../types/source';
import type { Workspace, WorkspaceMetadata, WorkspaceSyncStatus, WorkspaceType } from '../../types/workspace';
import type { HeaderRule, RulesCollection, RulesStorage } from '../../types/rules';
import type { ProxyRule } from '../../types/proxy';

const { createLogger } = mainLogger;
const log = createLogger('WorkspaceStateService');

// ── Interfaces for external services ──────────────────────────────

interface WebSocketServiceLike {
    sources: Source[];
    rules: RulesCollection;
    sourceHandler: { broadcastSources(): void; _syncSourcesToRefreshService(sources: Source[]): void };
    ruleHandler: { broadcastRules(): void };
    environmentHandler: EnvironmentResolverLike;
}

interface ProxyServiceLike {
    switchWorkspace(workspaceId: string): Promise<void>;
    updateSources(sources: Source[]): void;
    updateHeaderRules(rules: HeaderRule[]): void;
    updateEnvironmentVariables(variables: Record<string, string | { value: string }> | null): void;
    clearRules(): Promise<void>;
}

interface EnvironmentResolverLike {
    loadEnvironmentVariables(): Record<string, string>;
    resolveTemplate(template: string, variables: Record<string, string>): string;
}

interface SourceRefreshServiceLike {
    updateSource(source: Source): Promise<void>;
    removeSourcesNotIn(ids: Set<string>): Promise<void>;
    clearAllSources(): Promise<void>;
    manualRefresh(sourceId: string): Promise<{ success: boolean; error?: string }>;
    fetchOnce?(source: Source): Promise<{ content: string; originalResponse: string | null; headers: Record<string, string>; isFiltered: boolean; filteredWith: string | null }>;
}

interface WorkspaceSyncSchedulerLike {
    onWorkspaceSwitch(workspaceId: string, options?: { skipInitialSync?: boolean }): Promise<void>;
    onWorkspaceUpdated(workspaceId: string, workspace: Workspace): Promise<void>;
}

// ── State shape ───────────────────────────────────────────────────

export interface WorkspaceState {
    initialized: boolean;
    loading: boolean;
    error: string | null;
    workspaces: Workspace[];
    activeWorkspaceId: string;
    isWorkspaceSwitching: boolean;
    syncStatus: Record<string, WorkspaceSyncStatus>;
    sources: Source[];
    rules: RulesCollection;
    proxyRules: ProxyRule[];
}

// ── Service ───────────────────────────────────────────────────────

class WorkspaceStateService {
    private state: WorkspaceState;
    private appDataPath: string;

    // External services (wired after construction)
    private webSocketService: WebSocketServiceLike | null = null;
    private proxyService: ProxyServiceLike | null = null;
    private envResolver: EnvironmentResolverLike | null = null;
    private sourceRefreshService: SourceRefreshServiceLike | null = null;
    private syncScheduler: WorkspaceSyncSchedulerLike | null = null;

    // Auto-save
    private dirty: { sources: boolean; rules: boolean; proxyRules: boolean; workspaces: boolean } = {
        sources: false, rules: false, proxyRules: false, workspaces: false
    };
    private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
    private isSaving = false;
    private debounceSaveTimer: ReturnType<typeof setTimeout> | null = null;

    // Init
    private initPromise: Promise<boolean> | null = null;

    constructor() {
        this.appDataPath = electron.app.getPath('userData');
        this.state = {
            initialized: false,
            loading: false,
            error: null,
            workspaces: [],
            activeWorkspaceId: 'default-personal',
            isWorkspaceSwitching: false,
            syncStatus: {},
            sources: [],
            rules: { header: [], request: [], response: [] },
            proxyRules: []
        };
        log.info('WorkspaceStateService created');
    }

    // ── Configuration ─────────────────────────────────────────────

    configure(deps: {
        webSocketService: WebSocketServiceLike;
        proxyService: ProxyServiceLike;
        sourceRefreshService: SourceRefreshServiceLike;
        syncScheduler: WorkspaceSyncSchedulerLike;
    }): void {
        this.webSocketService = deps.webSocketService;
        this.proxyService = deps.proxyService;
        this.envResolver = deps.webSocketService.environmentHandler;
        this.sourceRefreshService = deps.sourceRefreshService;
        this.syncScheduler = deps.syncScheduler;
        log.info('WorkspaceStateService configured with dependencies');
    }

    // ── Initialization ────────────────────────────────────────────

    async initialize(): Promise<boolean> {
        if (this.initPromise) return this.initPromise;
        this.initPromise = this._doInitialize();
        return this.initPromise;
    }

    private async _doInitialize(): Promise<boolean> {
        try {
            this.state.loading = true;
            this.state.error = null;

            // Load workspaces config
            const config = await this.loadWorkspacesConfig();
            this.state.workspaces = config.workspaces;
            this.state.activeWorkspaceId = config.activeWorkspaceId;
            this.state.syncStatus = config.syncStatus;

            // Load active workspace data
            await this.loadWorkspaceData(this.state.activeWorkspaceId);

            // Start auto-save timer (runs regardless of renderer)
            this.startAutoSave();

            this.state.initialized = true;
            this.state.loading = false;
            this.sendPatchToRenderers(['initialized', 'loading', 'workspaces', 'activeWorkspaceId', 'syncStatus', 'sources', 'rules', 'proxyRules']);

            log.info(`Initialized with workspace ${this.state.activeWorkspaceId}: ${this.state.sources.length} sources, ${this.state.rules.header.length} header rules`);

            // Check source activations after a short delay
            setTimeout(() => { this.activateReadySources().catch(e => log.warn('Activation check failed:', errorMessage(e))); }, 200);

            return true;
        } catch (error) {
            log.error('Initialization failed:', error);
            this.state.initialized = false;
            this.state.loading = false;
            this.state.error = errorMessage(error);
            throw error;
        }
    }

    // ── State access ──────────────────────────────────────────────

    getState(): WorkspaceState {
        return { ...this.state };
    }

    // ── Workspace config persistence ──────────────────────────────

    private workspacesPath(): string {
        return path.join(this.appDataPath, 'workspaces.json');
    }

    private workspaceDir(workspaceId: string): string {
        return path.join(this.appDataPath, 'workspaces', workspaceId);
    }

    private async loadWorkspacesConfig(): Promise<{ workspaces: Workspace[]; activeWorkspaceId: string; syncStatus: Record<string, WorkspaceSyncStatus> }> {
        try {
            const data = await atomicWriter.readJson<{ workspaces?: Workspace[]; activeWorkspaceId?: string; syncStatus?: Record<string, WorkspaceSyncStatus> }>(this.workspacesPath());
            if (data) {
                return {
                    workspaces: data.workspaces ?? [],
                    activeWorkspaceId: data.activeWorkspaceId ?? 'default-personal',
                    syncStatus: data.syncStatus ?? {}
                };
            }
        } catch (_e) { /* fall through */ }

        // Initialize with default workspace
        const defaultConfig = {
            workspaces: [{
                id: 'default-personal',
                name: 'Personal Workspace',
                type: 'personal' as WorkspaceType,
                description: 'Your default personal workspace',
                isDefault: true,
                isPersonal: true,
                isTeam: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: { version: DATA_FORMAT_VERSION, sourceCount: 0, ruleCount: 0, proxyRuleCount: 0 }
            }],
            activeWorkspaceId: 'default-personal',
            syncStatus: {} as Record<string, WorkspaceSyncStatus>
        };
        await this.saveWorkspacesConfig(defaultConfig);
        return defaultConfig;
    }

    private async saveWorkspacesConfig(config?: { workspaces: Workspace[]; activeWorkspaceId: string; syncStatus: Record<string, WorkspaceSyncStatus> }): Promise<void> {
        const data = config ?? {
            workspaces: this.state.workspaces,
            activeWorkspaceId: this.state.activeWorkspaceId,
            syncStatus: this.state.syncStatus
        };
        await atomicWriter.writeJson(this.workspacesPath(), data, { pretty: true });
        this.dirty.workspaces = false;
    }

    // ── Workspace data persistence ────────────────────────────────

    private async loadWorkspaceData(workspaceId: string): Promise<void> {
        const dir = this.workspaceDir(workspaceId);

        const [sources, rules, proxyRules] = await Promise.all([
            this.loadJson<Source[]>(path.join(dir, 'sources.json'), []),
            this.loadRulesFromDisk(path.join(dir, 'rules.json')),
            this.loadJson<ProxyRule[]>(path.join(dir, 'proxy-rules.json'), [])
        ]);

        // Evaluate source dependencies
        const evaluatedSources = await this.evaluateAllSourceDependencies(sources);

        this.state.sources = evaluatedSources;
        this.state.rules = rules;
        this.state.proxyRules = proxyRules;

        // Mark all clean since we just loaded
        this.dirty.sources = false;
        this.dirty.rules = false;
        this.dirty.proxyRules = false;

        // Update workspace metadata
        const totalRules = rules.header.length + rules.request.length + rules.response.length;
        this.updateWorkspaceMetadataInMemory(workspaceId, {
            sourceCount: evaluatedSources.length,
            ruleCount: totalRules,
            proxyRuleCount: proxyRules.length,
            lastDataLoad: new Date().toISOString()
        });

        // Broadcast to services
        this.broadcastToServices();

        log.info(`Loaded workspace ${workspaceId}: ${evaluatedSources.length} sources, ${totalRules} rules, ${proxyRules.length} proxy rules`);
    }

    private async loadRulesFromDisk(rulesPath: string): Promise<RulesCollection> {
        try {
            const data = await atomicWriter.readJson<RulesStorage>(rulesPath);
            return data?.rules ?? { header: [], request: [], response: [] };
        } catch (_e) {
            return { header: [], request: [], response: [] };
        }
    }

    private async loadJson<T>(filePath: string, fallback: T): Promise<T> {
        try {
            const data = await atomicWriter.readJson<T>(filePath);
            return data ?? fallback;
        } catch (_e) {
            return fallback;
        }
    }

    private async saveSources(): Promise<void> {
        const dir = this.workspaceDir(this.state.activeWorkspaceId);
        await atomicWriter.writeJson(path.join(dir, 'sources.json'), this.state.sources);
        this.dirty.sources = false;
    }

    private async saveRules(): Promise<void> {
        const dir = this.workspaceDir(this.state.activeWorkspaceId);
        const storage: RulesStorage = {
            version: DATA_FORMAT_VERSION,
            rules: this.state.rules,
            metadata: {
                totalRules: this.state.rules.header.length + this.state.rules.request.length + this.state.rules.response.length,
                lastUpdated: new Date().toISOString()
            }
        };
        await atomicWriter.writeJson(path.join(dir, 'rules.json'), storage, { pretty: true });
        this.dirty.rules = false;
    }

    private async saveProxyRules(): Promise<void> {
        const dir = this.workspaceDir(this.state.activeWorkspaceId);
        await atomicWriter.writeJson(path.join(dir, 'proxy-rules.json'), this.state.proxyRules);
        this.dirty.proxyRules = false;
    }

    async saveAll(): Promise<void> {
        if (this.isSaving) return;
        this.isSaving = true;
        try {
            const saves: Promise<void>[] = [];
            if (this.dirty.sources) saves.push(this.saveSources());
            if (this.dirty.rules) saves.push(this.saveRules());
            if (this.dirty.proxyRules) saves.push(this.saveProxyRules());
            if (this.dirty.workspaces) saves.push(this.saveWorkspacesConfig());
            if (saves.length > 0) {
                await Promise.all(saves);
                log.debug(`Saved ${saves.length} data types`);
            }
        } catch (error) {
            log.error('Auto-save failed:', error);
        } finally {
            this.isSaving = false;
        }
    }

    // ── Auto-save ─────────────────────────────────────────────────

    private startAutoSave(): void {
        if (this.autoSaveTimer) return;
        this.autoSaveTimer = setInterval(() => {
            if (this.hasDirtyData() && !this.state.isWorkspaceSwitching) {
                this.saveAll().catch(e => log.error('Periodic save failed:', errorMessage(e)));
            }
        }, 5000);
    }

    private scheduleDebouncedSave(): void {
        if (this.state.isWorkspaceSwitching) return;
        if (this.debounceSaveTimer) clearTimeout(this.debounceSaveTimer);
        this.debounceSaveTimer = setTimeout(() => {
            this.debounceSaveTimer = null;
            if (!this.state.isWorkspaceSwitching) {
                this.saveAll().catch(e => log.error('Debounced save failed:', errorMessage(e)));
            }
        }, 1000);
    }

    private hasDirtyData(): boolean {
        return this.dirty.sources || this.dirty.rules || this.dirty.proxyRules || this.dirty.workspaces;
    }

    // ── Workspace switching ───────────────────────────────────────

    async switchWorkspace(workspaceId: string): Promise<void> {
        if (this.state.activeWorkspaceId === workspaceId) return;

        const previousWorkspaceId = this.state.activeWorkspaceId;
        const workspace = this.state.workspaces.find(w => w.id === workspaceId);
        if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

        log.info(`Switching workspace: ${previousWorkspaceId} → ${workspaceId}`);

        try {
            this.state.isWorkspaceSwitching = true;
            this.state.loading = true;
            this.state.error = null;
            this.sendProgressToRenderers('saving', 10, 'Saving current workspace data...');

            // Save current workspace
            await this.saveAll();
            this.sendProgressToRenderers('saving', 25, 'Current workspace saved');

            // Clear current data
            this.sendProgressToRenderers('clearing', 30, 'Clearing current data...');
            this.state.sources = [];
            this.state.rules = { header: [], request: [], response: [] };
            this.state.proxyRules = [];

            // Clear proxy
            if (this.proxyService) {
                await this.proxyService.clearRules().catch(e => log.warn('Failed to clear proxy rules:', errorMessage(e)));
            }

            // Update active workspace
            this.sendProgressToRenderers('switching', 40, `Switching to "${workspace.name}"...`);
            this.state.activeWorkspaceId = workspaceId;
            this.dirty.workspaces = true;
            await this.saveWorkspacesConfig();

            // Switch proxy
            if (this.proxyService) {
                await this.proxyService.switchWorkspace(workspaceId).catch(e => log.error('Proxy switch failed:', errorMessage(e)));
                await this.loadAndSetProxyEnvVars(workspaceId);
            }

            // Switch WebSocket service
            if (this.webSocketService) {
                this.webSocketService.sources = [];
                this.webSocketService.rules = { header: [], request: [], response: [] };
            }

            // Notify sync scheduler
            if (this.syncScheduler) {
                await this.syncScheduler.onWorkspaceSwitch(workspaceId).catch(e => log.warn('Sync scheduler switch failed:', errorMessage(e)));
            }

            // Clear source refresh schedules
            if (this.sourceRefreshService) {
                await this.sourceRefreshService.clearAllSources().catch(e => log.warn('Failed to clear refresh sources:', errorMessage(e)));
            }

            this.sendProgressToRenderers('switching', 45, 'Workspace context updated');

            // Load new workspace data
            this.sendProgressToRenderers('loading', 80, 'Loading workspace data...');
            await this.loadWorkspaceData(workspaceId);
            this.sendProgressToRenderers('loading', 90, 'Workspace data loaded');

            // Finalize
            this.sendProgressToRenderers('finalizing', 95, 'Updating interface...');
            this.state.loading = false;
            this.state.isWorkspaceSwitching = false;

            this.sendPatchToRenderers(['sources', 'rules', 'proxyRules', 'workspaces', 'activeWorkspaceId', 'loading', 'isWorkspaceSwitching']);
            this.sendProgressToRenderers('complete', 100, `Successfully switched to "${workspace.name}"`);

            log.info(`Successfully switched to workspace: ${workspaceId}`);

            // Check source activations
            setTimeout(() => { this.activateReadySources().catch(() => {}); }, 200);
        } catch (error) {
            log.error('Workspace switch failed:', error);

            // Attempt recovery
            try {
                this.state.activeWorkspaceId = previousWorkspaceId;
                await this.saveWorkspacesConfig();
                await this.loadWorkspaceData(previousWorkspaceId);
            } catch (recoveryError) {
                log.error('Recovery failed:', recoveryError);
                this.state.activeWorkspaceId = 'default-personal';
            }

            this.state.loading = false;
            this.state.isWorkspaceSwitching = false;
            this.state.error = errorMessage(error);
            this.sendPatchToRenderers(['sources', 'rules', 'proxyRules', 'activeWorkspaceId', 'loading', 'isWorkspaceSwitching', 'error']);
            throw error;
        }
    }

    private async loadAndSetProxyEnvVars(workspaceId: string): Promise<void> {
        try {
            const envPath = path.join(this.workspaceDir(workspaceId), 'environments.json');
            const envData = await fs.promises.readFile(envPath, 'utf8');
            const { environments, activeEnvironment } = JSON.parse(envData);
            const activeVars = environments?.[activeEnvironment] ?? {};
            this.proxyService!.updateEnvironmentVariables(activeVars);
        } catch (_e) {
            this.proxyService!.updateEnvironmentVariables({});
        }
    }

    // ── Source CRUD ────────────────────────────────────────────────

    async addSource(sourceData: Source): Promise<Source> {
        // Check for duplicates
        const isDuplicate = this.state.sources.some(src =>
            src.sourceType === sourceData.sourceType &&
            src.sourcePath === sourceData.sourcePath &&
            (sourceData.sourceType !== 'http' || src.sourceMethod === sourceData.sourceMethod)
        );
        if (isDuplicate) {
            throw new Error(`Source already exists: ${sourceData.sourceType.toUpperCase()} ${sourceData.sourcePath}`);
        }

        // Generate ID
        const maxId = this.state.sources.reduce((max, src) => {
            const id = parseInt(src.sourceId ?? '0');
            return id > max ? id : max;
        }, 0);

        // Evaluate dependencies
        let activationState: ActivationState = 'active';
        let missingDependencies: string[] = [];
        if (sourceData.sourceType === 'http') {
            const deps = this.evaluateSourceDependencies(sourceData);
            activationState = deps.ready ? 'active' : 'waiting_for_deps';
            missingDependencies = deps.missing;
        }

        const newSource: Source = {
            ...sourceData,
            sourceId: String(maxId + 1),
            createdAt: new Date().toISOString(),
            activationState,
            missingDependencies
        };

        this.state.sources.push(newSource);
        this.dirty.sources = true;

        // Save immediately (avoid race condition with refresh)
        await this.saveSources();
        this.updateWorkspaceMetadataInMemory(this.state.activeWorkspaceId, {
            sourceCount: this.state.sources.length,
            lastDataUpdate: new Date().toISOString()
        });

        this.broadcastToServices();
        this.sendPatchToRenderers(['sources']);

        return newSource;
    }

    async updateSource(sourceId: string, updates: SourceUpdate): Promise<Source | null> {
        let updatedSource: Source | null = null;
        const sources = this.state.sources.map(source => {
            if (source.sourceId === String(sourceId)) {
                const { refreshOptions: refreshUpdates, ...otherUpdates } = updates;
                const resolvedUpdates: Partial<Source> = { ...otherUpdates };
                if (refreshUpdates) {
                    const base = source.refreshOptions ?? { enabled: false };
                    resolvedUpdates.refreshOptions = { ...base, ...refreshUpdates };
                }
                const updated: Source = { ...source, ...resolvedUpdates, updatedAt: new Date().toISOString() };

                // Check dependencies if waiting
                if (updated.sourceType === 'http' && updated.activationState === 'waiting_for_deps') {
                    const deps = this.evaluateSourceDependencies(updated);
                    if (deps.ready) {
                        updated.activationState = 'active';
                        updated.missingDependencies = [];
                    }
                }

                updatedSource = updated;
                return updated;
            }
            return source;
        });

        this.state.sources = sources;
        this.dirty.sources = true;
        this.scheduleDebouncedSave();

        // Update proxy if source has content
        if (updatedSource !== null) {
            const src = updatedSource as Source;
            if (src.sourceContent && this.proxyService) {
                this.proxyService.updateSources(this.state.sources);
            }
        }

        this.broadcastToServices();
        this.sendPatchToRenderers(['sources']);
        return updatedSource;
    }

    async removeSource(sourceId: string): Promise<void> {
        this.state.sources = this.state.sources.filter(s => s.sourceId !== String(sourceId));
        this.dirty.sources = true;
        this.scheduleDebouncedSave();

        this.updateWorkspaceMetadataInMemory(this.state.activeWorkspaceId, {
            sourceCount: this.state.sources.length,
            lastDataUpdate: new Date().toISOString()
        });

        this.broadcastToServices();
        this.sendPatchToRenderers(['sources']);
    }

    async updateSourceContent(sourceId: string, content: string): Promise<void> {
        await this.updateSource(sourceId, { sourceContent: content });
    }

    async importSources(newSources: Source[], replace: boolean): Promise<void> {
        if (replace) {
            this.state.sources = newSources;
        } else {
            this.state.sources = [...this.state.sources, ...newSources];
        }
        this.dirty.sources = true;
        this.scheduleDebouncedSave();
        this.broadcastToServices();
        this.sendPatchToRenderers(['sources']);
    }

    /**
     * Refresh a file or env source by reading content directly.
     * HTTP sources go through SourceRefreshService.manualRefresh().
     */
    async refreshSource(sourceId: string): Promise<boolean> {
        const source = this.state.sources.find(s => s.sourceId === sourceId);
        if (!source) throw new Error(`Source ${sourceId} not found`);

        if (source.sourceType === 'file') {
            const content = await fs.promises.readFile(source.sourcePath || '', 'utf8');
            await this.updateSourceContent(sourceId, content);
            return true;
        } else if (source.sourceType === 'env') {
            const value = process.env[source.sourcePath || ''] ?? '';
            await this.updateSourceContent(sourceId, value);
            return true;
        } else if (source.sourceType === 'http') {
            if (this.sourceRefreshService) {
                const result = await this.sourceRefreshService.manualRefresh(sourceId);
                return result.success;
            }
            return false;
        }
        return false;
    }

    // ── Header Rule CRUD ──────────────────────────────────────────

    async addHeaderRule(ruleData: Partial<HeaderRule>): Promise<void> {
        const newRule: HeaderRule = {
            ...ruleData,
            id: Date.now().toString(),
            createdAt: new Date().toISOString()
        } as HeaderRule;

        this.state.rules = {
            ...this.state.rules,
            header: [...this.state.rules.header, newRule]
        };
        this.dirty.rules = true;
        this.scheduleDebouncedSave();
        this.broadcastToServices();
        this.sendPatchToRenderers(['rules']);
    }

    async updateHeaderRule(ruleId: string, updates: Partial<HeaderRule>): Promise<void> {
        this.state.rules = {
            ...this.state.rules,
            header: this.state.rules.header.map(rule =>
                rule.id === ruleId
                    ? { ...rule, ...updates, updatedAt: new Date().toISOString() }
                    : rule
            )
        };
        this.dirty.rules = true;
        this.scheduleDebouncedSave();
        this.broadcastToServices();
        this.sendPatchToRenderers(['rules']);
    }

    async removeHeaderRule(ruleId: string): Promise<void> {
        this.state.rules = {
            ...this.state.rules,
            header: this.state.rules.header.filter(rule => rule.id !== ruleId)
        };
        this.dirty.rules = true;
        this.scheduleDebouncedSave();
        this.broadcastToServices();
        this.sendPatchToRenderers(['rules']);
    }

    // ── Proxy Rule CRUD ───────────────────────────────────────────

    async addProxyRule(ruleData: ProxyRule): Promise<void> {
        this.state.proxyRules = [...this.state.proxyRules, ruleData];
        this.dirty.proxyRules = true;
        this.scheduleDebouncedSave();
        this.sendPatchToRenderers(['proxyRules']);
    }

    async removeProxyRule(ruleId: string): Promise<void> {
        this.state.proxyRules = this.state.proxyRules.filter(r => r.id !== ruleId);
        this.dirty.proxyRules = true;
        this.scheduleDebouncedSave();
        this.sendPatchToRenderers(['proxyRules']);
    }

    // ── Workspace CRUD ────────────────────────────────────────────

    async createWorkspace(workspace: Partial<Workspace> & { id: string; name: string; type: WorkspaceType }): Promise<Workspace> {
        // Validation
        if (this.state.workspaces.some(w => w.id === workspace.id)) {
            throw new Error(`Workspace with ID ${workspace.id} already exists`);
        }
        if (!workspace.name || workspace.name.length < 1 || workspace.name.length > 100) {
            throw new Error('Workspace name must be between 1 and 100 characters');
        }
        if (!['personal', 'team', 'git'].includes(workspace.type)) {
            throw new Error('Invalid workspace type');
        }
        if (!/^[a-zA-Z0-9\-_]+$/.test(workspace.id)) {
            throw new Error('Workspace ID can only contain letters, numbers, hyphens, and underscores');
        }
        if (workspace.type === 'git' && !workspace.gitUrl) {
            throw new Error('Git workspace must have a gitUrl');
        }

        const newWorkspace: Workspace = {
            ...workspace,
            createdAt: workspace.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isDefault: workspace.id === 'default-personal',
            isPersonal: workspace.type === 'personal',
            isTeam: workspace.type === 'team' || workspace.type === 'git',
            metadata: { version: DATA_FORMAT_VERSION, sourceCount: 0, ruleCount: 0, proxyRuleCount: 0, ...(workspace.metadata ?? {}) }
        };

        this.state.workspaces.push(newWorkspace);
        this.dirty.workspaces = true;

        // Initialize empty data containers
        const dir = this.workspaceDir(newWorkspace.id);
        await fs.promises.mkdir(dir, { recursive: true });
        await Promise.all([
            atomicWriter.writeJson(path.join(dir, 'sources.json'), []),
            atomicWriter.writeJson(path.join(dir, 'rules.json'), { version: DATA_FORMAT_VERSION, rules: { header: [], request: [], response: [] }, metadata: { totalRules: 0, lastUpdated: new Date().toISOString() } }, { pretty: true }),
            atomicWriter.writeJson(path.join(dir, 'proxy-rules.json'), [])
        ]);

        await this.saveWorkspacesConfig();

        // Auto-switch to new workspace
        await this.switchWorkspace(newWorkspace.id);

        log.info(`Created workspace: ${newWorkspace.id} (${newWorkspace.type})`);
        return newWorkspace;
    }

    async updateWorkspace(workspaceId: string, updates: Partial<Workspace>): Promise<boolean> {
        const existing = this.state.workspaces.find(w => w.id === workspaceId);
        if (!existing) throw new Error(`Workspace ${workspaceId} not found`);

        // Validation
        if (updates.name && (updates.name.length < 1 || updates.name.length > 100)) {
            throw new Error('Workspace name must be between 1 and 100 characters');
        }
        if (updates.type && !['personal', 'team', 'git'].includes(updates.type)) {
            throw new Error('Invalid workspace type');
        }

        this.state.workspaces = this.state.workspaces.map(w =>
            w.id === workspaceId ? { ...w, ...updates, updatedAt: new Date().toISOString() } : w
        );
        this.dirty.workspaces = true;
        await this.saveWorkspacesConfig();

        // Notify sync scheduler if this is the active workspace
        if (this.syncScheduler && workspaceId === this.state.activeWorkspaceId) {
            const updatedWorkspace = this.state.workspaces.find(w => w.id === workspaceId);
            if (updatedWorkspace) {
                await this.syncScheduler.onWorkspaceUpdated(workspaceId, updatedWorkspace);
            }
        }

        this.sendPatchToRenderers(['workspaces']);
        return true;
    }

    async deleteWorkspace(workspaceId: string): Promise<boolean> {
        if (workspaceId === 'default-personal') {
            throw new Error('Cannot delete default personal workspace');
        }

        this.state.workspaces = this.state.workspaces.filter(w => w.id !== workspaceId);
        this.dirty.workspaces = true;

        // Switch away if deleting active workspace
        if (this.state.activeWorkspaceId === workspaceId) {
            await this.switchWorkspace('default-personal');
        }

        // Delete data directory
        const dir = this.workspaceDir(workspaceId);
        await fs.promises.rm(dir, { recursive: true, force: true }).catch(e => log.warn('Failed to delete workspace dir:', errorMessage(e)));
        await this.saveWorkspacesConfig();

        this.sendPatchToRenderers(['workspaces']);
        log.info(`Deleted workspace: ${workspaceId}`);
        return true;
    }

    async syncWorkspace(workspaceId: string): Promise<{ success: boolean; error?: string }> {
        const workspace = this.state.workspaces.find(w => w.id === workspaceId);
        if (!workspace) return { success: false, error: 'Workspace not found' };
        if (workspace.type !== 'git') return { success: false, error: 'Only git workspaces can be synced' };

        // Update sync status
        this.state.syncStatus = { ...this.state.syncStatus, [workspaceId]: { syncing: true } };
        this.sendPatchToRenderers(['syncStatus']);

        // The actual sync is delegated to workspaceHandlers.handleWorkspaceSync()
        // which calls workspaceSyncScheduler.manualSync(). This method just manages
        // the sync status UI state. The sync result flows back via updateSyncStatus()
        // and onSyncDataChanged() callbacks.
        return { success: true };
    }

    // ── Copy workspace data ───────────────────────────────────────

    async copyWorkspaceData(sourceWorkspaceId: string, targetWorkspaceId: string): Promise<void> {
        const files = ['sources.json', 'rules.json', 'proxy-rules.json', 'environments.json'];
        for (const file of files) {
            try {
                const src = path.join(this.workspaceDir(sourceWorkspaceId), file);
                const dst = path.join(this.workspaceDir(targetWorkspaceId), file);
                const data = await fs.promises.readFile(src, 'utf8');
                await fs.promises.writeFile(dst, data, 'utf8');
            } catch (_e) { /* file doesn't exist, skip */ }
        }
    }

    // ── Source dependency evaluation ───────────────────────────────

    private evaluateSourceDependencies(source: Source): { ready: boolean; missing: string[] } {
        if (source.sourceType !== 'http') return { ready: true, missing: [] };

        const requiredVars = this.extractVariablesFromSource(source);
        if (requiredVars.length === 0) return { ready: true, missing: [] };

        const envVars = this.envResolver?.loadEnvironmentVariables() ?? {};
        const missing = requiredVars.filter(varName => !envVars[varName] || envVars[varName] === '');
        return { ready: missing.length === 0, missing };
    }

    private extractVariablesFromSource(source: Source): string[] {
        const variables = new Set<string>();
        const pattern = /\{\{(\w+)\}\}/g;

        const extract = (str: string | undefined) => {
            if (!str) return;
            for (const match of str.matchAll(pattern)) variables.add(match[1]);
        };

        extract(source.sourcePath);
        const opts = source.requestOptions;
        if (opts) {
            extract(opts.body);
            extract(opts.contentType);
            extract(opts.totpSecret);
            if (opts.headers) for (const h of opts.headers) { extract(h.key); extract(h.value); }
            if (opts.queryParams) for (const p of opts.queryParams) { extract(p.key); extract(p.value); }
        }
        if (source.jsonFilter?.path) extract(source.jsonFilter.path);

        return Array.from(variables);
    }

    private async evaluateAllSourceDependencies(sources: Source[]): Promise<Source[]> {
        return sources.map(source => {
            if (source.sourceType === 'http') {
                const deps = this.evaluateSourceDependencies(source);
                return { ...source, activationState: deps.ready ? 'active' as ActivationState : 'waiting_for_deps' as ActivationState, missingDependencies: deps.missing };
            }
            return { ...source, activationState: 'active' as ActivationState, missingDependencies: [] };
        });
    }

    async activateReadySources(): Promise<number> {
        let activated = 0;
        let hasChanges = false;
        const sources = this.state.sources.map(source => {
            if (source.activationState === 'waiting_for_deps') {
                const deps = this.evaluateSourceDependencies(source);
                if (deps.ready) {
                    activated++;
                    hasChanges = true;
                    return { ...source, activationState: 'active' as ActivationState, missingDependencies: [] };
                } else if (JSON.stringify(source.missingDependencies) !== JSON.stringify(deps.missing)) {
                    hasChanges = true;
                    return { ...source, missingDependencies: deps.missing };
                }
            }
            return source;
        });

        if (hasChanges) {
            this.state.sources = sources;
            this.dirty.sources = true;
            this.scheduleDebouncedSave();
            this.sendPatchToRenderers(['sources']);
        }

        if (activated > 0) log.info(`Activated ${activated} sources after dependency resolution`);
        return activated;
    }

    // ── Workspace metadata ────────────────────────────────────────

    private updateWorkspaceMetadataInMemory(workspaceId: string, metadata: Partial<WorkspaceMetadata>): void {
        this.state.workspaces = this.state.workspaces.map(w =>
            w.id === workspaceId
                ? { ...w, metadata: { ...w.metadata, ...metadata }, updatedAt: new Date().toISOString() }
                : w
        );
        this.dirty.workspaces = true;
    }

    // ── Broadcasting ──────────────────────────────────────────────

    private broadcastToServices(): void {
        // Update WebSocket service (for browser extensions)
        if (this.webSocketService) {
            this.webSocketService.sources = this.state.sources;
            this.webSocketService.rules = this.state.rules;
            this.webSocketService.sourceHandler.broadcastSources();
            this.webSocketService.ruleHandler.broadcastRules();
        }

        // Update proxy
        if (this.proxyService) {
            this.proxyService.updateSources(this.state.sources);
            this.proxyService.updateHeaderRules(this.state.rules.header);
        }

        // Sync to SourceRefreshService
        if (this.sourceRefreshService) {
            const httpIds = new Set<string>();
            for (const source of this.state.sources) {
                if (source.sourceType === 'http') {
                    httpIds.add(source.sourceId);
                    this.sourceRefreshService.updateSource(source).catch(e =>
                        log.warn(`Failed to sync source ${source.sourceId} to refresh service:`, errorMessage(e))
                    );
                }
            }
            this.sourceRefreshService.removeSourcesNotIn(httpIds).catch(e =>
                log.warn('Failed to clean up refresh service:', errorMessage(e))
            );
        }
    }

    /**
     * Send a state patch to all open renderer windows.
     * Safely no-ops when no windows exist (app running in background).
     */
    private sendPatchToRenderers(changedKeys: string[]): void {
        const patch: Record<string, unknown> = {};
        for (const key of changedKeys) {
            if (key in this.state) {
                patch[key] = this.state[key as keyof WorkspaceState];
            }
        }

        const { BrowserWindow } = electron;
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
                win.webContents.send('workspace:state-patch', patch);
            }
        }
    }

    private sendProgressToRenderers(step: string, progress: number, label: string, isGitOperation = false): void {
        const { BrowserWindow } = electron;
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
                win.webContents.send('workspace:switch-progress', { step, progress, label, isGitOperation });
            }
        }
    }

    // ── Sync status updates (called by WorkspaceSyncScheduler) ────

    updateSyncStatus(workspaceId: string, status: Partial<WorkspaceSyncStatus>): void {
        this.state.syncStatus = {
            ...this.state.syncStatus,
            [workspaceId]: { ...this.state.syncStatus[workspaceId], ...status }
        };
        this.dirty.workspaces = true;
        this.sendPatchToRenderers(['syncStatus']);
    }

    /**
     * Called after a successful git sync that changed data.
     * Reloads workspace data from disk and broadcasts.
     */
    async onSyncDataChanged(workspaceId: string): Promise<void> {
        if (workspaceId === this.state.activeWorkspaceId) {
            log.info('Reloading workspace data after sync');
            await this.loadWorkspaceData(workspaceId);
            this.sendPatchToRenderers(['sources', 'rules', 'proxyRules']);
        }
    }

    // ── CLI workspace join ────────────────────────────────────────

    /**
     * Called when the CLI creates and activates a workspace.
     * Reloads workspace list from disk and switches.
     */
    async onCliWorkspaceJoined(workspaceId: string): Promise<void> {
        log.info(`CLI workspace joined: ${workspaceId}`);

        // Save current workspace
        await this.saveAll();

        // Reload workspace list from disk (CLI already saved it)
        const config = await this.loadWorkspacesConfig();
        this.state.workspaces = config.workspaces;
        this.state.activeWorkspaceId = config.activeWorkspaceId;
        this.state.syncStatus = config.syncStatus;

        // Load new workspace data
        await this.loadWorkspaceData(config.activeWorkspaceId);

        this.sendPatchToRenderers(['workspaces', 'activeWorkspaceId', 'syncStatus', 'sources', 'rules', 'proxyRules']);
        this.broadcastToServices();
    }

    // ── Shutdown ──────────────────────────────────────────────────

    async stop(): Promise<void> {
        log.info('Shutting down WorkspaceStateService');
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
        if (this.debounceSaveTimer) {
            clearTimeout(this.debounceSaveTimer);
            this.debounceSaveTimer = null;
        }
        // Final save
        await this.saveAll();
        log.info('WorkspaceStateService shut down');
    }
}

// Singleton
const workspaceStateService = new WorkspaceStateService();
export { WorkspaceStateService };
export default workspaceStateService;
