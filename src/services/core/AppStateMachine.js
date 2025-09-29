const EventEmitter = require('events');
const { createLogger } = require('../../utils/mainLogger');
const timeManager = require('./TimeManager');

/**
 * Application states
 */
const AppStates = {
    INITIALIZING: 'INITIALIZING',
    LOADING_SETTINGS: 'LOADING_SETTINGS',
    INITIALIZING_SERVICES: 'INITIALIZING_SERVICES',
    STARTING_SERVERS: 'STARTING_SERVERS',
    READY: 'READY',
    LOADING_WORKSPACE: 'LOADING_WORKSPACE',
    OFFLINE: 'OFFLINE',
    ERROR: 'ERROR',
    SHUTTING_DOWN: 'SHUTTING_DOWN',
    TERMINATED: 'TERMINATED'
};

/**
 * Application state transitions
 */
const StateTransitions = {
    [AppStates.INITIALIZING]: {
        SETTINGS_LOADED: AppStates.LOADING_SETTINGS,
        ERROR: AppStates.ERROR
    },
    [AppStates.LOADING_SETTINGS]: {
        SETTINGS_READY: AppStates.INITIALIZING_SERVICES,
        ERROR: AppStates.ERROR
    },
    [AppStates.INITIALIZING_SERVICES]: {
        SERVICES_READY: AppStates.STARTING_SERVERS,
        ERROR: AppStates.ERROR
    },
    [AppStates.STARTING_SERVERS]: {
        SERVERS_READY: AppStates.READY,
        ERROR: AppStates.ERROR
    },
    [AppStates.READY]: {
        WORKSPACE_CHANGE: AppStates.LOADING_WORKSPACE,
        NETWORK_LOST: AppStates.OFFLINE,
        SHUTDOWN: AppStates.SHUTTING_DOWN,
        ERROR: AppStates.ERROR
    },
    [AppStates.LOADING_WORKSPACE]: {
        WORKSPACE_READY: AppStates.READY,
        ERROR: AppStates.ERROR
    },
    [AppStates.OFFLINE]: {
        NETWORK_RESTORED: AppStates.READY,
        SHUTDOWN: AppStates.SHUTTING_DOWN
    },
    [AppStates.ERROR]: {
        RETRY: AppStates.INITIALIZING,
        SHUTDOWN: AppStates.SHUTTING_DOWN
    },
    [AppStates.SHUTTING_DOWN]: {
        TERMINATED: AppStates.TERMINATED
    },
    [AppStates.TERMINATED]: {
        // Terminal state - no transitions
    }
};

/**
 * App State Machine
 * Manages application lifecycle and initialization phases
 */
class AppStateMachine extends EventEmitter {
    constructor() {
        super();
        this.log = createLogger('AppStateMachine');
        
        // Current state
        this.currentState = AppStates.INITIALIZING;
        this.previousState = null;
        
        // State history for debugging
        this.stateHistory = [{
            state: AppStates.INITIALIZING,
            timestamp: timeManager.now(),
            event: 'INIT'
        }];
        
        // Context data
        this.context = {
            startTime: timeManager.now(),
            errors: [],
            retryCount: 0,
            services: new Map(),
            settings: null
        };
        
        // State timeouts
        this.stateTimeouts = {
            [AppStates.INITIALIZING]: 30000,        // 30 seconds
            [AppStates.LOADING_SETTINGS]: 10000,    // 10 seconds
            [AppStates.INITIALIZING_SERVICES]: 60000, // 60 seconds
            [AppStates.STARTING_SERVERS]: 30000,    // 30 seconds
            [AppStates.LOADING_WORKSPACE]: 30000    // 30 seconds
        };
        
        this.currentTimeout = null;
    }

    /**
     * Get current state
     */
    getState() {
        return this.currentState;
    }

    /**
     * Get state history
     */
    getHistory() {
        return [...this.stateHistory];
    }

    /**
     * Get context
     */
    getContext() {
        return { ...this.context };
    }

    /**
     * Check if transition is valid
     */
    canTransition(event) {
        const transitions = StateTransitions[this.currentState];
        return transitions && transitions.hasOwnProperty(event);
    }

    /**
     * Transition to new state
     */
    transition(event, data = {}) {
        if (!this.canTransition(event)) {
            this.log.warn(`Invalid transition: ${event} from state ${this.currentState}`);
            return false;
        }

        const transitions = StateTransitions[this.currentState];
        const newState = transitions[event];
        
        this.log.info(`State transition: ${this.currentState} -> ${newState} (event: ${event})`);
        
        // Clear current timeout
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
        }
        
        // Update state
        this.previousState = this.currentState;
        this.currentState = newState;
        
        // Record in history
        this.stateHistory.push({
            state: newState,
            previousState: this.previousState,
            timestamp: timeManager.now(),
            event,
            data
        });
        
        // Keep only last 50 entries
        if (this.stateHistory.length > 50) {
            this.stateHistory.shift();
        }
        
