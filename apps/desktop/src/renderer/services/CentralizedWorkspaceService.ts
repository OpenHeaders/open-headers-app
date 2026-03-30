/**
 * CentralizedWorkspaceService — thin IPC client.
 *
 * All state management, persistence, auto-save, and broadcasting now live in
 * the main process (WorkspaceStateService). This renderer-side service:
 *  - Hydrates from main on init via IPC
 *  - Receives incremental state patches via IPC events
 *  - Forwards all mutations to main via IPC invokes
 *  - Exposes subscribe/notify for React hooks (same API as before)
 */

import type { HeaderRule, RulesCollection, Source, SourceUpdate } from '@openheaders/core';
import { createLogger } from '@/renderer/utils/error-handling/logger';
import type { ProxyRule } from '@/types/proxy';
import type { Workspace, WorkspaceSyncStatus, WorkspaceType } from '@/types/workspace';

const log = createLogger('CentralizedWorkspaceService');

export interface WorkspaceServiceState {
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

type StateListener = (state: WorkspaceServiceState, changedKeys: string[]) => void;

class CentralizedWorkspaceService {
  state: WorkspaceServiceState;
  private listeners: Set<StateListener> = new Set();
  private initPromise: Promise<boolean> | null = null;
  private patchCleanup: (() => void) | null = null;

  constructor() {
    this.state = {
      initialized: false,
      loading: true,
      error: null,
      workspaces: [],
      activeWorkspaceId: 'default-personal',
      isWorkspaceSwitching: false,
      syncStatus: {},
      sources: [],
      rules: { header: [], request: [], response: [] },
      proxyRules: [],
    };

    // Subscribe to state patches from main process
    if (window.electronAPI?.workspaceState) {
      this.patchCleanup = window.electronAPI.workspaceState.onStatePatch((patch) => {
        const changedKeys: string[] = [];
        for (const [key, value] of Object.entries(patch)) {
          if (key in this.state) {
            Object.assign(this.state, { [key]: value });
            changedKeys.push(key);
          }
        }
        if (changedKeys.length > 0) {
          this.notifyListeners(changedKeys);
        }
      });
    }

    log.info('CentralizedWorkspaceService initialized (IPC client)');
  }

