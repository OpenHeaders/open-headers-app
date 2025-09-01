const { ipcRenderer } = require('electron');

const proxyAPI = {
    proxyStart: (port) => ipcRenderer.invoke('proxy-start', port),
    proxyStop: () => ipcRenderer.invoke('proxy-stop'),
    proxyStatus: () => ipcRenderer.invoke('proxy-status'),
    proxyGetRules: () => ipcRenderer.invoke('proxy-get-rules'),
    proxySaveRule: (rule) => ipcRenderer.invoke('proxy-save-rule', rule),
    proxyDeleteRule: (ruleId) => ipcRenderer.invoke('proxy-delete-rule', ruleId),
    proxyUpdateSource: (sourceId, value) => ipcRenderer.send('proxy-update-source', sourceId, value),
    proxyUpdateSources: (sources) => ipcRenderer.send('proxy-update-sources', sources),
    
    proxyClearCache: () => ipcRenderer.invoke('proxy-clear-cache'),
    proxyGetCacheStats: () => ipcRenderer.invoke('proxy-get-cache-stats'),
    proxyGetCacheEntries: () => ipcRenderer.invoke('proxy-get-cache-entries'),
    proxySetCacheEnabled: (enabled) => ipcRenderer.invoke('proxy-set-cache-enabled', enabled),
    proxyUpdateHeaderRules: (headerRules) => ipcRenderer.invoke('proxy-update-header-rules', headerRules),
    proxyClearRules: () => ipcRenderer.invoke('proxyClearRules')
};

module.exports = proxyAPI;