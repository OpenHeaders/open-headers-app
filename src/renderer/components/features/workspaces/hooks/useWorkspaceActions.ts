import { useWorkspaceCreation } from './useWorkspaceCreation';
import { useWorkspaceOperations } from './workspace';
import { useSyncOperations } from './sync';
import { useGitActions } from './git';
import { WorkspaceServiceAdapterFactory } from '../services/WorkspaceServiceAdapter';
import type { WorkspaceContextType } from '../services/WorkspaceServiceAdapter';
import { useMemo } from 'react';
import type { WorkspaceCreationDependencies } from '../controllers/WorkspaceCreationController';

/**
 * Main orchestrator hook for workspace actions
 *
 * Now uses the new state machine architecture for workspace creation
 * while maintaining backward compatibility for other operations.
 */
export const useWorkspaceActions = (workspaceContext: WorkspaceContextType) => {
    // Create service adapters for new architecture (using singleton pattern)
    const services = useMemo(() => {
        return WorkspaceServiceAdapterFactory.create({
            workspaceContext
        });
    }, [workspaceContext]);

    // Use new workspace creation hook
    const workspaceCreation = useWorkspaceCreation(services as WorkspaceCreationDependencies);

    // Keep existing hooks for backward compatibility
    const gitActions = useGitActions();
    const workspaceOps = useWorkspaceOperations(workspaceContext);
    const syncOps = useSyncOperations({
        syncWorkspace: workspaceContext.syncWorkspace!,
        switchWorkspace: workspaceContext.switchWorkspace!
    });

    /**
     * Enhanced save workspace that uses new state machine architecture
     */
    const handleSaveWorkspace = async (values: Record<string, unknown>, editingWorkspace: Record<string, unknown> | null) => {
        // Use new architecture for new workspaces
        if (!editingWorkspace) {
            return await workspaceCreation.createWorkspace(values);
        }

        // Use old architecture for editing existing workspaces
        const saveResult = await workspaceOps.handleSaveWorkspace(values, editingWorkspace);

        if (saveResult.success && saveResult.result) {
            const result = saveResult.result as { id?: string };
            const workspace = {
                ...values,
                id: result.id || Date.now().toString(),
                type: values.gitUrl ? 'git' : 'personal'
            };

            // Handle sync operations for updated workspaces
            if (workspace.type === 'git') {
                const syncListeners = syncOps.setupSyncListeners();
                await syncOps.handleWorkspaceSwitch(result, workspace, syncListeners);
            } else {
                await syncOps.handleWorkspaceSwitch(result, workspace, null);
            }
        }

        return saveResult.success;
    };

    // Combine all actions and state
    return {
        // New workspace creation state (preferred)
        creationState: workspaceCreation.state,
        creationProgress: workspaceCreation.progress,
        creationError: workspaceCreation.error,
        isCreating: workspaceCreation.isLoading,
        creationCompleted: workspaceCreation.isCompleted,
        canRetryCreation: workspaceCreation.canRetry,
        canAbortCreation: workspaceCreation.canAbort,

        // Git actions state (backward compatibility)
        gitStatus: gitActions.gitStatus,
        checkingGitStatus: gitActions.checkingGitStatus,
        installingGit: gitActions.installingGit,
        gitInstallProgress: gitActions.gitInstallProgress,
        testingConnection: gitActions.testingConnection,
        connectionTested: gitActions.connectionTested,
        connectionProgress: gitActions.connectionProgress,
        showProgressModal: gitActions.showProgressModal,

        // Workspace operations state
        loading: workspaceOps.loading,

        // Actions - new architecture
        createWorkspace: workspaceCreation.createWorkspace,
        abortCreation: workspaceCreation.abortCreation,
        resetCreation: workspaceCreation.resetCreation,
        retryCreation: workspaceCreation.retryCreation,

        // Actions - backward compatibility
        checkGitStatus: gitActions.checkGitStatus,
        handleInstallGit: gitActions.handleInstallGit,
        handleTestConnection: gitActions.handleTestConnection,
        resetConnectionTest: gitActions.resetConnectionTest,

        // Workspace operations
        handleSaveWorkspace,
        handleDeleteWorkspace: workspaceOps.handleDeleteWorkspace,
        handleCloneToPersonal: workspaceOps.handleCloneToPersonal,
        handleBrowseSSHKey: workspaceOps.handleBrowseSSHKey,

        // Sync operations
        handleSyncWorkspace: syncOps.handleSyncWorkspace,

        // Utilities
        setShowProgressModal: gitActions.setShowProgressModal
    };
};
