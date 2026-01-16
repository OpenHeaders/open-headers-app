const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { createLogger } = require('../../../utils/mainLogger');
const { DATA_FORMAT_VERSION, isVersionCompatible: checkVersionCompatible } = require('../../../config/version');
const windowsFocusHelper = require('../utils/windowsFocus');

const log = createLogger('ProtocolHandler');

class ProtocolHandler {
    constructor() {
        this.mainWindow = null;
        this.rendererReady = false;
    }

    setMainWindow(window) {
        this.mainWindow = window;
    }

    setRendererReady() {
        log.info('Renderer marked as ready for protocol messages');
        this.rendererReady = true;
        // Process any pending invites when renderer is ready
        if (this.mainWindow) {
            this.processPendingInvites();
        }
    }

    setupProtocol() {
        // Register protocol handler for openheaders://
        if (process.defaultApp) {
            if (process.argv.length >= 2) {
                app.setAsDefaultProtocolClient('openheaders', process.execPath, [path.resolve(process.argv[1])]);
            }
        } else {
            app.setAsDefaultProtocolClient('openheaders');
        }
    }

    validateProtocolUrl(url) {
        if (!url || typeof url !== 'string') {
            return { valid: false, error: 'URL must be a non-empty string' };
        }
        
        // Check if it starts with openheaders://
        if (!url.startsWith('openheaders://')) {
            return { valid: false, error: 'URL must start with openheaders://' };
        }
        
        try {
            const urlObj = new URL(url);
            
            // Ensure the protocol is correct
            if (urlObj.protocol !== 'openheaders:') {
                return { valid: false, error: 'Invalid protocol' };
            }
            
            // Ensure we have a host
            const host = urlObj.host || urlObj.hostname || '';
            if (!host) {
                return { valid: false, error: 'URL must have a host' };
            }
            
            // Normalize the host
            const normalizedHost = host.split('/')[0];
            
            // Only accept the unified format
            if (normalizedHost !== 'open') {
                return { valid: false, error: 'Invalid URL format. Expected: openheaders://open?payload=...' };
            }
            
            const params = new URLSearchParams(urlObj.search);
            // Check for any valid payload parameter
            if (!params.get('payload') && !params.get('g') && !params.get('d') && !params.get('b85')) {
                return { valid: false, error: 'Open URL must have a payload parameter (payload, g, d, or b85)' };
            }
            
            return { valid: true, urlObj, host: normalizedHost };
        } catch (error) {
            return { valid: false, error: `Invalid URL format: ${error.message}` };
        }
    }

    handleProtocolUrl(url) {
        try {
            log.info('=== PROTOCOL HANDLER DEBUG START ===');
            log.info('Handling protocol URL:', url);
            log.info('URL type:', typeof url);
            log.info('URL length:', url?.length);
            
            // Validate the URL first
            const validation = this.validateProtocolUrl(url);
            if (!validation.valid) {
                log.error('Invalid protocol URL:', validation.error);
                this.handleProtocolError(validation.error);
                return;
            }
            
            // Parse the URL
            const urlObj = validation.urlObj;
            const params = new URLSearchParams(urlObj.search);
            
            log.info('Parsed URL - pathname:', urlObj.pathname, 'host:', urlObj.host, 'search:', urlObj.search);
            log.info('URL protocol:', urlObj.protocol, 'hostname:', urlObj.hostname);
            log.info('All URL params:', Array.from(params.entries()));
            
            // Check for different compression types
            let payload = params.get('payload');
            let compressionType = 'gzip'; // default
            
            if (!payload) {
                // Check for other compression type parameters
                if (params.get('g')) {
                    payload = params.get('g');
                    compressionType = 'gzip';
                } else if (params.get('d')) {
                    payload = params.get('d');
                    compressionType = 'deflate';
                } else if (params.get('b85')) {
                    payload = params.get('b85');
                    compressionType = 'base85';
                } else {
                    throw new Error('No payload parameter found');
                }
            }
            
            // Handle unified open format
            this.handleUnifiedProtocol(payload, compressionType);
        } catch (error) {
            log.error('Error handling protocol URL:', error);
            this.handleProtocolError(`Failed to handle URL: ${error.message}`);
        }
    }

