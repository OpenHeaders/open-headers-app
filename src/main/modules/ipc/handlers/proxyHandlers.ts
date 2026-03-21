import electron from 'electron';
import fs from 'fs';
import path from 'path';
import mainLogger from '../../../../utils/mainLogger';
import proxyService from '../../../../services/proxy/ProxyService';
import type { HeaderRule } from '../../../../services/proxy/ProxyService';
import settingsHandlers from './settingsHandlers';
import type { IpcInvokeEvent, OperationResult } from '../../../../types/common';
import { errorMessage } from '../../../../types/common';
import type { EnvironmentsFile, EnvironmentVariable } from '../../../../types/environment';
import type { Source } from '../../../../types/source';
import type { ProxyRule } from '../../../../types/proxy';
import type { AppSettings } from '../../../../types/settings';

const { app } = electron;
const fsPromises = fs.promises;

const { createLogger } = mainLogger;
const log = createLogger('ProxyHandlers');

class ProxyHandlers {
    async handleProxyStart(_: IpcInvokeEvent | null, port: number | null) {
        try {
            const result = await proxyService.start(port ?? undefined);
            if (result.success) {
                // Restore cache configuration from user settings
                try {
                    const settings = await settingsHandlers.handleGetSettings() as Partial<AppSettings>;
                    if (settings.proxyCacheEnabled !== undefined) {
                        proxyService.setCacheEnabled(settings.proxyCacheEnabled);
                    }
                } catch (error) {
                    log.warn('Could not apply cache setting from settings:', error);
                }

                // Load environment variables for the current workspace
                try {

                    // Get current workspace from settings
                    const workspacesPath = path.join(app.getPath('userData'), 'workspaces.json');
                    const workspacesData = await fsPromises.readFile(workspacesPath, 'utf8');
                    const { activeWorkspaceId } = JSON.parse(workspacesData) as { activeWorkspaceId?: string };

                    if (activeWorkspaceId) {
                        const envPath = path.join(app.getPath('userData'), 'workspaces', activeWorkspaceId, 'environments.json');
                        const envData = await fsPromises.readFile(envPath, 'utf8');
                        const { environments, activeEnvironment } = JSON.parse(envData) as EnvironmentsFile;
                        const activeVars = environments[activeEnvironment] || {};
                        // Extract just the values from the environment variable objects
                        const variables: Record<string, string> = {};
                        Object.entries(activeVars).forEach(([key, data]: [string, EnvironmentVariable]) => {
                            if (data && data.value !== undefined) {
                                variables[key] = data.value;
                            }
                        });
                        proxyService.updateEnvironmentVariables(variables);
                        log.info(`Loaded ${Object.keys(variables).length} environment variables for proxy service`);

                        // Load sources for the current workspace
                        try {
                            const sourcesPath = path.join(app.getPath('userData'), 'workspaces', activeWorkspaceId, 'sources.json');
                            const sourcesData = await fsPromises.readFile(sourcesPath, 'utf8');
                            const sources: Source[] = JSON.parse(sourcesData);
                            if (Array.isArray(sources)) {
                                proxyService.updateSources(sources);
                                log.info(`Loaded ${sources.length} sources for proxy service`);
                            }
                        } catch (error: unknown) {
                            log.warn('Could not load sources for proxy:', errorMessage(error));
                        }

                        // Load header rules for the current workspace
                        try {
                            const rulesPath = path.join(app.getPath('userData'), 'workspaces', activeWorkspaceId, 'rules.json');
                            const rulesData = await fsPromises.readFile(rulesPath, 'utf8');
                            const rulesStorage = JSON.parse(rulesData) as { rules?: { header?: HeaderRule[] } };
                            if (rulesStorage.rules && rulesStorage.rules.header) {
                                proxyService.updateHeaderRules(rulesStorage.rules.header);
                                log.info(`Loaded ${rulesStorage.rules.header.length} header rules for proxy service`);
                            }
                        } catch (error: unknown) {
                            log.warn('Could not load header rules for proxy:', errorMessage(error));
                        }
                    }
                } catch (error: unknown) {
                    log.warn('Could not load environment variables for proxy:', errorMessage(error));
                    proxyService.updateEnvironmentVariables({});
                }
            }
            return result;
        } catch (error: unknown) {
            log.error('Error starting proxy:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleProxyStop(): Promise<OperationResult> {
        try {
            await proxyService.stop();
            return { success: true };
        } catch (error: unknown) {
            log.error('Error stopping proxy:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    handleProxyStatus() {
        return proxyService.getStatus();
    }

    async handleProxyGetRules() {
        try {
            return proxyService.getRules();
        } catch (error) {
            log.error('Error getting proxy rules:', error);
            return [];
        }
    }

    async handleProxySaveRule(_: IpcInvokeEvent, rule: ProxyRule): Promise<OperationResult> {
        try {
            return await proxyService.saveRule(rule);
        } catch (error: unknown) {
            log.error('Error saving proxy rule:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleProxyDeleteRule(_: IpcInvokeEvent, ruleId: string): Promise<OperationResult> {
        try {
            return await proxyService.deleteRule(ruleId);
        } catch (error: unknown) {
            log.error('Error deleting proxy rule:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleProxyClearCache(): Promise<OperationResult> {
        try {
            proxyService.clearCache();
            return { success: true };
        } catch (error: unknown) {
            log.error('Error clearing proxy cache:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleProxyGetCacheStats() {
        try {
            return proxyService.getCacheStats();
        } catch (error) {
            log.error('Error getting cache stats:', error);
            return null;
        }
    }

    async handleProxyGetCacheEntries() {
        try {
            return proxyService.getCacheEntries();
        } catch (error) {
            log.error('Error getting cache entries:', error);
            return [];
        }
    }

    async handleProxySetCacheEnabled(_: IpcInvokeEvent, enabled: boolean): Promise<OperationResult> {
        try {
            proxyService.setCacheEnabled(enabled);
            return { success: true };
        } catch (error: unknown) {
            log.error('Error setting cache enabled:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleProxyUpdateHeaderRules(_: IpcInvokeEvent, headerRules: HeaderRule[]): Promise<OperationResult> {
        try {
            proxyService.updateHeaderRules(headerRules);
            return { success: true };
        } catch (error: unknown) {
            log.error('Error updating header rules in proxy:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleProxyClearRules(): Promise<OperationResult> {
        try {
            proxyService.clearRules();
            return { success: true };
        } catch (error: unknown) {
            log.error('Error clearing proxy rules:', error);
            return { success: false, error: errorMessage(error) };
        }
    }


    async handleProxySetStrictSSL(_: IpcInvokeEvent, enabled: boolean): Promise<OperationResult> {
        try {
            proxyService.setStrictSSL(enabled);
            return { success: true };
        } catch (error: unknown) {
            log.error('Error setting strict SSL:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleProxyAddTrustedCertificate(_: IpcInvokeEvent, fingerprint: string): Promise<OperationResult> {
        try {
            proxyService.addTrustedCertificate(fingerprint);
            return { success: true };
        } catch (error: unknown) {
            log.error('Error adding trusted certificate:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleProxyRemoveTrustedCertificate(_: IpcInvokeEvent, fingerprint: string): Promise<OperationResult> {
        try {
            proxyService.removeTrustedCertificate(fingerprint);
            return { success: true };
        } catch (error: unknown) {
            log.error('Error removing trusted certificate:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleProxyAddCertificateException(_: IpcInvokeEvent, domain: string, fingerprint: string): Promise<OperationResult> {
        try {
            proxyService.addCertificateException(domain, fingerprint);
            return { success: true };
        } catch (error: unknown) {
            log.error('Error adding certificate exception:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleProxyRemoveCertificateException(_: IpcInvokeEvent, domain: string): Promise<OperationResult> {
        try {
            proxyService.removeCertificateException(domain);
            return { success: true };
        } catch (error: unknown) {
            log.error('Error removing certificate exception:', error);
            return { success: false, error: errorMessage(error) };
        }
    }

    async handleProxyGetCertificateInfo() {
        try {
            return proxyService.getCertificateInfo();
        } catch (error) {
            log.error('Error getting certificate info:', error);
            return {
                strictSSL: true,
                trustedCertificates: [],
                certificateExceptions: []
            };
        }
    }

    async autoStartProxy() {
        try {
            const settings = await settingsHandlers.handleGetSettings() as Partial<AppSettings>;
            if (settings.autoStartProxy) {
                log.info('Auto-starting proxy server based on settings');
                const result = await this.handleProxyStart(null, null);
                if (result.success) {
                    log.info('Proxy server auto-started successfully on port', (result as { port?: number }).port);
                }
            }

            // Handle deferred video recording activation on macOS
            if (settings.pendingVideoRecording && process.platform === 'darwin') {
                log.info('Found pending video recording enable request, checking permission...');

                const systemHandlers = (await import('./systemHandlers')).default;
                const permissionCheck = await systemHandlers.handleCheckScreenRecordingPermission();
                if (permissionCheck.success && permissionCheck.hasPermission) {
                    log.info('Screen recording permission granted, enabling video recording feature');

                    const updatedSettings = {
                        ...settings,
                        videoRecording: true,
                        pendingVideoRecording: false
                    };

                    await settingsHandlers.handleSaveSettings(null, updatedSettings);
                    log.info('Video recording feature enabled automatically after permission grant');
                } else {
                    log.info('Screen recording permission not yet granted, keeping pending flag');
                }
            }
        } catch (error) {
            log.error('Error auto-starting proxy server:', error);
        }
    }
}

const proxyHandlers = new ProxyHandlers();
export { ProxyHandlers };
export default proxyHandlers;
