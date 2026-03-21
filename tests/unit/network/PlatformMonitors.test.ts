import { describe, it, expect } from 'vitest';
import {
    BasePlatformMonitor,
    MacOSNetworkMonitor,
    WindowsNetworkMonitor,
    LinuxNetworkMonitor,
    GenericNetworkMonitor
} from '../../../src/services/network/PlatformMonitors';

describe('PlatformMonitors', () => {
    describe('BasePlatformMonitor', () => {
        it('initializes with empty collections', () => {
            const monitor = new BasePlatformMonitor();
            expect(monitor.processes).toEqual([]);
            expect(monitor.watchers).toEqual([]);
            expect(monitor.intervals).toEqual([]);
        });

        it('has a logger', () => {
            const monitor = new BasePlatformMonitor();
            expect(monitor.log).toBeDefined();
            expect(typeof monitor.log.info).toBe('function');
            expect(typeof monitor.log.debug).toBe('function');
            expect(typeof monitor.log.error).toBe('function');
        });

        it('stop clears all collections', () => {
            const monitor = new BasePlatformMonitor();
            // Add some fake items
            const interval = setInterval(() => {}, 99999);
            monitor.intervals.push(interval);
            monitor.stop();
            expect(monitor.processes).toEqual([]);
            expect(monitor.watchers).toEqual([]);
            expect(monitor.intervals).toEqual([]);
        });

        it('stop handles watchers with close method', () => {
            const monitor = new BasePlatformMonitor();
            const fakeWatcher = { close: () => {} };
            monitor.watchers.push(fakeWatcher);
            expect(() => monitor.stop()).not.toThrow();
            expect(monitor.watchers).toEqual([]);
        });

        it('stop handles processes that are already killed', () => {
            const monitor = new BasePlatformMonitor();
            const fakeProcess = { killed: true, kill: () => {} };
            monitor.processes.push(fakeProcess);
            expect(() => monitor.stop()).not.toThrow();
        });
    });

    describe('MacOSNetworkMonitor', () => {
        it('constructs with correct logger name', () => {
            const monitor = new MacOSNetworkMonitor();
            expect(monitor.log).toBeDefined();
        });

        it('inherits from BasePlatformMonitor', () => {
            const monitor = new MacOSNetworkMonitor();
            expect(monitor).toBeInstanceOf(BasePlatformMonitor);
        });

        it('initializes with empty collections', () => {
            const monitor = new MacOSNetworkMonitor();
            expect(monitor.processes).toEqual([]);
            expect(monitor.watchers).toEqual([]);
            expect(monitor.intervals).toEqual([]);
        });
    });

    describe('WindowsNetworkMonitor', () => {
        it('constructs with correct defaults', () => {
            const monitor = new WindowsNetworkMonitor();
            expect(monitor.vpnCheckInProgress).toBe(false);
            expect(monitor.adapterMonitorActive).toBe(false);
        });

        it('inherits from BasePlatformMonitor', () => {
            const monitor = new WindowsNetworkMonitor();
            expect(monitor).toBeInstanceOf(BasePlatformMonitor);
        });
    });

    describe('LinuxNetworkMonitor', () => {
        it('constructs correctly', () => {
            const monitor = new LinuxNetworkMonitor();
            expect(monitor.log).toBeDefined();
        });

        it('inherits from BasePlatformMonitor', () => {
            const monitor = new LinuxNetworkMonitor();
            expect(monitor).toBeInstanceOf(BasePlatformMonitor);
        });
    });

    describe('GenericNetworkMonitor', () => {
        it('constructs correctly', () => {
            const monitor = new GenericNetworkMonitor();
            expect(monitor.log).toBeDefined();
        });

        it('inherits from BasePlatformMonitor', () => {
            const monitor = new GenericNetworkMonitor();
            expect(monitor).toBeInstanceOf(BasePlatformMonitor);
        });

        it('initializes with empty collections', () => {
            const monitor = new GenericNetworkMonitor();
            expect(monitor.processes).toEqual([]);
            expect(monitor.watchers).toEqual([]);
            expect(monitor.intervals).toEqual([]);
        });
    });
});