    handleUnifiedProtocol(payloadParam, compressionType = 'gzip') {
        try {
            log.info('Handling unified protocol with payload parameter');
            
            if (!payloadParam) {
                throw new Error('Missing payload parameter');
            }
            
            let decodedPayload;
            
            try {
                const zlib = require('zlib');
                let decompressed;
                
                if (compressionType === 'base85') {
                    // Decode base85 first
                    const base85Decoded = this.base85Decode(payloadParam);
                    // Then decompress (assuming gzip)
                    decompressed = zlib.gunzipSync(base85Decoded);
                } else if (compressionType === 'deflate') {
                    const compressed = Buffer.from(payloadParam, 'base64url');
                    decompressed = zlib.inflateSync(compressed);
                } else {
                    // Default to gzip
                    const compressed = Buffer.from(payloadParam, 'base64url');
                    decompressed = zlib.gunzipSync(compressed);
                }
                
                decodedPayload = JSON.parse(decompressed.toString('utf8'));
                log.info(`Successfully decompressed payload using ${compressionType}`);
            } catch (compressionError) {
                log.warn('Compression decoding failed:', compressionError.message);
                // Fallback to regular base64 decoding for backward compatibility
                try {
                    decodedPayload = JSON.parse(atob(payloadParam));
                    log.info('Using uncompressed payload (legacy format)');
                } catch (base64Error) {
                    throw new Error('Failed to decode payload: invalid format');
                }
            }
            
            // Expand ultra-optimized payloads
            decodedPayload = this.expandOptimizedPayload(decodedPayload);
            
            log.info('Decoded payload:', {
                action: decodedPayload.action,
                version: decodedPayload.version
            });
            
            // Validate version (optional - for future compatibility)
            if (decodedPayload.version && !this.isVersionCompatible(decodedPayload.version)) {
                log.warn(`Protocol version mismatch. Expected: 3.x.x, Got: ${decodedPayload.version}`);
            }
            
            // Validate required fields
            if (!decodedPayload.action) {
                throw new Error('Payload must contain an action field');
            }
            
            if (!decodedPayload.data) {
                throw new Error('Payload must contain a data field');
            }
            
            // Route based on action
            switch (decodedPayload.action) {
                case 'team-invite':
                    log.info('Processing team workspace invite');
                    this.processTeamWorkspaceInvite(decodedPayload.data);
                    break;
                    
                case 'environment-import':
                    log.info('Processing environment config import');
                    this.processEnvironmentConfigImport(decodedPayload.data);
                    break;
                    
                default:
                    log.error('Unknown action:', decodedPayload.action);
                    this.handleProtocolError(`Unknown action: ${decodedPayload.action}`);
            }
        } catch (error) {
            log.error('Error handling unified protocol:', error);
            this.handleProtocolError(`Failed to process payload: ${error.message}`);
        }
    }

    base85Decode(str) {
        const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~';
        const alphabetMap = {};
        for (let i = 0; i < alphabet.length; i++) {
            alphabetMap[alphabet[i]] = i;
        }
        
        const result = [];
        for (let i = 0; i < str.length; i += 5) {
            const chunk = str.slice(i, Math.min(i + 5, str.length));
            let value = 0;
            
            for (let j = 0; j < chunk.length; j++) {
                value = value * 85 + alphabetMap[chunk[j]];
            }
            
            // Convert to bytes
            const bytes = [];
            for (let j = 3; j >= 0; j--) {
                if (chunk.length >= j + 2) {
                    bytes.unshift(value & 0xFF);
                    value >>= 8;
                }
            }
            
            result.push(...bytes);
        }
        
        return Buffer.from(result);
    }
    
