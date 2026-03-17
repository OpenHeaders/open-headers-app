import electron from 'electron';
const { ipcRenderer } = electron;

const proxyAPI = {
    proxyStart: (port: number): Promise<unknown> => ipcRenderer.invoke('proxy-start', port),
    proxyStop: (): Promise<unknown> => ipcRenderer.invoke('proxy-stop'),
    proxyStatus: (): Promise<unknown> => ipcRenderer.invoke('proxy-status'),
    proxyGetRules: (): Promise<unknown> => ipcRenderer.invoke('proxy-get-rules'),
    proxySaveRule: (rule: unknown): Promise<unknown> => ipcRenderer.invoke('proxy-save-rule', rule),
    proxyDeleteRule: (ruleId: string): Promise<unknown> => ipcRenderer.invoke('proxy-delete-rule', ruleId),
    proxyUpdateSource: (sourceId: string, value: unknown): void => ipcRenderer.send('proxy-update-source', sourceId, value),
    proxyUpdateSources: (sources: unknown): void => ipcRenderer.send('proxy-update-sources', sources),

    proxyClearCache: (): Promise<unknown> => ipcRenderer.invoke('proxy-clear-cache'),
    proxyGetCacheStats: (): Promise<unknown> => ipcRenderer.invoke('proxy-get-cache-stats'),
    proxyGetCacheEntries: (): Promise<unknown> => ipcRenderer.invoke('proxy-get-cache-entries'),
    proxySetCacheEnabled: (enabled: boolean): Promise<unknown> => ipcRenderer.invoke('proxy-set-cache-enabled', enabled),
    proxyUpdateHeaderRules: (headerRules: unknown): Promise<unknown> => ipcRenderer.invoke('proxy-update-header-rules', headerRules),
    proxyClearRules: (): Promise<unknown> => ipcRenderer.invoke('proxyClearRules'),

    // SSL/Certificate management
    proxySetStrictSSL: (enabled: boolean): Promise<unknown> => ipcRenderer.invoke('proxy-set-strict-ssl', enabled),
    proxyAddTrustedCertificate: (fingerprint: string): Promise<unknown> => ipcRenderer.invoke('proxy-add-trusted-certificate', fingerprint),
    proxyRemoveTrustedCertificate: (fingerprint: string): Promise<unknown> => ipcRenderer.invoke('proxy-remove-trusted-certificate', fingerprint),
    proxyAddCertificateException: (domain: string, fingerprint: string): Promise<unknown> => ipcRenderer.invoke('proxy-add-certificate-exception', domain, fingerprint),
    proxyRemoveCertificateException: (domain: string): Promise<unknown> => ipcRenderer.invoke('proxy-remove-certificate-exception', domain),
    proxyGetCertificateInfo: (): Promise<unknown> => ipcRenderer.invoke('proxy-get-certificate-info'),
};

export default proxyAPI;
