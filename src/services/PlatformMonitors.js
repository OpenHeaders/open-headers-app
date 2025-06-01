// src/services/PlatformMonitors.js
const { EventEmitter } = require('events');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createLogger } = require('../utils/mainLogger');

// Base class for platform monitors
class BasePlatformMonitor extends EventEmitter {
    constructor() {
        super();
        this.processes = [];
        this.watchers = [];
        this.intervals = [];
    }

    start() {
        this.log = this.log || createLogger(this.constructor.name);
        this.log.info('Starting platform-specific monitoring');
    }

    stop() {
        this.log = this.log || createLogger(this.constructor.name);
        this.log.info('Stopping platform-specific monitoring');

        // Clean up processes
        this.processes.forEach(proc => {
            try {
                proc.kill();
            } catch (e) {
                // Process might already be dead
            }
        });

        // Clean up watchers
        this.watchers.forEach(watcher => {
            try {
                watcher.close();
            } catch (e) {
                // Watcher might already be closed
            }
        });

        // Clear intervals
        this.intervals.forEach(interval => {
            clearInterval(interval);
        });

        this.processes = [];
        this.watchers = [];
        this.intervals = [];
    }

    executeCommand(command, args = []) {
        return new Promise((resolve, reject) => {
            exec(`${command} ${args.join(' ')}`, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout.trim());
                }
            });
        });
    }
}

// macOS-specific network monitor
class MacOSNetworkMonitor extends BasePlatformMonitor {
    constructor() {
        super();
        this.log = createLogger('MacOSNetworkMonitor');
    }

    start() {
        super.start();

        this.watchNetworkConfiguration();
        this.watchVPNState();
        this.watchWiFiState();
        this.monitorNetworkChanges();
    }

    watchNetworkConfiguration() {
        // Watch for network configuration changes
        const configPaths = [
            '/Library/Preferences/SystemConfiguration/com.apple.airport.preferences.plist',
            '/Library/Preferences/SystemConfiguration/NetworkInterfaces.plist',
            '/Library/Preferences/SystemConfiguration/preferences.plist'
        ];

        configPaths.forEach(configPath => {
            if (fs.existsSync(configPath)) {
                try {
                    const watcher = fs.watch(configPath, (eventType) => {
                        if (eventType === 'change') {
                            this.log.info(`Network configuration changed: ${path.basename(configPath)}`);
                            this.emit('network-change', {
                                type: 'config-change',
                                file: path.basename(configPath)
                            });
                        }
                    });
                    this.watchers.push(watcher);
                } catch (e) {
                    this.log.error(`Failed to watch ${configPath}:`, e.message);
                }
            }
        });
    }

    watchVPNState() {
        let lastVPNState = null;
        let lastVPNInterface = null;
        let initialCheckDone = false;

        const checkVPN = async () => {
            try {
                // First check using scutil for native VPNs
                const output = await this.executeCommand('scutil', ['--nc', 'list']);
                const lines = output.split('\n');

                let activeVPN = false;
                let vpnName = null;

                for (const line of lines) {
                    if (line.includes('(Connected)')) {
                        activeVPN = true;
                        // Extract VPN name
                        const match = line.match(/"([^"]+)"/);
                        if (match) {
                            vpnName = match[1];
                        }
                        break;
                    }
                }

                // If no native VPN found, check interfaces for third-party VPNs
                if (!activeVPN) {
                    // Check for active utun interfaces (used by NordVPN, ExpressVPN, etc.)
                    const ifconfigOutput = await this.executeCommand('ifconfig');

                    // Look for utun interfaces with inet addresses
                    const utunMatches = ifconfigOutput.match(/utun\d+:.*\n(?:\s+.*\n)*?\s+inet\s+\d+\.\d+\.\d+\.\d+/g);

                    if (utunMatches && utunMatches.length > 0) {
                        activeVPN = true;
                        // Extract the interface name
                        const interfaceMatch = utunMatches[0].match(/^(utun\d+):/);
                        if (interfaceMatch) {
                            vpnName = interfaceMatch[1];
                        }
                    }
                }

                // Also check for IKEv2 VPNs
                const ikev2Output = await this.executeCommand('scutil', ['--proxy']);
                if (ikev2Output.includes('ProxyAutoConfigEnable : 1')) {
                    activeVPN = true;
                }

                // Only emit state change if:
                // 1. Not the first check OR
                // 2. State actually changed OR
                // 3. Interface changed
                if (initialCheckDone && (lastVPNState !== activeVPN || lastVPNInterface !== vpnName)) {
                    this.log.info(`VPN state changed: ${activeVPN ? 'connected' : 'disconnected'} ${vpnName ? `(${vpnName})` : ''}`);
                    this.emit('vpn-state', {
                        active: activeVPN,
                        name: vpnName,
                        interface: vpnName
                    });
                    lastVPNState = activeVPN;
                    lastVPNInterface = vpnName;
                } else if (!initialCheckDone) {
                    // For initial check, only emit if VPN is detected
                    // This prevents false "disconnected" events on startup
                    if (activeVPN) {
                        this.log.info(`Initial VPN state: connected (${vpnName})`);
                        this.emit('vpn-state', {
                            active: true,
                            name: vpnName,
                            interface: vpnName
                        });
                        lastVPNState = true;
                        lastVPNInterface = vpnName;
                    }
                    initialCheckDone = true;
                }
            } catch (e) {
                // scutil might not be available or might fail
                this.checkVPNInterfaces();
            }
        };

