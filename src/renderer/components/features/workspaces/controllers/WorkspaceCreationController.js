/**
 * Controller for atomic workspace creation operations
 * Ensures all operations are atomic and provides comprehensive error recovery
 */

import WorkspaceCreationStateMachine, { 
    WORKSPACE_CREATION_EVENTS, 
    WORKSPACE_CREATION_STATES 
} from '../state/WorkspaceCreationStateMachine';
import { prepareAuthData, prepareWorkspaceData } from '../utils';

const { createLogger } = require('../../../../utils/error-handling/logger');
const log = createLogger('WorkspaceCreationController');

class WorkspaceCreationController {
    constructor(dependencies) {
        this.stateMachine = new WorkspaceCreationStateMachine();
        this.dependencies = dependencies;
        this.abortController = null;
        this.listeners = new Set();
        
        // Bind methods
        this.create = this.create.bind(this);
        this.handleStateChange = this.handleStateChange.bind(this);
        
        // Setup state machine listener
        this.stateMachine.addListener(this.handleStateChange);
    }

    async create(formData, options = {}) {
        // Reset any existing operation
        this.reset();
        
        // Create new abort controller
        this.abortController = new AbortController();
        
        try {
            // Start the state machine with immediate user feedback
            this.stateMachine.transition(WORKSPACE_CREATION_EVENTS.START_CREATION, {
                formData,
                options
            });
            
            // Execute the creation flow
            await this.executeCreationFlow();
            
        } catch (error) {
            log.error('Workspace creation failed:', error);
            this.stateMachine.setError(error);
            
            // Attempt rollback if we're not already in error state
            if (this.stateMachine.getCurrentState() !== WORKSPACE_CREATION_STATES.ERROR) {
                await this.stateMachine.executeRollback();
            }
            
            throw error;
        }
    }

    async executeCreationFlow() {
        const { formData } = this.stateMachine.getContext();
        
        // Step 1: Form validation (auto-transition will handle VALIDATION_STARTED)
        await this.validateForm(formData);
        
        // Check if validation failed
        if (this.stateMachine.getCurrentState() === WORKSPACE_CREATION_STATES.ERROR) {
            return;
        }
        
        // Step 2: Git operations (if team workspace)
        if (formData.type === 'team') {
            await this.handleGitOperations(formData);
            
            // Check if git operations failed
            if (this.stateMachine.getCurrentState() === WORKSPACE_CREATION_STATES.ERROR) {
                return;
            }
            
            // Step 3: If we have initial commit data, perform the commit BEFORE creating workspace
            if (formData.initialCommit) {
                await this.performInitialCommit(formData);
                
                // Check if initial commit failed
                if (this.stateMachine.getCurrentState() === WORKSPACE_CREATION_STATES.ERROR) {
                    return;
                }
            }
        }
        
        // Step 4: Create workspace (branch now exists on remote if it's a team workspace)
        await this.createWorkspace(formData);
        
        // Check if workspace creation failed
        if (this.stateMachine.getCurrentState() === WORKSPACE_CREATION_STATES.ERROR) {
            return;
        }
        
        // Step 5: Complete the creation
        // Note: Workspace is already activated during creation in CentralizedWorkspaceService.createWorkspace()
        // Sync will happen automatically when switching to the workspace
        this.stateMachine.transition(WORKSPACE_CREATION_EVENTS.WORKSPACE_ACTIVATED);
    }

    async validateForm(formData) {
        this.checkAborted();
        
        // Validate required fields
        if (!formData.name?.trim()) {
            const error = new Error('Workspace name is required');
            this.stateMachine.setError(error);
            return;
        }
        
        if (formData.type === 'team' && !formData.gitUrl?.trim()) {
            const error = new Error('Git repository URL is required for team workspaces');
            this.stateMachine.setError(error);
            return;
        }
        
        // Validate Git URL format if provided
        if (formData.gitUrl) {
            try {
                await this.validateGitUrl(formData.gitUrl);
            } catch (error) {
                this.stateMachine.setError(error);
                return;
            }
        }
        
        this.stateMachine.transition(WORKSPACE_CREATION_EVENTS.FORM_VALIDATED, {
            isTeamWorkspace: formData.type === 'team'
        });
    }

