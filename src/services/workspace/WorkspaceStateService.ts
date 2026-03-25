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
import fs from 'fs';
import mainLogger from '../../utils/mainLogger';
import { errorMessage } from '../../types/common';
import type { Source, SourceUpdate } from '../../types/source';
import type { Workspace, WorkspaceMetadata, WorkspaceSyncStatus, WorkspaceType } from '../../types/workspace';
import type { HeaderRule } from '../../types/rules';
import type { ProxyRule } from '../../types/proxy';

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
    saveSources as persistSources,
    saveRules as persistRules,
    saveProxyRules as persistProxyRules,
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
    private dirty: DirtyFlags = { sources: false, rules: false, proxyRules: false, workspaces: false };
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
            sources: [], rules: { header: [], request: [], response: [] }, proxyRules: []
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

            await this.loadWorkspaceData(this.state.activeWorkspaceId);
            this.startAutoSave();

            this.state.initialized = true;
            this.state.loading = false;
            sendPatchToRenderers(this.state, ['initialized', 'loading', 'workspaces', 'activeWorkspaceId', 'syncStatus', 'sources', 'rules', 'proxyRules']);

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
            if (this.dirty.workspaces) saves.push(this.saveWorkspacesConfig());
            if (saves.length > 0) { await Promise.all(saves); log.debug(`Saved ${saves.length} data types`); }
        } catch (error) { log.error('Auto-save failed:', error); }
        finally { this.isSaving = false; }
    }

    // ── Auto-save ─────────────────────────────────────────────────

    private startAutoSave(): void {
        if (this.autoSaveTimer) return;
        this.autoSaveTimer = setInterval(() => {
            if ((this.dirty.sources || this.dirty.rules || this.dirty.proxyRules || this.dirty.workspaces) && !this.state.isWorkspaceSwitching) {
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

    async switchWorkspace(workspaceId: string): Promise<void> {
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
            await this.activateNewWorkspace(workspaceId, workspace.name, target);
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

    private async activateNewWorkspace(workspaceId: string, workspaceName: string, target: { id: string; name: string; type: string }): Promise<void> {
        sendProgressToRenderers('switching', 40, `Switching to "${workspaceName}"...`, false, target);

        this.state.activeWorkspaceId = workspaceId;
        this.dirty.workspaces = true;
        await this.saveWorkspacesConfig();

        if (this.proxyService) {
            await this.proxyService.switchWorkspace(workspaceId).catch(e => log.error('Proxy switch failed:', errorMessage(e)));
            await this.loadAndSetProxyEnvVars(workspaceId);
        }
        if (this.webSocketService) {
            this.webSocketService.sources = [];
            this.webSocketService.rules = { header: [], request: [], response: [] };
        }
        if (this.syncScheduler) {
            await this.syncScheduler.onWorkspaceSwitch(workspaceId).catch(e => log.warn('Sync scheduler switch failed:', errorMessage(e)));
        }
        if (this.sourceRefreshService) {
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
        sendPatchToRenderers(this.state, ['sources', 'rules', 'proxyRules', 'workspaces', 'activeWorkspaceId', 'loading', 'isWorkspaceSwitching']);
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
        sendPatchToRenderers(this.state, ['sources', 'rules', 'proxyRules', 'activeWorkspaceId', 'loading', 'isWorkspaceSwitching', 'error']);
    }

    private async loadAndSetProxyEnvVars(workspaceId: string): Promise<void> {
        try {
            const envPath = workspaceDir(this.appDataPath, workspaceId) + '/environments.json';
            const envData = await fs.promises.readFile(envPath, 'utf8');
            const { environments, activeEnvironment } = JSON.parse(envData);
            this.proxyService!.updateEnvironmentVariables(environments?.[activeEnvironment] ?? {});
        } catch (_e) {
            this.proxyService!.updateEnvironmentVariables({});
        }
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
            await this.loadWorkspaceData(workspaceId);
            if (this.proxyService) await this.loadAndSetProxyEnvVars(workspaceId);
            sendPatchToRenderers(this.state, ['sources', 'rules', 'proxyRules']);
        }
    }

    async onCliWorkspaceJoined(workspaceId: string): Promise<void> {
        log.info(`CLI workspace joined: ${workspaceId}`);
        await this.saveAll();
        const config = await loadWorkspacesConfig(this.appDataPath);
        this.state.workspaces = config.workspaces;
        this.state.activeWorkspaceId = config.activeWorkspaceId;
        this.state.syncStatus = config.syncStatus;
        await this.loadWorkspaceData(config.activeWorkspaceId);
        if (this.proxyService) await this.loadAndSetProxyEnvVars(config.activeWorkspaceId);
        sendPatchToRenderers(this.state, ['workspaces', 'activeWorkspaceId', 'syncStatus', 'sources', 'rules', 'proxyRules']);
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