        // Delay initial check to allow NetworkMonitor to establish baseline
        setTimeout(() => {
            checkVPN();
        }, 500);

        // Regular checks - more frequent for better VPN detection
        const interval = setInterval(checkVPN, 1000); // Check every second instead of 2 seconds
        this.intervals.push(interval);
    }

    async checkVPNInterfaces() {
        try {
            const output = await this.executeCommand('ifconfig');

            // Look for active VPN interfaces
            const vpnPatterns = [
                /utun\d+:.*UP/,
                /tun\d+:.*UP/,
                /tap\d+:.*UP/,
                /ppp\d+:.*UP/,
                /ipsec\d+:.*UP/
            ];

            let vpnActive = false;
            let vpnInterface = null;

            // Split by interface sections
            const interfaces = output.split(/^(?=\w)/m);

            for (const interfaceSection of interfaces) {
                for (const pattern of vpnPatterns) {
                    if (pattern.test(interfaceSection)) {
                        vpnActive = true;
                        // Extract interface name
                        const match = interfaceSection.match(/^(\w+\d+):/);
                        if (match) {
                            vpnInterface = match[1];
                        }
                        break;
                    }
                }
                if (vpnActive) break;
            }

            this.emit('vpn-state', {
                active: vpnActive,
                method: 'interface-check',
                interface: vpnInterface
            });
        } catch (e) {
            this.log.error('Failed to check VPN interfaces:', e.message);
        }
    }

    watchWiFiState() {
        let lastWiFiState = null;

        const checkWiFi = async () => {
            try {
                // Get WiFi power state
                const powerOutput = await this.executeCommand(
                    '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport',
                    ['-I']
                );

                const isOn = !powerOutput.includes('AirPort: Off');
                const ssidMatch = powerOutput.match(/\s+SSID: (.+)/);
                const ssid = ssidMatch ? ssidMatch[1] : null;

                const currentState = { on: isOn, ssid };

                if (JSON.stringify(lastWiFiState) !== JSON.stringify(currentState)) {
                    this.log.info('WiFi state changed:', currentState);
                    this.emit('network-change', {
                        type: 'wifi-change',
                        wifi: currentState
                    });
                    lastWiFiState = currentState;
                }
            } catch (e) {
                // airport command might not be available
            }
        };

        // Initial check
        checkWiFi();

        // Regular checks
        const interval = setInterval(checkWiFi, 3000);
        this.intervals.push(interval);
    }

    monitorNetworkChanges() {
        // Use route monitor for real-time network changes
        try {
            const routeMonitor = spawn('route', ['-n', 'monitor']);

            routeMonitor.stdout.on('data', (data) => {
                const output = data.toString();

                if (output.includes('RTM_IFINFO') || output.includes('RTM_NEWADDR') || output.includes('RTM_DELADDR')) {
                    this.log.info('Route change detected');
                    this.emit('network-change', {
                        type: 'route-change',
                        event: output.substring(0, 50)
                    });
                }
            });

            routeMonitor.on('error', (err) => {
                this.log.error('Route monitor error:', err.message);
            });

            this.processes.push(routeMonitor);
        } catch (e) {
            this.log.error('Failed to start route monitor:', e.message);
        }
    }
}

