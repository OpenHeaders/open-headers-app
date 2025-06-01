// src/services/NetworkMonitor.js
const { EventEmitter } = require('events');
const os = require('os');
const dns = require('dns').promises;
const { net } = require('electron');
const { createLogger } = require('../utils/mainLogger');
const log = createLogger('NetworkMonitor');

class NetworkMonitor extends EventEmitter {
    constructor() {
        super();

        this.state = {
            isOnline: true,
            connectionType: 'unknown',
            lastChange: Date.now(),
            confidence: 1.0,
            networkInterfaces: new Map(),
            vpnActive: false,
            lastCheck: Date.now(),
            consecutiveFailures: 0,
            networkQuality: 'good' // 'good', 'fair', 'poor', 'offline'
        };

        this.lastInterfaces = new Map();
        this.checkInterval = null;
        this.fastCheckInterval = null;
        this.platformMonitor = null;

        // Configuration
        this.config = {
            normalCheckInterval: 30000,    // 30 seconds for normal checks
            fastCheckInterval: 1000,       // 1 second for interface monitoring
            networkStabilizationDelay: 2000,
            maxConsecutiveFailures: 3
        };

        // Track recent state changes to prevent flapping
        this.stateChangeHistory = [];
        this.maxHistorySize = 10;
    }

    async initialize() {
        log.info('Initializing comprehensive network monitoring...');

        // Create platform-specific monitor
        this.platformMonitor = this.createPlatformMonitor();

        // Perform initial check
        await this.performComprehensiveCheck();

        // Start monitoring
        this.startMonitoring();

        return this.state;
    }

    createPlatformMonitor() {
        const PlatformMonitors = require('./PlatformMonitors');

        switch (process.platform) {
            case 'darwin':
                return new PlatformMonitors.MacOSNetworkMonitor();
            case 'win32':
                return new PlatformMonitors.WindowsNetworkMonitor();
            case 'linux':
                return new PlatformMonitors.LinuxNetworkMonitor();
            default:
                return new PlatformMonitors.GenericNetworkMonitor();
        }
    }

    startMonitoring() {
        // Start interface monitoring (fast)
        this.startInterfaceMonitoring();

        // Start connectivity checks (slower)
        this.startConnectivityMonitoring();

        // Start platform-specific monitoring
        if (this.platformMonitor) {
            this.platformMonitor.on('network-change', (data) => {
                log.debug('Platform-specific network change detected:', data);
                this.handlePlatformNetworkChange(data);
            });

            this.platformMonitor.on('vpn-state', (data) => {
                this.handleVPNStateChange(data);
            });

            this.platformMonitor.start();
        }

        log.info('Monitoring started');
    }

    startInterfaceMonitoring() {
        // Initial check
        this.checkNetworkInterfaces();

        // Fast polling for interface changes
        this.fastCheckInterval = setInterval(() => {
            this.checkNetworkInterfaces();
        }, this.config.fastCheckInterval);
    }

    startConnectivityMonitoring() {
        // Regular connectivity checks
        this.checkInterval = setInterval(() => {
            this.performConnectivityCheck();
        }, this.config.normalCheckInterval);
    }

    checkNetworkInterfaces() {
        const currentInterfaces = os.networkInterfaces();
        const changes = this.detectInterfaceChanges(currentInterfaces);

        if (changes.length > 0) {
            log.debug('Network interface changes detected:', changes);

            // Update state
            this.state.networkInterfaces = new Map(Object.entries(currentInterfaces));

            // Analyze changes
            const analysis = this.analyzeInterfaceChanges(changes, currentInterfaces);

            if (analysis.significantChange) {
                this.handleNetworkChange({
                    type: 'interface',
                    changes,
                    analysis,
                    interfaces: currentInterfaces
                });
            }
        }

        this.lastInterfaces = new Map(Object.entries(currentInterfaces));
    }

