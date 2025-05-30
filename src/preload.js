// preload.js - Secure bridge between renderer and main process
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // File operations
    openFileDialog: () => ipcRenderer.invoke('openFileDialog'),
    saveFileDialog: (options) => ipcRenderer.invoke('saveFileDialog', options),
    readFile: (filePath) => ipcRenderer.invoke('readFile', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('writeFile', filePath, content),
    watchFile: (sourceId, filePath) => ipcRenderer.invoke('watchFile', sourceId, filePath),
    unwatchFile: (filePath) => ipcRenderer.invoke('unwatchFile', filePath),

    openExternal: (url) => ipcRenderer.invoke('openExternal', url),

    // Added: App version
    getAppVersion: () => ipcRenderer.invoke('getAppVersion'),

    updateWebSocketSources: (sources) => {
        ipcRenderer.send('updateWebSocketSources', sources);
    },

    // Enhanced HTTP request method with retry tracking
    makeHttpRequest: async (url, method, options) => {
        // Add traceable request ID to help with debugging
        const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);

        try {
            console.log(`[${requestId}] Sending HTTP request: ${method} ${url}`);

            // Add connection options for the main process
            if (!options.connectionOptions) {
                options.connectionOptions = {
                    keepAlive: true,
                    timeout: 30000,
                    requestId: requestId
                };
            }

            // Start timing the request
            const startTime = Date.now();

            // Invoke the main process function
            const result = await ipcRenderer.invoke('makeHttpRequest', url, method, options);

            // Log completion and timing
            const duration = Date.now() - startTime;
            console.log(`[${requestId}] HTTP request completed in ${duration}ms`);

            return result;
        } catch (error) {
            console.error(`[${requestId}] HTTP request failed:`, error);

            // Add detailed error info for network issues
            if (error.message && (
                error.message.includes('ECONNRESET') ||
                error.message.includes('ETIMEDOUT') ||
                error.message.includes('ECONNREFUSED')
            )) {
                console.error(`[${requestId}] Network error detected: ${error.message}`);

                // Add basic diagnostics
                try {
                    console.error(`[${requestId}] Network environment: online=${navigator.onLine}`);
                } catch (diagError) {
                    // Ignore errors in diagnostic code
                }
            }

            throw error;
        }
    },

    // Update functionality
    checkForUpdates: (isManual) => ipcRenderer.send('check-for-updates', isManual),
    installUpdate: () => ipcRenderer.send('install-update'),
    onUpdateCheckAlreadyInProgress: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('update-check-already-in-progress', subscription);
        return () => ipcRenderer.removeListener('update-check-already-in-progress', subscription);
    },

    onClearUpdateCheckingNotification: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('clear-update-checking-notification', subscription);
        return () => ipcRenderer.removeListener('clear-update-checking-notification', subscription);
    },

    onUpdateAlreadyDownloaded: (callback) => {
        const subscription = (_, data) => {
            // Call the callback with isManual flag if available
            if (data && data.isManual) {
                callback(true); // Pass isManual flag to the callback
            } else {
                callback(false);
            }
        };
        ipcRenderer.on('update-already-downloaded', subscription);
        return () => ipcRenderer.removeListener('update-already-downloaded', subscription);
    },

    // Update events
    onUpdateAvailable: (callback) => {
        const subscription = (_, info) => callback(info);
        ipcRenderer.on('update-available', subscription);
        return () => ipcRenderer.removeListener('update-available', subscription);
    },
    onUpdateProgress: (callback) => {
        const subscription = (_, progressObj) => callback(progressObj);
        ipcRenderer.on('update-progress', subscription);
        return () => ipcRenderer.removeListener('update-progress', subscription);
    },
    onUpdateDownloaded: (callback) => {
        const subscription = (_, info) => callback(info);
        ipcRenderer.on('update-downloaded', subscription);
        return () => ipcRenderer.removeListener('update-downloaded', subscription);
    },
    onUpdateError: (callback) => {
        const subscription = (_, message) => callback(message);
        ipcRenderer.on('update-error', subscription);
        return () => ipcRenderer.removeListener('update-error', subscription);
    },
    onUpdateNotAvailable: (callback) => {
        const subscription = (_, info) => callback(info);
        ipcRenderer.on('update-not-available', subscription);
        return () => ipcRenderer.removeListener('update-not-available', subscription);
    },

    // File change events
    onFileChanged: (callback) => {
        const subscription = (_, sourceId, content) => callback(sourceId, content);
        ipcRenderer.on('fileChanged', subscription);
        return () => ipcRenderer.removeListener('fileChanged', subscription);
    },

    // Environment variables
    getEnvVariable: (name) => ipcRenderer.invoke('getEnvVariable', name),

    // Storage operations
    saveToStorage: (filename, content) => ipcRenderer.invoke('saveToStorage', filename, content),
    loadFromStorage: (filename) => ipcRenderer.invoke('loadFromStorage', filename),

    // App info
    getAppPath: () => ipcRenderer.invoke('getAppPath'),

    // Settings
    saveSettings: (settings) => ipcRenderer.invoke('saveSettings', settings),
    getSettings: () => ipcRenderer.invoke('getSettings'),

    // System integration
    setAutoLaunch: (enable) => ipcRenderer.invoke('setAutoLaunch', enable),
    showMainWindow: () => ipcRenderer.send('showMainWindow'),
    hideMainWindow: () => ipcRenderer.send('hideMainWindow'),
    quitApp: () => ipcRenderer.send('quitApp'),

    // Native network connectivity check
    checkNetworkConnectivity: () => ipcRenderer.invoke('checkNetworkConnectivity'),

    // Get current system state
    getSystemState: () => ipcRenderer.invoke('getSystemState'),

    // System monitoring events for RefreshManager (these already exist, just showing for completeness)
    onSystemSuspend: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('system-suspend', subscription);
        return () => ipcRenderer.removeListener('system-suspend', subscription);
    },

    onSystemResume: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('system-resume', subscription);
        return () => ipcRenderer.removeListener('system-resume', subscription);
    },

    onNetworkStateChanged: (callback) => {
        const subscription = (_, isOnline) => callback(isOnline);
        ipcRenderer.on('network-state-changed', subscription);
        return () => ipcRenderer.removeListener('network-state-changed', subscription);
    },

    // Tray menu events
    onShowApp: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('showApp', subscription);
        return () => ipcRenderer.removeListener('showApp', subscription);
    },

    onHideApp: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('hideApp', subscription);
        return () => ipcRenderer.removeListener('hideApp', subscription);
    },

    onQuitApp: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('quitApp', subscription);
        return () => ipcRenderer.removeListener('quitApp', subscription);
    }
});

