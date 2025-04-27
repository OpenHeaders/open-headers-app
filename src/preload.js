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

    // HTTP operations
    makeHttpRequest: (url, method, options) => ipcRenderer.invoke('makeHttpRequest', url, method, options),

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

    // Tray menu events - Added these missing handlers
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

// TOTP generation helper
contextBridge.exposeInMainWorld('generateTOTP', async (secret, period = 30, digits = 6, timeOffset = 0) => {
    try {
        // Normalize and clean the secret
        secret = secret.toUpperCase().replace(/\s/g, '').replace(/=/g, '');

        // Handle special cases where secret might be base64 encoded or in other formats
        if (secret.includes('/') || secret.includes('+')) {
            console.log("Note: Secret contains characters not in standard base32 alphabet");
        }

        // Base32 decoding
        const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let bits = '';

        // Convert each character to its 5-bit value
        for (let i = 0; i < secret.length; i++) {
            const val = base32chars.indexOf(secret[i]);
            if (val < 0) {
                console.log(`Skipping invalid character: ${secret[i]}`);
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
        console.log(`Generated TOTP: ${result}`);

        return result;
    } catch (error) {
        console.error('Error generating TOTP:', error);
        return 'ERROR';
    }
});