    detectInterfaceChanges(currentInterfaces) {
        const changes = [];

        // Check for new or modified interfaces
        for (const [name, addresses] of Object.entries(currentInterfaces)) {
            const lastAddresses = this.lastInterfaces.get(name);

            if (!lastAddresses) {
                changes.push({
                    type: 'added',
                    interface: name,
                    addresses,
                    hasIPv4: addresses.some(addr => addr.family === 'IPv4' && !addr.internal),
                    hasIPv6: addresses.some(addr => addr.family === 'IPv6' && !addr.internal)
                });
            } else {
                const lastJSON = JSON.stringify(lastAddresses);
                const currentJSON = JSON.stringify(addresses);

                if (lastJSON !== currentJSON) {
                    changes.push({
                        type: 'modified',
                        interface: name,
                        addresses,
                        previousAddresses: lastAddresses,
                        hasIPv4: addresses.some(addr => addr.family === 'IPv4' && !addr.internal),
                        hasIPv6: addresses.some(addr => addr.family === 'IPv6' && !addr.internal)
                    });
                }
            }
        }

        // Check for removed interfaces
        for (const [name, addresses] of this.lastInterfaces) {
            if (!currentInterfaces[name]) {
                changes.push({
                    type: 'removed',
                    interface: name,
                    previousAddresses: addresses
                });
            }
        }

        return changes;
    }

    analyzeInterfaceChanges(changes, currentInterfaces) {
        let significantChange = false;
        let likelyOnline = false;
        let vpnDetected = false;

        // Check if we have any active non-internal interfaces
        for (const [name, addresses] of Object.entries(currentInterfaces)) {
            const hasActiveIPv4 = addresses.some(addr =>
                addr.family === 'IPv4' && !addr.internal && addr.address !== '127.0.0.1'
            );

            if (hasActiveIPv4) {
                likelyOnline = true;

                if (name.toLowerCase().includes('vpn') ||
                    name.startsWith('utun') ||
                    name.startsWith('tun') ||
                    name.startsWith('tap') ||
                    name.startsWith('ppp') ||
                    name.includes('ipsec')) {
                    vpnDetected = true;
                    log.debug(`VPN interface detected: ${name}`);
                }
            }
        }

        // Check changes for VPN interfaces being added/removed
        for (const change of changes) {
            // Check if this is a VPN interface
            const isVPNInterface = change.interface.startsWith('utun') ||
                change.interface.startsWith('tun') ||
                change.interface.startsWith('tap') ||
                change.interface.startsWith('ppp') ||
                change.interface.includes('vpn') ||
                change.interface.includes('ipsec');

            if (change.type === 'added' && change.hasIPv4) {
                significantChange = true;
                log.info(`Significant: Interface ${change.interface} added with IPv4`);

                // If a VPN interface was added, emit VPN state change
                if (isVPNInterface) {
                    log.info(`VPN interface ${change.interface} connected`);
                    this.handleVPNStateChange({ active: true, interface: change.interface });
                }
            } else if (change.type === 'removed' && change.previousAddresses?.some(addr =>
                addr.family === 'IPv4' && !addr.internal)) {
                significantChange = true;
                log.info(`Significant: Interface ${change.interface} with IPv4 removed`);

                // If a VPN interface was removed, emit VPN state change
                if (isVPNInterface) {
                    log.info(`VPN interface ${change.interface} disconnected`);
                    this.handleVPNStateChange({ active: false, interface: change.interface });
                }
            } else if (change.type === 'modified') {
                // Check if IP addresses changed
                const hadIPv4 = change.previousAddresses?.some(addr =>
                    addr.family === 'IPv4' && !addr.internal);

                if (hadIPv4 !== change.hasIPv4) {
                    significantChange = true;
                    log.info(`Significant: Interface ${change.interface} IPv4 state changed`);
                }
            }
        }

        return {
            significantChange,
            likelyOnline,
            vpnDetected,
            activeInterfaceCount: Object.values(currentInterfaces).filter(addresses =>
                addresses.some(addr => addr.family === 'IPv4' && !addr.internal)
            ).length
        };
    }

    async performComprehensiveCheck() {
        log.debug('Performing comprehensive network check...');

        const checks = await Promise.allSettled([
            this.checkBasicConnectivity(),
            this.checkDNSResolution(),
            this.checkMultipleEndpoints()
        ]);

        const results = {
            basic: checks[0].status === 'fulfilled' ? checks[0].value : { success: false },
            dns: checks[1].status === 'fulfilled' ? checks[1].value : { success: false },
            endpoints: checks[2].status === 'fulfilled' ? checks[2].value : { success: false }
        };

        return this.updateStateFromResults(results);
    }