// TOTP generation helper with improved error handling
contextBridge.exposeInMainWorld('generateTOTP', async (secret, period = 30, digits = 6, timeOffset = 0) => {
    try {
        // Generate a request ID for tracking TOTP generation
        const totpId = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
        console.log(`[${totpId}] Generating TOTP code with period=${period}, digits=${digits}, timeOffset=${timeOffset}`);

        // Normalize and clean the secret
        secret = secret.toUpperCase().replace(/\s/g, '').replace(/=/g, '');

        // Handle special cases where secret might be base64 encoded or in other formats
        if (secret.includes('/') || secret.includes('+')) {
            console.log(`[${totpId}] Note: Secret contains characters not in standard base32 alphabet`);
        }

        // Base32 decoding
        const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let bits = '';

        // Convert each character to its 5-bit value
        for (let i = 0; i < secret.length; i++) {
            const val = base32chars.indexOf(secret[i]);
            if (val < 0) {
                console.log(`[${totpId}] Skipping invalid character: ${secret[i]}`);
                continue;
            }
            bits += val.toString(2).padStart(5, '0');
        }

        // Ensure we have complete bytes (8 bits each)
        const bitGroups = [];
        for (let i = 0; i < Math.floor(bits.length / 8); i++) {
            bitGroups.push(bits.substr(i * 8, 8));
        }

        // Convert bit groups to bytes
        const keyBytes = new Uint8Array(bitGroups.length);
        for (let i = 0; i < bitGroups.length; i++) {
            keyBytes[i] = parseInt(bitGroups[i], 2);
        }

        // Apply time offset in seconds (for synchronization with other TOTP providers)
        const currentTimeSeconds = Math.floor(Date.now() / 1000) + timeOffset;

        // Get the current time counter value (floor of seconds since epoch / period)
        const counter = Math.floor(currentTimeSeconds / period);
        console.log(`Current time: ${new Date(currentTimeSeconds * 1000).toISOString()}`);
        console.log(`Counter value: ${counter} (period: ${period}s)`);

        // Convert counter to bytes (8 bytes, big-endian) per RFC 4226
        const counterBytes = new Uint8Array(8);
        let temp = counter;
        for (let i = 7; i >= 0; i--) {
            counterBytes[i] = temp & 0xff;
            temp = Math.floor(temp / 256);
        }

        // Error handling for crypto operations
        try {
            // Import the key for HMAC-SHA1
            const key = await crypto.subtle.importKey(
                'raw',
                keyBytes,
                { name: 'HMAC', hash: { name: 'SHA-1' } },
                false,
                ['sign']
            );

            // Sign the counter with the key
            const signature = await crypto.subtle.sign('HMAC', key, counterBytes);
            const hash = new Uint8Array(signature);

            // Dynamic truncation as per RFC 4226
            const offset = hash[hash.length - 1] & 0xf;

            let code = ((hash[offset] & 0x7f) << 24) |
                ((hash[offset + 1] & 0xff) << 16) |
                ((hash[offset + 2] & 0xff) << 8) |
                (hash[offset + 3] & 0xff);

            // Truncate to the specified number of digits
            code = code % Math.pow(10, digits);

            // Add leading zeros if necessary
            const result = code.toString().padStart(digits, '0');
            console.log(`[${totpId}] Generated TOTP: ${result}`);

            return result;
        } catch (cryptoError) {
            console.error(`[${totpId}] Crypto operation failed:`, cryptoError);

            // Fallback to a simpler algorithm if crypto API fails
            try {
                console.log(`[${totpId}] Attempting fallback TOTP generation`);

                // Simple hash function for fallback (not cryptographically secure)
                let fallbackHash = 0;
                for (let i = 0; i < counterBytes.length; i++) {
                    // Simple hash combining with key bytes
                    for (let j = 0; j < keyBytes.length; j++) {
                        fallbackHash = ((fallbackHash << 5) - fallbackHash) + (counterBytes[i] ^ keyBytes[j % keyBytes.length]);
                    }
                }

                // Generate code from hash
                fallbackHash = Math.abs(fallbackHash);
                let fallbackCode = fallbackHash % Math.pow(10, digits);
                const result = fallbackCode.toString().padStart(digits, '0');

                console.log(`[${totpId}] Generated fallback TOTP: ${result}`);
                return result;
            } catch (fallbackError) {
                console.error(`[${totpId}] Fallback TOTP generation failed:`, fallbackError);
                return 'ERROR';
            }
        }
    } catch (error) {
        console.error('Error generating TOTP:', error);
        return 'ERROR';
    }
});