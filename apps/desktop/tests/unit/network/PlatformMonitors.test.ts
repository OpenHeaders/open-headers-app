import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  BasePlatformMonitor,
  GenericNetworkMonitor,
  LinuxNetworkMonitor,
  MacOSNetworkMonitor,
  WindowsNetworkMonitor,
} from '@/services/network/PlatformMonitors';

describe('PlatformMonitors', () => {
  describe('BasePlatformMonitor', () => {
    it('initializes with empty collections', () => {
      const monitor = new BasePlatformMonitor();
      expect(monitor.processes).toEqual([]);
      expect(monitor.watchers).toEqual([]);
      expect(monitor.intervals).toEqual([]);
    });

    it('extends EventEmitter', () => {
      const monitor = new BasePlatformMonitor();
      expect(monitor).toBeInstanceOf(EventEmitter);
    });

    it('has a logger with all standard methods', () => {
      const monitor = new BasePlatformMonitor();
      expect(monitor.log).toBeDefined();
      expect(typeof monitor.log.info).toBe('function');
      expect(typeof monitor.log.debug).toBe('function');
      expect(typeof monitor.log.error).toBe('function');
      expect(typeof monitor.log.warn).toBe('function');
    });

    it('stop clears all collections', () => {
      const monitor = new BasePlatformMonitor();
      const interval = setInterval(() => {}, 99999);
      monitor.intervals.push(interval);
      monitor.stop();
      expect(monitor.processes).toEqual([]);
      expect(monitor.watchers).toEqual([]);
      expect(monitor.intervals).toEqual([]);
    });

    it('stop handles watchers with close method', () => {
      const monitor = new BasePlatformMonitor();
      const closeFn = vi.fn();
      monitor.watchers.push({ close: closeFn });
      monitor.stop();
      expect(closeFn).toHaveBeenCalledOnce();
      expect(monitor.watchers).toEqual([]);
    });

    it('stop handles processes that are already killed', () => {
      const monitor = new BasePlatformMonitor();
      const killFn = vi.fn();
      monitor.processes.push({ killed: true, kill: killFn });
      expect(() => monitor.stop()).not.toThrow();
      // Should NOT call kill on already-killed process
      expect(killFn).not.toHaveBeenCalled();
    });

    it('stop kills live processes', () => {
      const monitor = new BasePlatformMonitor();
      const killFn = vi.fn();
      monitor.processes.push({ killed: false, kill: killFn });
      monitor.stop();
      expect(killFn).toHaveBeenCalledOnce();
    });

    it('stop handles watcher.close() throwing', () => {
      const monitor = new BasePlatformMonitor();
      monitor.watchers.push({
        close: () => {
          throw new Error('already closed');
        },
      });
      expect(() => monitor.stop()).not.toThrow();
      expect(monitor.watchers).toEqual([]);
    });

    it('stop handles process.kill() throwing', () => {
      const monitor = new BasePlatformMonitor();
      monitor.processes.push({
        killed: false,
        kill: () => {
          throw new Error('ESRCH');
        },
      });
      expect(() => monitor.stop()).not.toThrow();
      expect(monitor.processes).toEqual([]);
    });

    it('stop clears multiple intervals', () => {
      const monitor = new BasePlatformMonitor();
      const i1 = setInterval(() => {}, 99999);
      const i2 = setInterval(() => {}, 99999);
      const i3 = setInterval(() => {}, 99999);
      monitor.intervals.push(i1, i2, i3);
      monitor.stop();
      expect(monitor.intervals).toEqual([]);
    });

    it('executeCommand returns a promise', () => {
      const monitor = new BasePlatformMonitor();
      const result = monitor.executeCommand('echo', ['hello']);
      expect(result).toBeInstanceOf(Promise);
      // Don't await — we just verify it returns a promise
      result.catch(() => {}); // suppress unhandled rejection
    });
  });

  describe('MacOSNetworkMonitor', () => {
    it('constructs with correct logger', () => {
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

    it('is an EventEmitter', () => {
      const monitor = new MacOSNetworkMonitor();
      expect(monitor).toBeInstanceOf(EventEmitter);
      expect(typeof monitor.emit).toBe('function');
      expect(typeof monitor.on).toBe('function');
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

    it('has fallbackAdapterMonitoring method', () => {
      const monitor = new WindowsNetworkMonitor();
      expect(typeof monitor.fallbackAdapterMonitoring).toBe('function');
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

    it('has checkNetworkManager method', () => {
      const monitor = new LinuxNetworkMonitor();
      expect(typeof monitor.checkNetworkManager).toBe('function');
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

    it('has watchInterfaces method', () => {
      const monitor = new GenericNetworkMonitor();
      expect(typeof monitor.watchInterfaces).toBe('function');
    });
  });
});
