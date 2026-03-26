/**
 * WorkspaceStateService — main-process owner of all workspace state.
 *
 * Thin orchestrator that delegates to submodules in ./state/:
 *  - StatePersistence.ts         — reading/writing workspace data to disk
 *  - SourceDependencyEvaluator.ts — env var dependency checking
 *  - StateBroadcaster.ts         — pushing state to WS/proxy/renderer
 *  - SourceCrud.ts               — source + rule CRUD operations
 *  - WorkspaceCrud.ts            — workspace CRUD operations
 *  - types.ts                    — shared interfaces and state shape
 *
 * This file owns: lifecycle (configure/initialize/stop), auto-save,
 * workspace switching orchestration, and the StateContext that binds
 * submodules to the service's mutable state.
 */

import electron from 'electron';
import mainLogger from '../../utils/mainLogger';
import { errorMessage } from '../../types/common';
import type { Source, SourceUpdate } from '../../types/source';
import type { Workspace, WorkspaceMetadata, WorkspaceSyncStatus, WorkspaceType } from '../../types/workspace';
import type { HeaderRule } from '../../types/rules';
import type { ProxyRule } from '../../types/proxy';
import type { EnvironmentMap } from '../../types/environment';
import type { SyncData } from './sync/types';

import {
    type WorkspaceState,
    type WebSocketServiceLike,
    type ProxyServiceLike,
    type EnvironmentResolverLike,
    type SourceRefreshServiceLike,
    type WorkspaceSyncSchedulerLike,
    type DirtyFlags,
    type StateContext,
    // Persistence
    loadWorkspacesConfig,
    saveWorkspacesConfig as persistWorkspacesConfig,
    workspaceDir,
    loadSources,
    loadRules,
    loadProxyRules,
    loadEnvironments,
    saveSources as persistSources,
    saveRules as persistRules,
    saveProxyRules as persistProxyRules,
    saveEnvironments as persistEnvironments,
    // Source dependencies
    evaluateAllSourceDependencies,
    activateReadySources as evaluateActivations,
    extractVariablesFromSource,
    // Broadcasting
    broadcastToServices,
    syncToRefreshService,
    sendPatchToRenderers,
    sendProgressToRenderers,
    // Source CRUD
    addSource as crudAddSource,
    updateSource as crudUpdateSource,
    removeSource as crudRemoveSource,
    updateSourceFetchResult as crudUpdateSourceFetchResult,
    importSources as crudImportSources,
    refreshSource as crudRefreshSource,
    addHeaderRule as crudAddHeaderRule,
    updateHeaderRule as crudUpdateHeaderRule,
    updateHeaderRulesBatch as crudUpdateHeaderRulesBatch,
    removeHeaderRule as crudRemoveHeaderRule,
    addProxyRule as crudAddProxyRule,
    removeProxyRule as crudRemoveProxyRule,
    // Workspace CRUD
    createWorkspace as crudCreateWorkspace,
    updateWorkspace as crudUpdateWorkspace,
    deleteWorkspace as crudDeleteWorkspace,
    syncWorkspace as crudSyncWorkspace,
    copyWorkspaceData as crudCopyWorkspaceData,
} from './state';

const { createLogger } = mainLogger;
const log = createLogger('WorkspaceStateService');

// Re-export for consumers that import the type from this module
export type { WorkspaceState } from './state';

class WorkspaceStateService {
    private state: WorkspaceState;
    private readonly appDataPath: string;

    // External services (wired after construction)
    private webSocketService: WebSocketServiceLike | null = null;
    private proxyService: ProxyServiceLike | null = null;
    private envResolver: EnvironmentResolverLike | null = null;
    private sourceRefreshService: SourceRefreshServiceLike | null = null;
    private syncScheduler: WorkspaceSyncSchedulerLike | null = null;

    // Auto-save
    private dirty: DirtyFlags = { sources: false, rules: false, proxyRules: false, workspaces: false, environments: false };
    private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
    private isSaving = false;
    private debounceSaveTimer: ReturnType<typeof setTimeout> | null = null;

    // Init
    private initPromise: Promise<boolean> | null = null;

