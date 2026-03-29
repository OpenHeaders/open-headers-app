import type { BrowserWindow } from 'electron';
import { errorMessage } from '../../../types/common';
import mainLogger from '../../../utils/mainLogger';

const { createLogger } = mainLogger;
const log = createLogger('WindowsFocus');

/**
 * Windows-specific focus helper
 * Uses @openheaders/windows-foreground on Windows to help with focus attribution
 */
class WindowsFocusHelper {
  private foregroundModule: { forceForegroundWindow(pid: number): boolean } | null;
  private isWindows: boolean;

  constructor() {
    this.foregroundModule = null;
    this.isWindows = process.platform === 'win32';

    if (this.isWindows) {
      try {
        // externalizeDepsPlugin() keeps node_modules external, so require() works directly
        // node-gyp-build inside the package handles prebuild/fallback resolution
        this.foregroundModule = require('@openheaders/windows-foreground');
        log.info('@openheaders/windows-foreground loaded successfully');
      } catch (error: unknown) {
        log.warn('@openheaders/windows-foreground not available, using fallback focus methods');
        log.debug('Load error:', errorMessage(error));
      }
    }
  }

  /**
   * Enhanced window focus with platform-specific optimizations
   * @param {BrowserWindow} window - The window to focus
   */
  focusWindow(window: BrowserWindow) {
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
      // macOS: Focus window without forcing dock visibility
      // Dock visibility is controlled by user settings in trayManager
      window.focus();
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

const windowsFocusHelper = new WindowsFocusHelper();

export { WindowsFocusHelper };
export default windowsFocusHelper;
