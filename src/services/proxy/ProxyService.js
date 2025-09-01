const http = require('http');
const https = require('https');
const url = require('url');
const EventEmitter = require('events');
const { createLogger } = require('../../utils/mainLogger');
const ProxyCache = require('./ProxyCache');
const ProxyRuleStore = require('./ProxyRuleStore');
const domainMatcher = require('./domainMatcher');
const tls = require('tls');
const crypto = require('crypto');
const { Agent } = require('https');

/**
 * Consolidated ProxyService
 * Combines ProxyServer and ProxyManager functionality
 * Provides unified proxy management with rule application
 */
class ProxyService extends EventEmitter {
    constructor() {
        super();
        this.log = createLogger('ProxyService');
        
        // Server state
        this.server = null;
        this.port = 59212;
        this.isRunning = false;
        
        // Rule management
        this.ruleStore = new ProxyRuleStore();
        this.cache = new ProxyCache();
        this.cacheEnabled = true;
        this.headerRules = [];
        this.sources = new Map();
        this.environmentVariables = {};
        
        // SSL/TLS management
        this.strictSSL = false; // Disabled by default for development
        this.trustedCertificates = new Set();
        this.certificateExceptions = new Map(); // domain -> Set of fingerprints
        
        // Statistics
        this.stats = {
            requestsProcessed: 0,
            cacheHits: 0,
            cacheMisses: 0,
            errors: 0
        };
    }

    /**
     * Initialize the proxy service
     */
    async initialize() {
        await this.cache.initialize();
        await this.ruleStore.load();
        
        // Create HTTPS agent with proper certificate validation
        this.httpsAgent = new Agent({
            rejectUnauthorized: this.strictSSL,
            checkServerIdentity: (hostname, cert) => this.checkServerIdentity(hostname, cert),
            keepAlive: true,
            keepAliveMsecs: 30000,
            maxSockets: 50, // Increased to support more concurrent connections for prefetching
            maxFreeSockets: 25  // Increased proportionally
        });
    }

    /**
     * Switch to a new workspace
     */
    async switchWorkspace(workspaceId) {
        this.log.info(`Switching proxy service to workspace: ${workspaceId}`);
        
        // Clear current rules and sources
        this.clearRules();
        
        // Update rule store workspace
        this.ruleStore.setWorkspace(workspaceId);
        
        // Load rules for the new workspace
        await this.ruleStore.load();
        
        this.log.info(`Loaded ${this.ruleStore.getRules().length} proxy rules for workspace ${workspaceId}`);
    }

    /**
     * Update environment variables
     */
    updateEnvironmentVariables(variables) {
        // Process variables to handle both object format {value: "..."} and direct string format
        const processedVariables = {};
        Object.entries(variables || {}).forEach(([key, data]) => {
            // If it's an object with a 'value' property, extract the value
            // Otherwise, use the data as-is
            processedVariables[key] = (typeof data === 'object' && data !== null && 'value' in data) 
                ? data.value 
                : data;
        });
        
        this.environmentVariables = processedVariables;
        this.log.info(`Environment variables updated: ${Object.keys(this.environmentVariables).length} variables`);
    }