    constructor() {
        this.appDataPath = electron.app.getPath('userData');
        this.state = {
            initialized: false, loading: false, error: null,
            workspaces: [], activeWorkspaceId: 'default-personal',
            isWorkspaceSwitching: false, syncStatus: {},
            sources: [], rules: { header: [], request: [], response: [] }, proxyRules: [],
            environments: { Default: {} }, activeEnvironment: 'Default'
        };
        log.info('WorkspaceStateService created');
    }

    // ── StateContext for submodules ────────────────────────────────

    private get ctx(): StateContext {
        return {
            state: this.state,
            dirty: this.dirty,
            appDataPath: this.appDataPath,
            webSocketService: this.webSocketService,
            proxyService: this.proxyService,
            envResolver: this.envResolver,
            sourceRefreshService: this.sourceRefreshService,
            syncScheduler: this.syncScheduler,
            scheduleDebouncedSave: () => this.scheduleDebouncedSave(),
            saveAll: () => this.saveAll(),
            saveSources: () => this.saveSources(),
            saveEnvironments: () => this.saveEnvironments(),
            saveWorkspacesConfig: () => this.saveWorkspacesConfig(),
            loadWorkspaceData: (id) => this.loadWorkspaceData(id),
            updateWorkspaceMetadataInMemory: (id, m) => this.updateWorkspaceMetadataInMemory(id, m),
        };
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

            const config = await loadWorkspacesConfig(this.appDataPath);
            this.state.workspaces = config.workspaces;
            this.state.activeWorkspaceId = config.activeWorkspaceId;
            this.state.syncStatus = config.syncStatus;

            if (this.sourceRefreshService) {
                this.sourceRefreshService.activeWorkspaceId = this.state.activeWorkspaceId;
            }
            await this.loadEnvironmentData(this.state.activeWorkspaceId);
            await this.applyActiveEnvVarsToServices();
            await this.loadWorkspaceData(this.state.activeWorkspaceId);
            this.startAutoSave();

            this.state.initialized = true;
            this.state.loading = false;
            sendPatchToRenderers(this.state, ['initialized', 'loading', 'workspaces', 'activeWorkspaceId', 'syncStatus', 'sources', 'rules', 'proxyRules', 'environments', 'activeEnvironment']);

            log.info(`Initialized with workspace ${this.state.activeWorkspaceId}: ${this.state.sources.length} sources, ${this.state.rules.header.length} header rules`);
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

    getState(): WorkspaceState { return { ...this.state }; }
    getActiveWorkspaceId(): string { return this.state.activeWorkspaceId; }

    // ── Workspace data loading ────────────────────────────────────

    private async loadWorkspaceData(workspaceId: string): Promise<void> {
        const [sources, rules, proxyRules] = await Promise.all([
            loadSources(this.appDataPath, workspaceId),
            loadRules(this.appDataPath, workspaceId),
            loadProxyRules(this.appDataPath, workspaceId)
        ]);

        this.state.sources = evaluateAllSourceDependencies(sources, this.envResolver);
        this.state.rules = rules;
        this.state.proxyRules = proxyRules;
        this.dirty.sources = false;
        this.dirty.rules = false;
        this.dirty.proxyRules = false;
        this.dirty.environments = false;

        const totalRules = rules.header.length + rules.request.length + rules.response.length;
        this.updateWorkspaceMetadataInMemory(workspaceId, {
            sourceCount: this.state.sources.length, ruleCount: totalRules,
            proxyRuleCount: proxyRules.length, lastDataLoad: new Date().toISOString()
        });

        broadcastToServices(this.state, this.webSocketService, this.proxyService);
        syncToRefreshService(this.state.sources, this.sourceRefreshService);
        log.info(`Loaded workspace ${workspaceId}: ${this.state.sources.length} sources, ${totalRules} rules, ${proxyRules.length} proxy rules`);
    }

    // ── Persistence ───────────────────────────────────────────────

    private async saveSources(): Promise<void> {
        await persistSources(this.appDataPath, this.state.activeWorkspaceId, this.state.sources);
        this.dirty.sources = false;
    }
    private async saveRules(): Promise<void> {
        await persistRules(this.appDataPath, this.state.activeWorkspaceId, this.state.rules);
        this.dirty.rules = false;
    }
    private async saveProxyRules(): Promise<void> {
        await persistProxyRules(this.appDataPath, this.state.activeWorkspaceId, this.state.proxyRules);
        this.dirty.proxyRules = false;
    }
    private async saveEnvironments(): Promise<void> {
        await persistEnvironments(this.appDataPath, this.state.activeWorkspaceId, {
            environments: this.state.environments,
            activeEnvironment: this.state.activeEnvironment
        });
        this.dirty.environments = false;
    }
    private async saveWorkspacesConfig(): Promise<void> {
        await persistWorkspacesConfig(this.appDataPath, {
            workspaces: this.state.workspaces,
            activeWorkspaceId: this.state.activeWorkspaceId,
            syncStatus: this.state.syncStatus
        });
        this.dirty.workspaces = false;
    }

    async saveAll(): Promise<void> {
        if (this.isSaving) return;
        this.isSaving = true;
        try {
            const saves: Promise<void>[] = [];
            if (this.dirty.sources) saves.push(this.saveSources());
            if (this.dirty.rules) saves.push(this.saveRules());
            if (this.dirty.proxyRules) saves.push(this.saveProxyRules());
            if (this.dirty.environments) saves.push(this.saveEnvironments());
            if (this.dirty.workspaces) saves.push(this.saveWorkspacesConfig());
            if (saves.length > 0) { await Promise.all(saves); log.debug(`Saved ${saves.length} data types`); }
        } catch (error) { log.error('Auto-save failed:', error); }
        finally { this.isSaving = false; }
    }

    // ── Auto-save ─────────────────────────────────────────────────

    private startAutoSave(): void {
        if (this.autoSaveTimer) return;
        this.autoSaveTimer = setInterval(() => {
            if ((this.dirty.sources || this.dirty.rules || this.dirty.proxyRules || this.dirty.environments || this.dirty.workspaces) && !this.state.isWorkspaceSwitching) {
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

    // ── Workspace switching ───────────────────────────────────────

    async switchWorkspace(workspaceId: string, options: { skipInitialSync?: boolean } = {}): Promise<void> {
        if (this.state.activeWorkspaceId === workspaceId) return;

        const previousWorkspaceId = this.state.activeWorkspaceId;
        const workspace = this.state.workspaces.find(w => w.id === workspaceId);
        if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

        log.info(`Switching workspace: ${previousWorkspaceId} → ${workspaceId}`);
        const target = { id: workspace.id, name: workspace.name, type: workspace.type };

        try {
            this.beginWorkspaceSwitch(target);
            await this.saveCurrentWorkspace(target);
            await this.teardownCurrentWorkspace(target);
            await this.activateNewWorkspace(workspaceId, workspace.name, target, options);
            await this.loadNewWorkspaceData(workspaceId, workspace.name, target);
            this.finalizeWorkspaceSwitch(workspace.name, target);
        } catch (error) {
            await this.recoverFromSwitchFailure(previousWorkspaceId, error);
            throw error;
        }
    }

    // ── Workspace switch helpers ─────────────────────────────────

    private beginWorkspaceSwitch(target: { id: string; name: string; type: string }): void {
        this.state.isWorkspaceSwitching = true;
        this.state.loading = true;
        this.state.error = null;
        sendProgressToRenderers('saving', 10, 'Saving current workspace data...', false, target);
    }

    private async saveCurrentWorkspace(target: { id: string; name: string; type: string }): Promise<void> {
        await this.saveAll();
        sendProgressToRenderers('saving', 25, 'Current workspace saved', false, target);
    }

    private async teardownCurrentWorkspace(target: { id: string; name: string; type: string }): Promise<void> {
        sendProgressToRenderers('clearing', 30, 'Clearing current data...', false, target);

        this.state.sources = [];
        this.state.rules = { header: [], request: [], response: [] };
        this.state.proxyRules = [];

        if (this.envResolver) this.envResolver.clearVariableCache();
        if (this.proxyService) {
            try { this.proxyService.clearRules(); } catch (e: unknown) { log.warn('Failed to clear proxy rules:', errorMessage(e)); }
        }
    }

    private async activateNewWorkspace(workspaceId: string, workspaceName: string, target: { id: string; name: string; type: string }, options: { skipInitialSync?: boolean } = {}): Promise<void> {
        sendProgressToRenderers('switching', 40, `Switching to "${workspaceName}"...`, false, target);

        this.state.activeWorkspaceId = workspaceId;
        this.dirty.workspaces = true;
        await this.saveWorkspacesConfig();

        if (this.proxyService) {
            await this.proxyService.switchWorkspace(workspaceId).catch(e => log.error('Proxy switch failed:', errorMessage(e)));
        }
        // Load env data from disk + apply to envResolver + proxy before loadWorkspaceData
        // so evaluateAllSourceDependencies can resolve template variables.
        await this.loadEnvironmentData(workspaceId);
        this.applyActiveEnvVarsToServices();
        if (this.webSocketService) {
            this.webSocketService.sources = [];
            this.webSocketService.rules = { header: [], request: [], response: [] };
        }
        if (this.syncScheduler) {
            await this.syncScheduler.onWorkspaceSwitch(workspaceId, { skipInitialSync: options.skipInitialSync }).catch(e => log.warn('Sync scheduler switch failed:', errorMessage(e)));
        }
        if (this.sourceRefreshService) {
            this.sourceRefreshService.activeWorkspaceId = workspaceId;
            await this.sourceRefreshService.clearAllSources().catch(e => log.warn('Failed to clear refresh sources:', errorMessage(e)));
        }

        sendProgressToRenderers('switching', 45, 'Workspace context updated', false, target);
    }

    private async loadNewWorkspaceData(workspaceId: string, workspaceName: string, target: { id: string; name: string; type: string }): Promise<void> {
        sendProgressToRenderers('loading', 80, 'Loading workspace data...', false, target);
        await this.loadWorkspaceData(workspaceId);
        sendProgressToRenderers('loading', 90, `"${workspaceName}" data loaded`, false, target);
    }

    private finalizeWorkspaceSwitch(workspaceName: string, target: { id: string; name: string; type: string }): void {
        sendProgressToRenderers('finalizing', 95, 'Updating interface...', false, target);

        this.state.loading = false;
        this.state.isWorkspaceSwitching = false;
        sendPatchToRenderers(this.state, ['sources', 'rules', 'proxyRules', 'workspaces', 'activeWorkspaceId', 'loading', 'isWorkspaceSwitching', 'environments', 'activeEnvironment']);
        sendProgressToRenderers('complete', 100, `Successfully switched to "${workspaceName}"`, false, target);

        log.info(`Successfully switched to workspace: ${target.id}`);
        setTimeout(() => { this.activateReadySources().catch(() => {}); }, 200);
    }

    private async recoverFromSwitchFailure(previousWorkspaceId: string, error: unknown): Promise<void> {
        log.error('Workspace switch failed:', error);
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
        sendPatchToRenderers(this.state, ['sources', 'rules', 'proxyRules', 'activeWorkspaceId', 'loading', 'isWorkspaceSwitching', 'error', 'environments', 'activeEnvironment']);
    }

    /**
     * Load environment data from disk into state.
     */
    private async loadEnvironmentData(workspaceId: string): Promise<void> {
        const envData = await loadEnvironments(this.appDataPath, workspaceId);
        this.state.environments = envData.environments;
        this.state.activeEnvironment = envData.activeEnvironment;
        this.dirty.environments = false;
    }

    /**
     * Apply the active environment's variables to envResolver + proxy.
     * Must be called BEFORE loadWorkspaceData when the workspace changes,
     * so that evaluateAllSourceDependencies has the variables available.
     * Reads from in-memory state, not disk.
     */
    private applyActiveEnvVarsToServices(): void {
        const activeVars = this.state.environments[this.state.activeEnvironment] ?? {};
        const resolved = this.normalizeEnvVariables(activeVars);
        this.applyEnvVariablesToServices(resolved);
    }

    // ── Source + Rule CRUD (delegated) ────────────────────────────

    async addSource(sourceData: Source): Promise<Source> { return crudAddSource(this.ctx, sourceData); }
    async updateSource(sourceId: string, updates: SourceUpdate): Promise<Source | null> { return crudUpdateSource(this.ctx, sourceId, updates); }
    async removeSource(sourceId: string): Promise<void> { return crudRemoveSource(this.ctx, sourceId); }
    async updateSourceContent(sourceId: string, content: string): Promise<void> { await crudUpdateSource(this.ctx, sourceId, { sourceContent: content }); }
    async updateSourceFetchResult(sourceId: string, result: { content: string; originalResponse: string; headers: Record<string, string>; isFiltered: boolean; filteredWith?: string }): Promise<void> { return crudUpdateSourceFetchResult(this.ctx, sourceId, result); }
    async importSources(newSources: Source[], replace: boolean): Promise<void> { return crudImportSources(this.ctx, newSources, replace); }
    async refreshSource(sourceId: string): Promise<boolean> { return crudRefreshSource(this.ctx, sourceId); }
    async addHeaderRule(ruleData: Partial<HeaderRule>): Promise<void> { return crudAddHeaderRule(this.ctx, ruleData); }
    async updateHeaderRule(ruleId: string, updates: Partial<HeaderRule>): Promise<void> { return crudUpdateHeaderRule(this.ctx, ruleId, updates); }
    async updateHeaderRulesBatch(updates: Array<{ ruleId: string; changes: Partial<HeaderRule> }>): Promise<void> { return crudUpdateHeaderRulesBatch(this.ctx, updates); }
    async removeHeaderRule(ruleId: string): Promise<void> { return crudRemoveHeaderRule(this.ctx, ruleId); }
    async addProxyRule(ruleData: ProxyRule): Promise<void> { return crudAddProxyRule(this.ctx, ruleData); }
    async removeProxyRule(ruleId: string): Promise<void> { return crudRemoveProxyRule(this.ctx, ruleId); }

    // ── Workspace CRUD (delegated) ────────────────────────────────

    async createWorkspace(workspace: Partial<Workspace> & { id: string; name: string; type: WorkspaceType }): Promise<Workspace> {
        return crudCreateWorkspace(this.ctx, workspace, (id) => this.switchWorkspace(id));
    }
    async updateWorkspace(workspaceId: string, updates: Partial<Workspace>): Promise<boolean> { return crudUpdateWorkspace(this.ctx, workspaceId, updates); }
    async deleteWorkspace(workspaceId: string): Promise<boolean> {
        return crudDeleteWorkspace(this.ctx, workspaceId, (id) => this.switchWorkspace(id));
    }
    async syncWorkspace(workspaceId: string): Promise<{ success: boolean; error?: string }> {
        return crudSyncWorkspace(this.ctx, workspaceId, (id, s) => this.updateSyncStatus(id, s));
    }
    async copyWorkspaceData(sourceWorkspaceId: string, targetWorkspaceId: string): Promise<void> { return crudCopyWorkspaceData(this.ctx, sourceWorkspaceId, targetWorkspaceId); }

    // ── Source dependency activation ──────────────────────────────

    async activateReadySources(): Promise<number> {
        const result = evaluateActivations(this.state.sources, this.envResolver);
        if (result.hasChanges) {
            this.state.sources = result.sources;
            this.dirty.sources = true;
            this.scheduleDebouncedSave();
            sendPatchToRenderers(this.state, ['sources']);
        }
        if (result.activated > 0) log.info(`Activated ${result.activated} sources after dependency resolution`);
        return result.activated;
    }

    // ── Workspace metadata ────────────────────────────────────────

    private updateWorkspaceMetadataInMemory(workspaceId: string, metadata: Partial<WorkspaceMetadata>): void {
        this.state.workspaces = this.state.workspaces.map(w =>
            w.id === workspaceId ? { ...w, metadata: { ...w.metadata, ...metadata }, updatedAt: new Date().toISOString() } : w
        );
        this.dirty.workspaces = true;
    }

    // ── Sync status ──────────────────────────────────────────────

    updateSyncStatus(workspaceId: string, status: Partial<WorkspaceSyncStatus>): void {
        this.state.syncStatus = { ...this.state.syncStatus, [workspaceId]: { ...this.state.syncStatus[workspaceId], ...status } };
        this.dirty.workspaces = true;
        sendPatchToRenderers(this.state, ['syncStatus']);
    }

    async onSyncDataChanged(workspaceId: string): Promise<void> {
        if (workspaceId === this.state.activeWorkspaceId) {
            log.info('Reloading workspace data after sync');
            await this.loadEnvironmentData(workspaceId);
            this.applyActiveEnvVarsToServices();
            await this.loadWorkspaceData(workspaceId);
            sendPatchToRenderers(this.state, ['sources', 'rules', 'proxyRules', 'environments', 'activeEnvironment']);
        }
    }

    /**
     * Called by CliSetupHandler after it tests the git connection and syncs
     * the repository. Reuses crudCreateWorkspace for workspace entry creation,
     * imports synced data to disk, then switchWorkspace handles the rest.
     */
    async onCliWorkspaceCreated(params: {
        workspaceId: string;
        workspaceConfig: Partial<Workspace> & { name: string; type: WorkspaceType };
        syncData: SyncData | null;
    }): Promise<void> {
        const { workspaceId, workspaceConfig, syncData } = params;
        log.info(`CLI workspace created: ${workspaceId}`);

        // 1. Create workspace entry via crudCreateWorkspace. Pass a no-op switch
        //    callback — we'll do the actual switch after importing synced data.
        await crudCreateWorkspace(this.ctx, { ...workspaceConfig, id: workspaceId }, async () => {});

        // 2. Import synced data (sources, rules, proxy rules, environments) to disk
        //    BEFORE switching, so loadWorkspaceData reads populated files.
        if (syncData && this.syncScheduler) {
            await this.syncScheduler.importSyncedData(workspaceId, syncData, { broadcastToExtensions: false });
        }

        // 3. Delegate switch lifecycle: teardown → load env vars → load data →
        //    start sync scheduler → broadcast. skipInitialSync because we just synced.
        await this.switchWorkspace(workspaceId, { skipInitialSync: true });
        log.info(`CLI workspace ${workspaceId} fully activated`);
    }

    // ── Environment CRUD ──────────────────────────────────────────

    getEnvironmentState(): { environments: EnvironmentMap; activeEnvironment: string } {
        return { environments: this.state.environments, activeEnvironment: this.state.activeEnvironment };
    }

    async createEnvironment(name: string): Promise<void> {
        if (this.state.environments[name]) {
            throw new Error(`Environment '${name}' already exists`);
        }
        this.state.environments = { ...this.state.environments, [name]: {} };
        this.dirty.environments = true;
        await this.saveEnvironments();
        sendPatchToRenderers(this.state, ['environments']);
        log.info(`Created environment: ${name}`);
    }

    async deleteEnvironment(name: string): Promise<void> {
        if (name === 'Default') {
            throw new Error('Cannot delete Default environment');
        }
        if (!this.state.environments[name]) {
            throw new Error(`Environment '${name}' does not exist`);
        }
        const { [name]: _deleted, ...remaining } = this.state.environments;
        this.state.environments = remaining;
        this.dirty.environments = true;

        const wasActive = this.state.activeEnvironment === name;
        if (wasActive) {
            this.state.activeEnvironment = 'Default';
        }

        await this.saveEnvironments();
        sendPatchToRenderers(this.state, ['environments', 'activeEnvironment']);

        if (wasActive) {
            const activeVars = this.state.environments['Default'] ?? {};
            await this.onEnvironmentVariablesChanged(activeVars);
        }
        log.info(`Deleted environment: ${name}`);
    }

    async switchEnvironment(name: string): Promise<void> {
        if (!this.state.environments[name]) {
            throw new Error(`Environment '${name}' does not exist`);
        }
        if (this.state.activeEnvironment === name) return;

        log.info(`Switching environment: ${this.state.activeEnvironment} → ${name}`);
        this.state.activeEnvironment = name;
        this.dirty.environments = true;
        await this.saveEnvironments();
        sendPatchToRenderers(this.state, ['activeEnvironment']);

        const activeVars = this.state.environments[name] ?? {};
        await this.onEnvironmentVariablesChanged(activeVars);
    }

    async setVariable(name: string, value: string | null, environment: string, isSecret: boolean): Promise<void> {
        if (!this.state.environments[environment]) {
            throw new Error(`Environment '${environment}' does not exist`);
        }

        const envCopy = { ...this.state.environments[environment] };
        if (value === null || value === '') {
            delete envCopy[name];
        } else {
            envCopy[name] = { value, isSecret, updatedAt: new Date().toISOString() };
        }
        this.state.environments = { ...this.state.environments, [environment]: envCopy };
        this.dirty.environments = true;
        await this.saveEnvironments();
        sendPatchToRenderers(this.state, ['environments']);

        if (environment === this.state.activeEnvironment) {
            await this.onEnvironmentVariablesChanged(this.state.environments[environment]);
        }
    }

    async batchSetVariables(environment: string, variables: Array<{ name: string; value: string | null; isSecret?: boolean }>): Promise<void> {
        if (!this.state.environments[environment]) {
            throw new Error(`Environment '${environment}' does not exist`);
        }

        const envCopy = { ...this.state.environments[environment] };
        for (const { name, value, isSecret } of variables) {
            if (value === null || value === '') {
                delete envCopy[name];
            } else {
                envCopy[name] = { value, isSecret: isSecret ?? false, updatedAt: new Date().toISOString() };
            }
        }
        this.state.environments = { ...this.state.environments, [environment]: envCopy };
        this.dirty.environments = true;
        await this.saveEnvironments();
        sendPatchToRenderers(this.state, ['environments']);

        if (environment === this.state.activeEnvironment) {
            await this.onEnvironmentVariablesChanged(this.state.environments[environment]);
        }
    }

    /**
     * Merge imported environment data into the active workspace's state.
     * Creates missing environments and merges variables into existing ones.
     * Persists to disk, broadcasts to renderer, and triggers source re-evaluation.
     *
     * This is the proper entry point for CLI environment imports — the state
     * owner handles the merge, persistence, and all downstream effects.
     */
    async importEnvironments(incoming: Record<string, Record<string, { value: string; isSecret: boolean }>>): Promise<void> {
        const merged = { ...this.state.environments };
        for (const [envName, variables] of Object.entries(incoming)) {
            if (!merged[envName]) {
                merged[envName] = {};
            }
            Object.assign(merged[envName], variables);
        }
        this.state.environments = merged;
        this.dirty.environments = true;
        await this.saveEnvironments();
        sendPatchToRenderers(this.state, ['environments']);

        // Re-evaluate source dependencies with the updated active environment vars
        const activeVars = this.state.environments[this.state.activeEnvironment] ?? {};
        await this.onEnvironmentVariablesChanged(activeVars);
    }

    // ── Environment variable changes ────────────────────────────

    /**
     * Called when environment variables change (switch environment, edit values, import).
     *
     * Three-tier refresh strategy:
     *  1. Sources with NO env var references → untouched (timers preserved)
     *  2. Sources with env var references but identical resolved values → untouched
     *  3. Sources with env var references whose values changed → re-fetch immediately
     *
     * This runs in the main process so it works even without a renderer window.
     */
    async onEnvironmentVariablesChanged(variables: Record<string, string | { value: string }>): Promise<void> {
        const resolved = this.normalizeEnvVariables(variables);
        const previousVars = this.envResolver?.loadEnvironmentVariables() ?? {};

        log.info(`Environment variables changed, ${Object.keys(resolved).length} variables`);

        this.applyEnvVariablesToServices(resolved);

        const changedVarNames = this.diffVariables(previousVars, resolved);
        log.info(`${changedVarNames.size} variable(s) actually changed: ${Array.from(changedVarNames).join(', ')}`);

        const previousSources = this.state.sources;
        this.state.sources = evaluateAllSourceDependencies(this.state.sources, this.envResolver);

        const { newlyActivated, affectedExisting } = this.categorizeSourcesByEnvImpact(
            previousSources, this.state.sources, changedVarNames
        );

        this.resetAffectedCircuitBreakers([...newlyActivated, ...affectedExisting]);
        broadcastToServices(this.state, this.webSocketService, this.proxyService);
        this.notifyRendererOfActivationChanges(previousSources);
        this.registerNewlyActivatedSources(newlyActivated);
        this.refreshAffectedSources(affectedExisting);
    }

    // ── Environment change helpers ───────────────────────────────

    private normalizeEnvVariables(variables: Record<string, string | { value: string }>): Record<string, string> {
        const resolved: Record<string, string> = {};
        for (const [key, val] of Object.entries(variables)) {
            resolved[key] = typeof val === 'object' && val !== null ? val.value : String(val);
        }
        return resolved;
    }

    private applyEnvVariablesToServices(resolved: Record<string, string>): void {
        if (this.envResolver) {
            this.envResolver.setVariables(resolved);
        }
        if (this.proxyService) {
            this.proxyService.updateEnvironmentVariables(resolved);
        }
    }

    private diffVariables(previous: Record<string, string>, current: Record<string, string>): Set<string> {
        const changed = new Set<string>();
        const allKeys = new Set([...Object.keys(previous), ...Object.keys(current)]);
        for (const key of allKeys) {
            if (previous[key] !== current[key]) {
                changed.add(key);
            }
        }
        return changed;
    }

    private categorizeSourcesByEnvImpact(
        previousSources: Source[],
        currentSources: Source[],
        changedVarNames: Set<string>
    ): { newlyActivated: Source[]; affectedExisting: Source[] } {
        const newlyActivated: Source[] = [];
        const affectedExisting: Source[] = [];

        for (let i = 0; i < currentSources.length; i++) {
            const prev = previousSources[i];
            const curr = currentSources[i];
            if (!prev || !curr) continue;

            if (prev.activationState === 'waiting_for_deps' && curr.activationState === 'active') {
                newlyActivated.push(curr);
            } else if (
                curr.sourceType === 'http' &&
                curr.activationState === 'active' &&
                curr.sourceContent !== null &&
                curr.sourceContent !== undefined
            ) {
                const referencedVars = extractVariablesFromSource(curr);
                if (referencedVars.length > 0 && referencedVars.some(v => changedVarNames.has(v))) {
                    affectedExisting.push(curr);
                }
            }
        }

        return { newlyActivated, affectedExisting };
    }

    private resetAffectedCircuitBreakers(sources: Source[]): void {
        if (!this.sourceRefreshService || sources.length === 0) return;
        for (const source of sources) {
            this.sourceRefreshService.resetCircuitBreaker(source.sourceId);
        }
    }

    private notifyRendererOfActivationChanges(previousSources: Source[]): void {
        const hasChanges = previousSources.some(
            (prev, i) => prev.activationState !== this.state.sources[i]?.activationState
        );
        if (hasChanges) {
            this.dirty.sources = true;
            this.scheduleDebouncedSave();
            sendPatchToRenderers(this.state, ['sources']);
        }
    }

    private registerNewlyActivatedSources(sources: Source[]): void {
        if (!this.sourceRefreshService || sources.length === 0) return;
        log.info(`${sources.length} source(s) activated after environment change`);
        for (const source of sources) {
            this.sourceRefreshService.updateSource(source).catch(e =>
                log.warn(`Failed to register newly-activated source ${source.sourceId}:`, errorMessage(e))
            );
        }
    }

    private refreshAffectedSources(sources: Source[]): void {
        if (!this.sourceRefreshService) return;
        if (sources.length === 0) {
            log.info('No active sources affected by env var change — all timers preserved');
            return;
        }
        log.info(`${sources.length} source(s) affected by env var change, triggering re-fetch`);
        for (const source of sources) {
            this.sourceRefreshService.manualRefresh(source.sourceId).catch(e =>
                log.warn(`Failed to refresh source ${source.sourceId} after env change:`, errorMessage(e))
            );
        }
    }

    // ── Shutdown ──────────────────────────────────────────────────

    async stop(): Promise<void> {
        log.info('Shutting down WorkspaceStateService');
        if (this.autoSaveTimer) { clearInterval(this.autoSaveTimer); this.autoSaveTimer = null; }
        if (this.debounceSaveTimer) { clearTimeout(this.debounceSaveTimer); this.debounceSaveTimer = null; }
        await this.saveAll();
        log.info('WorkspaceStateService shut down');
    }
}

// Singleton
const workspaceStateService = new WorkspaceStateService();
export { WorkspaceStateService };
export default workspaceStateService;