    async handleGitOperations(formData) {
        this.checkAborted();
        
        // Check Git status
        await this.checkGitStatus();
        
        // Test connection with progress feedback
        this.stateMachine.transition(WORKSPACE_CREATION_EVENTS.CONNECTION_TESTING_STARTED);
        await this.testConnection(formData);
    }

    async checkGitStatus() {
        this.checkAborted();
        
        try {
            // Set timeout for Git status check
            this.stateMachine.setTimeout('git_status_check', 15000);
            
            const gitStatus = await this.dependencies.gitService.getStatus();
            
            // Clear timeout on success
            this.stateMachine.clearTimeout('git_status_check');
            
            if (!gitStatus.isInstalled) {
                // Attempt to install Git
                await this.installGit();
            }
            
            this.stateMachine.transition(WORKSPACE_CREATION_EVENTS.GIT_STATUS_CHECKED, {
                gitStatus
            });
            
        } catch (error) {
            this.stateMachine.clearTimeout('git_status_check');
            this.stateMachine.setError(error);
            throw error;
        }
    }

    async installGit() {
        this.checkAborted();
        
        try {
            // Provide immediate feedback for Git installation
            this.stateMachine.transition(WORKSPACE_CREATION_EVENTS.GIT_INSTALLATION_STARTED);
            
            // Set timeout for Git installation (can take longer than other operations)
            this.stateMachine.setTimeout('git_installation', 60000);
            
            const result = await this.dependencies.gitService.install();
            
            // Clear timeout on success
            this.stateMachine.clearTimeout('git_installation');
            
            if (!result.success) {
                const error = new Error(result.error || 'Git installation failed');
                this.stateMachine.setError(error);
                return;
            }
            
            this.stateMachine.transition(WORKSPACE_CREATION_EVENTS.GIT_INSTALLED);
            
        } catch (error) {
            this.stateMachine.clearTimeout('git_installation');
            this.stateMachine.setError(error);
            throw error;
        }
    }

    async testConnection(formData) {
        this.checkAborted();
        
        try {
            // Set timeout for connection test
            this.stateMachine.setTimeout('connection_test', 30000);
            
            const authData = await prepareAuthData(formData, formData.authType);
            
            const connectionConfig = {
                url: formData.gitUrl,
                branch: formData.gitBranch || 'main',
                authType: formData.authType || 'none',
                authData,
                filePath: formData.gitPath || 'config/open-headers.json'
            };
            
            const result = await this.dependencies.gitService.testConnection(connectionConfig);
            
            // Clear timeout on success
            this.stateMachine.clearTimeout('connection_test');
            
            if (!result.success) {
                const error = new Error(result.error || 'Connection test failed');
                this.stateMachine.setError(error);
                return;
            }
            
            this.stateMachine.transition(WORKSPACE_CREATION_EVENTS.CONNECTION_TESTED, {
                result
            });
            
        } catch (error) {
            this.stateMachine.clearTimeout('connection_test');
            this.stateMachine.setError(error);
            throw error;
        }
    }

    async createWorkspace(formData) {
        this.checkAborted();
        
        try {
            // Set timeout for workspace creation
            this.stateMachine.setTimeout('workspace_creation', 30000);
            
            const authData = formData.type === 'team' ? 
                await prepareAuthData(formData, formData.authType) : 
                undefined;
            
            const workspaceData = prepareWorkspaceData(formData, null, authData);
            
            const result = await this.dependencies.workspaceService.create(workspaceData);
            
            // Clear timeout on success
            this.stateMachine.clearTimeout('workspace_creation');
            
            if (!result) {
                const error = new Error('Failed to create workspace');
                this.stateMachine.setError(error);
                return;
            }
            
            this.stateMachine.transition(WORKSPACE_CREATION_EVENTS.WORKSPACE_CREATED, {
                workspaceId: result.id
            });
            
        } catch (error) {
            this.stateMachine.clearTimeout('workspace_creation');
            this.stateMachine.setError(error);
            throw error;
        }
    }

    // Removed handlePostCreation since initial commit is now done before workspace creation