    /**
     * Start the proxy server
     */
    async start(port = this.port) {
        if (this.isRunning) {
            this.log.warn('Proxy server is already running');
            return { success: true, port: this.port };
        }

        try {
            // Only update port if a valid port is provided
            if (port) {
                this.port = port;
            }
            
            // Update HTTPS agent if needed
            if (this.httpsAgent) {
                this.httpsAgent.options.rejectUnauthorized = this.strictSSL;
            }

            // Create HTTP server
            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            // Start listening
            await new Promise((resolve, reject) => {
                this.server.listen(this.port, '127.0.0.1', () => {
                    this.isRunning = true;
                    this.log.info(`Proxy server started on port ${this.port}`);
                    resolve();
                });
                
                this.server.on('error', reject);
            });

            return { success: true, port: this.port };
        } catch (error) {
            this.log.error('Failed to start proxy server:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Stop the proxy server
     */
    async stop() {
        if (!this.isRunning) {
            this.log.warn('Proxy server is not running');
            return { success: true };
        }

        try {
            await new Promise((resolve, reject) => {
                this.server.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        this.isRunning = false;
                        resolve();
                    }
                });
            });

            return { success: true };
        } catch (error) {
            this.log.error('Failed to stop proxy server:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle incoming request
     */
    async handleRequest(req, res) {
        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
            res.writeHead(200, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*',
                'Access-Control-Max-Age': '86400'
            });
            res.end();
            return;
        }
        
        // Extract target URL from proxy request
        let targetUrl = req.url;
        
        // Handle proxy URL format: /http://... or /https://...
        if (targetUrl.startsWith('/http://') || targetUrl.startsWith('/https://')) {
            targetUrl = targetUrl.substring(1);
        }
        
        // If it's not a full URL, it's not a valid proxy request
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Invalid proxy request. URL must be in format: /http://example.com or /https://example.com');
            return;
        }
        
        // Remove debug log for every request
        
        this.stats.requestsProcessed++;

        // Check cache for GET requests
        if (req.method === 'GET' && this.cacheEnabled) {
            try {
                const cached = await this.cache.get(targetUrl, req.headers);
                if (cached) {
                    this.stats.cacheHits++;
                    
                    res.writeHead(cached.statusCode || 200, cached.headers);
                    res.end(cached.data);
                    return;
                }
            } catch (err) {
                this.log.error('Cache lookup error:', err);
            }
            
            this.stats.cacheMisses++;
        }
        
        this.doProxy(req, res, targetUrl);
    }

