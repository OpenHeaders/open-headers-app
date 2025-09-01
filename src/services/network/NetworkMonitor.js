// src/services/NetworkMonitor.js
const { EventEmitter } = require('events');
const os = require('os');
const dns = require('dns').promises;
const { net } = require('electron');
const { createLogger } = require('../utils/mainLogger');
const log = createLogger('NetworkMonitor');
const timeManager = require('../core/TimeManager');

class NetworkMonitor extends EventEmitter {
    constructor() {
        super();

        this.state = {
            isOnline: false, // Start offline until proven otherwise
            connectionType: 'unknown',
            lastChange: timeManager.now(),
            confidence: 0, // No confidence until first check
            networkInterfaces: new Map(),
            vpnActive: false,
            lastCheck: timeManager.now(),
            consecutiveFailures: 0,
            networkQuality: 'offline' // Start offline
        };

        this.lastInterfaces = new Map();
        this.checkInterval = null;
        this.fastCheckInterval = null;
        this.platformMonitor = null;
        this.changeDebounceTimer = null;
        this.isDestroyed = false;
        this.stateLock = false;

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
        
        // Track initialization time to prevent false VPN disconnects
        this.initializationTime = timeManager.now();
        
        // Timers map for better management
        this.timers = new Map();
        this.intervals = new Map();
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
        if (this.isDestroyed) return;
        
        // Initial check
        this.checkNetworkInterfaces();

        // Fast polling for interface changes
        const intervalId = setInterval(() => {
            if (!this.isDestroyed) {
                this.checkNetworkInterfaces();
            }
        }, this.config.fastCheckInterval);
        
        this.fastCheckInterval = intervalId;
        this.intervals.set('fastCheck', intervalId);
    }

