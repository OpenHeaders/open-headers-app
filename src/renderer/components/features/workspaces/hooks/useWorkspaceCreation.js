/**
 * Centralized hook for workspace creation using state machine
 * Provides clean separation of concerns and atomic operations
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { App } from 'antd';
import WorkspaceCreationController from '../controllers/WorkspaceCreationController.js';
import { WORKSPACE_CREATION_STATES } from '../state/WorkspaceCreationStateMachine.js';

const { createLogger } = require('../../../../utils/error-handling/logger');
const log = createLogger('useWorkspaceCreation');

/**
 * Hook for managing workspace creation with state machine
 * @param {Object} dependencies - Required services and contexts
 * @param {Object} options - Optional configuration
 * @param {boolean} options.disableNotifications - Disable automatic success/error notifications
 * @returns {Object} Workspace creation state and actions
 */
export const useWorkspaceCreation = (dependencies, options = {}) => {
    const { message } = App.useApp();
    const controllerRef = useRef(null);
    const [state, setState] = useState(WORKSPACE_CREATION_STATES.IDLE);
    const [context, setContext] = useState({});
    const [progress, setProgress] = useState(null);
    const [error, setError] = useState(null);

    // Initialize controller
    useEffect(() => {
        if (!controllerRef.current) {
            controllerRef.current = new WorkspaceCreationController(dependencies);
            
            // Listen to state changes
            const unsubscribe = controllerRef.current.addListener((stateData) => {
                setState(stateData.state);
                setContext(stateData.context);
                setError(stateData.context.error);
                
                // Update progress based on state
                setProgress(getProgressFromState(stateData.state));
                
                // Handle UI notifications (if not disabled)
                if (!options.disableNotifications) {
                    handleStateNotifications(stateData, message);
                }
            });
            
            return () => {
                unsubscribe();
                controllerRef.current?.reset();
            };
        }
    }, [dependencies, message, options.disableNotifications]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (controllerRef.current) {
                controllerRef.current.reset();
            }
        };
    }, []);

    /**
     * Creates a new workspace
     * @param {Object} formData - Form data for workspace creation
     * @param {Object} options - Additional options
     * @returns {Promise<boolean>} Success status
     */
    const createWorkspace = useCallback(async (formData, options = {}) => {
        if (!controllerRef.current) {
            throw new Error('Controller not initialized');
        }

        try {
            await controllerRef.current.create(formData, options);
            return true;
        } catch (error) {
            log.error('Workspace creation failed:', error);
            return false;
        }
    }, []);

    /**
     * Aborts the current workspace creation process
     */
    const abortCreation = useCallback(() => {
        if (controllerRef.current) {
            controllerRef.current.abort();
        }
    }, []);

    /**
     * Resets the workspace creation state
     */
    const resetCreation = useCallback(() => {
        if (controllerRef.current) {
            controllerRef.current.reset();
        }
        setError(null);
        setProgress(null);
    }, []);

    /**
     * Retries the workspace creation with the same form data
     */
    const retryCreation = useCallback(async () => {
        if (!controllerRef.current || !context.formData) {
            return false;
        }

        try {
            await controllerRef.current.create(context.formData);
            return true;
        } catch (error) {
            log.error('Workspace creation retry failed:', error);
            return false;
        }
    }, [context.formData]);

    // Generate user-friendly progress message
    const getProgressMessage = useCallback((currentState) => {
        switch (currentState) {
            case WORKSPACE_CREATION_STATES.VALIDATING:
                return 'Validating workspace configuration...';
            case WORKSPACE_CREATION_STATES.FORM_VALIDATION:
                return 'Validating form data...';
            case WORKSPACE_CREATION_STATES.GIT_STATUS_CHECK:
                return 'Checking Git installation...';
            case WORKSPACE_CREATION_STATES.GIT_INSTALLATION:
                return 'Installing Git (this may take a moment)...';
            case WORKSPACE_CREATION_STATES.CONNECTION_TEST:
                return 'Testing repository connection...';
            case WORKSPACE_CREATION_STATES.WORKSPACE_CREATION:
                return 'Creating workspace...';
            case WORKSPACE_CREATION_STATES.INITIAL_COMMIT:
                return 'Committing initial configuration...';
            case WORKSPACE_CREATION_STATES.SYNC_INITIALIZATION:
                return 'Initializing workspace sync...';
            case WORKSPACE_CREATION_STATES.SYNC_IN_PROGRESS:
                return 'Syncing workspace data...';
            case WORKSPACE_CREATION_STATES.WORKSPACE_ACTIVATION:
                return 'Activating workspace...';
            case WORKSPACE_CREATION_STATES.ROLLBACK:
                return 'Rolling back changes...';
            case WORKSPACE_CREATION_STATES.RETRYING:
                return 'Retrying operation...';
            case WORKSPACE_CREATION_STATES.TIMEOUT:
                return 'Operation timed out';
            case WORKSPACE_CREATION_STATES.CANCELLING:
                return 'Cancelling operation...';
            case WORKSPACE_CREATION_STATES.CANCELLED:
                return 'Operation cancelled';
            case WORKSPACE_CREATION_STATES.COMPLETED:
                return 'Workspace created successfully!';
            case WORKSPACE_CREATION_STATES.ERROR:
                return 'An error occurred';
            default:
                return 'Processing...';
        }
    }, []);
    
    // Computed state
    const isIdle = state === WORKSPACE_CREATION_STATES.IDLE;
    const isLoading = ![
        WORKSPACE_CREATION_STATES.IDLE,
        WORKSPACE_CREATION_STATES.COMPLETED,
        WORKSPACE_CREATION_STATES.ERROR,
        WORKSPACE_CREATION_STATES.CANCELLED,
        WORKSPACE_CREATION_STATES.TIMEOUT
    ].includes(state);
    const isCompleted = state === WORKSPACE_CREATION_STATES.COMPLETED;
    const isError = state === WORKSPACE_CREATION_STATES.ERROR;
    const canRetry = (isError || state === WORKSPACE_CREATION_STATES.TIMEOUT) && context.formData;
    const canAbort = isLoading && [
        WORKSPACE_CREATION_STATES.ROLLBACK,
        WORKSPACE_CREATION_STATES.CANCELLING,
        WORKSPACE_CREATION_STATES.CANCELLED
    ].includes(state) === false;
    const progressMessage = getProgressMessage(state);

    return {
        // State
        state,
        context,
        progress,
        progressMessage,
        error,
        
        // Computed state
        isIdle,
        isLoading,
        isCompleted,
        isError,
        canRetry,
        canAbort,
        
        // Actions
        createWorkspace,
        abortCreation,
        resetCreation,
        retryCreation,
        
        // Workspace info
        workspaceId: context.workspaceId,
        formData: context.formData
    };
};