        // Set timeout for new state if applicable
        if (this.stateTimeouts[newState]) {
            this.currentTimeout = setTimeout(() => {
                this.log.error(`State ${newState} timed out after ${this.stateTimeouts[newState]}ms`);
                this.transition('ERROR', { reason: 'timeout', state: newState });
            }, this.stateTimeouts[newState]);
        }
        
        // Emit state change event
        this.emit('stateChanged', {
            newState,
            previousState: this.previousState,
            event,
            data
        });
        
        // Emit specific state event
        this.emit(newState, data);
        
        return true;
    }

    /**
     * Initialize application
     */
    async initialize() {
        this.log.info('Starting application initialization');
        
        try {
            // Already in INITIALIZING state
            this.emit('initializationStarted');
            
            return true;
        } catch (error) {
            this.log.error('Initialization failed:', error);
            this.transition('ERROR', { error: error.message });
            return false;
        }
    }

    /**
     * Mark settings as loaded
     */
    settingsLoaded(settings) {
        this.context.settings = settings;
        return this.transition('SETTINGS_LOADED', { settings });
    }

    /**
     * Mark settings as ready
     */
    settingsReady() {
        return this.transition('SETTINGS_READY');
    }

    /**
     * Mark services as ready
     */
    servicesReady(services) {
        this.context.services = services;
        return this.transition('SERVICES_READY', { services });
    }

    /**
     * Mark servers as ready
     */
    serversReady(servers) {
        return this.transition('SERVERS_READY', { servers });
    }

    /**
     * Handle workspace change
     */
    workspaceChange(workspace) {
        return this.transition('WORKSPACE_CHANGE', { workspace });
    }

    /**
     * Mark workspace as ready
     */
    workspaceReady() {
        return this.transition('WORKSPACE_READY');
    }

    /**
     * Handle network loss
     */
    networkLost() {
        return this.transition('NETWORK_LOST');
    }

    /**
     * Handle network restoration
     */
    networkRestored() {
        return this.transition('NETWORK_RESTORED');
    }

    /**
     * Handle error
     */
    error(error) {
        this.context.errors.push({
            error,
            timestamp: timeManager.now(),
            state: this.currentState
        });
        
        return this.transition('ERROR', { error });
    }

    /**
     * Retry after error
     */
    retry() {
        this.context.retryCount++;
        return this.transition('RETRY');
    }

    /**
     * Start shutdown
     */
    shutdown() {
        return this.transition('SHUTDOWN');
    }

    /**
     * Mark as terminated
     */
    terminate() {
        return this.transition('TERMINATED');
    }

    /**
     * Check if app is ready
     */
    isReady() {
        return this.currentState === AppStates.READY;
    }

    /**
     * Check if app is in error state
     */
    isError() {
        return this.currentState === AppStates.ERROR;
    }

    /**
     * Check if app is shutting down
     */
    isShuttingDown() {
        return this.currentState === AppStates.SHUTTING_DOWN || 
               this.currentState === AppStates.TERMINATED;
    }

    /**
     * Get state duration
     */
    getStateDuration() {
        if (this.stateHistory.length === 0) return 0;
        
        const lastEntry = this.stateHistory[this.stateHistory.length - 1];
        return timeManager.now() - lastEntry.timestamp;
    }

    /**
     * Get total initialization time
     */
    getInitializationTime() {
        if (!this.isReady()) return null;
        
        // Find when we reached READY state
        for (let i = this.stateHistory.length - 1; i >= 0; i--) {
            if (this.stateHistory[i].state === AppStates.READY) {
                return this.stateHistory[i].timestamp - this.context.startTime;
            }
        }
        
        return null;
    }

    /**
     * Get state summary
     */
    getStateSummary() {
        return {
            currentState: this.currentState,
            previousState: this.previousState,
            isReady: this.isReady(),
            isError: this.isError(),
            stateDuration: this.getStateDuration(),
            initializationTime: this.getInitializationTime(),
            retryCount: this.context.retryCount,
            errorCount: this.context.errors.length,
            lastError: this.context.errors[this.context.errors.length - 1] || null
        };
    }

    /**
     * Reset state machine
     */
    reset() {
        this.log.info('Resetting state machine');
        
        // Clear timeout
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
        }
        
        // Reset state
        this.currentState = AppStates.INITIALIZING;
        this.previousState = null;
        
        // Reset history
        this.stateHistory = [{
            state: AppStates.INITIALIZING,
            timestamp: timeManager.now(),
            event: 'RESET'
        }];
        
        // Reset context
        this.context = {
            startTime: timeManager.now(),
            errors: [],
            retryCount: 0,
            services: new Map(),
            settings: null
        };
        
        // Emit reset event
        this.emit('reset');
    }
}

// Export singleton instance and states
const appStateMachine = new AppStateMachine();
module.exports = {
    AppStateMachine: appStateMachine,
    AppStates,
    StateTransitions
};