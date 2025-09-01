/**
 * Comprehensive State Machine for Workspace Creation Flow
 * Handles all edge cases, errors, timeouts, cancellations, and retries
 */

export const WORKSPACE_CREATION_STATES = {
    IDLE: 'idle',
    VALIDATING: 'validating',
    FORM_VALIDATION: 'form_validation',
    GIT_STATUS_CHECK: 'git_status_check',
    GIT_INSTALLATION: 'git_installation',
    CONNECTION_TEST: 'connection_test',
    WORKSPACE_CREATION: 'workspace_creation',
    INITIAL_COMMIT: 'initial_commit',
    SYNC_INITIALIZATION: 'sync_initialization',
    SYNC_IN_PROGRESS: 'sync_in_progress',
    WORKSPACE_ACTIVATION: 'workspace_activation',
    COMPLETED: 'completed',
    ERROR: 'error',
    ROLLBACK: 'rollback',
    RETRYING: 'retrying',
    TIMEOUT: 'timeout',
    CANCELLING: 'cancelling',
    CANCELLED: 'cancelled'
};

export const WORKSPACE_CREATION_EVENTS = {
    START_CREATION: 'start_creation',
    VALIDATION_STARTED: 'validation_started',
    FORM_VALIDATED: 'form_validated',
    GIT_STATUS_CHECKED: 'git_status_checked',
    GIT_INSTALLATION_STARTED: 'git_installation_started',
    GIT_INSTALLED: 'git_installed',
    CONNECTION_TESTING_STARTED: 'connection_testing_started',
    CONNECTION_TESTED: 'connection_tested',
    WORKSPACE_CREATED: 'workspace_created',
    INITIAL_COMMIT_STARTED: 'initial_commit_started',
    INITIAL_COMMIT_COMPLETED: 'initial_commit_completed',
    SYNC_INITIALIZED: 'sync_initialized',
    SYNC_PROGRESS: 'sync_progress',
    SYNC_COMPLETED: 'sync_completed',
    WORKSPACE_ACTIVATED: 'workspace_activated',
    ERROR_OCCURRED: 'error_occurred',
    ROLLBACK_COMPLETED: 'rollback_completed',
    TIMEOUT_OCCURRED: 'timeout_occurred',
    CANCEL_REQUESTED: 'cancel_requested',
    ABORT_REQUESTED: 'abort_requested',
    RETRY_REQUESTED: 'retry_requested',
    RESET: 'reset'
};

class WorkspaceCreationStateMachine {
    constructor() {
        this.state = WORKSPACE_CREATION_STATES.IDLE;
        this.context = {
            formData: null,
            workspaceId: null,
            gitStatus: null,
            connectionResult: null,
            error: null,
            rollbackActions: [],
            retryCount: 0,
            maxRetries: 3,
            startTime: null,
            operationTimeouts: new Map(),
            syncProgress: null,
            abortRequested: false,
            cancelRequested: false
        };
        this.listeners = new Set();
        this.transitions = this.defineTransitions();
    }