/**
 * Maps state to progress information
 * @param {string} state - Current state
 * @returns {Object} Progress information
 */
function getProgressFromState(state) {
    const progressMap = {
        [WORKSPACE_CREATION_STATES.FORM_VALIDATION]: {
            step: 1,
            total: 7,
            title: 'Validating form data',
            description: 'Checking required fields and format'
        },
        [WORKSPACE_CREATION_STATES.GIT_STATUS_CHECK]: {
            step: 2,
            total: 7,
            title: 'Checking Git installation',
            description: 'Verifying Git is available'
        },
        [WORKSPACE_CREATION_STATES.GIT_INSTALLATION]: {
            step: 2,
            total: 7,
            title: 'Installing Git',
            description: 'Setting up Git environment'
        },
        [WORKSPACE_CREATION_STATES.CONNECTION_TEST]: {
            step: 3,
            total: 7,
            title: 'Testing Git connection',
            description: 'Verifying repository access'
        },
        [WORKSPACE_CREATION_STATES.WORKSPACE_CREATION]: {
            step: 4,
            total: 7,
            title: 'Creating workspace',
            description: 'Setting up workspace structure'
        },
        [WORKSPACE_CREATION_STATES.INITIAL_COMMIT]: {
            step: 5,
            total: 7,
            title: 'Committing configuration',
            description: 'Saving initial configuration to repository'
        },
        [WORKSPACE_CREATION_STATES.SYNC_INITIALIZATION]: {
            step: 6,
            total: 7,
            title: 'Initializing sync',
            description: 'Preparing Git synchronization'
        },
        [WORKSPACE_CREATION_STATES.SYNC_IN_PROGRESS]: {
            step: 6,
            total: 7,
            title: 'Syncing data',
            description: 'Downloading configuration from repository'
        },
        [WORKSPACE_CREATION_STATES.WORKSPACE_ACTIVATION]: {
            step: 7,
            total: 7,
            title: 'Activating workspace',
            description: 'Finalizing workspace setup'
        },
        [WORKSPACE_CREATION_STATES.ROLLBACK]: {
            step: 0,
            total: 7,
            title: 'Rolling back changes',
            description: 'Cleaning up partial changes'
        }
    };

    return progressMap[state] || null;
}

/**
 * Handles state-based UI notifications
 * @param {Object} stateData - State data from state machine
 * @param {Object} message - Ant Design message API
 */
function handleStateNotifications(stateData, message) {
    const { state, context } = stateData;

    switch (state) {
        case WORKSPACE_CREATION_STATES.COMPLETED:
            message.destroy('workspace-sync');
            message.success({
                content: `Workspace "${context.formData?.name}" created successfully!`,
                duration: 4
            });
            break;

        case WORKSPACE_CREATION_STATES.ERROR:
            if (context.error) {
                message.error({
                    content: `Failed to create workspace: ${context.error.message}`,
                    duration: 6
                });
            }
            break;

        case WORKSPACE_CREATION_STATES.ROLLBACK:
            message.warning({
                content: 'Rolling back changes due to error...',
                duration: 3
            });
            break;

        case WORKSPACE_CREATION_STATES.SYNC_IN_PROGRESS:
            message.loading({
                content: 'Syncing workspace data from Git repository...',
                key: 'workspace-sync',
                duration: 0
            });
            break;

        case WORKSPACE_CREATION_STATES.WORKSPACE_ACTIVATION:
            message.destroy('workspace-sync');
            break;
    }
}