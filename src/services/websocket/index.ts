// WebSocket services exports
import wsService from './ws-service';
import WSNetworkStateHandler from './ws-network-state';
import WSRecordingHandler from './ws-recording-handler';
import WSRuleHandler from './ws-rule-handler';
import WSSourceHandler from './ws-source-handler';
import WSEnvironmentHandler from './ws-environment-handler';
import WSClientHandler from './ws-client-handler';

export {
    wsService,
    WSNetworkStateHandler as wsNetworkState,
    WSRecordingHandler as wsRecordingHandler,
    WSRuleHandler as wsRuleHandler,
    WSSourceHandler as wsSourceHandler,
    WSEnvironmentHandler as wsEnvironmentHandler,
    WSClientHandler as wsClientHandler
};

// CJS compat – default export for require('./websocket')
export default {
    wsService,
    wsNetworkState: WSNetworkStateHandler,
    wsRecordingHandler: WSRecordingHandler,
    wsRuleHandler: WSRuleHandler,
    wsSourceHandler: WSSourceHandler,
    wsEnvironmentHandler: WSEnvironmentHandler,
    wsClientHandler: WSClientHandler
};