  // ── State management ──────────────────────────────────────────

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState(), []);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(changedKeys: string[] = []): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state, changedKeys);
      } catch (e) {
        log.error('Listener error:', e);
      }
    }
  }

  getState(): WorkspaceServiceState {
    return { ...this.state };
  }

  /**
   * setState is kept for backward compat with hooks that set state directly
   * (e.g. useSources.importSources, useWorkspaces.syncWorkspace status updates).
   * These callers will be migrated to IPC calls — for now, apply locally + notify.
   */
  setState(updates: Partial<WorkspaceServiceState>, changedKeys: string[] = []): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners(changedKeys);
  }

  // ── Initialization (hydrate from main) ──────────────────────

  async initialize(): Promise<boolean> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<boolean> {
    try {
      if (!window.electronAPI?.workspaceState) {
        throw new Error('workspaceState API not available');
      }

      const result = await window.electronAPI.workspaceState.initialize();
      if (result.state) {
        const changedKeys: string[] = [];
        for (const [key, value] of Object.entries(result.state)) {
          if (key in this.state) {
            Object.assign(this.state, { [key]: value });
            changedKeys.push(key);
          }
        }
        this.notifyListeners(changedKeys);
      }

      log.info('Hydrated from main process');
      return result.success;
    } catch (error) {
      log.error('Failed to hydrate from main:', error);
      this.state.error = error instanceof Error ? error.message : String(error);
      this.state.loading = false;
      this.notifyListeners(['error', 'loading']);
      throw error;
    }
  }

  isReady(): boolean {
    return this.state.initialized && !this.state.loading;
  }

  async waitForReady(timeout = 10000): Promise<boolean> {
    const start = Date.now();
    while (!this.isReady()) {
      if (Date.now() - start > timeout) throw new Error('Timeout waiting for workspace service');
      if (!this.state.loading && !this.initPromise) await this.initialize();
      await new Promise((r) => setTimeout(r, 100));
    }
    return true;
  }

  // ── Source CRUD (IPC forwards) ──────────────────────────────

  async addSource(sourceData: Source): Promise<Source> {
    const result = await window.electronAPI.workspaceState.addSource(sourceData);
    if (!result.success) throw new Error(result.error ?? 'Failed to add source');
    return result.source!;
  }

  async updateSource(sourceId: string, updates: SourceUpdate): Promise<Source | null> {
    const result = await window.electronAPI.workspaceState.updateSource(sourceId, updates);
    if (!result.success) throw new Error(result.error ?? 'Failed to update source');
    return result.source ?? null;
  }

  async removeSource(sourceId: string): Promise<void> {
    const result = await window.electronAPI.workspaceState.removeSource(sourceId);
    if (!result.success) throw new Error(result.error ?? 'Failed to remove source');
  }

  async updateSourceContent(sourceId: string, content: string): Promise<void> {
    const result = await window.electronAPI.workspaceState.updateSourceContent(sourceId, content);
    if (!result.success) throw new Error(result.error ?? 'Failed to update source content');
  }

  async refreshSource(sourceId: string): Promise<boolean> {
    const result = await window.electronAPI.workspaceState.refreshSource(sourceId);
    return result.success;
  }

  async importSources(sources: Source[], replace = false): Promise<void> {
    const result = await window.electronAPI.workspaceState.importSources(sources, replace);
    if (!result.success) throw new Error(result.error ?? 'Failed to import sources');
  }

  // ── Header Rule CRUD (IPC forwards) ────────────────────────

  async addHeaderRule(ruleData: Partial<HeaderRule>): Promise<void> {
    const result = await window.electronAPI.workspaceState.addHeaderRule(ruleData);
    if (!result.success) throw new Error(result.error ?? 'Failed to add header rule');
  }

  async updateHeaderRule(ruleId: string, updates: Partial<HeaderRule>): Promise<void> {
    const result = await window.electronAPI.workspaceState.updateHeaderRule(ruleId, updates);
    if (!result.success) throw new Error(result.error ?? 'Failed to update header rule');
  }

  async removeHeaderRule(ruleId: string): Promise<void> {
    const result = await window.electronAPI.workspaceState.removeHeaderRule(ruleId);
    if (!result.success) throw new Error(result.error ?? 'Failed to remove header rule');
  }

  // ── Proxy Rule CRUD (IPC forwards) ─────────────────────────

  async addProxyRule(ruleData: ProxyRule): Promise<void> {
    const result = await window.electronAPI.workspaceState.addProxyRule(ruleData);
    if (!result.success) throw new Error(result.error ?? 'Failed to add proxy rule');
  }

  async removeProxyRule(ruleId: string): Promise<void> {
    const result = await window.electronAPI.workspaceState.removeProxyRule(ruleId);
    if (!result.success) throw new Error(result.error ?? 'Failed to remove proxy rule');
  }

  // ── Workspace CRUD (IPC forwards) ──────────────────────────

  async createWorkspace(
    workspace: Partial<Workspace> & { id: string; name: string; type: WorkspaceType },
  ): Promise<Workspace> {
    const result = await window.electronAPI.workspaceState.createWorkspace(workspace);
    if (!result.success) throw new Error(result.error ?? 'Failed to create workspace');
    return result.workspace!;
  }

  async switchWorkspace(workspaceId: string): Promise<void> {
    const result = await window.electronAPI.workspaceState.switchWorkspace(workspaceId);
    if (!result.success) throw new Error(result.error ?? 'Failed to switch workspace');
  }

  async updateWorkspace(workspaceId: string, updates: Partial<Workspace>): Promise<boolean> {
    const result = await window.electronAPI.workspaceState.updateWorkspace(workspaceId, updates);
    if (!result.success) throw new Error(result.error ?? 'Failed to update workspace');
    return true;
  }

  async deleteWorkspace(workspaceId: string): Promise<boolean> {
    const result = await window.electronAPI.workspaceState.deleteWorkspace(workspaceId);
    if (!result.success) throw new Error(result.error ?? 'Failed to delete workspace');
    return true;
  }

  async syncWorkspace(workspaceId: string): Promise<boolean> {
    const result = await window.electronAPI.workspaceState.syncWorkspace(workspaceId);
    return result.success;
  }

  // ── Workspace data operations (IPC forwards) ───────────────

  async loadWorkspaceData(_workspaceId: string): Promise<void> {
    // Main process handles this — just re-hydrate state
    const state = await window.electronAPI.workspaceState.getState();
    const changedKeys: string[] = [];
    for (const [key, value] of Object.entries(state)) {
      if (key in this.state) {
        Object.assign(this.state, { [key]: value });
        changedKeys.push(key);
      }
    }
    this.notifyListeners(changedKeys);
  }

  async initializeWorkspaceData(_workspaceId: string): Promise<void> {
    // Main process handles workspace data initialization during createWorkspace
  }

  async saveWorkspaces(): Promise<void> {
    // Main process handles persistence — no-op in renderer
  }

  async copyWorkspaceData(sourceWorkspaceId: string, targetWorkspaceId: string): Promise<void> {
    const result = await window.electronAPI.workspaceState.copyWorkspaceData(sourceWorkspaceId, targetWorkspaceId);
    if (!result.success) throw new Error(result.error ?? 'Failed to copy workspace data');
  }

  // ── Cleanup ────────────────────────────────────────────────

  cleanup(): void {
    if (this.patchCleanup) {
      this.patchCleanup();
      this.patchCleanup = null;
    }
    this.listeners.clear();
  }
}

// Singleton
let serviceInstance: CentralizedWorkspaceService | null = null;

export function getCentralizedWorkspaceService(): CentralizedWorkspaceService {
  if (!serviceInstance) {
    serviceInstance = new CentralizedWorkspaceService();
  }
  return serviceInstance;
}

export { CentralizedWorkspaceService };
export default CentralizedWorkspaceService;
