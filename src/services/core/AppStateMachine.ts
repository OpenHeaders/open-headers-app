import { EventEmitter } from 'events';
import mainLogger from '../../utils/mainLogger.js';
import timeManager from './TimeManager';

const { createLogger } = mainLogger;

export const AppStates = {
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
} as const;

export type AppState = typeof AppStates[keyof typeof AppStates];

export const StateTransitions: Record<string, Record<string, string>> = {
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
    [AppStates.TERMINATED]: {}
};

interface StateHistoryEntry {
    state: string;
    previousState?: string | null;
    timestamp: number;
    event: string;
    data?: any;
}

interface AppContext {
    startTime: number;
    errors: Array<{ error: any; timestamp: number; state: string }>;
    retryCount: number;
    services: Map<string, any> | any;
    settings: any;
}

class AppStateMachineImpl extends EventEmitter {
    private log = createLogger('AppStateMachine');
    currentState: string = AppStates.INITIALIZING;
    previousState: string | null = null;
    private stateHistory: StateHistoryEntry[] = [{
        state: AppStates.INITIALIZING,
        timestamp: timeManager.now(),
        event: 'INIT'
    }];
    private context: AppContext = {
        startTime: timeManager.now(),
        errors: [],
        retryCount: 0,
        services: new Map(),
        settings: null
    };
    private stateTimeouts: Record<string, number> = {
        [AppStates.INITIALIZING]: 30000,
        [AppStates.LOADING_SETTINGS]: 10000,
        [AppStates.INITIALIZING_SERVICES]: 60000,
        [AppStates.STARTING_SERVERS]: 30000,
        [AppStates.LOADING_WORKSPACE]: 30000
    };
    private currentTimeout: ReturnType<typeof setTimeout> | null = null;

    getState(): string { return this.currentState; }
    getHistory(): StateHistoryEntry[] { return [...this.stateHistory]; }
    getContext(): AppContext { return { ...this.context }; }

    canTransition(event: string): boolean {
        const transitions = StateTransitions[this.currentState];
        return transitions && Object.prototype.hasOwnProperty.call(transitions, event);
    }

    transition(event: string, data: any = {}): boolean {
        if (!this.canTransition(event)) {
            this.log.warn(`Invalid transition: ${event} from state ${this.currentState}`);
            return false;
        }

        const transitions = StateTransitions[this.currentState];
        const newState = transitions[event];

        this.log.info(`State transition: ${this.currentState} -> ${newState} (event: ${event})`);

        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
        }

        this.previousState = this.currentState;
        this.currentState = newState;

        this.stateHistory.push({
            state: newState,
            previousState: this.previousState,
            timestamp: timeManager.now(),
            event,
            data
        });

        if (this.stateHistory.length > 50) {
            this.stateHistory.shift();
        }

        if (this.stateTimeouts[newState]) {
            this.currentTimeout = setTimeout(() => {
                this.log.error(`State ${newState} timed out after ${this.stateTimeouts[newState]}ms`);
                this.transition('ERROR', { reason: 'timeout', state: newState });
            }, this.stateTimeouts[newState]);
        }

        this.emit('stateChanged', { newState, previousState: this.previousState, event, data });
        this.emit(newState, data);

        return true;
    }

    async initialize(): Promise<boolean> {
        this.log.info('Starting application initialization');
        try {
            this.emit('initializationStarted');
            return true;
        } catch (error: any) {
            this.log.error('Initialization failed:', error);
            this.transition('ERROR', { error: error.message });
            return false;
        }
    }

    settingsLoaded(settings: any): boolean {
        this.context.settings = settings;
        return this.transition('SETTINGS_LOADED', { settings });
    }

    settingsReady(): boolean { return this.transition('SETTINGS_READY'); }

    servicesReady(services: any): boolean {
        this.context.services = services;
        return this.transition('SERVICES_READY', { services });
    }

    serversReady(servers: any): boolean { return this.transition('SERVERS_READY', { servers }); }
    workspaceChange(workspace: any): boolean { return this.transition('WORKSPACE_CHANGE', { workspace }); }
    workspaceReady(): boolean { return this.transition('WORKSPACE_READY'); }
    networkLost(): boolean { return this.transition('NETWORK_LOST'); }
    networkRestored(): boolean { return this.transition('NETWORK_RESTORED'); }

    error(error: any): boolean {
        this.context.errors.push({ error, timestamp: timeManager.now(), state: this.currentState });
        return this.transition('ERROR', { error });
    }

    retry(): boolean {
        this.context.retryCount++;
        return this.transition('RETRY');
    }

    shutdown(): boolean { return this.transition('SHUTDOWN'); }
    terminate(): boolean { return this.transition('TERMINATED'); }
    isReady(): boolean { return this.currentState === AppStates.READY; }
    isError(): boolean { return this.currentState === AppStates.ERROR; }
    isShuttingDown(): boolean { return this.currentState === AppStates.SHUTTING_DOWN || this.currentState === AppStates.TERMINATED; }

    getStateDuration(): number {
        if (this.stateHistory.length === 0) return 0;
        const lastEntry = this.stateHistory[this.stateHistory.length - 1];
        return timeManager.now() - lastEntry.timestamp;
    }

    getInitializationTime(): number | null {
        if (!this.isReady()) return null;
        for (let i = this.stateHistory.length - 1; i >= 0; i--) {
            if (this.stateHistory[i].state === AppStates.READY) {
                return this.stateHistory[i].timestamp - this.context.startTime;
            }
        }
        return null;
    }

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

    reset(): void {
        this.log.info('Resetting state machine');
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
        }
        this.currentState = AppStates.INITIALIZING;
        this.previousState = null;
        this.stateHistory = [{ state: AppStates.INITIALIZING, timestamp: timeManager.now(), event: 'RESET' }];
        this.context = { startTime: timeManager.now(), errors: [], retryCount: 0, services: new Map(), settings: null };
        this.emit('reset');
    }
}

const AppStateMachine = new AppStateMachineImpl();

export { AppStateMachineImpl, AppStateMachine };
export default { AppStateMachine, AppStates, StateTransitions };