    expandOptimizedPayload(payload) {
        // Expand ultra-optimized action codes
        if (payload.a === 'ei') {
            payload.action = 'environment-import';
        } else if (payload.a === 'ti') {
            payload.action = 'team-invite';
        }
        
        // Expand version
        if (payload.v === '3') {
            payload.version = DATA_FORMAT_VERSION;
        }
        
        // Expand data
        if (payload.d) {
            payload.data = payload.d;
            delete payload.d;
            
            // Expand environment names
            if (payload.data.e) {
                payload.data.environments = {};
                Object.entries(payload.data.e).forEach(([shortName, vars]) => {
                    const fullName = shortName === 'dev' ? 'development' :
                                   shortName === 'prod' ? 'production' :
                                   shortName === 'stg' ? 'staging' :
                                   shortName;
                    
                    payload.data.environments[fullName] = {};
                    
                    // Expand variable data
                    Object.entries(vars).forEach(([varName, varData]) => {
                        const expandedVar = {};
                        
                        if (varData.val !== undefined) {
                            expandedVar.value = varData.val;
                        }
                        
                        if (varData.s === 1) {
                            expandedVar.isSecret = true;
                        }
                        
                        payload.data.environments[fullName][varName] = expandedVar;
                    });
                });
                delete payload.data.e;
            }
            
            // Expand environment schema
            if (payload.data.es && payload.data.es.e) {
                payload.data.environmentSchema = {
                    environments: {}
                };
                
                Object.entries(payload.data.es.e).forEach(([shortName, envData]) => {
                    const fullName = shortName === 'dev' ? 'development' :
                                   shortName === 'prod' ? 'production' :
                                   shortName === 'stg' ? 'staging' :
                                   shortName;
                    
                    if (envData.v) {
                        payload.data.environmentSchema.environments[fullName] = {
                            variables: envData.v.map(v => ({
                                name: v.n,
                                ...(v.s === 1 && { isSecret: true })
                            }))
                        };
                    }
                });
                delete payload.data.es;
            }
            
            // Expand team invite fields
            if (payload.data.wn) {
                payload.data.workspaceName = payload.data.wn;
                delete payload.data.wn;
            }
            if (payload.data.ru) {
                payload.data.repoUrl = payload.data.ru;
                delete payload.data.ru;
            }
            if (payload.data.b) {
                payload.data.branch = payload.data.b;
                delete payload.data.b;
            }
            if (payload.data.cp) {
                payload.data.configPath = payload.data.cp;
                delete payload.data.cp;
            }
            if (payload.data.at) {
                payload.data.authType = payload.data.at;
                delete payload.data.at;
            }
            if (payload.data.in) {
                payload.data.inviterName = payload.data.in;
                delete payload.data.in;
            }
            if (payload.data.desc) {
                payload.data.description = payload.data.desc;
                delete payload.data.desc;
            }
        }
        
        // Remove the minified action field
        if (payload.a) {
            delete payload.a;
        }
        
        // Remove the minified version field
        if (payload.v) {
            delete payload.v;
        }
        
        return payload;
    }
    
    isVersionCompatible(version) {
        // Use centralized version compatibility check
        return checkVersionCompatible(version);
    }
    
