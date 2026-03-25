/**
 * EnvironmentStateManager - Manages environment state and listeners
 */
import { createLogger } from '../../utils/error-handling/logger';
import type { EnvironmentVariable } from '../../../types/environment';
const log = createLogger('EnvironmentStateManager');

export interface EnvironmentServiceState {
  currentWorkspaceId: string;
  environments: Record<string, Record<string, EnvironmentVariable>>;
  activeEnvironment: string;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
}

type StateListener = (state: EnvironmentServiceState, changedKeys: string[]) => void;

class EnvironmentStateManager {
  state: EnvironmentServiceState;
  private listeners: Set<StateListener> = new Set();
  initPromise: Promise<boolean> | null;
  loadPromises: Map<string, Promise<boolean>>;
  hasLoadedInitialData: boolean;

  constructor() {
    this.state = {
      currentWorkspaceId: 'default-personal',
      environments: { Default: {} },
      activeEnvironment: 'Default',
      isLoading: false,
      isReady: false,
      error: null
    };

    this.initPromise = null;
    this.loadPromises = new Map();
    this.hasLoadedInitialData = false;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState(), []);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(changedKeys: string[] = []): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try { listener(state, changedKeys); } catch (e) { log.error('Listener error:', e); }
    }
  }

  setState(updates: Partial<EnvironmentServiceState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners(Object.keys(updates));
  }

  getState(): EnvironmentServiceState {
    return {
      ...this.state,
      environments: { ...this.state.environments }
    };
  }

  isReady(): boolean {
    return this.state.isReady && !this.state.isLoading;
  }

  async waitForReady(timeout = 5000): Promise<boolean> {
    const startTime = Date.now();

    while (!this.state.isReady) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Timeout waiting for environment service to be ready');
      }

      if (!this.state.isLoading && !this.initPromise) {
        log.warn('Service not ready and not loading, initialization may be needed');
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return true;
  }

  setInitPromise(promise: Promise<boolean>): void {
    this.initPromise = promise;
  }

  getInitPromise(): Promise<boolean> | null {
    return this.initPromise;
  }

  setLoadPromise(workspaceId: string, promise: Promise<boolean>): void {
    this.loadPromises.set(workspaceId, promise);
  }

  getLoadPromise(workspaceId: string): Promise<boolean> | undefined {
    return this.loadPromises.get(workspaceId);
  }

  clearLoadPromise(workspaceId: string): void {
    this.loadPromises.delete(workspaceId);
  }

  isLoadingWorkspace(workspaceId: string): boolean {
    return this.loadPromises.has(workspaceId);
  }

  markInitialDataLoaded(): void {
    this.hasLoadedInitialData = true;
  }

  hasInitialData(): boolean {
    return this.hasLoadedInitialData;
  }

  cleanup(): void {
    this.listeners.clear();
  }
}

export default EnvironmentStateManager;
