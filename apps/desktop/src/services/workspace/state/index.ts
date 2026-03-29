export type {
    WorkspaceState,
    WebSocketServiceLike,
    ProxyServiceLike,
    EnvironmentResolverLike,
    SourceRefreshServiceLike,
    WorkspaceSyncSchedulerLike,
    DirtyFlags,
    StateContext,
} from './types';

export {
    loadWorkspacesConfig,
    saveWorkspacesConfig,
    workspaceDir,
    loadSources,
    loadRules,
    loadProxyRules,
    loadEnvironments,
    saveSources,
    saveRules,
    saveProxyRules,
    saveEnvironments,
    saveAll,
} from './StatePersistence';
export type { WorkspacesConfig } from './StatePersistence';

export {
    evaluateSourceDependencies,
    extractVariablesFromSource,
    evaluateAllSourceDependencies,
    activateReadySources,
} from './SourceDependencyEvaluator';

export {
    broadcastToServices,
    syncToRefreshService,
    sendPatchToRenderers,
    sendProgressToRenderers,
} from './StateBroadcaster';

export {
    addSource,
    updateSource,
    removeSource,
    updateSourceFetchResult,
    importSources,
    refreshSource,
    addHeaderRule,
    updateHeaderRule,
    updateHeaderRulesBatch,
    removeHeaderRule,
    addProxyRule,
    removeProxyRule,
} from './SourceCrud';

export {
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    syncWorkspace,
    copyWorkspaceData,
} from './WorkspaceCrud';