    processTeamWorkspaceInvite(inviteData) {
        // Basic validation
        if (!inviteData.workspaceName || !inviteData.repoUrl) {
            log.error('Invalid invite data structure:', inviteData);
            this.handleProtocolError('Invalid invite data: missing required fields');
            return;
        }
        
        log.info('Processing team workspace invite:', {
            workspaceName: inviteData.workspaceName,
            repoUrl: inviteData.repoUrl,
            inviterName: inviteData.inviterName
        });
        
        // Get main window - use stored reference or find existing
        let mainWindow = this.mainWindow || BrowserWindow.getAllWindows()[0];
        if (!mainWindow) {
            // If no window exists, we need to create one
            // This will be handled by the main process initialization
            log.info('No window available, invite will be processed after window creation');
            this.pendingInvite = inviteData;
            return;
        }
        
        // Show and focus the window
        this.showAndFocusWindow(mainWindow);
        
        // Check if renderer is ready
        if (!this.rendererReady) {
            log.info('Renderer not ready yet, storing invite as pending');
            this.pendingInvite = inviteData;
            return;
        }

        // Check if window is still loading
        if (mainWindow.webContents.isLoading()) {
            log.info('Window is still loading, waiting for it to be ready');
            mainWindow.webContents.once('did-finish-load', () => {
                mainWindow.webContents.send('process-team-workspace-invite', inviteData);
                log.info('Sent team workspace invite to renderer after window load');
            });
        } else {
            // Send invite data to renderer for processing
            mainWindow.webContents.send('process-team-workspace-invite', inviteData);
            log.info('Sent team workspace invite to renderer');
        }
    }
    
    processEnvironmentConfigImport(envData) {
        // Basic validation
        if (!envData.environmentSchema && !envData.environments) {
            log.error('Invalid environment data structure:', envData);
            this.handleProtocolError('Invalid environment data: must contain schema or environments');
            return;
        }
        
        log.info('Processing environment config import:', {
            hasSchema: !!envData.environmentSchema,
            hasValues: !!envData.environments,
            environmentCount: envData.environments ? Object.keys(envData.environments).length : 0
        });
        
        // Get main window - use stored reference or find existing
        let mainWindow = this.mainWindow || BrowserWindow.getAllWindows()[0];
        if (!mainWindow) {
            // If no window exists, we need to create one
            log.info('No window available, environment import will be processed after window creation');
            this.pendingEnvironmentImport = envData;
            return;
        }
        
        // Show and focus the window
        this.showAndFocusWindow(mainWindow);
        
        // Check if renderer is ready
        if (!this.rendererReady) {
            log.info('Renderer not ready yet, storing environment import as pending');
            this.pendingEnvironmentImport = envData;
            return;
        }
        
        // Ensure the window is ready before sending the event
        if (mainWindow.webContents.isLoading()) {
            log.info('Window is still loading, waiting for it to be ready');
            mainWindow.webContents.once('did-finish-load', () => {
                mainWindow.webContents.send('process-environment-config-import', envData);
                log.info('Sent environment config import to renderer after window load');
            });
        } else {
            // Send environment data to renderer for processing
            mainWindow.webContents.send('process-environment-config-import', envData);
            log.info('Sent environment config import to renderer');
        }
    }

    showAndFocusWindow(window) {
        windowsFocusHelper.focusWindow(window);
    }

    /**
     * Check if dock should be shown based on user settings
     * @returns {boolean} True if dock should be shown
     */
    shouldShowDock() {
        try {
            const settingsPath = path.join(app.getPath('userData'), 'settings.json');
            if (fs.existsSync(settingsPath)) {
                const settingsData = fs.readFileSync(settingsPath, 'utf8');
                const settings = JSON.parse(settingsData);
                // Default to true if setting doesn't exist
                return settings.showDockIcon !== false;
            }
        } catch (error) {
            log.debug('Could not read dock settings:', error.message);
        }
        // Default to showing dock if we can't read settings
        return true;
    }