    /**
     * Perform the actual proxying
     */
    doProxy(req, res, targetUrl) {
        // Create a unique request ID for debugging
        const requestId = Date.now() + '-' + Math.random().toString(36).substring(2, 11);
        
        // Parse the target URL
        const parsedUrl = url.parse(targetUrl);
        
        // Get the appropriate rules for this URL
        const rules = this.getApplicableRules(targetUrl);
        
        // Clone headers to avoid modifying the original request
        const proxyHeaders = { ...req.headers };
        
        // Delete headers that shouldn't be forwarded
        delete proxyHeaders.host;
        delete proxyHeaders['accept-encoding'];
        
        // Apply rule headers
        const appliedHeaders = {};
        
        rules.forEach(rule => {
            if (rule.headerName) {
                // Resolve environment variables in header name
                const resolvedHeaderName = this.resolveEnvironmentVariables(rule.headerName);
                let resolvedValue = this.resolveHeaderValue(rule.headerValue, rule);
                
                // For dynamic rules, apply prefix and suffix
                if (rule.isDynamic && resolvedValue) {
                    // Resolve environment variables in prefix/suffix
                    const prefix = this.resolveEnvironmentVariables(rule.prefix || '');
                    const suffix = this.resolveEnvironmentVariables(rule.suffix || '');
                    // Apply prefix/suffix if we have a resolved value
                    resolvedValue = `${prefix}${resolvedValue}${suffix}`;
                }
                
                // Only add header if we have a value (for dynamic rules) or always (for static rules)
                if (resolvedValue || !rule.isDynamic) {
                    const headerNameLower = resolvedHeaderName.toLowerCase();
                    proxyHeaders[headerNameLower] = resolvedValue;
                    appliedHeaders[resolvedHeaderName] = resolvedValue;
                }
            }
        });
        
        // Set correct host header
        proxyHeaders.host = parsedUrl.host;
        
        // Make the actual request using node's https/http modules
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        
        const proxyReq = protocol.request({
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.path,
            method: req.method,
            headers: proxyHeaders,
            agent: parsedUrl.protocol === 'https:' ? this.httpsAgent : undefined
        }, (proxyRes) => {
            this.handleProxyResponse(proxyRes, req, res, targetUrl, requestId);
        });
        
        // Handle proxy request errors
        proxyReq.on('error', (err) => {
            this.log.error(`[${requestId}] Proxy request error:`, err);
            this.stats.errors++;
            
            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'text/plain' });
                res.end('Proxy Error: ' + err.message);
            }
        });
        
        // Forward request body if present
        req.on('data', (chunk) => {
            proxyReq.write(chunk);
        });
        
        req.on('end', () => {
            proxyReq.end();
        });
    }

    /**
     * Handle proxy response (incoming)
     */
    handleProxyResponse(proxyRes, req, res, targetUrl, requestId) {
        // Only log errors and warnings
        if (proxyRes.statusCode >= 400) {
            this.log.warn(`[${requestId}] Response error: ${proxyRes.statusCode} for ${targetUrl}`);
        }
        
        // Handle redirects immediately
        if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
            const locationUrl = proxyRes.headers.location;
            
            // For static resources (fonts, CSS, JS), follow redirects automatically
            const isStaticResource = targetUrl.match(/\.(woff2?|ttf|otf|eot|js|mjs|css|png|jpg|jpeg|gif|webp|svg|ico)(\?|$)/i);
            
            if (isStaticResource) {
                
                // Get the original proxy headers from the doProxy method
                const rules = this.getApplicableRules(targetUrl);
                const proxyHeaders = { ...req.headers };
                delete proxyHeaders.host;
                delete proxyHeaders['accept-encoding'];
                
                // Re-apply rule headers
                rules.forEach(rule => {
                    if (rule.headerName) {
                        const resolvedHeaderName = this.resolveEnvironmentVariables(rule.headerName);
                        let resolvedValue = this.resolveHeaderValue(rule.headerValue, rule);
                        if (rule.isDynamic && resolvedValue) {
                            const prefix = this.resolveEnvironmentVariables(rule.prefix || '');
                            const suffix = this.resolveEnvironmentVariables(rule.suffix || '');
                            resolvedValue = `${prefix}${resolvedValue}${suffix}`;
                        }
                        if (resolvedValue || !rule.isDynamic) {
                            proxyHeaders[resolvedHeaderName.toLowerCase()] = resolvedValue;
                        }
                    }
                });
                
                // Make a new request to the redirect location with the same headers
                const redirectUrl = url.resolve(targetUrl, locationUrl);
                const parsedRedirectUrl = url.parse(redirectUrl);
                
                // Set correct host header for redirect
                proxyHeaders.host = parsedRedirectUrl.host;
                
                const redirectProtocol = parsedRedirectUrl.protocol === 'https:' ? https : http;
                
                const redirectReq = redirectProtocol.request({
                    hostname: parsedRedirectUrl.hostname,
                    port: parsedRedirectUrl.port,
                    path: parsedRedirectUrl.path,
                    method: 'GET',
                    headers: proxyHeaders,
                    agent: parsedRedirectUrl.protocol === 'https:' ? this.httpsAgent : undefined
                }, (redirectRes) => {
                    this.handleProxyResponse(redirectRes, req, res, redirectUrl, requestId + '-redirect');
                });
                
                redirectReq.on('error', (err) => {
                    this.log.error(`[${requestId}] Redirect request error:`, err);
                    if (!res.headersSent) {
                        res.writeHead(502, { 'Content-Type': 'text/plain' });
                        res.end('Proxy Error: ' + err.message);
                    }
                });
                
                redirectReq.end();
                return; // Don't process the original response further
            }
        }
        
        // Collect response data
        const chunks = [];
        
        proxyRes.on('data', (chunk) => {
            chunks.push(chunk);
        });
        
        proxyRes.on('end', async () => {
            const buffer = Buffer.concat(chunks);
            
            // Check if we got HTML when expecting a resource file
            if (targetUrl.match(/\.(woff2?|ttf|otf|eot|js|mjs|css|png|jpg|jpeg|gif|webp|svg|ico)$/i)) {
                const firstBytes = buffer.subarray(0, 50).toString('utf8').toLowerCase();
                if (firstBytes.includes('<!') || firstBytes.includes('<html') || firstBytes.includes('doctype')) {
                    this.log.error(`Resource returned HTML instead of expected type: ${targetUrl} (${proxyRes.statusCode})`, {
                        firstBytes: firstBytes.substring(0, 50),
                        location: proxyRes.headers.location || 'no location header'
                    });
                }
            }
            
            // Fix Content-Type based on file extension
            let contentType = proxyRes.headers['content-type'] || 'application/octet-stream';
            const urlLower = targetUrl.toLowerCase();
            
            if (urlLower.endsWith('.woff2')) {
                contentType = 'font/woff2';
            } else if (urlLower.endsWith('.woff')) {
                contentType = 'font/woff';
            } else if (urlLower.endsWith('.ttf')) {
                contentType = 'font/ttf';
            } else if (urlLower.endsWith('.otf')) {
                contentType = 'font/otf';
            } else if (urlLower.endsWith('.eot')) {
                contentType = 'application/vnd.ms-fontobject';
            } else if (urlLower.endsWith('.js') || urlLower.endsWith('.mjs')) {
                contentType = 'application/javascript';
            } else if (urlLower.endsWith('.css')) {
                contentType = 'text/css';
            } else if (urlLower.endsWith('.html') || urlLower.endsWith('.htm')) {
                contentType = 'text/html';
            } else if (urlLower.endsWith('.json')) {
                contentType = 'application/json';
            } else if (urlLower.endsWith('.svg')) {
                contentType = 'image/svg+xml';
            } else if (urlLower.endsWith('.png')) {
                contentType = 'image/png';
            } else if (urlLower.endsWith('.jpg') || urlLower.endsWith('.jpeg')) {
                contentType = 'image/jpeg';
            } else if (urlLower.endsWith('.gif')) {
                contentType = 'image/gif';
            } else if (urlLower.endsWith('.webp')) {
                contentType = 'image/webp';
            } else if (urlLower.endsWith('.ico')) {
                contentType = 'image/x-icon';
            }
            
            // Build response headers
            const responseHeaders = {
                ...proxyRes.headers,
                'content-type': contentType,
                'access-control-allow-origin': '*',
                'x-proxy-cache': 'MISS'
            };
            
            // Handle redirects for non-static resources
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                const locationUrl = proxyRes.headers.location;
                
                // For non-static resources, rewrite Location header to go through proxy
                if (locationUrl.startsWith('http://') || locationUrl.startsWith('https://')) {
                    responseHeaders.location = `http://localhost:${this.port}/${locationUrl}`;
                }
                // If it's a protocol-relative URL, convert to https and proxy it
                else if (locationUrl.startsWith('//')) {
                    responseHeaders.location = `http://localhost:${this.port}/https:${locationUrl}`;
                }
            }
            
            // Cache successful GET responses
            if (req.method === 'GET' && proxyRes.statusCode >= 200 && proxyRes.statusCode < 300 && this.cacheEnabled) {
                const cacheableTypes = [
                    'image/', 'font/', 'text/css', 'application/javascript',
                    'application/json', 'text/html', 'application/font',
                    'application/vnd.ms-fontobject', 'application/x-font',
                    'application/x-javascript', 'text/javascript'
                ];
                
                const shouldCache = cacheableTypes.some(type => contentType && contentType.includes(type));
                
                if (shouldCache) {
                    await this.cache.set(targetUrl, buffer, {
                        headers: responseHeaders,
                        contentType,
                        statusCode: proxyRes.statusCode
                    }).catch(err => {
                        this.log.error('Failed to cache response:', err);
                    });
                }
            }
            
            // Send response
            res.writeHead(proxyRes.statusCode, responseHeaders);
            res.end(buffer);
        });
    }

    /**
     * Check server identity for SSL/TLS
     */
    checkServerIdentity(hostname, cert) {
        const fingerprint = this.getCertificateFingerprint(cert);

        // Check trusted certificates
        if (this.trustedCertificates.has(fingerprint)) {
            return undefined; // No error
        }

        // Check domain exceptions
        const domainExceptions = this.certificateExceptions.get(hostname);
        if (domainExceptions && domainExceptions.has(fingerprint)) {
            return undefined; // No error
        }

        // Perform standard verification
        try {
            tls.checkServerIdentity(hostname, cert);
            return undefined; // No error
        } catch (error) {
            this.log.warn(`Certificate verification failed for ${hostname}: ${error.message}`);
            return error;
        }
    }

    /**
     * Get certificate fingerprint
     */
    getCertificateFingerprint(cert) {
        return crypto
            .createHash('sha256')
            .update(cert.raw)
            .digest('hex');
    }

    /**
     * Get applicable rules for a URL
     */
    getApplicableRules(targetUrl) {
        const applicableRules = [];
        
        // Get proxy rules from the rule store
        const proxyRules = this.ruleStore.getRules();
        
        // Process each proxy rule
        proxyRules.forEach(proxyRule => {
            if (!proxyRule.enabled) {
                return;
            }
            
            // Check if this proxy rule references a header rule
            if (proxyRule.headerRuleId) {
                // Find the referenced header rule
                const headerRule = this.headerRules.find(hr => hr.id === proxyRule.headerRuleId);
                if (headerRule && headerRule.isEnabled) {
                    // Check if the header rule applies to this URL
                    if (!headerRule.domains || headerRule.domains.length === 0) {
                        applicableRules.push(headerRule);
                    } else {
                        const matches = headerRule.domains.some(domainPattern => {
                            const resolvedPattern = this.resolveEnvironmentVariables(domainPattern);
                            
                            // Handle comma-separated domains from environment variables
                            if (resolvedPattern.includes(',')) {
                                const patterns = resolvedPattern.split(',').map(p => p.trim());
                                return patterns.some(pattern => {
                                    return domainMatcher.matches(targetUrl, pattern);
                                });
                            }
                            return domainMatcher.matches(targetUrl, resolvedPattern);
                        });
                        
                        if (matches) {
                            applicableRules.push(headerRule);
                        }
                    }
                }
            } else {
                // This is a custom proxy rule (not referencing a header rule)
                // Check if it applies to this URL
                if (!proxyRule.domains || proxyRule.domains.length === 0) {
                    applicableRules.push(proxyRule);
                } else {
                    const matches = proxyRule.domains.some(domainPattern => {
                        const resolvedPattern = this.resolveEnvironmentVariables(domainPattern);
                        // Handle comma-separated domains from environment variables
                        if (resolvedPattern.includes(',')) {
                            const patterns = resolvedPattern.split(',').map(p => p.trim());
                            return patterns.some(pattern => domainMatcher.matches(targetUrl, pattern));
                        }
                        return domainMatcher.matches(targetUrl, resolvedPattern);
                    });
                    if (matches) {
                        applicableRules.push(proxyRule);
                    }
                }
            }
        });
        
        return applicableRules;
    }

    /**
     * Resolve header value from sources
     */
    resolveHeaderValue(value, rule) {
        // For dynamic rules, always try to resolve from source
        if (rule && rule.isDynamic && rule.sourceId) {
            const sourceId = String(rule.sourceId); // Ensure sourceId is a string
            const sourceValue = this.sources.get(sourceId);
            return sourceValue || value || '';
        }

        if (!value || typeof value !== 'string') return value;

        // Check if value is a source reference
        const sourceMatch = value.match(/^__source_(\d+)$/);
        if (sourceMatch) {
            const sourceId = sourceMatch[1]; // Keep as string since sources are stored with string keys
            const sourceValue = this.sources.get(sourceId);
            return sourceValue || value;
        }

        // Resolve environment variables in static values
        return this.resolveEnvironmentVariables(value);
    }

    /**
     * Resolve environment variables in a string
     */
    resolveEnvironmentVariables(template) {
        if (!template || typeof template !== 'string') return template;
        
        return template.replace(/\{\{([^}]+)}}/g, (match, varName) => {
            const trimmedName = varName.trim();
            const value = this.environmentVariables[trimmedName];
            
            if (value === undefined) {
                return match; // Keep the original placeholder
            }
            
            return value;
        });
    }

    /**
     * Update header rules
     */
    updateHeaderRules(rules) {
        this.headerRules = rules || [];
        this.log.info(`Header rules updated: ${this.headerRules.length} rules loaded`);
    }

    /**
     * Update source value
     */
    updateSource(sourceId, value) {
        const id = String(sourceId); // Ensure sourceId is always a string
        this.sources.set(id, value);
    }
    
    /**
     * Update sources from array
     */
    updateSources(sourcesArray) {
        if (!Array.isArray(sourcesArray)) return;
        
        sourcesArray.forEach(source => {
            if (source.sourceId && source.sourceContent !== undefined) {
                this.updateSource(source.sourceId, source.sourceContent);
            }
        });
        
        this.log.info(`Sources updated: ${sourcesArray.length} sources loaded`);
    }

    /**
     * Clear all rules
     */
    clearRules() {
        this.headerRules = [];
        this.sources.clear();
        this.environmentVariables = {};
    }

    /**
     * Get proxy status
     */
    getStatus() {
        return {
            running: this.isRunning,
            port: this.port,
            rulesCount: this.headerRules.length,
            sourcesCount: this.sources.size,
            cacheEnabled: this.cacheEnabled,
            cacheSize: 0, // TODO: Implement cache size tracking
            stats: { ...this.stats },
            strictSSL: this.strictSSL,
            trustedCertificates: this.trustedCertificates.size,
            certificateExceptions: this.certificateExceptions.size
        };
    }

    /**
     * Set strict SSL mode
     */
    setStrictSSL(enabled) {
        this.strictSSL = enabled;
        
        // Update the agent
        if (this.httpsAgent) {
            this.httpsAgent.options.rejectUnauthorized = enabled;
        }
    }

    /**
     * Add trusted certificate
     */
    addTrustedCertificate(fingerprint) {
        this.trustedCertificates.add(fingerprint);
    }

    /**
     * Remove trusted certificate
     */
    removeTrustedCertificate(fingerprint) {
        this.trustedCertificates.delete(fingerprint);
    }

    /**
     * Add certificate exception for domain
     */
    addCertificateException(domain, fingerprint) {
        if (!this.certificateExceptions.has(domain)) {
            this.certificateExceptions.set(domain, new Set());
        }
        this.certificateExceptions.get(domain).add(fingerprint);
    }

    /**
     * Remove certificate exception for domain
     */
    removeCertificateException(domain) {
        this.certificateExceptions.delete(domain);
    }

    /**
     * Get certificate info
     */
    getCertificateInfo() {
        return {
            strictSSL: this.strictSSL,
            trustedCertificates: Array.from(this.trustedCertificates),
            certificateExceptions: Array.from(this.certificateExceptions.entries()).map(([domain, fingerprints]) => ({
                domain,
                fingerprints: Array.from(fingerprints)
            }))
        };
    }

    /**
     * Clear cache
     */
    async clearCache() {
        await this.cache.clear();
    }

    /**
     * Get cache stats
     */
    async getCacheStats() {
        return await this.cache.getStats();
    }

    /**
     * Get cache entries
     */
    async getCacheEntries() {
        return await this.cache.getCacheEntries();
    }

    /**
     * Set cache enabled
     */
    setCacheEnabled(enabled) {
        this.cacheEnabled = enabled;
    }

    /**
     * Save a proxy rule
     */
    async saveRule(rule) {
        try {
            await this.ruleStore.saveRule(rule);
            return { success: true };
        } catch (error) {
            this.log.error('Failed to save proxy rule:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete a proxy rule
     */
    async deleteRule(ruleId) {
        try {
            await this.ruleStore.deleteRule(ruleId);
            return { success: true };
        } catch (error) {
            this.log.error('Failed to delete proxy rule:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get all proxy rules
     */
    getRules() {
        return this.ruleStore.getRules();
    }
}

// Export singleton instance
module.exports = new ProxyService();