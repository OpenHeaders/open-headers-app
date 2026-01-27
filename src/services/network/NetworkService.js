const EventEmitter = require('events');
const os = require('os');
const dns = require('dns').promises;
const { createLogger } = require('../../utils/mainLogger');
const timeManager = require('../core/TimeManager');

/**
 * Consolidated NetworkService
 * Combines NetworkMonitor and NetworkStateManager functionality
 * Provides unified network state management with atomic updates
 * 
 * Key stability features:
 * - Hysteresis: Prevents rapid state changes with a 5-second cooldown
 * - Consecutive check requirement: Requires 2 consecutive confirmations for state changes
 * - Comprehensive/quick check coordination: Prevents conflicts between check types
 * - Extended initialization period: 30 seconds to prevent false offline during startup
 * - State change history tracking: Detects and blocks flip-flop patterns
 * - Adaptive monitoring: Reduces check frequency when network is stable (battery optimization)
 * - Background-optimized: Longer intervals and fewer endpoints for background operation
 */
class NetworkService extends EventEmitter {
    constructor() {
        super();
        this.log = createLogger('NetworkService');
        
        // State management - start optimistic, will be corrected by initial check
        this.state = {
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
                latency: 0
            },
            lastUpdate: timeManager.now(),
            version: 0
        };
        
        // Concurrency control
        this.stateUpdateLock = false;
        this.pendingStateChanges = {};
        
        this.intervals = new Map();
        this.isDestroyed = false;
        
        // Minimal endpoints for battery efficiency
        this.dnsTestHosts = ['google.com', 'cloudflare.com'];
        this.connectivityEndpoints = [
            { host: '8.8.8.8', port: 443, name: 'Google DNS' },
            { host: '8.8.4.4', port: 443, name: 'Google DNS Secondary' }
        ];
        
        // Background-optimized intervals
        this.checkInterval = 60000; // 60 seconds - less frequent for battery savings
        this.quickCheckInterval = 15000; // 15 seconds - reduced frequency for background mode
        this.debounceDelay = 1000; // 1 second debounce - faster response for background apps
        
        // Adaptive monitoring - DISABLED for better background reliability
        // this.stableNetworkMultiplier = 1; // Don't increase intervals for background apps
        // this.stabilityThreshold = 300000; // 5 minutes before reducing checks
        this.isNetworkStable = false; // Start as unstable to maintain regular checks
        this.adaptiveCheckInterval = this.checkInterval;
        this.adaptiveQuickCheckInterval = this.quickCheckInterval;
        
        // State stability - REDUCED for faster recovery
        this.consecutiveOfflineChecks = 0;
        this.consecutiveOnlineChecks = 0;
        this.requiredConsecutiveChecks = 1; // Only 1 check needed for background apps
        this.lastComprehensiveCheck = 0;
        this.comprehensiveCheckInProgress = false;
        this.stateChangeHistory = [];
        this.maxHistorySize = 10;
        
        // Hysteresis prevents rapid state changes - REDUCED for background apps
        this.hysteresisTimeout = null;
        this.hysteresisDelay = 2000; // 2 seconds - faster recovery for background mode
        
