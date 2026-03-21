import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkService } from '../../../src/services/network/NetworkService';

describe('NetworkService', () => {
    let svc: NetworkService;

    beforeEach(() => {
        svc = new NetworkService();
    });

    // ------- isValidIPv4 -------
    describe('isValidIPv4', () => {
        it('accepts valid IPv4 addresses', () => {
            expect(svc.isValidIPv4('192.168.1.1')).toBe(true);
            expect(svc.isValidIPv4('0.0.0.0')).toBe(true);
            expect(svc.isValidIPv4('255.255.255.255')).toBe(true);
            expect(svc.isValidIPv4('8.8.8.8')).toBe(true);
            expect(svc.isValidIPv4('10.0.0.1')).toBe(true);
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
                'Address: 142.250.80.46'
            ].join('\n');

            const ips = svc.parseNslookupOutput(output);
            expect(ips).toEqual(['142.250.80.46']);
        });

        it('parses multiple IPs from Addresses: line (Windows plural)', () => {
            const output = [
                'Server:  UnKnown',
                'Address:  192.168.1.1',
                '',
                'Non-authoritative answer:',
                'Name:    google.com',
                'Addresses: 142.250.80.46',
                '          142.250.80.47'
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
                'Address: 1.2.3.4'
            ].join('\n');

            const ips = svc.parseNslookupOutput(output);
            expect(ips).toEqual(['1.2.3.4']);
        });

        it('returns empty array when no answer section', () => {
            const output = [
                'Server:  dns.google',
                'Address:  8.8.8.8#53',
                '',
                '*** dns.google can\'t find nonexistent.example.com'
            ].join('\n');

            expect(svc.parseNslookupOutput(output)).toEqual([]);
        });

        it('handles empty string', () => {
            expect(svc.parseNslookupOutput('')).toEqual([]);
        });

        it('picks up continuation lines with bare IPs after answer section', () => {
            const output = [
                'Non-authoritative answer:',
                '10.0.0.1',
                '10.0.0.2'
            ].join('\n');

            const ips = svc.parseNslookupOutput(output);
            expect(ips).toEqual(['10.0.0.1', '10.0.0.2']);
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
            svc.state.interfaces = [
                ['eth0', { name: 'eth0', addresses: [], type: 'ethernet' }]
            ];
            expect(svc.determineConnectionType('eth0')).toBe('ethernet');
        });
    });

    // ------- calculateNetworkQuality -------
    describe('calculateNetworkQuality', () => {
        it('returns "poor" when both dns and connectivity fail', () => {
            expect(svc.calculateNetworkQuality({
                dnsSuccess: false,
                connectivitySuccess: false,
                latency: 0
            })).toBe('poor');
        });

        it('returns "excellent" for low latency', () => {
            expect(svc.calculateNetworkQuality({
                dnsSuccess: true,
                connectivitySuccess: true,
                latency: 50
            })).toBe('excellent');
        });

        it('returns "good" for moderate latency', () => {
            expect(svc.calculateNetworkQuality({
                dnsSuccess: true,
                connectivitySuccess: true,
                latency: 200
            })).toBe('good');
        });

        it('returns "fair" for higher latency', () => {
            expect(svc.calculateNetworkQuality({
                dnsSuccess: true,
                connectivitySuccess: true,
                latency: 500
            })).toBe('fair');
        });

        it('returns "poor" for very high latency', () => {
            expect(svc.calculateNetworkQuality({
                dnsSuccess: true,
                connectivitySuccess: true,
                latency: 2000
            })).toBe('poor');
        });

        it('returns quality based on latency even when only DNS succeeds', () => {
            expect(svc.calculateNetworkQuality({
                dnsSuccess: true,
                connectivitySuccess: false,
                latency: 50
            })).toBe('excellent');
        });
    });

    // ------- detectVPN -------
    describe('detectVPN', () => {
        it('returns false for empty interfaces', () => {
            const interfaces = new Map();
            expect(svc.detectVPN(interfaces)).toBe(false);
        });

        it('detects tun interface as VPN', () => {
            const interfaces = new Map([['tun0', { name: 'tun0', addresses: [], type: 'other' }]]);
            expect(svc.detectVPN(interfaces)).toBe(true);
        });

        it('detects tap interface as VPN', () => {
            const interfaces = new Map([['tap0', { name: 'tap0', addresses: [], type: 'other' }]]);
            expect(svc.detectVPN(interfaces)).toBe(true);
        });

        it('detects ppp interface as VPN', () => {
            const interfaces = new Map([['ppp0', { name: 'ppp0', addresses: [], type: 'other' }]]);
            expect(svc.detectVPN(interfaces)).toBe(true);
        });

        it('detects ipsec interface as VPN', () => {
            const interfaces = new Map([['ipsec0', { name: 'ipsec0', addresses: [], type: 'other' }]]);
            expect(svc.detectVPN(interfaces)).toBe(true);
        });

        it('detects vpn in interface name', () => {
            const interfaces = new Map([['MyVPN', { name: 'MyVPN', addresses: [], type: 'other' }]]);
            expect(svc.detectVPN(interfaces)).toBe(true);
        });

        it('does not detect ethernet as VPN', () => {
            const interfaces = new Map([['eth0', { name: 'eth0', addresses: [], type: 'ethernet' }]]);
            expect(svc.detectVPN(interfaces)).toBe(false);
        });
    });

    // ------- findPrimaryInterface -------
    describe('findPrimaryInterface', () => {
        it('returns null for empty interfaces', () => {
            const interfaces = new Map();
            expect(svc.findPrimaryInterface(interfaces)).toBeNull();
        });

        it('prefers ethernet over wifi', () => {
            const interfaces = new Map([
                ['wlan0', { name: 'wlan0', addresses: [], type: 'wifi' }],
                ['eth0', { name: 'eth0', addresses: [], type: 'ethernet' }]
            ]);
            expect(svc.findPrimaryInterface(interfaces)).toBe('eth0');
        });

        it('falls back to wifi when no ethernet', () => {
            const interfaces = new Map([
                ['wlan0', { name: 'wlan0', addresses: [], type: 'wifi' }],
                ['tun0', { name: 'tun0', addresses: [], type: 'other' }]
            ]);
            expect(svc.findPrimaryInterface(interfaces)).toBe('wlan0');
        });

        it('falls back to first interface when no ethernet or wifi', () => {
            const interfaces = new Map([
                ['utun0', { name: 'utun0', addresses: [], type: 'other' }],
                ['docker0', { name: 'docker0', addresses: [], type: 'other' }]
            ]);
            expect(svc.findPrimaryInterface(interfaces)).toBe('utun0');
        });
    });

    // ------- recordStateChangeAttempt -------
    describe('recordStateChangeAttempt', () => {
        it('records a stable entry when state does not change', () => {
            svc.recordStateChangeAttempt(true, true, 1000);
            expect(svc.stateChangeHistory).toHaveLength(1);
            expect(svc.stateChangeHistory[0].type).toBe('stable');
        });

        it('records a change entry when state changes', () => {
            svc.recordStateChangeAttempt(true, false, 1000);
            expect(svc.stateChangeHistory).toHaveLength(1);
            expect(svc.stateChangeHistory[0].type).toBe('change');
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
            svc.stateChangeHistory = [
                { wasOnline: true, isOnline: false, timestamp: 1000, type: 'change' }
            ];
            expect(svc.isStableStateChange()).toBe(true);
        });

        it('returns true with 2 history entries', () => {
            svc.stateChangeHistory = [
                { wasOnline: true, isOnline: false, timestamp: 1000, type: 'change' },
                { wasOnline: false, isOnline: true, timestamp: 2000, type: 'change' }
            ];
            expect(svc.isStableStateChange()).toBe(true);
        });

        it('returns false when too many recent changes (>=3 in last 5)', () => {
            svc.stateChangeHistory = [
                { wasOnline: true, isOnline: false, timestamp: 1000, type: 'change' },
                { wasOnline: false, isOnline: true, timestamp: 2000, type: 'change' },
                { wasOnline: true, isOnline: false, timestamp: 3000, type: 'change' },
                { wasOnline: false, isOnline: true, timestamp: 4000, type: 'change' },
                { wasOnline: true, isOnline: false, timestamp: 5000, type: 'change' }
            ];
            expect(svc.isStableStateChange()).toBe(false);
        });

        it('detects flip-flop pattern (online-offline-online)', () => {
            svc.stateChangeHistory = [
                { wasOnline: true, isOnline: true, timestamp: 1000, type: 'stable' },
                { wasOnline: true, isOnline: false, timestamp: 2000, type: 'change' },
                { wasOnline: false, isOnline: true, timestamp: 3000, type: 'change' }
            ];
            expect(svc.isStableStateChange()).toBe(false);
        });

        it('returns true with stable history', () => {
            svc.stateChangeHistory = [
                { wasOnline: true, isOnline: true, timestamp: 1000, type: 'stable' },
                { wasOnline: true, isOnline: true, timestamp: 2000, type: 'stable' },
                { wasOnline: true, isOnline: true, timestamp: 3000, type: 'stable' }
            ];
            expect(svc.isStableStateChange()).toBe(true);
        });

        it('returns true when only 1 change in last 5', () => {
            svc.stateChangeHistory = [
                { wasOnline: true, isOnline: true, timestamp: 1000, type: 'stable' },
                { wasOnline: true, isOnline: true, timestamp: 2000, type: 'stable' },
                { wasOnline: true, isOnline: false, timestamp: 3000, type: 'change' },
                { wasOnline: false, isOnline: false, timestamp: 4000, type: 'stable' },
                { wasOnline: false, isOnline: false, timestamp: 5000, type: 'stable' }
            ];
            expect(svc.isStableStateChange()).toBe(true);
        });
    });

    // ------- getState -------
    describe('getState', () => {
        it('returns a copy of the state (not the same reference)', () => {
            const state1 = svc.getState();
            const state2 = svc.getState();
            expect(state1).toEqual(state2);
            expect(state1).not.toBe(svc.state);
        });

        it('returns expected initial state shape', () => {
            const state = svc.getState();
            expect(state.isOnline).toBe(true);
            expect(state.networkQuality).toBe('good');
            expect(state.vpnActive).toBe(false);
            expect(state.connectionType).toBe('unknown');
            expect(state.version).toBe(0);
            expect(state.diagnostics).toBeDefined();
        });
    });

    // ------- constructor defaults -------
    describe('constructor defaults', () => {
        it('initializes with correct defaults', () => {
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
            expect(svc.dnsTestHosts).toEqual(['google.com', 'cloudflare.com']);
            expect(svc.connectivityEndpoints).toHaveLength(2);
        });
    });

    // ------- destroy -------
    describe('destroy', () => {
        it('sets isDestroyed flag', () => {
            svc.destroy();
            expect(svc.isDestroyed).toBe(true);
        });

        it('clears intervals', () => {
            svc.intervals.set('test', setTimeout(() => {}, 99999));
            svc.destroy();
            expect(svc.intervals.size).toBe(0);
        });
    });
});
