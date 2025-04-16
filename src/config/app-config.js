// app-config.js - Application configuration
const { app } = require('electron');
const path = require('path');

/**
 * Application configuration
 */
module.exports = {
    app: {
        name: 'Open Headers - Sources',
        isQuitting: false,
        version: '1.0.0',
        preventAutoLaunch: true,
    },
    window: {
        width: 1050,
        height: 700,
    },
    websocket: {
        port: 59210,
    },
    storage: {
        sourcesFile: path.join(app.getPath('userData'), 'sources.json'),
    },
    httpDefaults: {
        timeout: 10000, // 10 seconds
        userAgent: 'OpenHeaders/1.0',
    },
    fileWatch: {
        usePolling: true,
        interval: 300,
    }
};