        this.isInitialized = false;
        this.initializationTime = timeManager.now();
    }

    /**
     * Initialize the service
     */
    async initialize() {
        this.log.info('Initializing NetworkService...');
        
        this.startMonitoring();
        
        this._doingInitialCheck = true;
        
        // Initial network check
        this.log.info('Starting initial network check...');
        const checkStartTime = timeManager.now();
        await this.checkNetworkState();
        const checkEndTime = timeManager.now();
        this.log.debug('Initial network check completed in', checkEndTime - checkStartTime, 'ms');
        
        this._doingInitialCheck = false;
        
        this.isInitialized = true;
        this.log.info('NetworkService initialized successfully');
        this.log.info('Initialization complete, time elapsed:', timeManager.now() - this.initializationTime, 'ms');
    }

    /**
     * Start all monitoring tasks
     */
    startMonitoring() {
        this.startAdaptiveMonitoring();
        this.log.info('Network monitoring started');
    }

    /**
     * Get current state
     */
    getState() {
        return { ...this.state };
    }
    
    /**
     * Start adaptive monitoring for background operation
     */
    startAdaptiveMonitoring() {
        const scheduleNextCheck = () => {
            const interval = this.isNetworkStable ? 
                this.adaptiveCheckInterval : 
                this.checkInterval;
            
            this.intervals.set('networkCheck', setTimeout(() => {
                if (!this.isDestroyed) {
                    this.checkNetworkState().catch(err => 
                        this.log.error('Network state check error:', err)
                    );
                    scheduleNextCheck();
                }
            }, interval));
        };
        scheduleNextCheck();

        const scheduleNextQuickCheck = () => {
            const interval = this.isNetworkStable ? 
                this.adaptiveQuickCheckInterval : 
                this.quickCheckInterval;
            
            this.intervals.set('quickCheck', setTimeout(() => {
                if (!this.isDestroyed) {
                    this.quickConnectivityCheck().catch(err => 
                        this.log.error('Quick connectivity check error:', err)
                    );
                    scheduleNextQuickCheck();
                }
            }, interval));
        };
        scheduleNextQuickCheck();
        
        this.log.info('Started adaptive monitoring for background operation');
    }
    
    /**
     * Update monitoring based on network stability
     */
    updateAdaptiveMonitoring() {
        // Adaptive monitoring is DISABLED for background apps
        // We want consistent check intervals to ensure reliability
        
        /* Original adaptive logic kept for reference:
        const now = timeManager.now();
        const timeSinceLastChange = now - this.state.lastUpdate;
        
        // If network has been stable for threshold period
        if (this.state.isOnline && timeSinceLastChange > this.stabilityThreshold) {
            if (!this.isNetworkStable) {
                this.isNetworkStable = true;
                this.adaptiveCheckInterval = this.checkInterval * this.stableNetworkMultiplier;
                this.adaptiveQuickCheckInterval = this.quickCheckInterval * this.stableNetworkMultiplier;
                this.log.info('Network stable - reducing check frequency for battery savings');
            }
        } else {
            if (this.isNetworkStable) {
                this.isNetworkStable = false;
                this.adaptiveCheckInterval = this.checkInterval;
                this.adaptiveQuickCheckInterval = this.quickCheckInterval;
                this.log.info('Network unstable - resuming normal check frequency');
            }
        }
        */
    }

    /**
     * Apply state changes atomically
     */
    applyStateChanges() {
        if (this.stateUpdateLock) {
            this.log.warn('State update already in progress, queueing changes');
            setTimeout(() => this.applyStateChanges(), 50);
            return;
        }

        this.stateUpdateLock = true;
        
        try {
            const hasChanges = Object.keys(this.pendingStateChanges).length > 0;
            if (!hasChanges) {
                return;
            }

            const newState = JSON.parse(JSON.stringify(this.state));
            Object.assign(newState, this.pendingStateChanges);
            newState.version = this.state.version + 1;
            newState.lastUpdate = timeManager.now();
            this.pendingStateChanges = {};
            
            const oldState = this.state;
            this.state = newState;
            
            // Suppress false offline during initialization
            const timeSinceInit = timeManager.now() - this.initializationTime;
            const isOffline = !newState.isOnline;
            const wasOnline = oldState.isOnline;
            
            
            // 10-second grace period prevents false offline on startup (reduced for background apps)
            if (isOffline && (timeSinceInit < 10000 || this._doingInitialCheck) && !this.isInitialized) {
                this.log.debug('SUPPRESSING offline state during initialization phase', {
                    timeSinceInit,
                    wasOnline,
                    isInitialized: this.isInitialized,
                    doingInitialCheck: this._doingInitialCheck,
                    newStateVersion: newState.version,
                    networkQuality: newState.networkQuality,
                    pendingChanges: this.pendingStateChanges
                });
                this.state = oldState;
                return;
            }
            
            if (wasOnline !== newState.isOnline) {
                this.log.warn('NETWORK STATE TRANSITION:', {
                    from: wasOnline ? 'online' : 'offline',
                    to: newState.isOnline ? 'online' : 'offline',
                    isInitialized: this.isInitialized,
                    timeSinceInit,
                    version: newState.version
                });
            }
            
            const eventData = {
                newState: this.getState(),
                oldState,
                version: newState.version
            };
            
            
            this.emit('stateChanged', eventData);
            
        } finally {
            this.stateUpdateLock = false;
        }
    }

    /**
     * Update state with changes
     */
    updateState(changes, immediate = false) {
        if (changes.hasOwnProperty('isOnline')) {
            if (!changes.isOnline) {
                this.log.debug('OFFLINE STATE REQUESTED - Stack trace:', new Error().stack);
                
                if (this._doingInitialCheck && !this.isInitialized) {
                    this.log.debug('SKIPPING offline state change during initial check');
                    return;
                }
            }
        }
        
        Object.assign(this.pendingStateChanges, changes);
        
        if (immediate) {
            this.applyStateChanges();
        } else {
            clearTimeout(this.stateUpdateTimeout);
            this.stateUpdateTimeout = setTimeout(() => {
                this.applyStateChanges();
            }, this.debounceDelay);
        }
    }

    /**
     * Apply state changes with hysteresis to prevent rapid fluctuations
     */
    applyStateWithHysteresis(newState) {
        const currentIsOnline = this.state.isOnline;
        const newIsOnline = newState.isOnline;
        
        const now = timeManager.now();
        this.recordStateChangeAttempt(currentIsOnline, newIsOnline, now);
        
        if (currentIsOnline !== newIsOnline) {
            if (this.hysteresisTimeout) {
                this.log.debug(`State change blocked by hysteresis (current: ${currentIsOnline ? 'online' : 'offline'}, attempted: ${newIsOnline ? 'online' : 'offline'})`);
                return;
            }
            
            if (!this.isStableStateChange()) {
                this.log.debug(`State change blocked - not stable (current: ${currentIsOnline ? 'online' : 'offline'}, attempted: ${newIsOnline ? 'online' : 'offline'})`);
                return;
            }
            
            this.hysteresisTimeout = setTimeout(() => {
                this.hysteresisTimeout = null;
                this.log.debug('Hysteresis period ended');
            }, this.hysteresisDelay);
            
            this.log.info(`Applying state change with hysteresis: ${currentIsOnline ? 'online' : 'offline'} -> ${newIsOnline ? 'online' : 'offline'}`);
        }
        
        this.updateState(newState);
        this.updateAdaptiveMonitoring();
    }
    
    /**
     * Record state change attempt for stability analysis
     */
    recordStateChangeAttempt(wasOnline, isOnline, timestamp) {
        this.stateChangeHistory.push({
            wasOnline,
            isOnline,
            timestamp,
            type: wasOnline === isOnline ? 'stable' : 'change'
        });
        
        if (this.stateChangeHistory.length > this.maxHistorySize) {
            this.stateChangeHistory.shift();
        }
    }
    
    /**
     * Check if a state change is stable based on recent history
     */
    isStableStateChange() {
        if (this.stateChangeHistory.length < 3) {
            return true;
        }
        
        const recentChanges = this.stateChangeHistory.slice(-5);
        const changeCount = recentChanges.filter(h => h.type === 'change').length;
        
        if (changeCount >= 3) {
            this.log.debug(`Too many recent state changes (${changeCount} in last 5 checks)`);
            return false;
        }
        
        const last3 = this.stateChangeHistory.slice(-3);
        const states = last3.map(h => h.isOnline);
        if (states.length === 3 && states[0] === states[2] && states[0] !== states[1]) {
            this.log.debug('Detected flip-flop pattern in state changes');
            return false;
        }
        
        return true;
    }

    /**
     * Comprehensive network state check
     */
    async checkNetworkState() {
        if (this.isDestroyed) return;
        
        if (this.comprehensiveCheckInProgress) {
            this.log.debug('Skipping comprehensive check - another check in progress');
            return;
        }
        
        this.comprehensiveCheckInProgress = true;
        this.lastComprehensiveCheck = timeManager.now();
        
        try {
            const [interfaces, dnsResults, connectivityResults] = await Promise.all([
                this.getNetworkInterfaces(),
                this.checkDNSResolution(),
                this.checkInternetConnectivity()
            ]);

            const vpnActive = this.detectVPN(interfaces);
            const primaryInterface = this.findPrimaryInterface(interfaces);
            const connectionType = this.determineConnectionType(primaryInterface);
            
            const networkQuality = this.calculateNetworkQuality({
                dnsSuccess: dnsResults.some(r => r.success),
                connectivitySuccess: connectivityResults.some(r => r.success),
                latency: Math.min(...connectivityResults.filter(r => r.latency).map(r => r.latency))
            });

            const hasDNS = dnsResults.some(r => r.success);
            const hasConnectivity = connectivityResults.some(r => r.success);
            
            // Online if EITHER DNS OR connectivity work (more forgiving)
            const isOnline = hasDNS || hasConnectivity;
            
            // Log comprehensive check results for debugging
            this.log.info('COMPREHENSIVE CHECK COMPLETE:', {
                hasDNS,
                hasConnectivity,
                isOnline,
                networkQuality,
                vpnActive,
                primaryInterface,
                connectionType,
                dnsServers: dns.getServers(),
                connectivityDetails: connectivityResults.map(r => ({
                    name: r.name,
                    success: r.success,
                    error: r.error,
                    errorCode: r.errorCode
                }))
            });

            this.applyStateWithHysteresis({
                isOnline,
                networkQuality,
                vpnActive,
                interfaces: Array.from(interfaces.entries()),
                primaryInterface,
                connectionType,
                diagnostics: {
                    dnsResolvable: dnsResults.some(r => r.success),
                    internetReachable: connectivityResults.some(r => r.success),
                    captivePortal: false, // TODO: Implement captive portal detection
                    latency: Math.min(...connectivityResults.filter(r => r.latency).map(r => r.latency))
                }
            });

        } catch (error) {
            this.log.error('Error in network state check:', error);
            this.log.debug('Setting offline state due to check error', {
                error: error.message,
                isInitialized: this.isInitialized,
                timeSinceInit: timeManager.now() - this.initializationTime
            });
            this.applyStateWithHysteresis({
                isOnline: false,
                networkQuality: 'poor',
                diagnostics: {
                    dnsResolvable: false,
                    internetReachable: false,
                    captivePortal: false,
                    latency: 0
                }
            });
        } finally {
            this.comprehensiveCheckInProgress = false;
        }
    }

    /**
     * Quick connectivity check
     */
    async quickConnectivityCheck() {
        if (this.isDestroyed) return;
        
        const timeSinceComprehensive = timeManager.now() - this.lastComprehensiveCheck;
        if (this.comprehensiveCheckInProgress || timeSinceComprehensive < 2000) {
            this.log.debug('Skipping quick check - comprehensive check active or recent');
            return;
        }
        
        try {
            // Use Google DNS first as it's most reliable with VPNs
            const endpoint = this.connectivityEndpoints[0];
            const result = await this.checkEndpoint(endpoint);
            
            // If we get EADDRNOTAVAIL, it's likely a VPN routing issue, not truly offline
            // Try the second endpoint before declaring offline
            if (!result.success && result.errorCode === 'EADDRNOTAVAIL' && this.connectivityEndpoints.length > 1) {
                this.log.warn('QUICK CHECK: First endpoint blocked by VPN/firewall', {
                    endpoint: endpoint.name,
                    host: endpoint.host,
                    error: result.error,
                    errorCode: result.errorCode
                });
                const fallbackResult = await this.checkEndpoint(this.connectivityEndpoints[1]);
                this.log.info('QUICK CHECK: Fallback endpoint result', {
                    endpoint: this.connectivityEndpoints[1].name,
                    success: fallbackResult.success,
                    error: fallbackResult.error,
                    errorCode: fallbackResult.errorCode
                });
                if (fallbackResult.success) {
                    result.success = true;
                }
            }
            
            if (result.success !== this.state.isOnline) {
                if (result.success) {
                    this.consecutiveOnlineChecks++;
                    this.consecutiveOfflineChecks = 0;
                } else {
                    this.consecutiveOfflineChecks++;
                    this.consecutiveOnlineChecks = 0;
                }
                
                if ((result.success && this.consecutiveOnlineChecks >= this.requiredConsecutiveChecks) ||
                    (!result.success && this.consecutiveOfflineChecks >= this.requiredConsecutiveChecks)) {
                    this.log.warn(`QUICK CHECK STATE CHANGE: ${this.state.isOnline ? 'online' : 'offline'} -> ${result.success ? 'online' : 'offline'}`, {
                        checksRequired: this.requiredConsecutiveChecks,
                        consecutiveChecks: result.success ? this.consecutiveOnlineChecks : this.consecutiveOfflineChecks,
                        endpoint: endpoint.name,
                        errorCode: result.errorCode
                    });
                    this.updateState({ isOnline: result.success }, true);
                    this.consecutiveOnlineChecks = 0;
                    this.consecutiveOfflineChecks = 0;
                } else {
                    this.log.debug(`Quick check detected potential change but waiting for confirmation (${result.success ? 'online' : 'offline'} count: ${result.success ? this.consecutiveOnlineChecks : this.consecutiveOfflineChecks})`);
                }
            } else {
                this.consecutiveOnlineChecks = 0;
                this.consecutiveOfflineChecks = 0;
            }
        } catch (error) {
            this.log.debug('Quick connectivity check failed:', error.message);
        }
    }

    /**
     * Get network interfaces
     */
    async getNetworkInterfaces() {
        const interfaces = new Map();
        const netInterfaces = os.networkInterfaces();
        
        // this.log.info('Detected network interfaces:', Object.keys(netInterfaces));
        
        for (const [name, addresses] of Object.entries(netInterfaces)) {
            const validAddresses = addresses.filter(addr => 
                !addr.internal && addr.family === 'IPv4'
            );

            if (validAddresses.length > 0) {
                interfaces.set(name, {
                    name,
                    addresses: validAddresses,
                    type: this.getInterfaceType(name)
                });
                this.log.info(`Interface ${name}:`, {
                    type: this.getInterfaceType(name),
                    addresses: validAddresses.map(a => ({ address: a.address, netmask: a.netmask }))
                });
            }
        }
        
        this.log.info(`Found ${interfaces.size} active network interfaces`);
        return interfaces;
    }

    /**
     * Check DNS resolution
     */
    async checkDNSResolution() {
        this.log.info('Starting DNS resolution checks for hosts:', this.dnsTestHosts);
        
        // Log current DNS servers
        try {
            const dnsServers = dns.getServers();
            this.log.info('Current DNS servers:', dnsServers);
        } catch (error) {
            this.log.info('Could not get DNS servers:', error.message);
        }
        
        const checkPromises = this.dnsTestHosts.map(async (host) => {
            try {
                const start = timeManager.now();
                this.log.info(`DNS check starting for: ${host}`);
                
                let result;
                
                // Use OS-specific DNS commands for more reliable resolution
                if (process.platform === 'darwin') {
                    // macOS: use dscacheutil or nslookup
                    result = await this.checkDNSMacOS(host);
                } else if (process.platform === 'win32') {
                    // Windows: use nslookup
                    result = await this.checkDNSWindows(host);
                } else if (process.platform === 'linux') {
                    // Linux: use getent or nslookup
                    result = await this.checkDNSLinux(host);
                } else {
                    // Fallback to Node.js DNS resolver
                    result = await Promise.race([
                        dns.resolve4(host),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('DNS timeout')), 3000)
                        )
                    ]);
                }
                
                const latency = timeManager.now() - start;
                const ips = Array.isArray(result) ? result : [result];
                this.log.info(`DNS check SUCCESS for ${host}: resolved to ${ips.join(', ')} in ${latency}ms`);
                return { host, success: true, latency, ips };
            } catch (error) {
                this.log.info(`DNS check FAILED for ${host}: ${error.message}`);
                return { host, success: false, error: error.message };
            }
        });

        return await Promise.all(checkPromises);
    }

    /**
     * Parse nslookup output to extract IP addresses
     * Handles both Windows and Unix output formats
     */
    parseNslookupOutput(stdout) {
        const lines = stdout.split('\n');
        const ips = [];

        let foundAnswerSection = false;
        let skipNextAddress = true; // Skip first Address line (DNS server) on Windows

        for (const line of lines) {
            const trimmedLine = line.trim();

            // Detect answer section (works for both "Non-authoritative answer:" and "answer:")
            if (trimmedLine.toLowerCase().includes('answer')) {
                foundAnswerSection = true;
                skipNextAddress = false; // After answer section, Address lines are results
                continue;
            }

            if (foundAnswerSection) {
                // Handle "Addresses:" (plural, Windows with multiple IPs)
                if (trimmedLine.toLowerCase().startsWith('addresses:')) {
                    const ip = trimmedLine.split(/addresses?:/i)[1]?.trim();
                    if (ip && this.isValidIPv4(ip)) {
                        ips.push(ip);
                    }
                    continue;
                }

                // Handle "Address:" or continuation lines with just IP
                if (trimmedLine.toLowerCase().startsWith('address:')) {
                    const ip = trimmedLine.split(/address:/i)[1]?.trim();
                    // Filter out DNS server port notation (e.g., "8.8.8.8#53")
                    if (ip && !ip.includes('#') && this.isValidIPv4(ip)) {
                        ips.push(ip);
                    }
                    continue;
                }

                // Handle continuation lines (just IP addresses, indented)
                if (this.isValidIPv4(trimmedLine)) {
                    ips.push(trimmedLine);
                }
            }
        }

        return ips;
    }

    /**
     * Validate IPv4 address format
     */
    isValidIPv4(str) {
        if (!str) return false;
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (!ipv4Regex.test(str)) return false;
        const parts = str.split('.');
        return parts.every(part => {
            const num = parseInt(part, 10);
            return num >= 0 && num <= 255;
        });
    }

    /**
     * Execute nslookup command
     */
    async executeNslookup(host) {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        // Add timeout to prevent hanging processes - 5 second timeout
        const { stdout } = await execAsync(`nslookup -timeout=3 ${host} 8.8.8.8`, {
            timeout: 5000,
            windowsHide: true
        });
        const ips = this.parseNslookupOutput(stdout);

        if (ips.length > 0) {
            this.log.info(`DNS resolved via nslookup: ${host} -> ${ips.join(', ')}`);
            return ips;
        }
        throw new Error('No IP addresses found');
    }

    /**
     * Check DNS on macOS using system commands
     */
    async checkDNSMacOS(host) {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        try {
            // Try dscacheutil first (faster)
            const { stdout } = await execAsync(`dscacheutil -q host -a name ${host}`);
            const ipMatch = stdout.match(/ip_address:\s*([\d.]+)/g);
            if (ipMatch && ipMatch.length > 0) {
                const ips = ipMatch.map(match => match.replace(/ip_address:\s*/, ''));
                this.log.info(`DNS resolved via dscacheutil: ${host} -> ${ips.join(', ')}`);
                return ips;
            }
        } catch (error) {
            this.log.debug(`dscacheutil failed for ${host}, trying nslookup`);
        }
        
        // Fallback to nslookup
        return await this.executeNslookup(host);
    }
    
    /**
     * Check DNS on Windows using nslookup
     */
    async checkDNSWindows(host) {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        // Skip PowerShell Resolve-DnsName - it can hang and cause process accumulation
        // Use nslookup directly as it's more reliable and doesn't require PowerShell startup overhead
        // The Resolve-DnsName cmdlet was causing dozens of hanging powershell.exe processes
        try {
            return await this.executeNslookup(host);
        } catch (error) {
            this.log.debug(`nslookup failed for ${host}: ${error.message}`);
            // Final fallback to Node.js DNS resolver
            const dns = require('dns').promises;
            return await dns.resolve4(host);
        }
    }
    
    /**
     * Check DNS on Linux using getent or nslookup
     */
    async checkDNSLinux(host) {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        // Try getent first (more reliable on Linux)
        try {
            const { stdout } = await execAsync(`getent hosts ${host}`);
            const parts = stdout.trim().split(/\s+/);
            if (parts.length > 0 && parts[0]) {
                const ips = [parts[0]];
                this.log.info(`DNS resolved via getent: ${host} -> ${ips.join(', ')}`);
                return ips;
            }
        } catch (error) {
            this.log.debug(`getent failed for ${host}, trying nslookup`);
        }
        
        // Fallback to nslookup
        return await this.executeNslookup(host);
    }

    /**
     * Check internet connectivity
     */
    async checkInternetConnectivity() {
        // this.log.info('Starting connectivity checks for endpoints:', this.connectivityEndpoints);
        
        const checkPromises = this.connectivityEndpoints.map(endpoint => 
            this.checkEndpoint(endpoint)
        );

        return await Promise.all(checkPromises);
    }

    /**
     * Check single endpoint
     */
    async checkEndpoint(endpoint) {
        const net = require('net');
        const start = timeManager.now();
        
        this.log.info(`Checking connectivity to ${endpoint.name} (${endpoint.host}:${endpoint.port})`);

        return new Promise((resolve) => {
            const socket = new net.Socket();
            let connected = false;

            socket.setTimeout(3000);

            socket.on('connect', () => {
                connected = true;
                const latency = timeManager.now() - start;
                socket.destroy();
                this.log.info(`Connectivity SUCCESS to ${endpoint.name}: connected in ${latency}ms`);
                resolve({ ...endpoint, success: true, latency });
            });

            socket.on('error', (error) => {
                if (!connected) {
                    // EADDRNOTAVAIL often happens with VPNs - treat as network routing issue, not offline
                    if (error.code === 'EADDRNOTAVAIL') {
                        this.log.info(`Connectivity BLOCKED by VPN/firewall to ${endpoint.name}: ${error.message}`);
                    } else {
                        this.log.info(`Connectivity FAILED to ${endpoint.name}: ${error.message}`);
                    }
                    resolve({ ...endpoint, success: false, error: error.message, errorCode: error.code });
                }
            });

            socket.on('timeout', () => {
                socket.destroy();
                if (!connected) {
                    this.log.info(`Connectivity TIMEOUT to ${endpoint.name} after 3000ms`);
                    resolve({ ...endpoint, success: false, error: 'Timeout' });
                }
            });

            try {
                socket.connect(endpoint.port, endpoint.host);
            } catch (error) {
                this.log.info(`Connectivity ERROR to ${endpoint.name}: ${error.message}`);
                resolve({ ...endpoint, success: false, error: error.message });
            }
        });
    }

    /**
     * Detect VPN
     */
    detectVPN(interfaces) {
        const vpnIndicators = ['tun', 'tap', 'ppp', 'ipsec', 'vpn'];
        
        for (const [name] of interfaces) {
            const lowerName = name.toLowerCase();
            if (vpnIndicators.some(indicator => lowerName.includes(indicator))) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Find primary interface
     */
    findPrimaryInterface(interfaces) {
        for (const [name, info] of interfaces) {
            if (info.type === 'ethernet') {
                return name;
            }
        }

        for (const [name, info] of interfaces) {
            if (info.type === 'wifi') {
                return name;
            }
        }

        const first = interfaces.entries().next();
        return first.done ? null : first.value[0];
    }

    /**
     * Get interface type
     */
    getInterfaceType(name) {
        const lowerName = name.toLowerCase();
        
        if (lowerName.includes('eth') || lowerName.includes('en0')) {
            return 'ethernet';
        } else if (lowerName.includes('wi-fi') || lowerName.includes('wlan') || 
                   lowerName.includes('airport') || lowerName.includes('en1')) {
            return 'wifi';
        } else if (lowerName.includes('lo')) {
            return 'loopback';
        } else {
            return 'other';
        }
    }

    /**
     * Determine connection type
     */
    determineConnectionType(primaryInterface) {
        if (!primaryInterface) return 'none';
        
        const interfaces = new Map(this.state.interfaces);
        const info = interfaces.get(primaryInterface);
        
        return info ? info.type : 'unknown';
    }

    /**
     * Calculate network quality
     */
    calculateNetworkQuality({ dnsSuccess, connectivitySuccess, latency }) {
        if (!dnsSuccess && !connectivitySuccess) {
            return 'poor';
        }

        if (latency < 100) {
            return 'excellent';
        } else if (latency < 300) {
            return 'good';
        } else if (latency < 1000) {
            return 'fair';
        } else {
            return 'poor';
        }
    }

    /**
     * Force network check
     */
    async forceCheck() {
        this.log.info('Forcing network check...');
        await this.checkNetworkState();
        return this.getState();
    }

    /**
     * Destroy the service
     */
    destroy() {
        this.log.info('Destroying NetworkService...');
        this.isDestroyed = true;

        for (const [name, timerId] of this.intervals) {
            if (typeof timerId === 'number') {
                clearTimeout(timerId); // Works for both setTimeout and setInterval
                clearInterval(timerId);
            }
            this.log.debug(`Cleared timer: ${name}`);
        }
        this.intervals.clear();

        clearTimeout(this.stateUpdateTimeout);
        clearTimeout(this.hysteresisTimeout);

        this.removeAllListeners();

        this.log.info('NetworkService destroyed');
    }
}

module.exports = new NetworkService();