    defineTransitions() {
        return {
            [WORKSPACE_CREATION_STATES.IDLE]: {
                [WORKSPACE_CREATION_EVENTS.START_CREATION]: {
                    target: WORKSPACE_CREATION_STATES.VALIDATING,
                    action: (context, event) => ({
                        ...context,
                        formData: event.payload.formData,
                        rollbackActions: [],
                        retryCount: 0,
                        startTime: new Date().toISOString(),
                        error: null,
                        abortRequested: false,
                        cancelRequested: false
                    }),
                    guard: (context) => !context.abortRequested && !context.cancelRequested
                },
                [WORKSPACE_CREATION_EVENTS.RESET]: {
                    target: WORKSPACE_CREATION_STATES.IDLE,
                    action: () => this.getInitialContext()
                },
                // Handle delayed events when already in idle state (no-op)
                [WORKSPACE_CREATION_EVENTS.SYNC_INITIALIZED]: {
                    target: WORKSPACE_CREATION_STATES.IDLE
                },
                [WORKSPACE_CREATION_EVENTS.ERROR_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.IDLE
                },
                [WORKSPACE_CREATION_EVENTS.ROLLBACK_COMPLETED]: {
                    target: WORKSPACE_CREATION_STATES.IDLE
                },
                [WORKSPACE_CREATION_EVENTS.TIMEOUT_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.IDLE
                },
                [WORKSPACE_CREATION_EVENTS.CANCEL_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.IDLE
                },
                [WORKSPACE_CREATION_EVENTS.ABORT_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.IDLE
                }
            },
            
            [WORKSPACE_CREATION_STATES.VALIDATING]: {
                [WORKSPACE_CREATION_EVENTS.VALIDATION_STARTED]: {
                    target: WORKSPACE_CREATION_STATES.FORM_VALIDATION
                },
                [WORKSPACE_CREATION_EVENTS.FORM_VALIDATED]: {
                    target: WORKSPACE_CREATION_STATES.GIT_STATUS_CHECK,
                    condition: (context, event) => event.payload.isTeamWorkspace,
                    fallback: WORKSPACE_CREATION_STATES.WORKSPACE_CREATION
                },
                [WORKSPACE_CREATION_EVENTS.ERROR_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.ERROR,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.TIMEOUT_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.TIMEOUT,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.CANCEL_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLING,
                    action: (context) => ({ ...context, cancelRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.ABORT_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLING,
                    action: (context) => ({ ...context, abortRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.RESET]: {
                    target: WORKSPACE_CREATION_STATES.IDLE,
                    action: () => this.getInitialContext()
                }
            },
            
            [WORKSPACE_CREATION_STATES.FORM_VALIDATION]: {
                [WORKSPACE_CREATION_EVENTS.FORM_VALIDATED]: {
                    target: WORKSPACE_CREATION_STATES.GIT_STATUS_CHECK,
                    condition: (context, event) => event.payload.isTeamWorkspace,
                    fallback: WORKSPACE_CREATION_STATES.WORKSPACE_CREATION
                },
                [WORKSPACE_CREATION_EVENTS.ERROR_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.ERROR,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.TIMEOUT_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.TIMEOUT,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.CANCEL_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLING,
                    action: (context) => ({ ...context, cancelRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.ABORT_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLING,
                    action: (context) => ({ ...context, abortRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.RESET]: {
                    target: WORKSPACE_CREATION_STATES.IDLE,
                    action: () => this.getInitialContext()
                }
            },
            
            [WORKSPACE_CREATION_STATES.GIT_STATUS_CHECK]: {
                [WORKSPACE_CREATION_EVENTS.GIT_STATUS_CHECKED]: {
                    target: WORKSPACE_CREATION_STATES.CONNECTION_TEST,
                    condition: (context, event) => event.payload.gitStatus?.isInstalled,
                    fallback: WORKSPACE_CREATION_STATES.GIT_INSTALLATION,
                    action: (context, event) => ({ ...context, gitStatus: event.payload.gitStatus })
                },
                [WORKSPACE_CREATION_EVENTS.ERROR_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.ERROR,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.TIMEOUT_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.TIMEOUT,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.CANCEL_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLING,
                    action: (context) => ({ ...context, cancelRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.ABORT_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLING,
                    action: (context) => ({ ...context, abortRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.RESET]: {
                    target: WORKSPACE_CREATION_STATES.IDLE,
                    action: () => this.getInitialContext()
                }
            },
            
            [WORKSPACE_CREATION_STATES.GIT_INSTALLATION]: {
                [WORKSPACE_CREATION_EVENTS.GIT_INSTALLATION_STARTED]: {
                    target: WORKSPACE_CREATION_STATES.GIT_INSTALLATION
                },
                [WORKSPACE_CREATION_EVENTS.GIT_INSTALLED]: {
                    target: WORKSPACE_CREATION_STATES.CONNECTION_TEST
                },
                [WORKSPACE_CREATION_EVENTS.ERROR_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.ERROR,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.TIMEOUT_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.TIMEOUT,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.CANCEL_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLING,
                    action: (context) => ({ ...context, cancelRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.ABORT_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLING,
                    action: (context) => ({ ...context, abortRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.RESET]: {
                    target: WORKSPACE_CREATION_STATES.IDLE,
                    action: () => this.getInitialContext()
                }
            },
            
            [WORKSPACE_CREATION_STATES.CONNECTION_TEST]: {
                [WORKSPACE_CREATION_EVENTS.CONNECTION_TESTING_STARTED]: {
                    target: WORKSPACE_CREATION_STATES.CONNECTION_TEST
                },
                [WORKSPACE_CREATION_EVENTS.CONNECTION_TESTED]: {
                    target: WORKSPACE_CREATION_STATES.INITIAL_COMMIT,
                    condition: (context, event) => context.formData?.type === 'team' && context.formData?.initialCommit,
                    fallback: WORKSPACE_CREATION_STATES.WORKSPACE_CREATION,
                    action: (context, event) => ({
                        ...context,
                        connectionResult: event.payload.result
                    })
                },
                [WORKSPACE_CREATION_EVENTS.ERROR_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.ERROR,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.TIMEOUT_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.TIMEOUT,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.CANCEL_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLING,
                    action: (context) => ({ ...context, cancelRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.ABORT_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLING,
                    action: (context) => ({ ...context, abortRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.RESET]: {
                    target: WORKSPACE_CREATION_STATES.IDLE,
                    action: () => this.getInitialContext()
                }
            },
            
            [WORKSPACE_CREATION_STATES.WORKSPACE_CREATION]: {
                [WORKSPACE_CREATION_EVENTS.WORKSPACE_CREATED]: {
                    target: WORKSPACE_CREATION_STATES.WORKSPACE_ACTIVATION,
                    action: (context, event) => ({
                        ...context,
                        workspaceId: event.payload.workspaceId,
                        rollbackActions: [...context.rollbackActions, {
                            type: 'delete_workspace',
                            workspaceId: event.payload.workspaceId
                        }]
                    })
                },
                [WORKSPACE_CREATION_EVENTS.ERROR_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.ERROR,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.TIMEOUT_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.TIMEOUT,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.CANCEL_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLING,
                    action: (context) => ({ ...context, cancelRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.ABORT_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context) => ({ ...context, abortRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.RESET]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context) => ({ ...context, abortRequested: true })
                }
            },
            
            [WORKSPACE_CREATION_STATES.INITIAL_COMMIT]: {
                [WORKSPACE_CREATION_EVENTS.INITIAL_COMMIT_STARTED]: {
                    target: WORKSPACE_CREATION_STATES.INITIAL_COMMIT
                },
                [WORKSPACE_CREATION_EVENTS.INITIAL_COMMIT_COMPLETED]: {
                    target: WORKSPACE_CREATION_STATES.WORKSPACE_CREATION
                },
                [WORKSPACE_CREATION_EVENTS.ERROR_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.TIMEOUT_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.CANCEL_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context) => ({ ...context, cancelRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.ABORT_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context) => ({ ...context, abortRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.RESET]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context) => ({ ...context, abortRequested: true })
                }
            },
            
            [WORKSPACE_CREATION_STATES.SYNC_INITIALIZATION]: {
                [WORKSPACE_CREATION_EVENTS.SYNC_INITIALIZED]: {
                    target: WORKSPACE_CREATION_STATES.SYNC_IN_PROGRESS
                },
                [WORKSPACE_CREATION_EVENTS.ERROR_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.TIMEOUT_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.CANCEL_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context) => ({ ...context, cancelRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.ABORT_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context) => ({ ...context, abortRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.RESET]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context) => ({ ...context, abortRequested: true })
                }
            },
            
            [WORKSPACE_CREATION_STATES.SYNC_IN_PROGRESS]: {
                [WORKSPACE_CREATION_EVENTS.SYNC_PROGRESS]: {
                    target: WORKSPACE_CREATION_STATES.SYNC_IN_PROGRESS,
                    action: (context, event) => ({ ...context, syncProgress: event.payload.progress })
                },
                [WORKSPACE_CREATION_EVENTS.SYNC_COMPLETED]: {
                    target: WORKSPACE_CREATION_STATES.WORKSPACE_ACTIVATION
                },
                [WORKSPACE_CREATION_EVENTS.ERROR_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.TIMEOUT_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.CANCEL_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context) => ({ ...context, cancelRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.ABORT_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context) => ({ ...context, abortRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.RESET]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context) => ({ ...context, abortRequested: true })
                }
            },
            
            [WORKSPACE_CREATION_STATES.WORKSPACE_ACTIVATION]: {
                [WORKSPACE_CREATION_EVENTS.WORKSPACE_ACTIVATED]: {
                    target: WORKSPACE_CREATION_STATES.COMPLETED
                },
                [WORKSPACE_CREATION_EVENTS.ERROR_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.TIMEOUT_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.CANCEL_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context) => ({ ...context, cancelRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.ABORT_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context) => ({ ...context, abortRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.RESET]: {
                    target: WORKSPACE_CREATION_STATES.ROLLBACK,
                    action: (context) => ({ ...context, abortRequested: true })
                }
            },
            
            [WORKSPACE_CREATION_STATES.ERROR]: {
                [WORKSPACE_CREATION_EVENTS.RETRY_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.RETRYING,
                    condition: (context) => context.retryCount < context.maxRetries,
                    action: (context) => ({ ...context, retryCount: context.retryCount + 1 })
                },
                [WORKSPACE_CREATION_EVENTS.RESET]: {
                    target: WORKSPACE_CREATION_STATES.IDLE,
                    action: () => this.getInitialContext()
                },
                [WORKSPACE_CREATION_EVENTS.CANCEL_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLED,
                    action: (context) => ({ ...context, cancelRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.ABORT_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLED,
                    action: (context) => ({ ...context, abortRequested: true })
                }
            },
            
            [WORKSPACE_CREATION_STATES.ROLLBACK]: {
                [WORKSPACE_CREATION_EVENTS.ROLLBACK_COMPLETED]: {
                    target: WORKSPACE_CREATION_STATES.ERROR
                },
                [WORKSPACE_CREATION_EVENTS.ERROR_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.ERROR,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.TIMEOUT_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.ERROR,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                }
            },
            
            [WORKSPACE_CREATION_STATES.RETRYING]: {
                [WORKSPACE_CREATION_EVENTS.START_CREATION]: {
                    target: WORKSPACE_CREATION_STATES.VALIDATING,
                    action: (context, event) => ({
                        ...context,
                        formData: event.payload.formData || context.formData,
                        error: null
                    })
                },
                [WORKSPACE_CREATION_EVENTS.ERROR_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.ERROR,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.CANCEL_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLED,
                    action: (context) => ({ ...context, cancelRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.ABORT_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLED,
                    action: (context) => ({ ...context, abortRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.RESET]: {
                    target: WORKSPACE_CREATION_STATES.IDLE,
                    action: () => this.getInitialContext()
                }
            },
            
            [WORKSPACE_CREATION_STATES.TIMEOUT]: {
                [WORKSPACE_CREATION_EVENTS.RETRY_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.RETRYING,
                    condition: (context) => context.retryCount < context.maxRetries,
                    action: (context) => ({ ...context, retryCount: context.retryCount + 1 })
                },
                [WORKSPACE_CREATION_EVENTS.RESET]: {
                    target: WORKSPACE_CREATION_STATES.IDLE,
                    action: () => this.getInitialContext()
                },
                [WORKSPACE_CREATION_EVENTS.CANCEL_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLED,
                    action: (context) => ({ ...context, cancelRequested: true })
                },
                [WORKSPACE_CREATION_EVENTS.ABORT_REQUESTED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLED,
                    action: (context) => ({ ...context, abortRequested: true })
                }
            },
            
            [WORKSPACE_CREATION_STATES.CANCELLING]: {
                [WORKSPACE_CREATION_EVENTS.ROLLBACK_COMPLETED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLED
                },
                [WORKSPACE_CREATION_EVENTS.ERROR_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLED,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                },
                [WORKSPACE_CREATION_EVENTS.TIMEOUT_OCCURRED]: {
                    target: WORKSPACE_CREATION_STATES.CANCELLED,
                    action: (context, event) => ({ ...context, error: event.payload.error })
                }
            },
            
            [WORKSPACE_CREATION_STATES.CANCELLED]: {
                [WORKSPACE_CREATION_EVENTS.RESET]: {
                    target: WORKSPACE_CREATION_STATES.IDLE,
                    action: () => this.getInitialContext()
                }
            },
            
            [WORKSPACE_CREATION_STATES.COMPLETED]: {
                [WORKSPACE_CREATION_EVENTS.RESET]: {
                    target: WORKSPACE_CREATION_STATES.IDLE,
                    action: () => this.getInitialContext()
                },
                [WORKSPACE_CREATION_EVENTS.START_CREATION]: {
                    target: WORKSPACE_CREATION_STATES.VALIDATING,
                    action: (context, event) => ({
                        ...this.getInitialContext(),
                        formData: event.payload.formData,
                        startTime: new Date().toISOString()
                    })
                }
            }
        };
    }

    getInitialContext() {
        return {
            formData: null,
            workspaceId: null,
            gitStatus: null,
            connectionResult: null,
            error: null,
            rollbackActions: [],
            retryCount: 0,
            maxRetries: 3,
            startTime: null,
            operationTimeouts: new Map(),
            syncProgress: null,
            abortRequested: false,
            cancelRequested: false
        };
    }

    transition(event, payload = {}) {
        const currentTransitions = this.transitions[this.state];
        if (!currentTransitions || !currentTransitions[event]) {
            // Only warn for non-idle states and non-completed states to avoid spam from delayed events
            if (this.state !== WORKSPACE_CREATION_STATES.IDLE && 
                this.state !== WORKSPACE_CREATION_STATES.COMPLETED &&
                this.state !== WORKSPACE_CREATION_STATES.CANCELLED) {
                console.warn(`No transition defined for ${event} in state ${this.state}`);
            }
            return false;
        }

        const transition = currentTransitions[event];
        const eventPayload = { payload, type: event };

        // Check guard conditions
        if (transition.guard && !transition.guard(this.context, eventPayload)) {
            console.warn(`Guard condition failed for ${event} in state ${this.state}`);
            return false;
        }

        // Check condition if exists
        if (transition.condition && !transition.condition(this.context, eventPayload)) {
            // Use fallback state if condition fails
            if (transition.fallback) {
                this.state = transition.fallback;
            } else {
                console.warn(`Condition failed for ${event} in state ${this.state} and no fallback defined`);
                return false;
            }
        } else {
            this.state = transition.target;
        }

        // Execute action if exists
        if (transition.action) {
            const newContext = transition.action(this.context, eventPayload);
            if (newContext) {
                this.context = newContext;
            }
        }

        // Notify listeners
        this.notifyListeners();
        return true;
    }

    addListener(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notifyListeners() {
        this.listeners.forEach(listener => {
            try {
                listener({
                    state: this.state,
                    context: this.context,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.error('Error in state machine listener:', error);
            }
        });
    }

    getCurrentState() {
        return this.state;
    }

    getContext() {
        return this.context;
    }

    setError(error) {
        this.context.error = error;
        this.transition(WORKSPACE_CREATION_EVENTS.ERROR_OCCURRED, { error });
    }

    setTimeout(operation, timeout = 30000) {
        const timeoutId = setTimeout(() => {
            this.transition(WORKSPACE_CREATION_EVENTS.TIMEOUT_OCCURRED, { 
                error: new Error(`Operation ${operation} timed out after ${timeout}ms`) 
            });
        }, timeout);
        
        this.context.operationTimeouts.set(operation, timeoutId);
        return timeoutId;
    }

    clearTimeout(operation) {
        const timeoutId = this.context.operationTimeouts.get(operation);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.context.operationTimeouts.delete(operation);
        }
    }

    clearAllTimeouts() {
        this.context.operationTimeouts.forEach(timeoutId => {
            clearTimeout(timeoutId);
        });
        this.context.operationTimeouts.clear();
    }



    reset() {
        this.clearAllTimeouts();
        this.transition(WORKSPACE_CREATION_EVENTS.RESET);
    }

    async executeRollback() {
        const { rollbackActions } = this.context;
        
        // Clear all timeouts during rollback
        this.clearAllTimeouts();
        
        for (const action of rollbackActions.reverse()) {
            try {
                await this.executeRollbackAction(action);
            } catch (error) {
                console.error('Rollback action failed:', error);
                // Continue with other rollback actions even if one fails
            }
        }
        
        this.transition(WORKSPACE_CREATION_EVENTS.ROLLBACK_COMPLETED);
    }

    async executeRollbackAction(action) {
        switch (action.type) {
            case 'delete_workspace':
                if (window.electronAPI?.deleteWorkspace) {
                    await window.electronAPI.deleteWorkspace(action.workspaceId);
                } else {
                    console.warn('deleteWorkspace function not available in electronAPI');
                }
                break;
            case 'cleanup_git_repo':
                if (window.electronAPI?.cleanupGitRepo && action?.repoPath) {
                    await window.electronAPI.cleanupGitRepo(action.repoPath);
                } else {
                    console.warn('cleanupGitRepo function not available in electronAPI or repoPath missing');
                }
                break;
            case 'cleanup_temp_files':
                if (window.electronAPI?.cleanupTempFiles && action?.paths) {
                    await window.electronAPI.cleanupTempFiles(action.paths);
                } else {
                    console.warn('cleanupTempFiles function not available in electronAPI or paths missing');
                }
                break;
            default:
                console.warn(`Unknown rollback action type: ${action.type}`);
        }
    }

}

export default WorkspaceCreationStateMachine;