// WebSocket services exports

import WSClientHandler from './ws-client-handler';
import WSEnvironmentHandler from './ws-environment-handler';
import WSNetworkStateHandler from './ws-network-state';
import WSRecordingHandler from './ws-recording-handler';
import WSRuleHandler from './ws-rule-handler';
import wsService from './ws-service';
import WSSourceHandler from './ws-source-handler';

export {
  WSClientHandler as wsClientHandler,
  WSEnvironmentHandler as wsEnvironmentHandler,
  WSNetworkStateHandler as wsNetworkState,
  WSRecordingHandler as wsRecordingHandler,
  WSRuleHandler as wsRuleHandler,
  WSSourceHandler as wsSourceHandler,
  wsService,
};

// CJS compat – default export for require('./websocket')
export default {
  wsService,
  wsNetworkState: WSNetworkStateHandler,
  wsRecordingHandler: WSRecordingHandler,
  wsRuleHandler: WSRuleHandler,
  wsSourceHandler: WSSourceHandler,
  wsEnvironmentHandler: WSEnvironmentHandler,
  wsClientHandler: WSClientHandler,
};
