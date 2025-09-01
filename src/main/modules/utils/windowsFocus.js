const { createLogger } = require('../../../utils/mainLogger');
const log = createLogger('WindowsFocus');

/**
 * Windows-specific focus helper
 * Uses @openheaders/windows-foreground on Windows to help with focus attribution
 */
class WindowsFocusHelper {
    constructor() {
        this.foregroundModule = null;
        this.isWindows = process.platform === 'win32';
        
        // Try to load @openheaders/windows-foreground if on Windows
        if (this.isWindows) {
            try {
                // Use dynamic require to prevent webpack from trying to bundle it
                this.foregroundModule = eval("require")('@openheaders/windows-foreground');
                log.info('@openheaders/windows-foreground loaded successfully');
            } catch (error) {
                // Try multiple fallback paths for the module
                const fallbackPaths = [];
                
                try {
                    const path = eval("require")('path');
                    const { app } = eval("require")('electron');
                    const appPath = app.getAppPath();
                    
                    // Try unpacked asar location
                    fallbackPaths.push(path.join(
                        appPath.replace('app.asar', 'app.asar.unpacked'),
                        'node_modules',
                        '@openheaders',
                        'windows-foreground'
                    ));
                    
                    // Try direct node_modules path (for development)
                    fallbackPaths.push(path.join(
                        appPath,
                        'node_modules',
                        '@openheaders',
                        'windows-foreground'
                    ));
                    
                    // Try to load from each fallback path
                    for (const fallbackPath of fallbackPaths) {
                        try {
                            this.foregroundModule = eval("require")(fallbackPath);
                            log.info('@openheaders/windows-foreground loaded from fallback path:', fallbackPath);
                            break;
                        } catch (pathError) {
                            log.debug('Failed to load from path:', fallbackPath, pathError.message);
                        }
                    }
                } catch (fallbackError) {
                    log.debug('Error setting up fallback paths:', fallbackError.message);
                }
                
                if (!this.foregroundModule) {
                    log.warn('@openheaders/windows-foreground not available, using fallback focus methods');
                    log.debug('Original error:', error.message);
                }
            }
        }
    }
    
    /**
     * Enhanced window focus with platform-specific optimizations
     * @param {BrowserWindow} window - The window to focus
     */
    focusWindow(window) {
        if (!window || window.isDestroyed()) {
            return;
        }
        
        // Restore if minimized (all platforms)
        if (window.isMinimized()) {
            window.restore();
        }
        
        // Ensure window is visible
        window.show();
        
        if (this.isWindows && this.foregroundModule) {
            // Windows: Use native module's comprehensive forceForegroundWindow
            // It already handles multiple strategies internally
            try {
                const pid = process.pid;
                const success = this.foregroundModule.forceForegroundWindow(pid);
                
                if (!success) {
                    // Fallback: Use Electron's built-in methods
                    window.setAlwaysOnTop(true, 'floating', 1);
                    window.focus();
                    window.moveTop();
                    
                    // Remove always on top after a brief moment
                    setTimeout(() => {
                        window.setAlwaysOnTop(false);
                        window.focus();
                    }, 100);
                } else {
                    // Just ensure Electron's focus is also called
                    window.focus();
                }
            } catch (error) {
                log.error('Error using native foreground module:', error);
                // Fallback to basic Electron focus
                window.focus();
            }
        } else if (process.platform === 'darwin') {
            // macOS: Simple approach works well
            window.focus();
            const { app } = require('electron');
            if (app.dock) {
                app.dock.show();
            }
        } else {
            // Linux and other platforms (including Windows without native module)
            window.focus();
            
            // Windows fallback when native module isn't available
            if (this.isWindows) {
                window.setAlwaysOnTop(true, 'floating', 1);
                window.moveTop();
                setTimeout(() => {
                    window.setAlwaysOnTop(false);
                    window.focus();
                }, 100);
            }
        }
    }
}

module.exports = new WindowsFocusHelper();