import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceRegistry } from '../../../src/services/core/ServiceRegistry';

describe('ServiceRegistry', () => {
    let registry: ServiceRegistry;

    beforeEach(() => {
        registry = new ServiceRegistry();
    });

    describe('register()', () => {
        it('registers a service', () => {
            const svc = { initialize: vi.fn() };
            registry.register('proxyService', svc);
            expect(registry.get('proxyService')).toBe(svc);
        });

        it('throws on duplicate registration', () => {
            registry.register('proxyService', {});
            expect(() => registry.register('proxyService', {})).toThrow('already registered');
        });

        it('registers with dependencies', () => {
            const svcA = { initialize: vi.fn() };
            const svcB = { initialize: vi.fn() };
            registry.register('networkService', svcA);
            registry.register('workspaceSyncScheduler', svcB, ['networkService']);
            expect(registry.get('workspaceSyncScheduler')).toBe(svcB);
        });

        it('registers with custom init method', () => {
            const svc = { setup: vi.fn() };
            registry.register('customService', svc, [], 'setup');
            expect(registry.get('customService')).toBe(svc);
        });
    });

    describe('get()', () => {
        it('returns registered service', () => {
            const svc = { name: 'NetworkService' };
            registry.register('networkService', svc);
            expect(registry.get('networkService')).toBe(svc);
        });

        it('throws for unknown service', () => {
            expect(() => registry.get('nonexistent')).toThrow('not found');
        });
    });

    describe('initializeAll()', () => {
        it('calls initialize on all services', async () => {
            const svcA = { initialize: vi.fn() };
            const svcB = { initialize: vi.fn() };
            registry.register('networkService', svcA);
            registry.register('proxyService', svcB);

            await registry.initializeAll();

            expect(svcA.initialize).toHaveBeenCalledOnce();
            expect(svcB.initialize).toHaveBeenCalledOnce();
        });

        it('initializes dependencies before dependents', async () => {
            const order: string[] = [];
            const svcA = { initialize: vi.fn(() => order.push('network')) };
            const svcB = { initialize: vi.fn(() => order.push('workspace')) };

            registry.register('networkService', svcA);
            registry.register('workspaceSync', svcB, ['networkService']);

            await registry.initializeAll();

            expect(order).toEqual(['network', 'workspace']);
        });

        it('handles deep dependency chains', async () => {
            const order: string[] = [];
            const svcA = { initialize: vi.fn(() => order.push('a')) };
            const svcB = { initialize: vi.fn(() => order.push('b')) };
            const svcC = { initialize: vi.fn(() => order.push('c')) };

            registry.register('a', svcA);
            registry.register('b', svcB, ['a']);
            registry.register('c', svcC, ['b']);

            await registry.initializeAll();

            expect(order).toEqual(['a', 'b', 'c']);
        });

        it('skips services without initialize method', async () => {
            registry.register('noInit', { doStuff: vi.fn() });
            await expect(registry.initializeAll()).resolves.toBeUndefined();
        });

        it('throws if dependency is not registered', () => {
            registry.register('orphan', {}, ['missingDep']);
            expect(registry.initializeAll()).rejects.toThrow('not registered');
        });

        it('does nothing on second call', async () => {
            const svc = { initialize: vi.fn() };
            registry.register('test', svc);
            await registry.initializeAll();
            await registry.initializeAll();
            expect(svc.initialize).toHaveBeenCalledOnce();
        });
    });

    describe('initializeService()', () => {
        it('initializes a single service', async () => {
            const svc = { initialize: vi.fn() };
            registry.register('proxyService', svc);

            await registry.initializeService('proxyService');

            expect(svc.initialize).toHaveBeenCalledOnce();
        });

        it('does not re-initialize', async () => {
            const svc = { initialize: vi.fn() };
            registry.register('test', svc);

            await registry.initializeService('test');
            await registry.initializeService('test');

            expect(svc.initialize).toHaveBeenCalledOnce();
        });

        it('propagates initialization errors', async () => {
            const svc = { initialize: vi.fn(() => { throw new Error('Port 8443 already in use'); }) };
            registry.register('proxyService', svc);

            await expect(registry.initializeService('proxyService')).rejects.toThrow('Port 8443 already in use');
        });

        it('throws for unknown service name', async () => {
            await expect(registry.initializeService('nonexistent')).rejects.toThrow('not found');
        });

        it('initializes dependencies automatically', async () => {
            const order: string[] = [];
            const svcA = { initialize: vi.fn(() => order.push('a')) };
            const svcB = { initialize: vi.fn(() => order.push('b')) };

            registry.register('a', svcA);
            registry.register('b', svcB, ['a']);

            await registry.initializeService('b');

            expect(order).toEqual(['a', 'b']);
        });
    });

    describe('shutdownAll()', () => {
        it('calls shutdown methods in reverse initialization order', async () => {
            const order: string[] = [];
            const svcA = { initialize: vi.fn(), shutdown: vi.fn(() => order.push('network')) };
            const svcB = { initialize: vi.fn(), shutdown: vi.fn(() => order.push('workspace')) };

            registry.register('networkService', svcA);
            registry.register('workspaceSync', svcB, ['networkService']);

            await registry.initializeAll();
            await registry.shutdownAll();

            expect(order).toEqual(['workspace', 'network']);
        });

        it('tries alternative shutdown methods (destroy, close, stop)', async () => {
            const svc = { initialize: vi.fn(), stop: vi.fn() };
            registry.register('test', svc);
            await registry.initializeAll();

            await registry.shutdownAll();

            expect(svc.stop).toHaveBeenCalledOnce();
        });

        it('continues shutdown even if one service fails', async () => {
            const svcA = { initialize: vi.fn(), shutdown: vi.fn(() => { throw new Error('shutdown failed'); }) };
            const svcB = { initialize: vi.fn(), destroy: vi.fn() };

            registry.register('a', svcA);
            registry.register('b', svcB);

            await registry.initializeAll();
            await registry.shutdownAll(); // Should not throw

            expect(svcB.destroy).toHaveBeenCalledOnce();
        });
    });

    describe('getAllServices()', () => {
        it('returns all service instances as record', () => {
            const network = { name: 'network' };
            const proxy = { name: 'proxy' };
            registry.register('network', network);
            registry.register('proxy', proxy);

            expect(registry.getAllServices()).toEqual({ network, proxy });
        });

        it('returns empty object for empty registry', () => {
            expect(registry.getAllServices()).toEqual({});
        });
    });

    describe('getStatus()', () => {
        it('shows initialization state and dependencies', async () => {
            const svc = { initialize: vi.fn() };
            registry.register('workspaceSync', svc, ['networkService']);

            const status = registry.getStatus();
            expect(status.workspaceSync).toEqual({
                initialized: false,
                error: null,
                dependencies: ['networkService']
            });
        });

        it('shows error after failed initialization', async () => {
            const svc = { initialize: vi.fn(() => { throw new Error('init failed'); }) };
            registry.register('broken', svc);

            try { await registry.initializeService('broken'); } catch (e) { /* expected */ }

            const status = registry.getStatus();
            expect(status.broken.initialized).toBe(false);
            expect(status.broken.error).toBe('init failed');
        });

        it('shows initialized after successful init', async () => {
            const svc = { initialize: vi.fn() };
            registry.register('test', svc);
            await registry.initializeService('test');

            const status = registry.getStatus();
            expect(status.test.initialized).toBe(true);
            expect(status.test.error).toBeNull();
        });
    });
});
