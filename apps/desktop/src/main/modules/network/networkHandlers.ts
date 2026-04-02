import electron from 'electron';
import { AppStateMachine } from '@/services/core/AppStateMachine';
import timeManager from '@/services/core/TimeManager';
import type { NetworkState } from '@/services/network/NetworkService';
import networkService from '@/services/network/NetworkService';
import webSocketService from '@/services/websocket/ws-service';
import mainLogger from '@/utils/mainLogger';

const { powerMonitor, BrowserWindow } = electron;
const { createLogger } = mainLogger;
const log = createLogger('NetworkHandlers');

class NetworkHandlers {
  async initializeNetworkService() {
    log.info('Setting up network service event handlers...');

    // Forward every state update to the renderer (quality, latency, interfaces, etc.)
    networkService.on('state-changed', (event: { newState: NetworkState; oldState: NetworkState; version: number }) => {
      log.debug('NetworkService state changed event:', {
        isOnline: event.newState.isOnline,
        wasOnline: event.oldState.isOnline,
        quality: event.newState.networkQuality,
        version: event.version,
      });

      BrowserWindow.getAllWindows().forEach((window) => {
        if (window && !window.isDestroyed()) {
          window.webContents.send('network-change', {
            type: 'state-sync',
            state: event.newState,
            oldState: event.oldState,
            version: event.version,
          });

          window.webContents.send('network-state-changed', event.newState);

          const syncData = {
            state: event.newState,
            timestamp: Date.now(),
            version: event.version,
          };
          window.webContents.send('network-state-sync', syncData);
        }
      });
    });

    // Semantic connectivity events — only fire on actual offline↔online transitions
    networkService.on('offline', () => {
      if (AppStateMachine.isReady()) {
        AppStateMachine.networkLost();
      }
    });

    networkService.on('online', () => {
      if (AppStateMachine.isReady()) {
        AppStateMachine.networkRestored();
      }
    });

    log.info('Network service initialized with state:', networkService.getState());

    if (webSocketService?.networkStateHandler) {
      log.info('Connecting network service to WebSocket service...');
      webSocketService.networkStateHandler.initialize(networkService);
    }
  }

  setupNativeMonitoring() {
    log.info('Setting up native system monitoring...');

    powerMonitor.on('suspend', () => {
      log.info('System is going to sleep');

      BrowserWindow.getAllWindows().forEach((window) => {
        if (window && !window.isDestroyed()) {
          window.webContents.send('system-suspend');
        }
      });
    });

    powerMonitor.on('resume', () => {
      log.info('System woke up');

      const resumeDelay = process.platform === 'win32' ? 3000 : 1000;

      if (networkService) {
        setTimeout(async () => {
          const state = await networkService.forceCheck();

          if (state) {
            log.info('Network state after resume:', {
              isOnline: state.isOnline,
              networkQuality: state.networkQuality,
              vpnActive: state.vpnActive,
            });
          }

          BrowserWindow.getAllWindows().forEach((window) => {
            if (window && !window.isDestroyed()) {
              window.webContents.send('system-resume');
              if (state) {
                window.webContents.send('network-state-changed', state.isOnline);
              }
            }
          });
        }, resumeDelay);
      }
    });
  }

  async checkNetworkConnectivity() {
    if (networkService) {
      const state = await networkService.forceCheck();
      return state.isOnline;
    }

    return true;
  }

  getNetworkState() {
    return networkService.getState();
  }

  async forceNetworkCheck() {
    if (networkService) {
      return await networkService.forceCheck();
    }
    return null;
  }

  getSystemState() {
    const networkState = networkService.getState();
    return {
      ...networkState,
      powerState: 'active',
      timestamp: timeManager.now(),
    };
  }
}

const networkHandlers = new NetworkHandlers();

export { NetworkHandlers };
export default networkHandlers;