    async performInitialCommit(formData) {
        this.checkAborted();
        
        try {
            log.info('Performing initial commit for team workspace');
            
            // Transition to initial commit state
            this.stateMachine.transition(WORKSPACE_CREATION_EVENTS.INITIAL_COMMIT_STARTED);
            
            // Set timeout for initial commit
            this.stateMachine.setTimeout('initial_commit', 45000);
            
            // Prepare auth data
            const authData = await prepareAuthData(formData, formData.authType || 'none');
            
            // Commit configuration
            const commitConfig = {
                url: formData.gitUrl,
                branch: formData.gitBranch || 'main',
                path: formData.gitPath || 'config/',
                files: formData.initialCommit.files,
                message: formData.initialCommit.message,
                authType: formData.authType || 'none',
                authData
            };
            
            const result = await this.dependencies.gitService.commitConfiguration(commitConfig);
            
            // Clear timeout on completion
            this.stateMachine.clearTimeout('initial_commit');
            
            if (!result.success) {
                const error = new Error(result.error || 'Failed to commit initial configuration');
                this.stateMachine.setError(error);
                throw error;
            }
            
            log.info('Initial commit completed successfully');
            
            // Transition to completed state
            this.stateMachine.transition(WORKSPACE_CREATION_EVENTS.INITIAL_COMMIT_COMPLETED);
            
        } catch (error) {
            this.stateMachine.clearTimeout('initial_commit');
            log.error('Initial commit failed:', error);
            this.stateMachine.setError(error);
            throw error;
        }
    }

    // Removed initializeSync and setupSyncListeners since sync happens automatically during workspace switch


    async validateGitUrl(url) {
        // Basic URL validation
        if (!url.match(/^(https?:\/\/|git@|file:\/\/|\/|\w+:\/\/)/)) {
            throw new Error('Invalid Git repository URL format');
        }
    }

    checkAborted() {
        if (this.abortController?.signal.aborted) {
            throw new Error('Operation was aborted');
        }
    }

    isAborted() {
        return this.abortController?.signal.aborted || false;
    }

    abort() {
        if (this.abortController) {
            this.abortController.abort();
        }
        
        this.cleanup();
    }

    cleanup() {
        // Cleanup resources if needed
    }

    handleStateChange(stateData) {
        const { state } = stateData;
        
        // Notify listeners
        this.listeners.forEach(listener => {
            listener(stateData);
        });
        
        // Handle automatic state transitions
        switch (state) {
            case WORKSPACE_CREATION_STATES.VALIDATING:
                // Auto-transition to form validation immediately
                this.stateMachine.transition(WORKSPACE_CREATION_EVENTS.VALIDATION_STARTED);
                break;
                
            case WORKSPACE_CREATION_STATES.WORKSPACE_ACTIVATION:
                // No need to activate workspace as it's already activated during creation
                // The transition to COMPLETED will happen automatically
                break;
                
            case WORKSPACE_CREATION_STATES.ROLLBACK:
                // Auto-execute rollback
                this.stateMachine.executeRollback().catch(error => {
                    log.error('Rollback failed:', error);
                });
                break;
                
            case WORKSPACE_CREATION_STATES.COMPLETED:
                // Cleanup resources
                this.cleanup();
                break;
                
            case WORKSPACE_CREATION_STATES.ERROR:
                // Cleanup resources
                this.cleanup();
                break;
        }
    }

    addListener(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    getCurrentState() {
        return this.stateMachine.getCurrentState();
    }

    getContext() {
        return this.stateMachine.getContext();
    }

    reset() {
        // Only abort if we're not in a completed state
        const currentState = this.stateMachine.getCurrentState();
        const shouldAbort = currentState !== WORKSPACE_CREATION_STATES.COMPLETED && 
                           currentState !== WORKSPACE_CREATION_STATES.IDLE &&
                           currentState !== WORKSPACE_CREATION_STATES.ERROR &&
                           currentState !== WORKSPACE_CREATION_STATES.CANCELLED;
        
        this.cleanup();
        
        if (this.abortController && shouldAbort) {
            this.abortController.abort();
        }
        
        // Clear the abort controller reference
        this.abortController = null;
        
        this.stateMachine.reset();
    }
}

export default WorkspaceCreationController;