import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetworkManagerState } from '@/services/network/NetworkStateManager';
import { NetworkStateManager } from '@/services/network/NetworkStateManager';

function makeNetworkState(overrides: Partial<NetworkManagerState> = {}): NetworkManagerState {
  return {
    isOnline: false,
    networkQuality: 'unknown',
    vpnActive: false,
    interfaces: [],
    primaryInterface: null,
    connectionType: '',
    lastCheck: 0,
    lastStateChange: 0,
    diagnostics: { dnsResolvable: false, internetReachable: false, captivePortal: false, latency: 0 },
    ...overrides,
  };
}

describe('NetworkStateManager', () => {
  let mgr: NetworkStateManager;

  beforeEach(() => {
    mgr = new NetworkStateManager();
  });

  // ------- constructor defaults -------
  describe('constructor defaults', () => {
    it('initializes with full expected default state', () => {
      expect(mgr.stateUpdateLock).toBe(false);
      expect(mgr.stateVersion).toBe(0);
      expect(mgr.pendingStateChanges).toEqual({});
      expect(mgr.state).toEqual({
        isOnline: false,
        networkQuality: 'offline',
        vpnActive: false,
        interfaces: [],
        primaryInterface: null,
        connectionType: 'unknown',
        lastCheck: expect.any(Number),
        lastStateChange: expect.any(Number),
        diagnostics: {
          dnsResolvable: false,
          internetReachable: false,
          captivePortal: false,
          latency: 0,
        },
      });
    });
  });

  // ------- getState -------
  describe('getState', () => {
    it('returns deep clone (not same reference)', () => {
      const s1 = mgr.getState();
      const s2 = mgr.getState();
      expect(s1).toEqual(s2);
      expect(s1).not.toBe(s2);
      expect(s1.diagnostics).not.toBe(s2.diagnostics);
    });

    it('initial state starts offline with expected quality', () => {
      const state = mgr.getState();
      expect(state.isOnline).toBe(false);
      expect(state.networkQuality).toBe('offline');
      expect(state.diagnostics.dnsResolvable).toBe(false);
      expect(state.diagnostics.internetReachable).toBe(false);
      expect(state.diagnostics.captivePortal).toBe(false);
      expect(state.diagnostics.latency).toBe(0);
    });

    it('mutation of returned state does not affect internal state', () => {
      const state = mgr.getState();
      state.isOnline = true;
      state.diagnostics.latency = 999;
      expect(mgr.state.isOnline).toBe(false);
      expect(mgr.state.diagnostics.latency).toBe(0);
    });
  });

  // ------- mergeStateChanges -------
  describe('mergeStateChanges', () => {
    it('shallow merges primitive values', () => {
      const current = makeNetworkState({ isOnline: false, networkQuality: 'offline' });
      const changes = { isOnline: true };
      const result = mgr.mergeStateChanges(current, changes);
      expect(result.isOnline).toBe(true);
      expect(result.networkQuality).toBe('offline');
    });

    it('deep merges diagnostics object', () => {
      const current = makeNetworkState({
        diagnostics: {
          dnsResolvable: false,
          internetReachable: false,
          captivePortal: false,
          latency: 0,
        },
      });
      const changes = {
        diagnostics: {
          dnsResolvable: true,
          internetReachable: false,
          captivePortal: false,
          latency: 50,
        },
      };
      const result = mgr.mergeStateChanges(current, changes);
      expect(result.diagnostics).toEqual({
        dnsResolvable: true,
        internetReachable: false,
        captivePortal: false,
        latency: 50,
      });
    });

    it('replaces arrays directly (no deep merge)', () => {
      const current = makeNetworkState({ interfaces: ['en0', 'wlan0'] });
      const changes = { interfaces: ['eth0'] };
      const result = mgr.mergeStateChanges(current, changes);
      expect(result.interfaces).toEqual(['eth0']);
    });

    it('handles null values correctly', () => {
      const current = makeNetworkState({ primaryInterface: 'eth0' });
      const changes = { primaryInterface: null };
      const result = mgr.mergeStateChanges(current, changes);
      expect(result.primaryInterface).toBeNull();
    });

    it('produces a new object (does not mutate input)', () => {
      const current = makeNetworkState({ isOnline: false });
      const changes = { isOnline: true };
      const result = mgr.mergeStateChanges(current, changes);
      expect(current.isOnline).toBe(false);
      expect(result.isOnline).toBe(true);
    });

    it('merges enterprise VPN state with diagnostics', () => {
      const current = makeNetworkState({
        vpnActive: false,
        connectionType: 'wifi',
        diagnostics: { dnsResolvable: true, internetReachable: true, captivePortal: false, latency: 25 },
      });
      const changes = {
        vpnActive: true,
        connectionType: 'ethernet',
        diagnostics: { dnsResolvable: true, internetReachable: true, captivePortal: false, latency: 120 },
      };
      const result = mgr.mergeStateChanges(current, changes);
      expect(result.vpnActive).toBe(true);
      expect(result.connectionType).toBe('ethernet');
      expect(result.diagnostics.latency).toBe(120);
    });
  });

  // ------- hasStateChanged -------
  describe('hasStateChanged', () => {
    it('returns false for identical states', () => {
      const s = mgr.getState();
      expect(mgr.hasStateChanged(s, { ...s })).toBe(false);
    });

    it('detects change in primitive field', () => {
      const s1 = mgr.getState();
      const s2 = { ...s1, isOnline: true };
      expect(mgr.hasStateChanged(s1, s2)).toBe(true);
    });

    it('detects change in nested diagnostics field', () => {
      const s1 = mgr.getState();
      const s2 = JSON.parse(JSON.stringify(s1));
      s2.diagnostics.latency = 999;
      expect(mgr.hasStateChanged(s1, s2)).toBe(true);
    });

    it('returns false for same object by value', () => {
      const s1 = mgr.getState();
      const s2 = JSON.parse(JSON.stringify(s1));
      expect(mgr.hasStateChanged(s1, s2)).toBe(false);
    });

    it('detects change in networkQuality string', () => {
      const s1 = mgr.getState();
      const s2 = JSON.parse(JSON.stringify(s1));
      s2.networkQuality = 'excellent';
      expect(mgr.hasStateChanged(s1, s2)).toBe(true);
    });
  });

  // ------- analyzeNetworkChange -------
  describe('analyzeNetworkChange', () => {
    it('returns correct analysis when offline', () => {
      mgr.state.isOnline = false;
      const analysis = mgr.analyzeNetworkChange();
      expect(analysis).toEqual({
        wasOffline: true,
        isNowOnline: false,
        networkQualityImproved: false,
        vpnStateChanged: false,
        likelyRecovery: false,
        significantChange: false,
      });
    });

    it('returns correct analysis when online', () => {
      mgr.state.isOnline = true;
      const analysis = mgr.analyzeNetworkChange();
      expect(analysis).toEqual({
        wasOffline: false,
        isNowOnline: true,
        networkQualityImproved: false,
        vpnStateChanged: false,
        likelyRecovery: false,
        significantChange: false,
      });
    });
  });

  // ------- applyStateChanges -------
  describe('applyStateChanges', () => {
    it('increments version on change', () => {
      mgr.pendingStateChanges = { isOnline: true };
      mgr.applyStateChanges();
      expect(mgr.stateVersion).toBe(1);
      expect(mgr.state.isOnline).toBe(true);
    });

    it('clears pending changes after apply', () => {
      mgr.pendingStateChanges = { isOnline: true };
      mgr.applyStateChanges();
      expect(mgr.pendingStateChanges).toEqual({});
    });

    it('drops changes after max retries when locked', () => {
      mgr.stateUpdateLock = true;
      mgr.pendingStateChanges = { isOnline: true };
      mgr.applyStateChanges(10);
      expect(mgr.pendingStateChanges).toEqual({});
    });

    it('does nothing with empty pending changes', () => {
      const versionBefore = mgr.stateVersion;
      mgr.applyStateChanges();
      expect(mgr.stateVersion).toBe(versionBefore);
    });

    it('emits state-changed event with change details', () => {
      const handler = vi.fn();
      mgr.on('state-changed', handler);
      mgr.pendingStateChanges = { isOnline: true, networkQuality: 'excellent' };
      mgr.applyStateChanges();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 1,
          state: expect.objectContaining({ isOnline: true }),
          previousState: expect.objectContaining({ isOnline: false }),
        }),
      );
    });

    it('updates lastStateChange timestamp on actual change', () => {
      const before = mgr.state.lastStateChange;
      mgr.pendingStateChanges = { isOnline: true };
      mgr.applyStateChanges();
      expect(mgr.state.lastStateChange).toBeGreaterThanOrEqual(before);
    });

    it('retries with exponential backoff when locked', () => {
      vi.useFakeTimers();
      mgr.stateUpdateLock = true;
      mgr.pendingStateChanges = { isOnline: true };
      mgr.applyStateChanges(0); // first attempt
      // Unlock so the retry succeeds
      mgr.stateUpdateLock = false;
      vi.advanceTimersByTime(100);
      expect(mgr.state.isOnline).toBe(true);
      vi.useRealTimers();
    });
  });

  // ------- updateState -------
  describe('updateState', () => {
    it('merges changes into pendingStateChanges', () => {
      mgr.updateState({ isOnline: true });
      expect(mgr.pendingStateChanges).toEqual(expect.objectContaining({ isOnline: true }));
    });

    it('applies immediately when immediate=true', () => {
      mgr.updateState({ isOnline: true, networkQuality: 'good' }, true);
      expect(mgr.state.isOnline).toBe(true);
      expect(mgr.state.networkQuality).toBe('good');
    });

    it('accumulates multiple non-immediate updates', () => {
      mgr.updateState({ isOnline: true });
      mgr.updateState({ vpnActive: true });
      expect(mgr.pendingStateChanges).toEqual(
        expect.objectContaining({
          isOnline: true,
          vpnActive: true,
        }),
      );
    });
  });
});