// Windows-specific network monitor
class WindowsNetworkMonitor extends BasePlatformMonitor {
    constructor() {
        super();
        this.log = createLogger('WindowsNetworkMonitor');
    }

    start() {
        super.start();

        this.watchNetworkAdapters();
        this.watchVPNState();
        this.watchWiFiState();
        this.monitorNetworkEvents();
    }

    watchNetworkAdapters() {
        // Monitor network adapter changes using PowerShell
        const monitorScript = `
            while ($true) {
                $adapters = Get-NetAdapter | Select-Object Name, Status, InterfaceDescription
                $adapters | ConvertTo-Json -Compress
                Start-Sleep -Seconds 2
            }
        `;

        try {
            const monitor = spawn('powershell', ['-Command', monitorScript]);
            let lastState = null;

            monitor.stdout.on('data', (data) => {
                const output = data.toString().trim();
                if (output && output.startsWith('[') || output.startsWith('{')) {
                    try {
                        const adapters = JSON.parse(output);
                        const currentState = JSON.stringify(adapters);

                        if (lastState && lastState !== currentState) {
                            this.log.info('Network adapter change detected');
                            this.emit('network-change', {
                                type: 'adapter-change',
                                adapters
                            });
                        }

                        lastState = currentState;
                    } catch (e) {
                        // JSON parsing error
                    }
                }
            });

            monitor.on('error', (err) => {
                this.log.error('Adapter monitor error:', err.message);
            });

            this.processes.push(monitor);
        } catch (e) {
            this.log.error('Failed to start adapter monitor:', e.message);
        }
    }

    watchVPNState() {
        let lastVPNState = null;
        let lastVPNInterface = null;

        const checkVPN = async () => {
            try {
                // First check using scutil for native VPNs
                const output = await this.executeCommand('scutil', ['--nc', 'list']);
                const lines = output.split('\n');

                let activeVPN = false;
                let vpnName = null;

                for (const line of lines) {
                    if (line.includes('(Connected)')) {
                        activeVPN = true;
                        // Extract VPN name
                        const match = line.match(/"([^"]+)"/);
                        if (match) {
                            vpnName = match[1];
                        }
                        break;
                    }
                }

                // If no native VPN found, check interfaces for third-party VPNs
                if (!activeVPN) {
                    // Check for active utun interfaces (used by NordVPN, ExpressVPN, etc.)
                    const ifconfigOutput = await this.executeCommand('ifconfig');

                    // Look for utun interfaces with inet addresses
                    const utunMatches = ifconfigOutput.match(/utun\d+:.*\n(?:\s+.*\n)*?\s+inet\s+\d+\.\d+\.\d+\.\d+/g);

                    if (utunMatches && utunMatches.length > 0) {
                        activeVPN = true;
                        // Extract the interface name
                        const interfaceMatch = utunMatches[0].match(/^(utun\d+):/);
                        if (interfaceMatch) {
                            vpnName = interfaceMatch[1];
                        }
                    }
                }

                // Also check for IKEv2 VPNs
                const ikev2Output = await this.executeCommand('scutil', ['--proxy']);
                if (ikev2Output.includes('ProxyAutoConfigEnable : 1')) {
                    activeVPN = true;
                }

                if (lastVPNState !== activeVPN || lastVPNInterface !== vpnName) {
                    this.log.info(`VPN state changed: ${activeVPN ? 'connected' : 'disconnected'} ${vpnName ? `(${vpnName})` : ''}`);
                    this.emit('vpn-state', {
                        active: activeVPN,
                        name: vpnName,
                        interface: vpnName
                    });
                    lastVPNState = activeVPN;
                    lastVPNInterface = vpnName;
                }
            } catch (e) {
                // scutil might not be available or might fail
                this.checkVPNInterfaces();
            }
        };

        // Initial check
        checkVPN();

