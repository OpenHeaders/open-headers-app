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

        it('has one entry in history with INIT event', () => {
            const history = sm.getHistory();
            expect(history).toHaveLength(1);
            expect(history[0]).toEqual({
                state: AppStates.INITIALIZING,
                timestamp: expect.any(Number),
                event: 'INIT'
            });
        });

        it('is not ready, not error, not shutting down', () => {
            expect(sm.isReady()).toBe(false);
            expect(sm.isError()).toBe(false);
            expect(sm.isShuttingDown()).toBe(false);
        });

        it('has clean context', () => {
            const ctx = sm.getContext();
            expect(ctx.errors).toHaveLength(0);
            expect(ctx.retryCount).toBe(0);
            expect(ctx.settings).toBeNull();
            expect(ctx.startTime).toEqual(expect.any(Number));
        });
    });

    describe('transition()', () => {
        it('transitions through full startup lifecycle', () => {
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

        it('records history with previous state and data', () => {
            sm.transition('SETTINGS_LOADED', { settings: { theme: 'dark' } });
            sm.transition('SETTINGS_READY');

            const history = sm.getHistory();
            expect(history).toHaveLength(3);
            expect(history[1]).toEqual({
                state: AppStates.LOADING_SETTINGS,
                previousState: AppStates.INITIALIZING,
                timestamp: expect.any(Number),
                event: 'SETTINGS_LOADED',
                data: { settings: { theme: 'dark' } }
            });
            expect(history[2].state).toBe(AppStates.INITIALIZING_SERVICES);
        });

        it('caps history at 50 entries', () => {
            for (let i = 0; i < 60; i++) {
                sm.transition('ERROR');
                sm.currentState = AppStates.INITIALIZING;
            }
            expect(sm.getHistory().length).toBeLessThanOrEqual(50);
        });

        it('emits stateChanged event with full payload', () => {
            const handler = vi.fn();
            sm.on('stateChanged', handler);

            sm.transition('SETTINGS_LOADED', { settings: { autoStartProxy: true } });

            expect(handler).toHaveBeenCalledWith({
                newState: AppStates.LOADING_SETTINGS,
                previousState: AppStates.INITIALIZING,
                event: 'SETTINGS_LOADED',
                data: { settings: { autoStartProxy: true } }
            });
        });

        it('emits named state event', () => {
            const handler = vi.fn();
            sm.on(AppStates.LOADING_SETTINGS, handler);
            sm.transition('SETTINGS_LOADED');
            expect(handler).toHaveBeenCalledOnce();
        });

        it('sets previousState correctly', () => {
            sm.transition('SETTINGS_LOADED');
            expect(sm.previousState).toBe(AppStates.INITIALIZING);

            sm.transition('SETTINGS_READY');
            expect(sm.previousState).toBe(AppStates.LOADING_SETTINGS);
        });
    });

    describe('canTransition()', () => {
        it('returns true for valid events from current state', () => {
            expect(sm.canTransition('SETTINGS_LOADED')).toBe(true);
            expect(sm.canTransition('ERROR')).toBe(true);
        });

        it('returns false for invalid events from current state', () => {
            expect(sm.canTransition('SERVERS_READY')).toBe(false);
            expect(sm.canTransition('NONEXISTENT')).toBe(false);
            expect(sm.canTransition('WORKSPACE_CHANGE')).toBe(false);
        });
    });

    describe('helper methods', () => {
        function driveToReady(machine: AppStateMachineImpl) {
            machine.settingsLoaded({});
            machine.settingsReady();
            machine.servicesReady({});
            machine.serversReady({});
        }

        it('settingsLoaded transitions from INITIALIZING and stores settings', () => {
            expect(sm.settingsLoaded({ theme: 'dark' })).toBe(true);
            expect(sm.getState()).toBe(AppStates.LOADING_SETTINGS);
            expect(sm.getContext().settings).toEqual({ theme: 'dark' });
        });

        it('serversReady makes app ready', () => {
            driveToReady(sm);
            expect(sm.isReady()).toBe(true);
            expect(sm.getState()).toBe(AppStates.READY);
        });

        it('workspaceChange and workspaceReady cycle', () => {
            driveToReady(sm);
            expect(sm.workspaceChange({ id: 'ws-a1b2c3d4', name: 'Production — Staging Environment' })).toBe(true);
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
            sm.error('Failed to connect to https://gitlab.openheaders.io');
            expect(sm.isError()).toBe(true);
            expect(sm.getContext().errors).toHaveLength(1);
            expect(sm.getContext().errors[0].error).toBe('Failed to connect to https://gitlab.openheaders.io');
            expect(sm.getContext().errors[0].state).toBe(AppStates.INITIALIZING);

            sm.retry();
            expect(sm.getState()).toBe(AppStates.INITIALIZING);
            expect(sm.getContext().retryCount).toBe(1);
        });

        it('shutdown and terminate', () => {
            driveToReady(sm);
            expect(sm.shutdown()).toBe(true);
            expect(sm.isShuttingDown()).toBe(true);
            expect(sm.getState()).toBe(AppStates.SHUTTING_DOWN);

            expect(sm.terminate()).toBe(true);
            expect(sm.getState()).toBe(AppStates.TERMINATED);
            expect(sm.isShuttingDown()).toBe(true);
        });

        it('servicesReady accepts Map of services', () => {
            sm.settingsLoaded({});
            sm.settingsReady();
            const services = new Map<string, object>();
            services.set('proxy', { port: 8443 });
            services.set('websocket', { port: 9090 });
            expect(sm.servicesReady(services)).toBe(true);
        });

        it('shutdown from OFFLINE state', () => {
            driveToReady(sm);
            sm.networkLost();
            expect(sm.shutdown()).toBe(true);
            expect(sm.isShuttingDown()).toBe(true);
        });
    });

    describe('getStateSummary()', () => {
        it('returns full summary object for initial state', () => {
            const summary = sm.getStateSummary();
            expect(summary).toEqual({
                currentState: AppStates.INITIALIZING,
                previousState: null,
                isReady: false,
                isError: false,
                stateDuration: expect.any(Number),
                initializationTime: null,
                retryCount: 0,
                errorCount: 0,
                lastError: null
            });
        });

        it('reflects error state after error', () => {
            sm.error('test error');
            const summary = sm.getStateSummary();
            expect(summary.isError).toBe(true);
            expect(summary.errorCount).toBe(1);
            expect(summary.lastError).not.toBeNull();
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

    describe('getStateDuration()', () => {
        it('returns non-negative duration', () => {
            expect(sm.getStateDuration()).toBeGreaterThanOrEqual(0);
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
            expect(sm.getContext().settings).toBeNull();
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

        it('every non-terminal state can transition to ERROR', () => {
            const nonTerminal = [
                AppStates.INITIALIZING, AppStates.LOADING_SETTINGS,
                AppStates.INITIALIZING_SERVICES, AppStates.STARTING_SERVERS,
                AppStates.READY, AppStates.LOADING_WORKSPACE
            ];
            for (const state of nonTerminal) {
                expect(StateTransitions[state]).toHaveProperty('ERROR');
            }
        });

        it('ERROR state can RETRY or SHUTDOWN', () => {
            expect(StateTransitions[AppStates.ERROR]).toEqual({
                RETRY: AppStates.INITIALIZING,
                SHUTDOWN: AppStates.SHUTTING_DOWN
            });
        });
    });
});
