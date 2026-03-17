import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppStateMachineImpl, AppStates, StateTransitions } from '../../../src/services/core/AppStateMachine';

describe('AppStateMachine', () => {
    let sm: AppStateMachineImpl;

    beforeEach(() => {
        sm = new AppStateMachineImpl();
    });

    describe('initial state', () => {
        it('starts in INITIALIZING', () => {
            expect(sm.getState()).toBe(AppStates.INITIALIZING);
        });

        it('has no previous state', () => {
            expect(sm.previousState).toBeNull();
        });

        it('has one entry in history', () => {
            expect(sm.getHistory()).toHaveLength(1);
            expect(sm.getHistory()[0].event).toBe('INIT');
        });

        it('is not ready', () => {
            expect(sm.isReady()).toBe(false);
        });
    });

    describe('transition()', () => {
        it('transitions through valid states', () => {
            expect(sm.transition('SETTINGS_LOADED')).toBe(true);
            expect(sm.getState()).toBe(AppStates.LOADING_SETTINGS);

            expect(sm.transition('SETTINGS_READY')).toBe(true);
            expect(sm.getState()).toBe(AppStates.INITIALIZING_SERVICES);

            expect(sm.transition('SERVICES_READY')).toBe(true);
            expect(sm.getState()).toBe(AppStates.STARTING_SERVERS);

            expect(sm.transition('SERVERS_READY')).toBe(true);
            expect(sm.getState()).toBe(AppStates.READY);
        });

        it('rejects invalid transitions', () => {
            expect(sm.transition('SERVERS_READY')).toBe(false);
            expect(sm.getState()).toBe(AppStates.INITIALIZING);
        });

        it('records history', () => {
            sm.transition('SETTINGS_LOADED');
            sm.transition('SETTINGS_READY');

            const history = sm.getHistory();
            expect(history).toHaveLength(3); // INIT + 2 transitions
            expect(history[1].state).toBe(AppStates.LOADING_SETTINGS);
            expect(history[2].state).toBe(AppStates.INITIALIZING_SERVICES);
        });

        it('caps history at 50 entries', () => {
            // Drive through enough transitions to exceed 50
            for (let i = 0; i < 60; i++) {
                sm.transition('ERROR');
                sm.currentState = AppStates.INITIALIZING; // force back for next cycle
            }
            expect(sm.getHistory().length).toBeLessThanOrEqual(50);
        });

        it('emits stateChanged event', () => {
            const handler = vi.fn();
            sm.on('stateChanged', handler);

            sm.transition('SETTINGS_LOADED');

            expect(handler).toHaveBeenCalledWith(expect.objectContaining({
                newState: AppStates.LOADING_SETTINGS,
                previousState: AppStates.INITIALIZING,
                event: 'SETTINGS_LOADED',
            }));
        });

        it('sets previousState', () => {
            sm.transition('SETTINGS_LOADED');
            expect(sm.previousState).toBe(AppStates.INITIALIZING);
        });
    });

    describe('canTransition()', () => {
        it('returns true for valid events', () => {
            expect(sm.canTransition('SETTINGS_LOADED')).toBe(true);
            expect(sm.canTransition('ERROR')).toBe(true);
        });

        it('returns false for invalid events', () => {
            expect(sm.canTransition('SERVERS_READY')).toBe(false);
            expect(sm.canTransition('NONEXISTENT')).toBe(false);
        });
    });

    describe('helper methods', () => {
        function driveToReady(machine: AppStateMachineImpl) {
            machine.settingsLoaded({});
            machine.settingsReady();
            machine.servicesReady({});
            machine.serversReady({});
        }

        it('settingsLoaded transitions from INITIALIZING', () => {
            expect(sm.settingsLoaded({ theme: 'dark' })).toBe(true);
            expect(sm.getState()).toBe(AppStates.LOADING_SETTINGS);
        });

        it('serversReady makes app ready', () => {
            driveToReady(sm);
            expect(sm.isReady()).toBe(true);
        });

        it('workspaceChange and workspaceReady cycle', () => {
            driveToReady(sm);
            expect(sm.workspaceChange({ id: 'ws-1' })).toBe(true);
            expect(sm.getState()).toBe(AppStates.LOADING_WORKSPACE);
            expect(sm.workspaceReady()).toBe(true);
            expect(sm.isReady()).toBe(true);
        });

        it('networkLost and networkRestored cycle', () => {
            driveToReady(sm);
            expect(sm.networkLost()).toBe(true);
            expect(sm.getState()).toBe(AppStates.OFFLINE);
            expect(sm.networkRestored()).toBe(true);
            expect(sm.isReady()).toBe(true);
        });

        it('error and retry cycle', () => {
            sm.error('something broke');
            expect(sm.isError()).toBe(true);
            expect(sm.getContext().errors).toHaveLength(1);

            sm.retry();
            expect(sm.getState()).toBe(AppStates.INITIALIZING);
            expect(sm.getContext().retryCount).toBe(1);
        });

        it('shutdown and terminate', () => {
            driveToReady(sm);
            expect(sm.shutdown()).toBe(true);
            expect(sm.isShuttingDown()).toBe(true);
            expect(sm.terminate()).toBe(true);
            expect(sm.getState()).toBe(AppStates.TERMINATED);
        });
    });

    describe('getStateSummary()', () => {
        it('returns summary object', () => {
            const summary = sm.getStateSummary();
            expect(summary.currentState).toBe(AppStates.INITIALIZING);
            expect(summary.isReady).toBe(false);
            expect(summary.isError).toBe(false);
            expect(summary.retryCount).toBe(0);
            expect(summary.errorCount).toBe(0);
            expect(summary.lastError).toBeNull();
        });
    });

    describe('getInitializationTime()', () => {
        it('returns null before ready', () => {
            expect(sm.getInitializationTime()).toBeNull();
        });

        it('returns time after reaching READY', () => {
            sm.settingsLoaded({});
            sm.settingsReady();
            sm.servicesReady({});
            sm.serversReady({});

            const time = sm.getInitializationTime();
            expect(time).toBeGreaterThanOrEqual(0);
        });
    });

    describe('reset()', () => {
        it('returns to INITIALIZING with clean context', () => {
            sm.settingsLoaded({});
            sm.settingsReady();
            sm.error('oops');

            sm.reset();

            expect(sm.getState()).toBe(AppStates.INITIALIZING);
            expect(sm.previousState).toBeNull();
            expect(sm.getHistory()).toHaveLength(1);
            expect(sm.getHistory()[0].event).toBe('RESET');
            expect(sm.getContext().errors).toHaveLength(0);
            expect(sm.getContext().retryCount).toBe(0);
        });

        it('emits reset event', () => {
            const handler = vi.fn();
            sm.on('reset', handler);
            sm.reset();
            expect(handler).toHaveBeenCalledOnce();
        });
    });

    describe('AppStates / StateTransitions exports', () => {
        it('AppStates has all expected states', () => {
            expect(Object.keys(AppStates)).toEqual([
                'INITIALIZING', 'LOADING_SETTINGS', 'INITIALIZING_SERVICES',
                'STARTING_SERVERS', 'READY', 'LOADING_WORKSPACE',
                'OFFLINE', 'ERROR', 'SHUTTING_DOWN', 'TERMINATED'
            ]);
        });

        it('TERMINATED is a terminal state with no transitions', () => {
            expect(StateTransitions[AppStates.TERMINATED]).toEqual({});
        });
    });
});