        // Regular checks - more frequent for better VPN detection
        const interval = setInterval(checkVPN, 1000); // Check every second instead of 2 seconds
        this.intervals.push(interval);
    }

    watchWiFiState() {
        let lastWiFiState = null;

        const checkWiFi = async () => {
            try {
                const wifiOutput = await this.executeCommand('netsh', ['wlan', 'show', 'interfaces']);

                const stateMatch = wifiOutput.match(/State\s+:\s+(\w+)/);
                const ssidMatch = wifiOutput.match(/SSID\s+:\s+(.+)/);

                const isConnected = stateMatch && stateMatch[1] === 'connected';
                const ssid = ssidMatch ? ssidMatch[1].trim() : null;

                const currentState = { connected: isConnected, ssid };

                if (JSON.stringify(lastWiFiState) !== JSON.stringify(currentState)) {
                    this.log.info('WiFi state changed:', currentState);
                    this.emit('network-change', {
                        type: 'wifi-change',
                        wifi: currentState
                    });
                    lastWiFiState = currentState;
                }
            } catch (e) {
                // netsh might fail or WiFi might not be available
            }
        };

        // Initial check
        checkWiFi();

        // Regular checks
        const interval = setInterval(checkWiFi, 3000);
        this.intervals.push(interval);
    }

    monitorNetworkEvents() {
        // Monitor Windows network events using WMI
        const eventScript = `
            Register-WmiEvent -Query "SELECT * FROM __InstanceModificationEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_NetworkAdapter'" |
            ForEach-Object {
                Write-Host "NETWORK_CHANGE"
            }
        `;

        try {
            const monitor = spawn('powershell', ['-Command', eventScript]);

            monitor.stdout.on('data', (data) => {
                const output = data.toString().trim();
                if (output.includes('NETWORK_CHANGE')) {
                    this.log.info('WMI network event detected');
                    this.emit('network-change', {
                        type: 'wmi-event'
                    });
                }
            });

            monitor.on('error', (err) => {
                this.log.error('WMI monitor error:', err.message);
            });

            this.processes.push(monitor);
        } catch (e) {
            this.log.error('Failed to start WMI monitor:', e.message);
        }
    }
}

// Linux-specific network monitor
class LinuxNetworkMonitor extends BasePlatformMonitor {
    constructor() {
        super();
        this.log = createLogger('LinuxNetworkMonitor');
    }

    start() {
        super.start();

        this.watchNetworkManager();
        this.watchNetworkInterfaces();
        this.watchVPNState();
        this.watchWiFiState();
    }

    watchNetworkManager() {
        // Try to use NetworkManager if available
        this.checkNetworkManager().then(hasNM => {
            if (hasNM) {
                this.monitorWithNetworkManager();
            } else {
                this.monitorWithIPCommand();
            }
        });
    }

    async checkNetworkManager() {
        try {
            await this.executeCommand('nmcli', ['--version']);
            return true;
        } catch (e) {
            return false;
        }
    }

    monitorWithNetworkManager() {
        // Monitor NetworkManager events
        try {
            const monitor = spawn('nmcli', ['monitor']);

            monitor.stdout.on('data', (data) => {
                const output = data.toString();

                if (output.includes('connected') || output.includes('disconnected') ||
                    output.includes('connecting') || output.includes('deactivating')) {
                    this.log.info('NetworkManager event:', output.trim());
                    this.emit('network-change', {
                        type: 'networkmanager-event',
                        event: output.trim()
                    });
                }
            });

            monitor.on('error', (err) => {
                this.log.error('NetworkManager monitor error:', err.message);
                // Fall back to ip monitor
                this.monitorWithIPCommand();
            });

            this.processes.push(monitor);
        } catch (e) {
            this.log.error('Failed to start NetworkManager monitor:', e.message);
            this.monitorWithIPCommand();
        }
    }

    monitorWithIPCommand() {
        // Use ip monitor as fallback
        try {
            const monitor = spawn('ip', ['monitor', 'link', 'address', 'route']);

            monitor.stdout.on('data', (data) => {
                const output = data.toString();

                if (output.includes('link/') || output.includes('inet') || output.includes('route')) {
                    this.log.info('IP monitor event:', output.substring(0, 100));
                    this.emit('network-change', {
                        type: 'ip-monitor-event',
                        event: output.substring(0, 100)
                    });
                }
            });

            monitor.on('error', (err) => {
                this.log.error('IP monitor error:', err.message);
            });

            this.processes.push(monitor);
        } catch (e) {
            this.log.error('Failed to start IP monitor:', e.message);
        }
    }

    watchNetworkInterfaces() {
        // Watch /sys/class/net for interface changes
        const netPath = '/sys/class/net';

        try {
            const watcher = fs.watch(netPath, (eventType, filename) => {
                if (eventType === 'rename' && filename) {
                    this.log.info(`Network interface change: ${filename}`);
                    this.emit('network-change', {
                        type: 'interface-change',
                        interface: filename
                    });
                }
            });

            this.watchers.push(watcher);
        } catch (e) {
            this.log.error('Failed to watch network interfaces:', e.message);
        }
    }

