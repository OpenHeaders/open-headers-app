import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetworkInterfaceInfo } from '../../../src/services/network/NetworkService';
import { NetworkService } from '../../../src/services/network/NetworkService';

describe('NetworkService', () => {
  let svc: NetworkService;

  beforeEach(() => {
    svc = new NetworkService();
  });

  afterEach(() => {
    svc.destroy();
  });

  // ------- constructor defaults -------
  describe('constructor defaults', () => {
    it('initializes with full expected default state', () => {
      expect(svc.isDestroyed).toBe(false);
      expect(svc.isInitialized).toBe(false);
      expect(svc.checkInterval).toBe(60000);
      expect(svc.quickCheckInterval).toBe(15000);
      expect(svc.debounceDelay).toBe(1000);
      expect(svc.hysteresisDelay).toBe(2000);
      expect(svc.requiredConsecutiveChecks).toBe(1);
      expect(svc.maxHistorySize).toBe(10);
      expect(svc.consecutiveOfflineChecks).toBe(0);
      expect(svc.consecutiveOnlineChecks).toBe(0);
      expect(svc.stateChangeHistory).toEqual([]);
      expect(svc.stateUpdateLock).toBe(false);
      expect(svc.pendingStateChanges).toEqual({});
      expect(svc.isNetworkStable).toBe(false);
      expect(svc.comprehensiveCheckInProgress).toBe(false);
      expect(svc.lastComprehensiveCheck).toBe(0);
      expect(svc.hysteresisTimeout).toBeNull();
    });

    it('configures DNS test hosts for reliable public resolvers', () => {
      expect(svc.dnsTestHosts).toEqual(['google.com', 'cloudflare.com']);
    });

    it('configures connectivity endpoints with Google DNS on port 443', () => {
      expect(svc.connectivityEndpoints).toHaveLength(2);
      expect(svc.connectivityEndpoints[0]).toEqual({
        host: '8.8.8.8',
        port: 443,
        name: 'Google DNS',
      });
      expect(svc.connectivityEndpoints[1]).toEqual({
        host: '8.8.4.4',
        port: 443,
        name: 'Google DNS Secondary',
      });
    });

    it('sets adaptive intervals equal to base intervals initially', () => {
      expect(svc.adaptiveCheckInterval).toBe(svc.checkInterval);
      expect(svc.adaptiveQuickCheckInterval).toBe(svc.quickCheckInterval);
    });
  });

  // ------- getState -------
  describe('getState', () => {
    it('returns a defensive copy (not the same reference)', () => {
      const state1 = svc.getState();
      const state2 = svc.getState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(svc.state);
    });

    it('returns full expected initial state shape', () => {
      const state = svc.getState();
      expect(state).toEqual({
        isOnline: true,
        networkQuality: 'good',
        vpnActive: false,
        interfaces: [],
        primaryInterface: null,
        connectionType: 'unknown',
        diagnostics: {
          dnsResolvable: true,
          internetReachable: true,
          captivePortal: false,
          latency: 0,
        },
        lastUpdate: expect.any(Number),
        version: 0,
      });
    });

    it('mutation of returned state does not affect internal state', () => {
      const state = svc.getState();
      state.isOnline = false;
      state.networkQuality = 'poor';
      expect(svc.state.isOnline).toBe(true);
      expect(svc.state.networkQuality).toBe('good');
    });
  });

  // ------- isValidIPv4 -------
  describe('isValidIPv4', () => {
    it('accepts valid IPv4 addresses', () => {
      expect(svc.isValidIPv4('192.168.1.1')).toBe(true);
      expect(svc.isValidIPv4('0.0.0.0')).toBe(true);
      expect(svc.isValidIPv4('255.255.255.255')).toBe(true);
      expect(svc.isValidIPv4('8.8.8.8')).toBe(true);
      expect(svc.isValidIPv4('10.0.0.1')).toBe(true);
      expect(svc.isValidIPv4('172.16.254.1')).toBe(true);
      expect(svc.isValidIPv4('1.1.1.1')).toBe(true);
    });

    it('rejects invalid IPv4 addresses', () => {
      expect(svc.isValidIPv4('')).toBe(false);
      expect(svc.isValidIPv4('256.1.1.1')).toBe(false);
      expect(svc.isValidIPv4('1.2.3')).toBe(false);
      expect(svc.isValidIPv4('1.2.3.4.5')).toBe(false);
      expect(svc.isValidIPv4('abc.def.ghi.jkl')).toBe(false);
      expect(svc.isValidIPv4('192.168.1')).toBe(false);
      expect(svc.isValidIPv4('192.168.1.1.1')).toBe(false);
    });

    it('rejects addresses with octets > 255', () => {
      expect(svc.isValidIPv4('999.999.999.999')).toBe(false);
      expect(svc.isValidIPv4('1.2.3.256')).toBe(false);
      expect(svc.isValidIPv4('300.0.0.1')).toBe(false);
    });

    it('rejects IPv6 addresses', () => {
      expect(svc.isValidIPv4('::1')).toBe(false);
      expect(svc.isValidIPv4('fe80::1')).toBe(false);
      expect(svc.isValidIPv4('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(false);
    });

    it('rejects addresses with leading/trailing whitespace', () => {
      expect(svc.isValidIPv4(' 192.168.1.1')).toBe(false);
      expect(svc.isValidIPv4('192.168.1.1 ')).toBe(false);
    });
  });

  // ------- parseNslookupOutput -------
  describe('parseNslookupOutput', () => {
    it('parses non-authoritative answer with Address line', () => {
      const output = [
        'Server:  dns.google',
        'Address:  8.8.8.8#53',
        '',
        'Non-authoritative answer:',
        'Name:    google.com',
        'Address: 142.250.80.46',
      ].join('\n');

      expect(svc.parseNslookupOutput(output)).toEqual(['142.250.80.46']);
    });

    it('parses multiple IPs from Addresses: line (Windows plural)', () => {
      const output = [
        'Server:  UnKnown',
        'Address:  192.168.1.1',
        '',
        'Non-authoritative answer:',
        'Name:    google.com',
        'Addresses: 142.250.80.46',
        '          142.250.80.47',
      ].join('\n');

      const ips = svc.parseNslookupOutput(output);
      expect(ips).toContain('142.250.80.46');
      expect(ips).toContain('142.250.80.47');
    });

    it('filters out DNS server address with # port notation', () => {
      const output = [
        'Server:  dns.google',
        'Address:  8.8.8.8#53',
        '',
        'Non-authoritative answer:',
        'Address: 8.8.8.8#53',
        'Address: 1.2.3.4',
      ].join('\n');

      expect(svc.parseNslookupOutput(output)).toEqual(['1.2.3.4']);
    });

    it('returns empty array when no answer section', () => {
      const output = [
        'Server:  dns.google',
        'Address:  8.8.8.8#53',
        '',
        "*** dns.google can't find nonexistent.openheaders.io",
      ].join('\n');

      expect(svc.parseNslookupOutput(output)).toEqual([]);
    });

    it('handles empty string', () => {
      expect(svc.parseNslookupOutput('')).toEqual([]);
    });

    it('picks up continuation lines with bare IPs after answer section', () => {
      const output = ['Non-authoritative answer:', '10.0.0.1', '10.0.0.2'].join('\n');

      expect(svc.parseNslookupOutput(output)).toEqual(['10.0.0.1', '10.0.0.2']);
    });

    it('parses enterprise DNS with multiple A records for auth.openheaders.io', () => {
      const output = [
        'Server:  corp-dns.openheaders.internal',
        'Address:  10.100.0.53#53',
        '',
        'Non-authoritative answer:',
        'Name:    auth.openheaders.io',
        'Address: 34.120.55.100',
        '34.120.55.101',
        '34.120.55.102',
      ].join('\n');

      const ips = svc.parseNslookupOutput(output);
      expect(ips).toEqual(['34.120.55.100', '34.120.55.101', '34.120.55.102']);
    });
  });

  // ------- getInterfaceType -------
  describe('getInterfaceType', () => {
    it('classifies ethernet interfaces', () => {
      expect(svc.getInterfaceType('eth0')).toBe('ethernet');
      expect(svc.getInterfaceType('en0')).toBe('ethernet');
      expect(svc.getInterfaceType('Ethernet')).toBe('ethernet');
    });

    it('classifies wifi interfaces', () => {
      expect(svc.getInterfaceType('wlan0')).toBe('wifi');
      expect(svc.getInterfaceType('Wi-Fi')).toBe('wifi');
      expect(svc.getInterfaceType('en1')).toBe('wifi');
      expect(svc.getInterfaceType('AirPort')).toBe('wifi');
    });

    it('classifies loopback interfaces', () => {
      expect(svc.getInterfaceType('lo')).toBe('loopback');
      expect(svc.getInterfaceType('lo0')).toBe('loopback');
      expect(svc.getInterfaceType('Loopback')).toBe('loopback');
    });

    it('classifies unknown interfaces as other', () => {
      expect(svc.getInterfaceType('utun0')).toBe('other');
      expect(svc.getInterfaceType('docker0')).toBe('other');
      expect(svc.getInterfaceType('vboxnet0')).toBe('other');
      expect(svc.getInterfaceType('br-abc123')).toBe('other');
    });
  });

  // ------- determineConnectionType -------
  describe('determineConnectionType', () => {
    it('returns "none" when primaryInterface is null', () => {
      expect(svc.determineConnectionType(null)).toBe('none');
    });

    it('returns "unknown" when interface is not found in state', () => {
      svc.state.interfaces = [];
      expect(svc.determineConnectionType('eth0')).toBe('unknown');
    });

    it('returns interface type when found', () => {
      svc.state.interfaces = [['eth0', { name: 'eth0', addresses: [], type: 'ethernet' }]];
      expect(svc.determineConnectionType('eth0')).toBe('ethernet');
    });

    it('returns wifi type for corporate wifi interface', () => {
      svc.state.interfaces = [['wlan0', { name: 'wlan0', addresses: [], type: 'wifi' }]];
      expect(svc.determineConnectionType('wlan0')).toBe('wifi');
    });
  });

  // ------- calculateNetworkQuality -------
  describe('calculateNetworkQuality', () => {
    it('returns "poor" when both dns and connectivity fail', () => {
      expect(
        svc.calculateNetworkQuality({
          dnsSuccess: false,
          connectivitySuccess: false,
          latency: 0,
        }),
      ).toBe('poor');
    });

    it('returns "excellent" for low latency (<100ms)', () => {
      expect(
        svc.calculateNetworkQuality({
          dnsSuccess: true,
          connectivitySuccess: true,
          latency: 50,
        }),
      ).toBe('excellent');
    });

    it('returns "good" for moderate latency (100-299ms)', () => {
      expect(
        svc.calculateNetworkQuality({
          dnsSuccess: true,
          connectivitySuccess: true,
          latency: 200,
        }),
      ).toBe('good');
    });

    it('returns "fair" for higher latency (300-999ms)', () => {
      expect(
        svc.calculateNetworkQuality({
          dnsSuccess: true,
          connectivitySuccess: true,
          latency: 500,
        }),
      ).toBe('fair');
    });

    it('returns "poor" for very high latency (>=1000ms)', () => {
      expect(
        svc.calculateNetworkQuality({
          dnsSuccess: true,
          connectivitySuccess: true,
          latency: 2000,
        }),
      ).toBe('poor');
    });

    it('returns quality based on latency even when only DNS succeeds', () => {
      expect(
        svc.calculateNetworkQuality({
          dnsSuccess: true,
          connectivitySuccess: false,
          latency: 50,
        }),
      ).toBe('excellent');
    });

    it('returns quality based on latency even when only connectivity succeeds', () => {
      expect(
        svc.calculateNetworkQuality({
          dnsSuccess: false,
          connectivitySuccess: true,
          latency: 150,
        }),
      ).toBe('good');
    });

    it('returns "excellent" at boundary latency of 99ms', () => {
      expect(
        svc.calculateNetworkQuality({
          dnsSuccess: true,
          connectivitySuccess: true,
          latency: 99,
        }),
      ).toBe('excellent');
    });

    it('returns "good" at boundary latency of 100ms', () => {
      expect(
        svc.calculateNetworkQuality({
          dnsSuccess: true,
          connectivitySuccess: true,
          latency: 100,
        }),
      ).toBe('good');
    });

    it('returns "fair" at boundary latency of 300ms', () => {
      expect(
        svc.calculateNetworkQuality({
          dnsSuccess: true,
          connectivitySuccess: true,
          latency: 300,
        }),
      ).toBe('fair');
    });

    it('returns "poor" at boundary latency of 1000ms', () => {
      expect(
        svc.calculateNetworkQuality({
          dnsSuccess: true,
          connectivitySuccess: true,
          latency: 1000,
        }),
      ).toBe('poor');
    });
  });

  // ------- detectVPN -------
  describe('detectVPN', () => {
    it('returns false for empty interfaces', () => {
      expect(svc.detectVPN(new Map())).toBe(false);
    });

    it('detects VPN indicator interfaces', () => {
      const indicators = ['tun0', 'tap0', 'ppp0', 'ipsec0', 'MyVPN'];
      for (const name of indicators) {
        const interfaces = new Map<string, NetworkInterfaceInfo>([[name, { name, addresses: [], type: 'other' }]]);
        expect(svc.detectVPN(interfaces)).toBe(true);
      }
    });

    it('does not detect ethernet as VPN', () => {
      const interfaces = new Map<string, NetworkInterfaceInfo>([
        ['eth0', { name: 'eth0', addresses: [], type: 'ethernet' }],
      ]);
      expect(svc.detectVPN(interfaces)).toBe(false);
    });

    it('detects VPN even when mixed with non-VPN interfaces', () => {
      const interfaces = new Map<string, NetworkInterfaceInfo>([
        ['en0', { name: 'en0', addresses: [], type: 'ethernet' }],
        ['utun3', { name: 'utun3', addresses: [], type: 'other' }],
      ]);
      // utun contains 'tun'
      expect(svc.detectVPN(interfaces)).toBe(true);
    });

    it('does not detect docker/bridge interfaces as VPN', () => {
      const interfaces = new Map<string, NetworkInterfaceInfo>([
        ['docker0', { name: 'docker0', addresses: [], type: 'other' }],
        ['br-abc123', { name: 'br-abc123', addresses: [], type: 'other' }],
      ]);
      expect(svc.detectVPN(interfaces)).toBe(false);
    });
  });

  // ------- findPrimaryInterface -------
  describe('findPrimaryInterface', () => {
    it('returns null for empty interfaces', () => {
      expect(svc.findPrimaryInterface(new Map())).toBeNull();
    });

    it('prefers ethernet over wifi', () => {
      const interfaces = new Map<string, NetworkInterfaceInfo>([
        ['wlan0', { name: 'wlan0', addresses: [], type: 'wifi' }],
        ['eth0', { name: 'eth0', addresses: [], type: 'ethernet' }],
      ]);
      expect(svc.findPrimaryInterface(interfaces)).toBe('eth0');
    });

    it('falls back to wifi when no ethernet', () => {
      const interfaces = new Map<string, NetworkInterfaceInfo>([
        ['wlan0', { name: 'wlan0', addresses: [], type: 'wifi' }],
        ['tun0', { name: 'tun0', addresses: [], type: 'other' }],
      ]);
      expect(svc.findPrimaryInterface(interfaces)).toBe('wlan0');
    });

    it('falls back to first interface when no ethernet or wifi', () => {
      const interfaces = new Map<string, NetworkInterfaceInfo>([
        ['utun0', { name: 'utun0', addresses: [], type: 'other' }],
        ['docker0', { name: 'docker0', addresses: [], type: 'other' }],
      ]);
      expect(svc.findPrimaryInterface(interfaces)).toBe('utun0');
    });
  });

  // ------- recordStateChangeAttempt -------
  describe('recordStateChangeAttempt', () => {
    it('records a stable entry when state does not change', () => {
      svc.recordStateChangeAttempt(true, true, 1000);
      expect(svc.stateChangeHistory).toHaveLength(1);
      expect(svc.stateChangeHistory[0]).toEqual({
        wasOnline: true,
        isOnline: true,
        timestamp: 1000,
        type: 'stable',
      });
    });

    it('records a change entry when state changes', () => {
      svc.recordStateChangeAttempt(true, false, 1000);
      expect(svc.stateChangeHistory).toHaveLength(1);
      expect(svc.stateChangeHistory[0]).toEqual({
        wasOnline: true,
        isOnline: false,
        timestamp: 1000,
        type: 'change',
      });
    });

    it('trims history to maxHistorySize', () => {
      for (let i = 0; i < 15; i++) {
        svc.recordStateChangeAttempt(true, true, i * 1000);
      }
      expect(svc.stateChangeHistory.length).toBeLessThanOrEqual(svc.maxHistorySize);
    });

    it('preserves the most recent entries after trimming', () => {
      for (let i = 0; i < 15; i++) {
        svc.recordStateChangeAttempt(true, true, i * 1000);
      }
      const lastEntry = svc.stateChangeHistory[svc.stateChangeHistory.length - 1];
      expect(lastEntry.timestamp).toBe(14000);
    });
  });

  // ------- isStableStateChange -------
  describe('isStableStateChange', () => {
    it('returns true with fewer than 3 history entries', () => {
      svc.stateChangeHistory = [{ wasOnline: true, isOnline: false, timestamp: 1000, type: 'change' }];
      expect(svc.isStableStateChange()).toBe(true);
    });

    it('returns true with 2 history entries', () => {
      svc.stateChangeHistory = [
        { wasOnline: true, isOnline: false, timestamp: 1000, type: 'change' },
        { wasOnline: false, isOnline: true, timestamp: 2000, type: 'change' },
      ];
      expect(svc.isStableStateChange()).toBe(true);
    });

    it('returns false when too many recent changes (>=3 in last 5)', () => {
      svc.stateChangeHistory = [
        { wasOnline: true, isOnline: false, timestamp: 1000, type: 'change' },
        { wasOnline: false, isOnline: true, timestamp: 2000, type: 'change' },
        { wasOnline: true, isOnline: false, timestamp: 3000, type: 'change' },
        { wasOnline: false, isOnline: true, timestamp: 4000, type: 'change' },
        { wasOnline: true, isOnline: false, timestamp: 5000, type: 'change' },
      ];
      expect(svc.isStableStateChange()).toBe(false);
    });

    it('detects flip-flop pattern (online-offline-online)', () => {
      svc.stateChangeHistory = [
        { wasOnline: true, isOnline: true, timestamp: 1000, type: 'stable' },
        { wasOnline: true, isOnline: false, timestamp: 2000, type: 'change' },
        { wasOnline: false, isOnline: true, timestamp: 3000, type: 'change' },
      ];
      expect(svc.isStableStateChange()).toBe(false);
    });

    it('returns true with stable history', () => {
      svc.stateChangeHistory = [
        { wasOnline: true, isOnline: true, timestamp: 1000, type: 'stable' },
        { wasOnline: true, isOnline: true, timestamp: 2000, type: 'stable' },
        { wasOnline: true, isOnline: true, timestamp: 3000, type: 'stable' },
      ];
      expect(svc.isStableStateChange()).toBe(true);
    });

    it('returns true when only 1 change in last 5', () => {
      svc.stateChangeHistory = [
        { wasOnline: true, isOnline: true, timestamp: 1000, type: 'stable' },
        { wasOnline: true, isOnline: true, timestamp: 2000, type: 'stable' },
        { wasOnline: true, isOnline: false, timestamp: 3000, type: 'change' },
        { wasOnline: false, isOnline: false, timestamp: 4000, type: 'stable' },
        { wasOnline: false, isOnline: false, timestamp: 5000, type: 'stable' },
      ];
      expect(svc.isStableStateChange()).toBe(true);
    });

    it('detects offline-online-offline flip-flop', () => {
      svc.stateChangeHistory = [
        { wasOnline: false, isOnline: false, timestamp: 1000, type: 'stable' },
        { wasOnline: false, isOnline: true, timestamp: 2000, type: 'change' },
        { wasOnline: true, isOnline: false, timestamp: 3000, type: 'change' },
      ];
      expect(svc.isStableStateChange()).toBe(false);
    });
  });

  // ------- applyStateChanges -------
  describe('applyStateChanges', () => {
    it('does nothing with empty pending changes', () => {
      const version = svc.state.version;
      svc.applyStateChanges();
      expect(svc.state.version).toBe(version);
    });

    it('applies pending changes and increments version', () => {
      svc.isInitialized = true;
      svc.pendingStateChanges = { networkQuality: 'excellent' };
      svc.applyStateChanges();
      expect(svc.state.networkQuality).toBe('excellent');
      expect(svc.state.version).toBe(1);
    });

    it('clears pending changes after apply', () => {
      svc.isInitialized = true;
      svc.pendingStateChanges = { networkQuality: 'fair' };
      svc.applyStateChanges();
      expect(svc.pendingStateChanges).toEqual({});
    });

    it('emits stateChanged event on state change', () => {
      svc.isInitialized = true;
      const handler = vi.fn();
      svc.on('state-changed', handler);
      svc.pendingStateChanges = { isOnline: false };
      svc.applyStateChanges();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 1,
        }),
      );
    });

    it('retries when state update lock is active', () => {
      vi.useFakeTimers();
      svc.stateUpdateLock = true;
      svc.pendingStateChanges = { networkQuality: 'poor' };
      svc.applyStateChanges();
      // Should queue a retry — unlock and advance timer
      svc.stateUpdateLock = false;
      vi.advanceTimersByTime(100);
      vi.useRealTimers();
    });

    it('suppresses offline state during initialization phase', () => {
      // Fresh service: not initialized, within init grace period
      svc.pendingStateChanges = { isOnline: false };
      svc.applyStateChanges();
      // Should revert to old state (online=true)
      expect(svc.state.isOnline).toBe(true);
    });
  });

  // ------- updateState -------
  describe('updateState', () => {
    it('queues changes into pendingStateChanges', () => {
      svc.updateState({ networkQuality: 'fair' });
      expect(svc.pendingStateChanges).toEqual(
        expect.objectContaining({
          networkQuality: 'fair',
        }),
      );
    });

    it('applies immediately when immediate=true', () => {
      svc.isInitialized = true;
      svc.updateState({ networkQuality: 'excellent' }, true);
      expect(svc.state.networkQuality).toBe('excellent');
    });

    it('skips offline state change during initial check', () => {
      // Simulate initial check in progress
      svc['_doingInitialCheck'] = true;
      svc.isInitialized = false;
      svc.updateState({ isOnline: false });
      // pendingStateChanges should NOT contain isOnline
      expect(svc.pendingStateChanges.isOnline).toBeUndefined();
    });

    it('merges multiple pending changes', () => {
      svc.updateState({ networkQuality: 'fair' });
      svc.updateState({ vpnActive: true });
      expect(svc.pendingStateChanges).toEqual(
        expect.objectContaining({
          networkQuality: 'fair',
          vpnActive: true,
        }),
      );
    });
  });

  // ------- applyStateWithHysteresis -------
  describe('applyStateWithHysteresis', () => {
    it('records state change attempt in history', () => {
      svc.applyStateWithHysteresis({ isOnline: true });
      expect(svc.stateChangeHistory.length).toBeGreaterThan(0);
    });

    it('blocks state change when hysteresis timeout is active', () => {
      vi.useFakeTimers();
      svc.isInitialized = true;
      // Force through an initial state change to activate hysteresis
      svc.stateChangeHistory = [
        { wasOnline: true, isOnline: true, timestamp: 1000, type: 'stable' },
        { wasOnline: true, isOnline: true, timestamp: 2000, type: 'stable' },
        { wasOnline: true, isOnline: true, timestamp: 3000, type: 'stable' },
      ];
      svc.applyStateWithHysteresis({ isOnline: false });
      // Now hysteresis is active — second change should be blocked
      svc.applyStateWithHysteresis({ isOnline: true });
      vi.useRealTimers();
    });

    it('allows state change after hysteresis period expires', () => {
      vi.useFakeTimers();
      svc.isInitialized = true;
      svc.stateChangeHistory = [
        { wasOnline: true, isOnline: true, timestamp: 1000, type: 'stable' },
        { wasOnline: true, isOnline: true, timestamp: 2000, type: 'stable' },
        { wasOnline: true, isOnline: true, timestamp: 3000, type: 'stable' },
      ];
      svc.applyStateWithHysteresis({ isOnline: false });
      // Wait for hysteresis to expire
      vi.advanceTimersByTime(svc.hysteresisDelay + 100);
      expect(svc.hysteresisTimeout).toBeNull();
      vi.useRealTimers();
    });
  });

  // ------- destroy -------
  describe('destroy', () => {
    it('sets isDestroyed flag', () => {
      svc.destroy();
      expect(svc.isDestroyed).toBe(true);
    });

    it('clears all intervals', () => {
      svc.intervals.set(
        'test',
        setTimeout(() => {}, 99999),
      );
      svc.intervals.set(
        'test2',
        setTimeout(() => {}, 99999),
      );
      svc.destroy();
      expect(svc.intervals.size).toBe(0);
    });

    it('removes all event listeners', () => {
      svc.on('state-changed', () => {});
      svc.destroy();
      expect(svc.listenerCount('state-changed')).toBe(0);
    });
  });
});
