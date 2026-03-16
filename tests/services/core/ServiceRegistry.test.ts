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
            registry.register('test', svc);
            expect(registry.get('test')).toBe(svc);
        });

        it('throws on duplicate registration', () => {
            registry.register('test', {});
            expect(() => registry.register('test', {})).toThrow('already registered');
        });
    });

    describe('get()', () => {
        it('returns registered service', () => {
            const svc = { name: 'myService' };
            registry.register('my', svc);
            expect(registry.get('my')).toBe(svc);
        });

        it('throws for unknown service', () => {
            expect(() => registry.get('nonexistent')).toThrow('not found');
        });
    });

    describe('initializeAll()', () => {
        it('calls initialize on all services', async () => {
            const svcA = { initialize: vi.fn() };
            const svcB = { initialize: vi.fn() };
            registry.register('a', svcA);
            registry.register('b', svcB);

            await registry.initializeAll();

            expect(svcA.initialize).toHaveBeenCalledOnce();
            expect(svcB.initialize).toHaveBeenCalledOnce();
        });

        it('initializes dependencies before dependents', async () => {
            const order: string[] = [];
            const svcA = { initialize: vi.fn(() => order.push('a')) };
            const svcB = { initialize: vi.fn(() => order.push('b')) };

            registry.register('a', svcA);
            registry.register('b', svcB, ['a']);

            await registry.initializeAll();

            expect(order).toEqual(['a', 'b']);
        });

        it('skips services without initialize method', async () => {
            registry.register('noInit', { doStuff: vi.fn() });
            await expect(registry.initializeAll()).resolves.toBeUndefined();
        });

        it('throws if dependency is not registered', () => {
            registry.register('orphan', {}, ['missing']);
            expect(registry.initializeAll()).rejects.toThrow('not registered');
        });

        it('does nothing on second call', async () => {
            const svc = { initialize: vi.fn() };
            registry.register('a', svc);
            await registry.initializeAll();
            await registry.initializeAll();
            expect(svc.initialize).toHaveBeenCalledOnce();
        });
    });

    describe('initializeService()', () => {
        it('initializes a single service', async () => {
            const svc = { initialize: vi.fn() };
            registry.register('test', svc);

            await registry.initializeService('test');

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
            const svc = { initialize: vi.fn(() => { throw new Error('init failed'); }) };
            registry.register('bad', svc);

            await expect(registry.initializeService('bad')).rejects.toThrow('init failed');
        });
    });

    describe('shutdownAll()', () => {
        it('calls shutdown methods in reverse order', async () => {
            const order: string[] = [];
            const svcA = { initialize: vi.fn(), shutdown: vi.fn(() => order.push('a')) };
            const svcB = { initialize: vi.fn(), shutdown: vi.fn(() => order.push('b')) };

            registry.register('a', svcA);
            registry.register('b', svcB, ['a']);

            await registry.initializeAll();
            await registry.shutdownAll();

            expect(order).toEqual(['b', 'a']);
        });

        it('tries alternative shutdown methods (destroy, close, stop)', async () => {
            const svc = { initialize: vi.fn(), stop: vi.fn() };
            registry.register('test', svc);
            await registry.initializeAll();

            await registry.shutdownAll();

            expect(svc.stop).toHaveBeenCalledOnce();
        });
    });

    describe('getAllServices()', () => {
        it('returns all service instances', () => {
            const a = { name: 'a' };
            const b = { name: 'b' };
            registry.register('a', a);
            registry.register('b', b);

            const all = registry.getAllServices();
            expect(all).toEqual({ a, b });
        });
    });

    describe('getStatus()', () => {
        it('shows initialization state', async () => {
            const svc = { initialize: vi.fn() };
            registry.register('test', svc, ['dep1']);

            const status = registry.getStatus();
            expect(status.test.initialized).toBe(false);
            expect(status.test.error).toBeNull();
            expect(status.test.dependencies).toEqual(['dep1']);
        });
    });
});
