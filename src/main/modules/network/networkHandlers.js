const { powerMonitor, BrowserWindow } = require('electron');
const { createLogger } = require('../../../utils/mainLogger');
const networkService = require('../../../services/network/NetworkService');
const webSocketService = require('../../../services/websocket/ws-service');
const { AppStateMachine } = require('../../../services/core/AppStateMachine');
const timeManager = require('../../../services/core/TimeManager');

const log = createLogger('NetworkHandlers');

class NetworkHandlers {
    async initializeNetworkService() {
        log.info('Setting up network service event handlers...');

        networkService.on('stateChanged', (event) => {
            log.info('NetworkService state changed event:', {
                isOnline: event.newState.isOnline,
                wasOnline: event.oldState.isOnline,
                quality: event.newState.networkQuality,
                version: event.version
            });
            
            if (AppStateMachine.isReady()) {
                if (!event.newState.isOnline && event.oldState.isOnline) {
                    AppStateMachine.networkLost();
                } else if (event.newState.isOnline && !event.oldState.isOnline) {
                    AppStateMachine.networkRestored();
                }
            }

            BrowserWindow.getAllWindows().forEach(window => {
                if (window && !window.isDestroyed()) {
                    window.webContents.send('network-change', {
                        type: 'state-sync',
                        state: event.newState,
                        oldState: event.oldState,
                        version: event.version
                    });
                    
                    window.webContents.send('network-state-changed', event.newState);
                    
                    const syncData = {
                        state: event.newState,
                        timestamp: Date.now(),
                        version: event.version
                    };
                    window.webContents.send('network-state-sync', syncData);
                }
            });
        });

        log.info('Network service initialized with state:', networkService.getState());
        
        if (webSocketService && webSocketService.networkStateHandler) {
            log.info('Connecting network service to WebSocket service...');
            webSocketService.networkStateHandler.initialize(networkService);
        }
    }

    setupNativeMonitoring() {
        log.info('Setting up native system monitoring...');

        powerMonitor.on('suspend', () => {
            log.info('System is going to sleep');

            BrowserWindow.getAllWindows().forEach(window => {
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
                            vpnActive: state.vpnActive
                        });
                    }

                    BrowserWindow.getAllWindows().forEach(window => {
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
            timestamp: timeManager.now()
        };
    }
}

module.exports = new NetworkHandlers();