    async performConnectivityCheck() {
        try {
            const results = await this.checkMultipleEndpoints();

            if (results.success !== this.state.isOnline) {
                this.handleConnectivityChange(results);
            } else {
                // Update confidence and quality metrics
                this.state.confidence = results.confidence;
                this.state.networkQuality = this.calculateNetworkQuality(results);
                this.state.lastCheck = Date.now();
            }
        } catch (error) {
            log.error('Connectivity check error:', error);
        }
    }

    async checkBasicConnectivity() {
        // Use Electron's net module for basic connectivity
        return new Promise((resolve) => {
            const request = net.request({
                method: 'HEAD',
                url: 'https://www.google.com/generate_204',
                timeout: 3000
            });

            let resolved = false;
            const handleResponse = (success) => {
                if (!resolved) {
                    resolved = true;
                    resolve({ success });
                }
            };

            request.on('response', () => handleResponse(true));
            request.on('error', () => handleResponse(false));

            setTimeout(() => handleResponse(false), 3500);
            request.end();
        });
    }

    async checkDNSResolution() {
        const dnsServers = ['1.1.1.1', '8.8.8.8', '208.67.222.222'];
        const domains = ['google.com', 'cloudflare.com', 'microsoft.com'];

        const checks = [];
        for (const server of dnsServers) {
            for (const domain of domains) {
                checks.push(
                    dns.resolve4(domain, { servers: [server] })
                        .then(() => ({ success: true, server, domain }))
                        .catch(() => ({ success: false, server, domain }))
                );
            }
        }

        const results = await Promise.allSettled(checks);
        const successful = results.filter(r =>
            r.status === 'fulfilled' && r.value.success
        ).length;

        return {
            success: successful > 0,
            successRate: successful / checks.length,
            workingCombinations: results
                .filter(r => r.status === 'fulfilled' && r.value.success)
                .map(r => r.value)
        };
    }

    async checkMultipleEndpoints() {
        const endpoints = [
            { url: 'https://www.google.com/generate_204', timeout: 3000, weight: 1.0 },
            { url: 'https://connectivity-check.ubuntu.com', timeout: 3000, weight: 0.8 },
            { url: 'http://captive.apple.com/hotspot-detect.html', timeout: 3000, weight: 0.8 },
            { url: 'http://www.msftconnecttest.com/connecttest.txt', timeout: 3000, weight: 0.8 },
            { url: 'https://1.1.1.1', timeout: 2000, weight: 0.6 },
            { url: 'https://8.8.8.8', timeout: 2000, weight: 0.6 }
        ];

        const checks = endpoints.map(endpoint => this.checkEndpoint(endpoint));
        const results = await Promise.allSettled(checks);

        let totalWeight = 0;
        let successWeight = 0;
        const responseTimes = [];

        results.forEach((result, index) => {
            const endpoint = endpoints[index];
            totalWeight += endpoint.weight;

            if (result.status === 'fulfilled' && result.value.success) {
                successWeight += endpoint.weight;
                if (result.value.responseTime) {
                    responseTimes.push(result.value.responseTime);
                }
            }
        });

        const confidence = successWeight / totalWeight;
        const avgResponseTime = responseTimes.length > 0
            ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
            : null;

        return {
            success: confidence > 0.3,
            confidence,
            successRate: successWeight / totalWeight,
            avgResponseTime,
            responsive: results
                .map((r, i) => ({ ...r, endpoint: endpoints[i] }))
                .filter(r => r.status === 'fulfilled' && r.value?.success)
                .map(r => r.endpoint.url)
        };
    }

    async checkEndpoint(endpoint) {
        const startTime = Date.now();

        return new Promise((resolve) => {
            const request = net.request({
                method: 'HEAD',
                url: endpoint.url,
                timeout: endpoint.timeout
            });

            let resolved = false;

            const handleResponse = (success, statusCode = null) => {
                if (!resolved) {
                    resolved = true;
                    resolve({
                        success,
                        statusCode,
                        responseTime: Date.now() - startTime,
                        endpoint: endpoint.url
                    });
                }
            };

            request.on('response', (response) => {
                handleResponse(true, response.statusCode);
            });

            request.on('error', () => {
                handleResponse(false);
            });

            setTimeout(() => handleResponse(false), endpoint.timeout + 100);

            request.end();
        });
    }



