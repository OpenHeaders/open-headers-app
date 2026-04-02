import type { HeaderRule, Source } from '@openheaders/core';
import electron from 'electron';
import type { CacheEntry, CacheStats, ProxyCertificateInfo, ProxyRule, ProxyStatus } from '@/types/proxy';

const { ipcRenderer } = electron;

const proxyAPI = {
  proxyStart: (port: number): Promise<{ success: boolean; port?: number; error?: string }> =>
    ipcRenderer.invoke('proxy-start', port),
  proxyStop: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('proxy-stop'),
  proxyStatus: (): Promise<ProxyStatus> => ipcRenderer.invoke('proxy-status'),
  proxyGetRules: (): Promise<ProxyRule[]> => ipcRenderer.invoke('proxy-get-rules'),
  proxySaveRule: (rule: ProxyRule): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('proxy-save-rule', rule),
  proxyDeleteRule: (ruleId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('proxy-delete-rule', ruleId),
  proxyUpdateSource: (sourceId: string, value: string): void =>
    ipcRenderer.send('proxy-update-source', sourceId, value),
  proxyUpdateSources: (sources: Source[]): void => ipcRenderer.send('proxy-update-sources', sources),

  proxyClearCache: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('proxy-clear-cache'),
  proxyGetCacheStats: (): Promise<CacheStats | null> => ipcRenderer.invoke('proxy-get-cache-stats'),
  proxyGetCacheEntries: (): Promise<CacheEntry[]> => ipcRenderer.invoke('proxy-get-cache-entries'),
  proxySetCacheEnabled: (enabled: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('proxy-set-cache-enabled', enabled),
  proxyUpdateHeaderRules: (headerRules: HeaderRule[]): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('proxy-update-header-rules', headerRules),
  proxyClearRules: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('proxyClearRules'),

  proxySetStrictSSL: (enabled: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('proxy-set-strict-ssl', enabled),
  proxyAddTrustedCertificate: (fingerprint: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('proxy-add-trusted-certificate', fingerprint),
  proxyRemoveTrustedCertificate: (fingerprint: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('proxy-remove-trusted-certificate', fingerprint),
  proxyAddCertificateException: (domain: string, fingerprint: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('proxy-add-certificate-exception', domain, fingerprint),
  proxyRemoveCertificateException: (domain: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('proxy-remove-certificate-exception', domain),
  proxyGetCertificateInfo: (): Promise<ProxyCertificateInfo> => ipcRenderer.invoke('proxy-get-certificate-info'),
};

export default proxyAPI;
