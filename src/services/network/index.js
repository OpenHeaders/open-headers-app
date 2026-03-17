// Network services exports
const NetworkServiceModule = require('./NetworkService');
const NetworkMonitorModule = require('./NetworkMonitor');
const NetworkStateManagerModule = require('./NetworkStateManager');
const PlatformMonitorsModule = require('./PlatformMonitors');

module.exports = {
  NetworkService: NetworkServiceModule.networkService || NetworkServiceModule.default || NetworkServiceModule,
  NetworkMonitor: NetworkMonitorModule.NetworkMonitor || NetworkMonitorModule.default || NetworkMonitorModule,
  NetworkStateManager: NetworkStateManagerModule.networkStateManager || NetworkStateManagerModule.default || NetworkStateManagerModule,
  PlatformMonitors: PlatformMonitorsModule
};