    startConnectivityMonitoring() {
        if (this.isDestroyed) return;
        
        // Regular connectivity checks
        const intervalId = setInterval(() => {
            if (!this.isDestroyed) {
                this.performConnectivityCheck();
            }
        }, this.config.normalCheckInterval);
        
        this.checkInterval = intervalId;
        this.intervals.set('connectivityCheck', intervalId);
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

        // Run all checks in parallel with individual timeouts
        const [basicCheck, dnsCheck, endpointsCheck] = await Promise.allSettled([
            Promise.race([
                this.checkBasicConnectivity(),
                new Promise((resolve) => 
                    setTimeout(() => resolve({ success: false, error: 'timeout' }), 5000)
                )
            ]),
            Promise.race([
                this.checkDNSResolution(),
                new Promise((resolve) => 
                    setTimeout(() => resolve({ success: false, successRate: 0 }), 8000)
                )
            ]),
            Promise.race([
                this.checkMultipleEndpoints(),
                new Promise((resolve) => 
                    setTimeout(() => resolve({ success: false, confidence: 0 }), 10000)
                )
            ])
        ]);

        const results = {
            basic: basicCheck.status === 'fulfilled' ? basicCheck.value : { success: false },
            dns: dnsCheck.status === 'fulfilled' ? dnsCheck.value : { success: false },
            endpoints: endpointsCheck.status === 'fulfilled' ? endpointsCheck.value : { success: false }
        };

        // Log comprehensive check results
        log.info('Comprehensive network check complete:', {
            basic: {
                success: results.basic.success,
                details: results.basic
            },
            dns: {
                success: results.dns.success,
                successRate: results.dns.successRate || 0,
                workingCombinations: results.dns.workingCombinations?.length || 0
            },
            endpoints: {
                success: results.endpoints.success,
                confidence: results.endpoints.confidence || 0,
                successfulEndpoints: results.endpoints.successfulEndpoints || 0,
                totalEndpoints: results.endpoints.totalEndpoints || 0,
                avgResponseTime: results.endpoints.avgResponseTime || 0
            }
        });

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
                this.state.lastCheck = timeManager.now();
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
            request.on('error', (error) => {
                log.debug('Basic connectivity check failed:', error.message);
                handleResponse(false);
            });

            setTimeout(() => handleResponse(false), 3500);
            request.end();
        });
    }

    async checkDNSResolution() {
        const dnsServers = ['1.1.1.1', '8.8.8.8', '208.67.222.222'];
        const domains = ['google.com', 'cloudflare.com', 'microsoft.com'];

        // Create all checks in parallel using flatMap for better performance
        const checks = dnsServers.flatMap(server =>
            domains.map(domain =>
                dns.resolve4(domain, { servers: [server] })
                    .then(() => ({ success: true, server, domain }))
                    .catch((error) => {
                        log.debug(`DNS resolution failed for ${domain} via ${server}:`, error.message);
                        return { success: false, server, domain, error: error.message };
                    })
            )
        );

        // Execute all checks in parallel with a reasonable timeout
        const results = await Promise.allSettled(
            checks.map(check =>
                Promise.race([
                    check,
                    new Promise((resolve) => 
                        setTimeout(() => resolve({ success: false, error: 'timeout' }), 5000)
                    )
                ])
            )
        );
        
        const successful = results.filter(r =>
            r.status === 'fulfilled' && r.value.success
        ).length;
        
        const failed = results.filter(r =>
            r.status === 'fulfilled' && !r.value.success
        );
        
        if (failed.length > 0) {
            log.debug(`DNS check: ${failed.length}/${checks.length} checks failed`);
        }

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

        // Execute all endpoint checks truly in parallel
        const results = await Promise.allSettled(
            endpoints.map(endpoint => 
                // Add a hard timeout for each endpoint check
                Promise.race([
                    this.checkEndpoint(endpoint),
                    new Promise((resolve) => 
                        setTimeout(() => 
                            resolve({ 
                                success: false, 
                                error: 'timeout', 
                                endpoint: endpoint.url 
                            }), 
                            endpoint.timeout + 1000
                        )
                    )
                ])
            )
        );

        let totalWeight = 0;
        let successWeight = 0;
        const responseTimes = [];
        let successfulEndpoints = 0;
        let failedEndpoints = 0;

        results.forEach((result, index) => {
            const endpoint = endpoints[index];
            totalWeight += endpoint.weight;

            if (result.status === 'fulfilled' && result.value.success) {
                successWeight += endpoint.weight;
                successfulEndpoints++;
                if (result.value.responseTime) {
                    responseTimes.push(result.value.responseTime);
                }
            } else {
                failedEndpoints++;
                log.debug(`Endpoint check failed for ${endpoint.url}:`, 
                    result.status === 'rejected' ? result.reason : result.value?.error || 'Unknown error');
            }
        });

        const confidence = successWeight / totalWeight;
        const avgResponseTime = responseTimes.length > 0
            ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
            : null;
            
        if (failedEndpoints > 0) {
            log.debug(`Endpoint checks: ${successfulEndpoints}/${endpoints.length} successful`);
        }

        return {
            success: confidence > 0.3,
            confidence,
            successRate: successWeight / totalWeight,
            avgResponseTime,
            successfulEndpoints,
            totalEndpoints: endpoints.length,
            responsive: results
                .map((r, i) => ({ ...r, endpoint: endpoints[i] }))
                .filter(r => r.status === 'fulfilled' && r.value?.success)
                .map(r => r.endpoint.url)
        };
    }

    async checkEndpoint(endpoint) {
        const startTime = timeManager.now();

        return new Promise((resolve) => {
            const request = net.request({
                method: 'HEAD',
                url: endpoint.url,
                timeout: endpoint.timeout
            });

            let resolved = false;

            const handleResponse = (success, statusCode = null, error = null) => {
                if (!resolved) {
                    resolved = true;
                    resolve({
                        success,
                        statusCode,
                        responseTime: timeManager.now() - startTime,
                        endpoint: endpoint.url,
                        error
                    });
                }
            };

            request.on('response', (response) => {
                handleResponse(true, response.statusCode);
            });

            request.on('error', (error) => {
                handleResponse(false, null, error.message);
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
        // Prevent concurrent state updates
        if (this.stateLock) {
            log.warn('State update already in progress, skipping');
            return this.state;
        }
        
        try {
            this.stateLock = true;
            
            const wasOnline = this.state.isOnline;
            const previousState = JSON.parse(JSON.stringify(this.state));

            // Create new state object atomically
            const isOnline = results.basic.success || results.endpoints.success;
            const newState = {
                ...this.state,
                isOnline: isOnline,
                confidence: results.endpoints.confidence || 0,
                networkQuality: this.calculateNetworkQuality(results.endpoints),
                lastCheck: timeManager.now()
            };
            
            // Debug log for network state determination
            log.debug('Network state determination:', {
                basicSuccess: results.basic.success,
                endpointsSuccess: results.endpoints.success,
                determinedOnline: isOnline,
                quality: newState.networkQuality,
                confidence: newState.confidence
            });

            // Update consecutive failures
            if (!newState.isOnline) {
                newState.consecutiveFailures = this.state.consecutiveFailures + 1;
            } else {
                newState.consecutiveFailures = 0;
            }

            // Apply state atomically
            this.state = newState;

            // Emit change event if status changed
            if (wasOnline !== this.state.isOnline) {
                log.info(`Network status change detected: ${wasOnline ? 'online' : 'offline'} -> ${this.state.isOnline ? 'online' : 'offline'}`);
                this.recordStateChange(wasOnline, this.state.isOnline);
                this.emit('status-change', {
                    wasOnline,
                    isOnline: this.state.isOnline,
                    state: { ...this.state }
                });
            }

            return this.state;
        } finally {
            this.stateLock = false;
        }
    }

    handleNetworkChange(data) {
        if (this.isDestroyed) return;
        
        log.info('Handling network change:', {
            type: data.type,
            changes: data.changes?.length || 0,
            analysis: data.analysis
        });

        // Clear existing timer safely
        const existingTimer = this.timers.get('changeDebounce');
        if (existingTimer) {
            clearTimeout(existingTimer);
            this.timers.delete('changeDebounce');
        }

        const timerId = setTimeout(async () => {
            if (this.isDestroyed) return;
            
            this.timers.delete('changeDebounce');
            
            log.info('Performing comprehensive check after network change...');
            
            // Perform comprehensive check after network change
            const checkResult = await this.performComprehensiveCheck();
            
            if (this.isDestroyed) return;

            // Emit detailed change event with all state fields
            const eventData = {
                ...data,
                state: { ...this.state },
                checkResult: {
                    isOnline: this.state.isOnline,
                    confidence: this.state.confidence,
                    networkQuality: this.state.networkQuality
                }
            };
            
            this.emit('network-change', eventData);
        }, 500); // 500ms debounce
        
        this.changeDebounceTimer = timerId;
        this.timers.set('changeDebounce', timerId);
    }

    handlePlatformNetworkChange(data) {
        // Platform-specific change detected
        log.debug('Platform network change:', data);
        this.handleNetworkChange({ ...data, source: 'platform' });
    }

    handleVPNStateChange(data) {
        const wasActive = this.state.vpnActive;
        
        // Only update VPN state if we have a definitive signal
        // Ignore "disconnected" signals during initialization phase
        if (!data.active && timeManager.now() - this.initializationTime < 5000) {
            log.debug('Ignoring VPN disconnect signal during initialization phase');
            return;
        }
        
        this.state.vpnActive = data.active;

        if (wasActive !== data.active) {
            log.info(`VPN state changed: ${data.active ? 'connected' : 'disconnected'} ${data.interface ? `(${data.interface})` : ''}`);

            this.emit('vpn-change', {
                active: data.active,
                wasActive,
                interface: data.interface,
                name: data.name,
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
            timestamp: timeManager.now(),
            wasOnline,
            isOnline,
            duration: this.state.lastChange ? timeManager.now() - this.state.lastChange : 0
        };

        this.stateChangeHistory.push(change);

        // Keep history size limited
        if (this.stateChangeHistory.length > this.maxHistorySize) {
            this.stateChangeHistory.shift();
        }

        this.state.lastChange = timeManager.now();
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
        
        this.isDestroyed = true;

        // Clear all intervals
        for (const [name, intervalId] of this.intervals) {
            clearInterval(intervalId);
            log.debug(`Cleared interval: ${name}`);
        }
        this.intervals.clear();

        // Clear all timers
        for (const [name, timerId] of this.timers) {
            clearTimeout(timerId);
            log.debug(`Cleared timer: ${name}`);
        }
        this.timers.clear();

        // Legacy cleanup
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        if (this.fastCheckInterval) {
            clearInterval(this.fastCheckInterval);
            this.fastCheckInterval = null;
        }

        if (this.changeDebounceTimer) {
            clearTimeout(this.changeDebounceTimer);
            this.changeDebounceTimer = null;
        }

        if (this.platformMonitor) {
            this.platformMonitor.stop();
            this.platformMonitor.removeAllListeners();
            this.platformMonitor = null;
        }

        // Clear state history to free memory
        this.stateChangeHistory = [];
        this.lastInterfaces.clear();
        
        // Remove all listeners with error handling
        try {
            this.removeAllListeners();
        } catch (error) {
            log.error('Error removing listeners:', error);
        }
    }
}

module.exports = NetworkMonitor;