    handleProtocolError(message) {
        // Show error to user if window is available
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            windows[0].webContents.send('show-error-message', {
                title: 'Protocol Error',
                message: message
            });
        }
    }

    // Method to handle pending invites after window creation
    processPendingInvite(mainWindow) {
        if (this.pendingInvite && mainWindow) {
            log.info('Processing pending team workspace invite');
            mainWindow.webContents.send('process-team-workspace-invite', this.pendingInvite);
            this.pendingInvite = null;
        }
        
        if (this.pendingEnvironmentImport && mainWindow) {
            log.info('Processing pending environment config import');
            mainWindow.webContents.send('process-environment-config-import', this.pendingEnvironmentImport);
            this.pendingEnvironmentImport = null;
        }
    }

    // Process any pending invites - called when main window is set
    processPendingInvites() {
        if (!this.mainWindow) return;
        
        if (this.pendingInvite) {
            log.info('Processing pending team workspace invite from setMainWindow');
            // Check if window is ready
            if (this.mainWindow.webContents.isLoading()) {
                this.mainWindow.webContents.once('did-finish-load', () => {
                    this.mainWindow.webContents.send('process-team-workspace-invite', this.pendingInvite);
                    this.pendingInvite = null;
                });
            } else {
                this.mainWindow.webContents.send('process-team-workspace-invite', this.pendingInvite);
                this.pendingInvite = null;
            }
        }
        
        if (this.pendingEnvironmentImport) {
            log.info('Processing pending environment config import from setMainWindow');
            // Check if window is ready
            if (this.mainWindow.webContents.isLoading()) {
                this.mainWindow.webContents.once('did-finish-load', () => {
                    this.mainWindow.webContents.send('process-environment-config-import', this.pendingEnvironmentImport);
                    this.pendingEnvironmentImport = null;
                });
            } else {
                this.mainWindow.webContents.send('process-environment-config-import', this.pendingEnvironmentImport);
                this.pendingEnvironmentImport = null;
            }
        }
    }

    setupProtocolHandlers() {
        // macOS protocol URL handling
        app.on('open-url', (event, url) => {
            event.preventDefault();
            log.info('Received protocol URL on macOS:', url);

            // Bring application to foreground
            const windows = BrowserWindow.getAllWindows();
            if (windows.length > 0) {
                const window = windows[0];
                this.showAndFocusWindow(window);
                // Respect user's dock visibility setting
                if (app.dock && this.shouldShowDock()) {
                    app.dock.show().catch(error => {
                        log.debug('Error showing dock:', error.message);
                    });
                }
            }

            this.handleProtocolUrl(url);
        });

        // Prevent multiple instances and handle protocol URLs from new instances
        app.on('second-instance', (event, commandLine, workingDirectory) => {
            log.info('Second instance detected with args:', commandLine);
            log.info('Working directory:', workingDirectory);

            // Focus existing window instead of creating new instance
            const windows = BrowserWindow.getAllWindows();
            if (windows.length > 0) {
                const window = windows[0];
                this.showAndFocusWindow(window);
                
                // Extract and handle any protocol URLs from command line
                let protocolUrl = null;
                for (const arg of commandLine) {
                    if (arg.startsWith('openheaders://')) {
                        protocolUrl = arg;
                        break;
                    }
                    // Sometimes Windows passes the URL without the protocol prefix
                    if (arg.includes('open?')) {
                        // Try to reconstruct the URL
                        if (!arg.startsWith('openheaders://')) {
                            protocolUrl = 'openheaders://' + arg;
                        } else {
                            protocolUrl = arg;
                        }
                        break;
                    }
                }
                
                if (protocolUrl) {
                    log.info('Extracted protocol URL from command line:', protocolUrl);
                    
                    // Validate the URL before processing
                    const validation = this.validateProtocolUrl(protocolUrl);
                    if (!validation.valid) {
                        log.error('Invalid protocol URL extracted from command line:', validation.error);
                        this.handleProtocolError(validation.error);
                        return;
                    }
                    
                    // Add a small delay to ensure the window is ready
                    setTimeout(() => {
                        this.handleProtocolUrl(protocolUrl);
                    }, 500);
                } else {
                    log.warn('No protocol URL found in command line arguments');
                    log.debug('Command line arguments:', commandLine);
                }
            }
        });
    }
}

module.exports = new ProtocolHandler();