    calculateNetworkQuality(results) {
        if (!results.success) return 'offline';

        const { confidence, avgResponseTime } = results;

        if (confidence > 0.8 && avgResponseTime < 100) return 'excellent';
        if (confidence > 0.6 && avgResponseTime < 300) return 'good';
        if (confidence > 0.4 && avgResponseTime < 1000) return 'fair';
        return 'poor';
    }

    updateStateFromResults(results) {
        const wasOnline = this.state.isOnline;

        // Determine online status
        this.state.isOnline = results.basic.success || results.endpoints.success;
        this.state.confidence = results.endpoints.confidence || 0;
        this.state.networkQuality = this.calculateNetworkQuality(results.endpoints);
        this.state.lastCheck = Date.now();

        // Update consecutive failures
        if (!this.state.isOnline) {
            this.state.consecutiveFailures++;
        } else {
            this.state.consecutiveFailures = 0;
        }

        // Emit change event if status changed
        if (wasOnline !== this.state.isOnline) {
            this.recordStateChange(wasOnline, this.state.isOnline);
            this.emit('status-change', {
                wasOnline,
                isOnline: this.state.isOnline,
                state: { ...this.state }
            });
        }

        return this.state;
    }

    handleNetworkChange(data) {
        log.debug('Handling network change:', data.type);

        // Debounce rapid changes
        if (this.changeDebounceTimer) {
            clearTimeout(this.changeDebounceTimer);
        }

        this.changeDebounceTimer = setTimeout(async () => {
            // Perform comprehensive check after network change
            await this.performComprehensiveCheck();

            // Emit detailed change event
            this.emit('network-change', {
                ...data,
                state: { ...this.state }
            });
        }, 500); // 500ms debounce
    }

    handlePlatformNetworkChange(data) {
        // Platform-specific change detected
        log.debug('Platform network change:', data);
        this.handleNetworkChange({ ...data, source: 'platform' });
    }

    handleVPNStateChange(data) {
        const wasActive = this.state.vpnActive;
        this.state.vpnActive = data.active;

        if (wasActive !== data.active) {
            log.info(`VPN state changed: ${data.active ? 'connected' : 'disconnected'}`);

            this.emit('vpn-change', {
                active: data.active,
                wasActive,
                state: { ...this.state }
            });

            // Trigger network re-evaluation
            this.performComprehensiveCheck();
        }
    }

    handleConnectivityChange(results) {
        const wasOnline = this.state.isOnline;
        this.state.isOnline = results.success;
        this.state.confidence = results.confidence;
        this.state.networkQuality = this.calculateNetworkQuality(results);

        this.recordStateChange(wasOnline, this.state.isOnline);

        this.emit('connectivity-change', {
            wasOnline,
            isOnline: this.state.isOnline,
            results,
            state: { ...this.state }
        });
    }

    recordStateChange(wasOnline, isOnline) {
        const change = {
            timestamp: Date.now(),
            wasOnline,
            isOnline,
            duration: this.state.lastChange ? Date.now() - this.state.lastChange : 0
        };

        this.stateChangeHistory.push(change);

        // Keep history size limited
        if (this.stateChangeHistory.length > this.maxHistorySize) {
            this.stateChangeHistory.shift();
        }

        this.state.lastChange = Date.now();
    }


    getState() {
        return { ...this.state };
    }

    async forceCheck() {
        log.info('Force check requested');
        return await this.performComprehensiveCheck();
    }

    destroy() {
        log.info('Shutting down network monitor');

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        if (this.fastCheckInterval) {
            clearInterval(this.fastCheckInterval);
        }

        if (this.changeDebounceTimer) {
            clearTimeout(this.changeDebounceTimer);
        }

        if (this.platformMonitor) {
            this.platformMonitor.stop();
        }

        this.removeAllListeners();
    }
}

module.exports = NetworkMonitor;