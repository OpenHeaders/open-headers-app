const { BrowserWindow } = require('electron');
const path = require('path');
const { createLogger } = require('../../../utils/mainLogger');

const log = createLogger('SplashWindow');

class SplashWindow {
    constructor() {
        this.splashWindow = null;
    }

    show() {
        log.info('Creating splash window...');
        
        this.splashWindow = new BrowserWindow({
            width: 400,
            height: 240,
            frame: false,
            alwaysOnTop: true,
            transparent: true,
            resizable: false,
            center: true,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });

        // Create inline HTML for splash screen
        const splashHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    background: linear-gradient(135deg, #0071e3 0%, #0051a2 100%);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    overflow: hidden;
                    border-radius: 10px;
                }
                .splash-container {
                    text-align: center;
                    color: white;
                }
                .logo {
                    width: 80px;
                    height: 80px;
                    margin-bottom: 20px;
                    animation: pulse 2s ease-in-out infinite;
                }
                @keyframes pulse {
                    0% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.1); opacity: 0.8; }
                    100% { transform: scale(1); opacity: 1; }
                }
                .app-name {
                    font-size: 24px;
                    font-weight: 600;
                    margin-bottom: 10px;
                    letter-spacing: -0.5px;
                }
                .loading-text {
                    font-size: 14px;
                    opacity: 0.9;
                    margin-bottom: 20px;
                }
                .progress-bar {
                    width: 200px;
                    height: 4px;
                    background: rgba(255, 255, 255, 0.3);
                    border-radius: 2px;
                    margin: 0 auto;
                    overflow: hidden;
                }
                .progress-fill {
                    height: 100%;
                    background: white;
                    border-radius: 2px;
                    animation: progress 2s ease-in-out infinite;
                }
                @keyframes progress {
                    0% { width: 0%; }
                    50% { width: 70%; }
                    100% { width: 100%; }
                }
            </style>
        </head>
        <body>
            <div class="splash-container">
                <img class="logo" src="data:image/png;base64,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" />
                <div class="app-name">OpenHeaders</div>
                <div class="loading-text">Starting up...</div>
                <div class="progress-bar">
                    <div class="progress-fill"></div>
                </div>
            </div>
        </body>
        </html>
        `;

        this.splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHTML)}`);

        this.splashWindow.once('ready-to-show', () => {
            this.splashWindow.show();
        });

        return this.splashWindow;
    }

    close() {
        if (this.splashWindow && !this.splashWindow.isDestroyed()) {
            this.splashWindow.close();
            this.splashWindow = null;
        }
    }

    isVisible() {
        return this.splashWindow && !this.splashWindow.isDestroyed();
    }
}

module.exports = new SplashWindow();