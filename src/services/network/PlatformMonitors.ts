import { EventEmitter } from 'events';
import child_process from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import mainLogger from '../../utils/mainLogger';
import { errorMessage } from '../../types/common';

const { createLogger } = mainLogger;
const { spawn, exec } = child_process;

type ChildProcess = child_process.ChildProcess;
type FSWatcher = fs.FSWatcher;
type Logger = ReturnType<typeof createLogger>;

// Base class for platform monitors
class BasePlatformMonitor extends EventEmitter {
    processes: ChildProcess[] = [];
    watchers: FSWatcher[] = [];
    intervals: ReturnType<typeof setInterval>[] = [];
    log: Logger;

    constructor() {
        super();
        this.log = createLogger(this.constructor.name);
    }

    start(): void {
        this.log.info('Starting platform-specific monitoring');
    }

    stop(): void {
        this.log.info('Stopping platform-specific monitoring');

        // Clean up processes
        this.processes.forEach(proc => {
            try {
                if (proc && !proc.killed) {
                    proc.kill();
                }
            } catch (e: unknown) {
                this.log.debug(`Process cleanup error: ${errorMessage(e)}`);
            }
        });

        // Clean up watchers
        this.watchers.forEach(watcher => {
            try {
                if (watcher && typeof watcher.close === 'function') {
                    watcher.close();
                }
            } catch (e: unknown) {
                this.log.debug(`Watcher cleanup error: ${errorMessage(e)}`);
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

    executeCommand(command: string, args: string[] = [], timeoutMs = 5000): Promise<string> {
        return new Promise((resolve, reject) => {
            const childProcess = exec(`${command} ${args.join(' ')}`, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
                if (error) {
                    // If timeout, force kill the process
                    if (error.killed) {
                        reject(new Error(`Command timed out after ${timeoutMs}ms`));
                    } else {
                        reject(error);
                    }
                } else {
                    resolve(stdout.trim());
                }
            });

            // On Windows, ensure child processes are killed on timeout
            if (process.platform === 'win32') {
                setTimeout(() => {
                    try {
                        if (childProcess && !childProcess.killed) {
                            childProcess.kill('SIGKILL');
                        }
                    } catch (e) {
                        // Ignore kill errors
                    }
                }, timeoutMs + 500);
            }
        });
    }
}

// macOS-specific network monitor
class MacOSNetworkMonitor extends BasePlatformMonitor {
    constructor() {
        super();
        this.log = createLogger('MacOSNetworkMonitor');
    }

    start(): void {
        super.start();

        this.watchNetworkConfiguration();
        this.watchVPNState();
        this.watchWiFiState();
        this.monitorNetworkChanges();
    }

    watchNetworkConfiguration(): void {
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
                } catch (e: unknown) {
                    this.log.error(`Failed to watch ${configPath}:`, errorMessage(e));
                }
            }
        });
    }

    watchVPNState(): void {
        let lastVPNState: boolean | null = null;
        let lastVPNInterface: string | null = null;
        let initialCheckDone = false;

        const checkVPN = async (): Promise<void> => {
            try {
                // First check using scutil for native VPNs
                const output = await this.executeCommand('scutil', ['--nc', 'list']);
                const lines = output.split('\n');

                let activeVPN = false;
                let vpnName: string | null = null;

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

        // Regular checks - reduced frequency to prevent excessive process spawning
        const interval = setInterval(checkVPN, 10000);
        this.intervals.push(interval);
    }

    async checkVPNInterfaces(): Promise<void> {
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
            let vpnInterface: string | null = null;

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
        } catch (e: unknown) {
            this.log.error('Failed to check VPN interfaces:', errorMessage(e));
        }
    }

    watchWiFiState(): void {
        let lastWiFiState: { on: boolean; ssid: string | null } | null = null;

        const checkWiFi = async (): Promise<void> => {
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

    monitorNetworkChanges(): void {
        // Use route monitor for real-time network changes
        try {
            const routeMonitor = spawn('route', ['-n', 'monitor']);

            routeMonitor.stdout.on('data', (data: Buffer) => {
                const output = data.toString();

                if (output.includes('RTM_IFINFO') || output.includes('RTM_NEWADDR') || output.includes('RTM_DELADDR')) {
                    this.log.info('Route change detected');
                    this.emit('network-change', {
                        type: 'route-change',
                        event: output.substring(0, 50)
                    });
                }
            });

            routeMonitor.on('error', (err: Error) => {
                this.log.error('Route monitor error:', err.message);
            });

            this.processes.push(routeMonitor);
        } catch (e: unknown) {
            this.log.error('Failed to start route monitor:', errorMessage(e));
        }
    }
}

// Windows-specific network monitor
class WindowsNetworkMonitor extends BasePlatformMonitor {
    vpnCheckInProgress = false;
    adapterMonitorActive = false;

    constructor() {
        super();
        this.log = createLogger('WindowsNetworkMonitor');
    }

    start(): void {
        super.start();

        this.watchNetworkAdapters();
        this.watchVPNState();
        this.watchWiFiState();
        // Disable WMI event monitor - it can hang and accumulate processes
        // this.monitorNetworkEvents();
    }

    watchNetworkAdapters(): void {
        // Use polling instead of persistent PowerShell process to avoid hangs
        let lastState: string | null = null;

        const checkAdapters = async (): Promise<void> => {
            if (this.adapterMonitorActive) {
                return; // Skip if previous check still running
            }
            this.adapterMonitorActive = true;

            try {
                const output = await this.executeCommand('powershell', [
                    '-NoProfile',
                    '-NonInteractive',
                    '-Command',
                    'Get-NetAdapter -ErrorAction SilentlyContinue | Select-Object Name, Status, InterfaceDescription | ConvertTo-Json -Compress'
                ], 5000);

                if (output && (output.startsWith('[') || output.startsWith('{'))) {
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
                    } catch (e: unknown) {
                        this.log.debug('JSON parsing error in adapter check:', errorMessage(e));
                    }
                }
            } catch (e: unknown) {
                this.log.debug('Adapter check failed:', errorMessage(e));
            } finally {
                this.adapterMonitorActive = false;
            }
        };

        // Check every 10 seconds instead of using persistent process
        checkAdapters();
        const interval = setInterval(checkAdapters, 10000);
        this.intervals.push(interval);
    }

    watchNetworkAdaptersLegacy(): void {
        // DEPRECATED: This method used an infinite loop PowerShell script
        // that caused process accumulation. Kept for reference only.
        const monitorScript = `
            $ErrorActionPreference = 'SilentlyContinue'
            while ($true) {
                try {
                    $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Select-Object Name, Status, InterfaceDescription
                    if ($adapters) {
                        $adapters | ConvertTo-Json -Compress
                    }
                    Start-Sleep -Seconds 2
                } catch {
                    Start-Sleep -Seconds 5
                }
            }
        `;

        const startMonitor = (): void => {
            try {
                const monitor = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', monitorScript]);
                let lastState: string | null = null;
                let restartTimer: ReturnType<typeof setTimeout> | null = null;

                monitor.stdout.on('data', (data: Buffer) => {
                    const output = data.toString().trim();
                    if (output && (output.startsWith('[') || output.startsWith('{'))) {
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
                        } catch (e: unknown) {
                            this.log.debug('JSON parsing error in adapter monitor:', errorMessage(e));
                        }
                    }
                });

                monitor.on('error', (err: Error) => {
                    this.log.error('Adapter monitor error:', err.message);
                    // Restart monitor after 10 seconds
                    if (!restartTimer) {
                        restartTimer = setTimeout(() => {
                            this.log.info('Restarting adapter monitor...');
                            startMonitor();
                        }, 10000);
                    }
                });

                monitor.on('exit', (code: number | null) => {
                    this.log.warn(`Adapter monitor exited with code ${code}`);
                    // Remove from processes array
                    const index = this.processes.indexOf(monitor);
                    if (index > -1) {
                        this.processes.splice(index, 1);
                    }
                });

                this.processes.push(monitor);
            } catch (e: unknown) {
                this.log.error('Failed to start adapter monitor:', errorMessage(e));
                // Fall back to periodic polling if PowerShell spawn fails
                this.fallbackAdapterMonitoring();
            }
        };

        startMonitor();
    }

    fallbackAdapterMonitoring(): void {
        this.log.info('Using fallback adapter monitoring');
        // Implement simple periodic check as fallback
        const checkAdapters = setInterval(() => {
            // This will be picked up by the base network monitor's interface checking
            this.emit('network-change', {
                type: 'fallback-check'
            });
        }, 30000); // Check every 30 seconds

        this.intervals.push(checkAdapters);
    }

    watchVPNState(): void {
        let lastVPNState: boolean | null = null;
        let lastVPNInterface: string | null = null;
        let initialCheckDone = false;

        const checkVPN = async (): Promise<void> => {
            // Prevent concurrent VPN checks - critical fix for process accumulation
            if (this.vpnCheckInProgress) {
                this.log.debug('Skipping VPN check - previous check still in progress');
                return;
            }
            this.vpnCheckInProgress = true;

            try {
                let activeVPN = false;
                let vpnName: string | null = null;
                let vpnDetails: { serverAddress?: string; tunnelType?: string; description?: string } = {};

                // First check using PowerShell to get VPN connections
                try {
                    const vpnOutput = await this.executeCommand('powershell', [
                        '-NoProfile',
                        '-NonInteractive',
                        '-Command',
                        'Get-VpnConnection | Where-Object {$_.ConnectionStatus -eq "Connected"} | Select-Object -First 1 | ConvertTo-Json -Compress'
                    ], 5000);

                    if (vpnOutput && vpnOutput.trim()) {
                        try {
                            const vpnInfo = JSON.parse(vpnOutput);
                            if (vpnInfo && vpnInfo.ConnectionStatus === 'Connected') {
                                activeVPN = true;
                                vpnName = vpnInfo.Name;
                                vpnDetails = {
                                    serverAddress: vpnInfo.ServerAddress,
                                    tunnelType: vpnInfo.TunnelType
                                };
                            }
                        } catch (parseError) {
                            // JSON parsing failed
                        }
                    }
                } catch (e) {
                    // PowerShell command failed, continue with other checks
                }

                // If no native VPN found, check network adapters for VPN interfaces
                if (!activeVPN) {
                    try {
                        const adapterOutput = await this.executeCommand('powershell', [
                            '-NoProfile',
                            '-NonInteractive',
                            '-Command',
                            'Get-NetAdapter | Where-Object {$_.InterfaceDescription -match "VPN|TAP|OpenVPN|NordVPN|ExpressVPN|Cisco|Fortinet|WireGuard" -and $_.Status -eq "Up"} | Select-Object -First 1 Name, InterfaceDescription | ConvertTo-Json -Compress'
                        ], 5000);

                        if (adapterOutput && adapterOutput.trim()) {
                            try {
                                const adapterInfo = JSON.parse(adapterOutput);
                                if (adapterInfo) {
                                    activeVPN = true;
                                    vpnName = adapterInfo.Name;
                                    vpnDetails.description = adapterInfo.InterfaceDescription;
                                }
                            } catch (parseError) {
                                // JSON parsing failed
                            }
                        }
                    } catch (e) {
                        // PowerShell command failed
                    }
                }

                // Also check for active RAS connections (Remote Access Service)
                if (!activeVPN) {
                    try {
                        const rasOutput = await this.executeCommand('rasdial');
                        // rasdial shows "No connections" if no active connections
                        if (rasOutput && !rasOutput.includes('No connections')) {
                            const lines = rasOutput.split('\n');
                            for (const line of lines) {
                                if (line.includes('Connected to')) {
                                    activeVPN = true;
                                    const match = line.match(/Connected to (.+)/);
                                    if (match) {
                                        vpnName = match[1].trim();
                                    }
                                    break;
                                }
                            }
                        }
                    } catch (e: unknown) {
                        // rasdial might not be available
                        this.log.debug('rasdial check failed:', errorMessage(e));
                    }
                }

                // Only emit state change if:
                // 1. Not the first check OR
                // 2. State actually changed OR
                // 3. Interface changed
                if (initialCheckDone && (lastVPNState !== activeVPN || lastVPNInterface !== vpnName)) {
                    this.log.info(`VPN state changed: ${activeVPN ? 'connected' : 'disconnected'} ${vpnName ? `(${vpnName})` : ''}`, vpnDetails);
                    this.emit('vpn-state', {
                        active: activeVPN,
                        name: vpnName,
                        interface: vpnName,
                        details: vpnDetails
                    });
                    lastVPNState = activeVPN;
                    lastVPNInterface = vpnName;
                } else if (!initialCheckDone) {
                    // For initial check, only emit if VPN is detected
                    if (activeVPN) {
                        this.log.info(`Initial VPN state: connected (${vpnName})`, vpnDetails);
                        this.emit('vpn-state', {
                            active: true,
                            name: vpnName,
                            interface: vpnName,
                            details: vpnDetails
                        });
                        lastVPNState = true;
                        lastVPNInterface = vpnName;
                    }
                    initialCheckDone = true;
                }
            } catch (e: unknown) {
                this.log.error('VPN check failed:', errorMessage(e));
            } finally {
                // Always reset the flag to allow next check
                this.vpnCheckInProgress = false;
            }
        };

        // Initial check with delay to not block startup
        setTimeout(checkVPN, 1000);

        // Regular checks - reduced frequency to prevent process accumulation
        const interval = setInterval(checkVPN, 10000);
        this.intervals.push(interval);
    }

    watchWiFiState(): void {
        let lastWiFiState: { connected: boolean; ssid: string | null } | null = null;

        const checkWiFi = async (): Promise<void> => {
            try {
                const wifiOutput = await this.executeCommand('netsh', ['wlan', 'show', 'interfaces']);

                const stateMatch = wifiOutput.match(/State\s+:\s+(\w+)/);
                const ssidMatch = wifiOutput.match(/SSID\s+:\s+(.+)/);

                const isConnected = stateMatch && stateMatch[1] === 'connected';
                const ssid = ssidMatch ? ssidMatch[1].trim() : null;

                const currentState = { connected: isConnected || false, ssid };

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

    monitorNetworkEvents(): void {
        // Monitor Windows network events using WMI
        const eventScript = `
            Register-WmiEvent -Query "SELECT * FROM __InstanceModificationEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_NetworkAdapter'" |
            ForEach-Object {
                Write-Host "NETWORK_CHANGE"
            }
        `;

        try {
            const monitor = spawn('powershell', ['-Command', eventScript]);

            monitor.stdout.on('data', (data: Buffer) => {
                const output = data.toString().trim();
                if (output.includes('NETWORK_CHANGE')) {
                    this.log.info('WMI network event detected');
                    this.emit('network-change', {
                        type: 'wmi-event'
                    });
                }
            });

            monitor.on('error', (err: Error) => {
                this.log.error('WMI monitor error:', err.message);
            });

            this.processes.push(monitor);
        } catch (e: unknown) {
            this.log.error('Failed to start WMI monitor:', errorMessage(e));
        }
    }
}

// Linux-specific network monitor
class LinuxNetworkMonitor extends BasePlatformMonitor {
    constructor() {
        super();
        this.log = createLogger('LinuxNetworkMonitor');
    }

    start(): void {
        super.start();

        this.watchNetworkManager();
        this.watchNetworkInterfaces();
        this.watchVPNState();
        this.watchWiFiState();
    }

    watchNetworkManager(): void {
        // Try to use NetworkManager if available
        this.checkNetworkManager().then(hasNM => {
            if (hasNM) {
                this.monitorWithNetworkManager();
            } else {
                this.monitorWithIPCommand();
            }
        });
    }

    async checkNetworkManager(): Promise<boolean> {
        try {
            await this.executeCommand('nmcli', ['--version']);
            return true;
        } catch (e) {
            return false;
        }
    }

    monitorWithNetworkManager(): void {
        // Monitor NetworkManager events
        try {
            const monitor = spawn('nmcli', ['monitor']);

            monitor.stdout.on('data', (data: Buffer) => {
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

            monitor.on('error', (err: Error) => {
                this.log.error('NetworkManager monitor error:', err.message);
                // Fall back to ip monitor
                this.monitorWithIPCommand();
            });

            this.processes.push(monitor);
        } catch (e: unknown) {
            this.log.error('Failed to start NetworkManager monitor:', errorMessage(e));
            this.monitorWithIPCommand();
        }
    }

    monitorWithIPCommand(): void {
        // Use ip monitor as fallback
        try {
            const monitor = spawn('ip', ['monitor', 'link', 'address', 'route']);

            monitor.stdout.on('data', (data: Buffer) => {
                const output = data.toString();

                if (output.includes('link/') || output.includes('inet') || output.includes('route')) {
                    this.log.info('IP monitor event:', output.substring(0, 100));
                    this.emit('network-change', {
                        type: 'ip-monitor-event',
                        event: output.substring(0, 100)
                    });
                }
            });

            monitor.on('error', (err: Error) => {
                this.log.error('IP monitor error:', err.message);
            });

            this.processes.push(monitor);
        } catch (e: unknown) {
            this.log.error('Failed to start IP monitor:', errorMessage(e));
        }
    }

    watchNetworkInterfaces(): void {
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
        } catch (e: unknown) {
            this.log.error('Failed to watch network interfaces:', errorMessage(e));
        }
    }

    watchVPNState(): void {
        let lastVPNState: boolean | null = null;

        const checkVPN = async (): Promise<void> => {
            try {
                // Check for VPN interfaces
                const interfaces = await this.executeCommand('ip', ['link', 'show']);

                const vpnPatterns = ['tun', 'tap', 'vpn', 'ppp', 'ipsec'];
                let vpnActive = false;
                let vpnInterface: string | null = null;

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
            } catch (e: unknown) {
                this.log.error('Failed to check VPN state:', errorMessage(e));
            }
        };

        // Initial check
        checkVPN();

        // Regular checks
        const interval = setInterval(checkVPN, 2000);
        this.intervals.push(interval);
    }

    watchWiFiState(): void {
        let lastWiFiState: { connected: boolean; ssid: string | null } | null = null;

        const checkWiFi = async (): Promise<void> => {
            try {
                let wifiInfo: { connected: boolean; ssid: string | null } | null = null;

                // Try using nmcli first
                try {
                    const nmOutput = await this.executeCommand('nmcli', ['device', 'wifi']);
                    const lines = nmOutput.split('\n');

                    for (const line of lines) {
                        if (line.includes('*')) {
                            // Connected WiFi
                            const parts = line.split(/\s+/).filter((p: string) => p);
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

    start(): void {
        super.start();

        this.log.info('Using generic network monitoring');

        // Basic interface monitoring
        this.watchInterfaces();
    }

    watchInterfaces(): void {
        let lastInterfaces = JSON.stringify(os.networkInterfaces());

        const checkInterfaces = (): void => {
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

export {
    BasePlatformMonitor,
    MacOSNetworkMonitor,
    WindowsNetworkMonitor,
    LinuxNetworkMonitor,
    GenericNetworkMonitor
};
