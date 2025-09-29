const { createLogger } = require('../../../../utils/mainLogger');
const proxyService = require('../../../../services/proxy/ProxyService');
const settingsHandlers = require('./settingsHandlers');

const log = createLogger('ProxyHandlers');

class ProxyHandlers {
    async handleProxyStart(_, port) {
        try {
            const result = await proxyService.start(port);
            if (result.success) {
                // Restore cache configuration from user settings
                try {
                    const settings = await settingsHandlers.handleGetSettings();
                    if (settings.proxyCacheEnabled !== undefined) {
                        proxyService.setCacheEnabled(settings.proxyCacheEnabled);
                    }
                } catch (error) {
                    log.warn('Could not apply cache setting from settings:', error);
                }
                
                // Load environment variables for the current workspace
                try {
                    const { app } = require('electron');
                    const fs = require('fs').promises;
                    const path = require('path');
                    
                    // Get current workspace from settings
                    const workspacesPath = path.join(app.getPath('userData'), 'workspaces.json');
                    const workspacesData = await fs.readFile(workspacesPath, 'utf8');
                    const { activeWorkspaceId } = JSON.parse(workspacesData);
                    
                    if (activeWorkspaceId) {
                        const envPath = path.join(app.getPath('userData'), 'workspaces', activeWorkspaceId, 'environments.json');
                        const envData = await fs.readFile(envPath, 'utf8');
                        const { environments, activeEnvironment } = JSON.parse(envData);
                        const activeVars = environments[activeEnvironment] || {};
                        // Extract just the values from the environment variable objects
                        const variables = {};
                        Object.entries(activeVars).forEach(([key, data]) => {
                            if (data && data.value !== undefined) {
                                variables[key] = data.value;
                            }
                        });
                        proxyService.updateEnvironmentVariables(variables);
                        log.info(`Loaded ${Object.keys(variables).length} environment variables for proxy service`);
                        
                        // Load sources for the current workspace
                        try {
                            const sourcesPath = path.join(app.getPath('userData'), 'workspaces', activeWorkspaceId, 'sources.json');
                            const sourcesData = await fs.readFile(sourcesPath, 'utf8');
                            const sources = JSON.parse(sourcesData);
                            if (Array.isArray(sources)) {
                                proxyService.updateSources(sources);
                                log.info(`Loaded ${sources.length} sources for proxy service`);
                            }
                        } catch (error) {
                            log.warn('Could not load sources for proxy:', error.message);
                        }
                        
                        // Load header rules for the current workspace
                        try {
                            const rulesPath = path.join(app.getPath('userData'), 'workspaces', activeWorkspaceId, 'rules.json');
                            const rulesData = await fs.readFile(rulesPath, 'utf8');
                            const rulesStorage = JSON.parse(rulesData);
                            if (rulesStorage.rules && rulesStorage.rules.header) {
                                proxyService.updateHeaderRules(rulesStorage.rules.header);
                                log.info(`Loaded ${rulesStorage.rules.header.length} header rules for proxy service`);
                            }
                        } catch (error) {
                            log.warn('Could not load header rules for proxy:', error.message);
                        }
                    }
                } catch (error) {
                    log.warn('Could not load environment variables for proxy:', error.message);
                    proxyService.updateEnvironmentVariables({});
                }
            }
            return result;
        } catch (error) {
            log.error('Error starting proxy:', error);
            return { success: false, error: error.message };
        }
    }

    async handleProxyStop() {
        try {
            await proxyService.stop();
            return { success: true };
        } catch (error) {
            log.error('Error stopping proxy:', error);
            return { success: false, error: error.message };
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

    async handleProxySaveRule(_, rule) {
        try {
            return await proxyService.saveRule(rule);
        } catch (error) {
            log.error('Error saving proxy rule:', error);
            return { success: false, error: error.message };
        }
    }

    async handleProxyDeleteRule(_, ruleId) {
        try {
            return await proxyService.deleteRule(ruleId);
        } catch (error) {
            log.error('Error deleting proxy rule:', error);
            return { success: false, error: error.message };
        }
    }

    async handleProxyClearCache() {
        try {
            proxyService.clearCache();
            return { success: true };
        } catch (error) {
            log.error('Error clearing proxy cache:', error);
            return { success: false, error: error.message };
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

    async handleProxySetCacheEnabled(_, enabled) {
        try {
            proxyService.setCacheEnabled(enabled);
            return { success: true };
        } catch (error) {
            log.error('Error setting cache enabled:', error);
            return { success: false, error: error.message };
        }
    }

    async handleProxyUpdateHeaderRules(_, headerRules) {
        try {
            proxyService.updateHeaderRules(headerRules);
            return { success: true };
        } catch (error) {
            log.error('Error updating header rules in proxy:', error);
            return { success: false, error: error.message };
        }
    }

    async handleProxyClearRules() {
        try {
            proxyService.clearRules();
            return { success: true };
        } catch (error) {
            log.error('Error clearing proxy rules:', error);
            return { success: false, error: error.message };
        }
    }


    async handleProxySetStrictSSL(_, enabled) {
        try {
            proxyService.setStrictSSL(enabled);
            return { success: true };
        } catch (error) {
            log.error('Error setting strict SSL:', error);
            return { success: false, error: error.message };
        }
    }

    async handleProxyAddTrustedCertificate(_, fingerprint) {
        try {
            proxyService.addTrustedCertificate(fingerprint);
            return { success: true };
        } catch (error) {
            log.error('Error adding trusted certificate:', error);
            return { success: false, error: error.message };
        }
    }

    async handleProxyRemoveTrustedCertificate(_, fingerprint) {
        try {
            proxyService.removeTrustedCertificate(fingerprint);
            return { success: true };
        } catch (error) {
            log.error('Error removing trusted certificate:', error);
            return { success: false, error: error.message };
        }
    }

    async handleProxyAddCertificateException(_, domain, fingerprint) {
        try {
            proxyService.addCertificateException(domain, fingerprint);
            return { success: true };
        } catch (error) {
            log.error('Error adding certificate exception:', error);
            return { success: false, error: error.message };
        }
    }

    async handleProxyRemoveCertificateException(_, domain) {
        try {
            proxyService.removeCertificateException(domain);
            return { success: true };
        } catch (error) {
            log.error('Error removing certificate exception:', error);
            return { success: false, error: error.message };
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
            const settings = await settingsHandlers.handleGetSettings();
            if (settings.autoStartProxy) {
                log.info('Auto-starting proxy server based on settings');
                const result = await this.handleProxyStart(null, null);
                if (result.success) {
                    log.info('Proxy server auto-started successfully on port', result.port);
                }
            }
            
            // Handle deferred video recording activation on macOS
            if (settings.pendingVideoRecording && process.platform === 'darwin') {
                log.info('Found pending video recording enable request, checking permission...');
                
                const systemHandlers = require('./systemHandlers');
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

module.exports = new ProxyHandlers();