    watchVPNState() {
        let lastVPNState = null;

        const checkVPN = async () => {
            try {
                // Check for VPN interfaces
                const interfaces = await this.executeCommand('ip', ['link', 'show']);

                const vpnPatterns = ['tun', 'tap', 'vpn', 'ppp', 'ipsec'];
                let vpnActive = false;
                let vpnInterface = null;

                const lines = interfaces.split('\n');
                for (const line of lines) {
                    for (const pattern of vpnPatterns) {
                        if (line.includes(pattern) && line.includes('UP')) {
                            vpnActive = true;
                            const match = line.match(/^\d+:\s+(\S+):/);
                            if (match) {
                                vpnInterface = match[1];
                            }
                            break;
                        }
                    }
                    if (vpnActive) break;
                }

                // Also check with nmcli if available
                try {
                    const nmOutput = await this.executeCommand('nmcli', ['connection', 'show', '--active']);
                    if (nmOutput.toLowerCase().includes('vpn')) {
                        vpnActive = true;
                    }
                } catch (e) {
                    // nmcli might not be available
                }

                if (lastVPNState !== vpnActive) {
                    this.log.info(`VPN state changed: ${vpnActive ? 'connected' : 'disconnected'}`);
                    this.emit('vpn-state', {
                        active: vpnActive,
                        interface: vpnInterface
                    });
                    lastVPNState = vpnActive;
                }
            } catch (e) {
                this.log.error('Failed to check VPN state:', e.message);
            }
        };

        // Initial check
        checkVPN();

        // Regular checks
        const interval = setInterval(checkVPN, 2000);
        this.intervals.push(interval);
    }

    watchWiFiState() {
        let lastWiFiState = null;

        const checkWiFi = async () => {
            try {
                let wifiInfo = null;

                // Try using nmcli first
                try {
                    const nmOutput = await this.executeCommand('nmcli', ['device', 'wifi']);
                    const lines = nmOutput.split('\n');

                    for (const line of lines) {
                        if (line.includes('*')) {
                            // Connected WiFi
                            const parts = line.split(/\s+/).filter(p => p);
                            if (parts.length > 1) {
                                wifiInfo = {
                                    connected: true,
                                    ssid: parts[1]
                                };
                            }
                            break;
                        }
                    }
                } catch (e) {
                    // nmcli not available, try iwconfig
                    const iwOutput = await this.executeCommand('iwconfig', ['2>&1']);
                    const ssidMatch = iwOutput.match(/ESSID:"([^"]+)"/);

                    if (ssidMatch) {
                        wifiInfo = {
                            connected: true,
                            ssid: ssidMatch[1]
                        };
                    }
                }

                const currentState = wifiInfo || { connected: false, ssid: null };

                if (JSON.stringify(lastWiFiState) !== JSON.stringify(currentState)) {
                    this.log.info('WiFi state changed:', currentState);
                    this.emit('network-change', {
                        type: 'wifi-change',
                        wifi: currentState
                    });
                    lastWiFiState = currentState;
                }
            } catch (e) {
                // WiFi tools might not be available
            }
        };

        // Initial check
        checkWiFi();

        // Regular checks
        const interval = setInterval(checkWiFi, 3000);
        this.intervals.push(interval);
    }
}

// Generic fallback monitor
class GenericNetworkMonitor extends BasePlatformMonitor {
    constructor() {
        super();
        this.log = createLogger('GenericNetworkMonitor');
    }

    start() {
        super.start();

        this.log.info('Using generic network monitoring');

        // Basic interface monitoring
        this.watchInterfaces();
    }

    watchInterfaces() {
        let lastInterfaces = JSON.stringify(os.networkInterfaces());

        const checkInterfaces = () => {
            const currentInterfaces = JSON.stringify(os.networkInterfaces());

            if (currentInterfaces !== lastInterfaces) {
                this.log.info('Network interface change detected');
                this.emit('network-change', {
                    type: 'interface-change'
                });
                lastInterfaces = currentInterfaces;
            }
        };

        // Check every 2 seconds
        const interval = setInterval(checkInterfaces, 2000);
        this.intervals.push(interval);
    }
}

module.exports = {
    MacOSNetworkMonitor,
    WindowsNetworkMonitor,
    LinuxNetworkMonitor,
    GenericNetworkMonitor
};