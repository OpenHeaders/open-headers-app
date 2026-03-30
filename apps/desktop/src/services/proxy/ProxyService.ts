import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import type net from 'node:net';
import tls from 'node:tls';
import url from 'node:url';
import { errorMessage } from '../../types/common';
import type { HeaderRule } from '../../types/rules';
import type { Source } from '../../types/source';
import mainLogger from '../../utils/mainLogger';
import { DomainMatcher } from './domainMatcher';
import { ProxyCache } from './ProxyCache';
import type { ProxyRule } from './ProxyRuleStore';
import { ProxyRuleStore } from './ProxyRuleStore';

const { createLogger } = mainLogger;

export type { HeaderRule };

export interface ProxyStats {
  requestsProcessed: number;
  cacheHits: number;
  cacheMisses: number;
  errors: number;
}

export interface ProxyStatus {
  running: boolean;
  port: number;
  rulesCount: number;
  sourcesCount: number;
  cacheEnabled: boolean;
  cacheSize: number;
  stats: ProxyStats;
  strictSSL: boolean;
  trustedCertificates: number;
  certificateExceptions: number;
}

class ProxyService extends EventEmitter {
  private log = createLogger('ProxyService');

  // Server state
  server: http.Server | null = null;
  port = 59212;
  isRunning = false;
  private _connections = new Set<net.Socket>();

  // Rule management
  ruleStore = new ProxyRuleStore();
  cache = new ProxyCache();
  cacheEnabled = true;
  headerRules: HeaderRule[] = [];
  sources = new Map<string, string>();
  environmentVariables: Record<string, string> = {};

  // SSL/TLS management
  strictSSL = false;
  trustedCertificates = new Set<string>();
  certificateExceptions = new Map<string, Set<string>>();

  // HTTPS agent
  httpsAgent: https.Agent | null = null;

  // Statistics
  stats: ProxyStats = {
    requestsProcessed: 0,
    cacheHits: 0,
    cacheMisses: 0,
    errors: 0,
  };

  async initialize(): Promise<void> {
    await this.cache.initialize();
    await this.ruleStore.load();

    this.httpsAgent = new https.Agent({
      rejectUnauthorized: this.strictSSL,
      checkServerIdentity: (hostname: string, cert: tls.PeerCertificate) => this.checkServerIdentity(hostname, cert),
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 50,
      maxFreeSockets: 25,
    });
  }

  async switchWorkspace(workspaceId: string): Promise<void> {
    this.log.info(`Switching proxy service to workspace: ${workspaceId}`);
    this.clearRules();
    this.ruleStore.setWorkspace(workspaceId);
    await this.ruleStore.load();
    this.log.info(`Loaded ${this.ruleStore.getRules().length} proxy rules for workspace ${workspaceId}`);
  }

  updateEnvironmentVariables(variables: Record<string, string | { value: string }> | null | undefined): void {
    const processedVariables: Record<string, string> = {};
    Object.entries(variables || {}).forEach(([key, data]) => {
      processedVariables[key] =
        typeof data === 'object' && data !== null && 'value' in data ? (data as { value: string }).value : String(data);
    });
    this.environmentVariables = processedVariables;
    this.log.debug(`Environment variables updated: ${Object.keys(this.environmentVariables).length} variables`);
  }

  async start(port = this.port): Promise<{ success: boolean; port?: number; error?: string }> {
    if (this.isRunning) {
      this.log.warn('Proxy server is already running');
      return { success: true, port: this.port };
    }

    try {
      if (port !== undefined) {
        this.port = port;
      }

      if (this.httpsAgent) {
        this.httpsAgent.options.rejectUnauthorized = this.strictSSL;
      }

      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('connection', (socket: net.Socket) => {
        this._connections.add(socket);
        socket.once('close', () => this._connections.delete(socket));
      });

      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const maxRetries = 5;
        const retryDelay = 500;

        const retryHandler = (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE' && attempts < maxRetries) {
            attempts++;
            this.log.warn(
              `Proxy port ${this.port} in use, retrying in ${retryDelay}ms (attempt ${attempts}/${maxRetries})`,
            );
            setTimeout(() => this.server!.listen(this.port, '127.0.0.1'), retryDelay);
          } else {
            this.server!.removeListener('error', retryHandler);
            reject(error);
          }
        };

        this.server!.on('error', retryHandler);

        this.server!.once('listening', () => {
          this.server!.removeListener('error', retryHandler);
          this.isRunning = true;
          this.log.info(`Proxy server started on port ${this.port}`);
          if (attempts > 0) {
            this.log.info(`Proxy server bound after ${attempts} retries`);
          }
          resolve();
        });

        this.server!.listen(this.port, '127.0.0.1');
      });

      return { success: true, port: this.port };
    } catch (error: unknown) {
      this.log.error('Failed to start proxy server:', error);
      return { success: false, error: errorMessage(error) };
    }
  }

  async stop(): Promise<{ success: boolean; error?: string }> {
    if (!this.isRunning) {
      this.log.warn('Proxy server is not running');
      return { success: true };
    }

    try {
      for (const socket of this._connections) {
        try {
          socket.destroy();
        } catch (e) {
          /* ignore */
        }
      }
      this._connections.clear();

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.log.warn('Proxy server close timed out after 2s, forcing');
          this.isRunning = false;
          resolve();
        }, 2000);

        this.server!.close((err?: Error) => {
          clearTimeout(timeout);
          if (err) {
            this.log.warn('Proxy server close error:', err.message);
          }
          this.isRunning = false;
          resolve();
        });
      });

      return { success: true };
    } catch (error: unknown) {
      this.log.error('Failed to stop proxy server:', error);
      this.isRunning = false;
      return { success: false, error: errorMessage(error) };
    }
  }

  async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': (req.headers['access-control-request-headers'] as string) || '*',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

    let targetUrl = req.url || '';

    if (targetUrl.startsWith('/http://') || targetUrl.startsWith('/https://')) {
      targetUrl = targetUrl.substring(1);
    }

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid proxy request. URL must be in format: /http://example.com or /https://example.com');
      return;
    }

    this.stats.requestsProcessed++;

    if (req.method === 'GET' && this.cacheEnabled) {
      try {
        const cached = await this.cache.get(targetUrl, req.headers as Record<string, string>);
        if (cached) {
          this.stats.cacheHits++;
          res.writeHead(cached.statusCode || 200, cached.headers);
          res.end(cached.data);
          return;
        }
      } catch (err: unknown) {
        this.log.error('Cache lookup error:', err);
      }
      this.stats.cacheMisses++;
    }

    this.doProxy(req, res, targetUrl);
  }

  doProxy(req: http.IncomingMessage, res: http.ServerResponse, targetUrl: string): void {
    const requestId = Date.now() + '-' + Math.random().toString(36).substring(2, 11);
    const parsedUrl = url.parse(targetUrl);
    const rules = this.getApplicableRules(targetUrl);

    const proxyHeaders: Record<string, string | string[] | undefined> = { ...req.headers };
    delete proxyHeaders.host;
    delete proxyHeaders['accept-encoding'];

    rules.forEach((rule) => {
      if (rule.headerName) {
        const resolvedHeaderName = this.resolveEnvironmentVariables(rule.headerName);
        let resolvedValue = this.resolveHeaderValue(rule.headerValue, rule);

        if (rule.isDynamic && resolvedValue) {
          const prefix = this.resolveEnvironmentVariables(rule.prefix || '');
          const suffix = this.resolveEnvironmentVariables(rule.suffix || '');
          resolvedValue = `${prefix}${resolvedValue}${suffix}`;
        }

        if (resolvedValue || !rule.isDynamic) {
          const headerNameLower = resolvedHeaderName.toLowerCase();
          proxyHeaders[headerNameLower] = resolvedValue;
        }
      }
    });

    proxyHeaders.host = parsedUrl.host || undefined;

    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const proxyReq = protocol.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.path,
        method: req.method,
        headers: proxyHeaders,
        agent: parsedUrl.protocol === 'https:' ? this.httpsAgent || undefined : undefined,
      },
      (proxyRes) => {
        this.handleProxyResponse(proxyRes, req, res, targetUrl, requestId);
      },
    );

    proxyReq.on('error', (err) => {
      this.log.error(`[${requestId}] Proxy request error:`, err);
      this.stats.errors++;
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Proxy Error: ' + err.message);
      }
    });

    req.on('data', (chunk) => {
      proxyReq.write(chunk);
    });
    req.on('end', () => {
      proxyReq.end();
    });
  }

  handleProxyResponse(
    proxyRes: http.IncomingMessage,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    targetUrl: string,
    requestId: string,
  ): void {
    if ((proxyRes.statusCode || 0) >= 400) {
      this.log.warn(`[${requestId}] Response error: ${proxyRes.statusCode} for ${targetUrl}`);
    }

    if ((proxyRes.statusCode || 0) >= 300 && (proxyRes.statusCode || 0) < 400 && proxyRes.headers.location) {
      const locationUrl = proxyRes.headers.location;
      const isStaticResource = targetUrl.match(
        /\.(woff2?|ttf|otf|eot|js|mjs|css|png|jpg|jpeg|gif|webp|svg|ico)(\?|$)/i,
      );

      if (isStaticResource) {
        const rules = this.getApplicableRules(targetUrl);
        const proxyHeaders: Record<string, string | string[] | undefined> = { ...req.headers };
        delete proxyHeaders.host;
        delete proxyHeaders['accept-encoding'];

        rules.forEach((rule) => {
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

        const redirectUrl = url.resolve(targetUrl, locationUrl);
        const parsedRedirectUrl = url.parse(redirectUrl);
        proxyHeaders.host = parsedRedirectUrl.host || undefined;

        const redirectProtocol = parsedRedirectUrl.protocol === 'https:' ? https : http;

        const redirectReq = redirectProtocol.request(
          {
            hostname: parsedRedirectUrl.hostname,
            port: parsedRedirectUrl.port,
            path: parsedRedirectUrl.path,
            method: 'GET',
            headers: proxyHeaders,
            agent: parsedRedirectUrl.protocol === 'https:' ? this.httpsAgent || undefined : undefined,
          },
          (redirectRes) => {
            this.handleProxyResponse(redirectRes, req, res, redirectUrl, requestId + '-redirect');
          },
        );

        redirectReq.on('error', (err) => {
          this.log.error(`[${requestId}] Redirect request error:`, err);
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end('Proxy Error: ' + err.message);
          }
        });

        redirectReq.end();
        return;
      }
    }

    const chunks: Buffer[] = [];

    proxyRes.on('data', (chunk) => {
      chunks.push(chunk);
    });

    proxyRes.on('end', async () => {
      const buffer = Buffer.concat(chunks);

      if (targetUrl.match(/\.(woff2?|ttf|otf|eot|js|mjs|css|png|jpg|jpeg|gif|webp|svg|ico)$/i)) {
        const firstBytes = buffer.subarray(0, 50).toString('utf8').toLowerCase();
        if (firstBytes.includes('<!') || firstBytes.includes('<html') || firstBytes.includes('doctype')) {
          this.log.error(`Resource returned HTML instead of expected type: ${targetUrl} (${proxyRes.statusCode})`, {
            firstBytes: firstBytes.substring(0, 50),
            location: proxyRes.headers.location || 'no location header',
          });
        }
      }

      let contentType = (proxyRes.headers['content-type'] as string) || 'application/octet-stream';
      const urlLower = targetUrl.toLowerCase();

      const contentTypeMap: Record<string, string> = {
        '.woff2': 'font/woff2',
        '.woff': 'font/woff',
        '.ttf': 'font/ttf',
        '.otf': 'font/otf',
        '.eot': 'application/vnd.ms-fontobject',
        '.css': 'text/css',
        '.html': 'text/html',
        '.htm': 'text/html',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.ico': 'image/x-icon',
      };
      // .js and .mjs need special check since .json also ends with .json
      if (urlLower.endsWith('.js') || urlLower.endsWith('.mjs')) {
        contentType = 'application/javascript';
      } else if (urlLower.endsWith('.jpg')) {
        contentType = 'image/jpeg';
      } else {
        for (const [ext, type] of Object.entries(contentTypeMap)) {
          if (urlLower.endsWith(ext)) {
            contentType = type;
            break;
          }
        }
      }

      const responseHeaders: Record<string, string | string[] | undefined> = {
        ...proxyRes.headers,
        'content-type': contentType,
        'access-control-allow-origin': '*',
        'x-proxy-cache': 'MISS',
      };

      if ((proxyRes.statusCode || 0) >= 300 && (proxyRes.statusCode || 0) < 400 && proxyRes.headers.location) {
        const locationUrl = proxyRes.headers.location;
        if (locationUrl.startsWith('http://') || locationUrl.startsWith('https://')) {
          responseHeaders.location = `http://localhost:${this.port}/${locationUrl}`;
        } else if (locationUrl.startsWith('//')) {
          responseHeaders.location = `http://localhost:${this.port}/https:${locationUrl}`;
        }
      }

      if (
        req.method === 'GET' &&
        (proxyRes.statusCode || 0) >= 200 &&
        (proxyRes.statusCode || 0) < 300 &&
        this.cacheEnabled
      ) {
        const cacheableTypes = [
          'image/',
          'font/',
          'text/css',
          'application/javascript',
          'application/json',
          'text/html',
          'application/font',
          'application/vnd.ms-fontobject',
          'application/x-font',
          'application/x-javascript',
          'text/javascript',
        ];
        const shouldCache = cacheableTypes.some((type) => contentType?.includes(type));
        if (shouldCache) {
          await this.cache
            .set(targetUrl, buffer, {
              headers: responseHeaders as Record<string, string>,
              contentType,
              statusCode: proxyRes.statusCode || 200,
            })
            .catch((err: unknown) => {
              this.log.error('Failed to cache response:', err);
            });
        }
      }

      res.writeHead(proxyRes.statusCode || 200, responseHeaders);
      res.end(buffer);
    });
  }

  checkServerIdentity(hostname: string, cert: tls.PeerCertificate): Error | undefined {
    const fingerprint = this.getCertificateFingerprint(cert);

    if (this.trustedCertificates.has(fingerprint)) {
      return undefined;
    }

    const domainExceptions = this.certificateExceptions.get(hostname);
    if (domainExceptions?.has(fingerprint)) {
      return undefined;
    }

    try {
      tls.checkServerIdentity(hostname, cert);
      return undefined;
    } catch (error: unknown) {
      this.log.warn(`Certificate verification failed for ${hostname}: ${errorMessage(error)}`);
      return error instanceof Error ? error : new Error(errorMessage(error));
    }
  }

  getCertificateFingerprint(cert: tls.PeerCertificate): string {
    return crypto.createHash('sha256').update(cert.raw).digest('hex');
  }

  getApplicableRules(targetUrl: string): (HeaderRule | ProxyRule)[] {
    const applicableRules: (HeaderRule | ProxyRule)[] = [];
    const proxyRules = this.ruleStore.getRules();

    proxyRules.forEach((proxyRule) => {
      if (!proxyRule.enabled) return;

      if (proxyRule.headerRuleId) {
        const headerRule = this.headerRules.find((hr) => hr.id === proxyRule.headerRuleId);
        if (headerRule?.isEnabled) {
          // Skip rules with unresolved env vars — don't inject garbage
          if (!this.isRuleReady(headerRule)) return;

          if (!headerRule.domains || headerRule.domains.length === 0) {
            applicableRules.push(headerRule);
          } else {
            const matches = headerRule.domains.some((domainPattern) => {
              const resolvedPattern = this.resolveEnvironmentVariables(domainPattern);
              if (resolvedPattern.includes(',')) {
                const patterns = resolvedPattern.split(',').map((p: string) => p.trim());
                return patterns.some((pattern: string) => DomainMatcher.matches(targetUrl, pattern));
              }
              return DomainMatcher.matches(targetUrl, resolvedPattern);
            });
            if (matches) applicableRules.push(headerRule);
          }
        }
      } else {
        // Skip rules with unresolved env vars — don't inject garbage
        if (!this.isRuleReady(proxyRule)) return;

        if (!proxyRule.domains || proxyRule.domains.length === 0) {
          applicableRules.push(proxyRule);
        } else {
          const matches = proxyRule.domains.some((domainPattern) => {
            const resolvedPattern = this.resolveEnvironmentVariables(domainPattern);
            if (resolvedPattern.includes(',')) {
              const patterns = resolvedPattern.split(',').map((p: string) => p.trim());
              return patterns.some((pattern: string) => DomainMatcher.matches(targetUrl, pattern));
            }
            return DomainMatcher.matches(targetUrl, resolvedPattern);
          });
          if (matches) applicableRules.push(proxyRule);
        }
      }
    });

    return applicableRules;
  }

  resolveHeaderValue(value: string | undefined, rule: HeaderRule | ProxyRule): string {
    if (rule?.isDynamic && rule.sourceId) {
      const sourceId = String(rule.sourceId);
      const sourceValue = this.sources.get(sourceId);
      return sourceValue || value || '';
    }

    if (!value || typeof value !== 'string') return value || '';

    const sourceMatch = value.match(/^__source_(\d+)$/);
    if (sourceMatch) {
      const sourceId = sourceMatch[1];
      const sourceValue = this.sources.get(sourceId);
      return sourceValue || value;
    }

    return this.resolveEnvironmentVariables(value);
  }

  resolveEnvironmentVariables(template: string): string {
    if (!template || typeof template !== 'string') return template;

    return template.replace(/\{\{([^}]+)}}/g, (match: string, varName: string) => {
      const trimmedName = varName.trim();
      const value = this.environmentVariables[trimmedName];
      if (value === undefined) return match;
      return value;
    });
  }

  /**
   * Check if a string has unresolved {{env_var}} references after resolution.
   * Returns true if all variables are resolved (or no variables present).
   */
  private isFullyResolved(template: string | undefined): boolean {
    if (!template) return true;
    const resolved = this.resolveEnvironmentVariables(template);
    return !/\{\{[^}]+}}/.test(resolved);
  }

  /**
   * Check if a rule has all its env var dependencies resolved.
   * Rules with unresolved variables should not be applied to requests.
   */
  private isRuleReady(rule: HeaderRule | ProxyRule): boolean {
    if (!this.isFullyResolved(rule.headerName)) return false;
    if (!this.isFullyResolved(rule.headerValue)) return false;
    if (!this.isFullyResolved(rule.prefix)) return false;
    if (!this.isFullyResolved(rule.suffix)) return false;
    if (rule.domains) {
      for (const domain of rule.domains) {
        if (!this.isFullyResolved(domain)) return false;
      }
    }
    return true;
  }

  updateHeaderRules(rules: HeaderRule[]): void {
    this.headerRules = rules || [];
    this.log.debug(`Header rules updated: ${this.headerRules.length} rules loaded`);
  }

  updateProxyRules(rules: ProxyRule[]): void {
    this.ruleStore.rules = rules || [];
    this.log.debug(`Proxy rules updated: ${this.ruleStore.rules.length} rules loaded`);
  }

  updateSource(sourceId: string | number, value: string): void {
    const id = String(sourceId);
    this.sources.set(id, value);
  }

  updateSources(sourcesArray: Source[]): void {
    if (!Array.isArray(sourcesArray)) return;
    sourcesArray.forEach((source) => {
      if (source.sourceId && source.sourceContent) {
        this.updateSource(source.sourceId, source.sourceContent);
      }
    });
    this.log.debug(`Sources updated: ${sourcesArray.length} sources loaded`);
  }

  clearRules(): void {
    this.headerRules = [];
    this.sources.clear();
    this.environmentVariables = {};
  }

  getStatus(): ProxyStatus {
    return {
      running: this.isRunning,
      port: this.port,
      rulesCount: this.headerRules.length,
      sourcesCount: this.sources.size,
      cacheEnabled: this.cacheEnabled,
      cacheSize: 0,
      stats: { ...this.stats },
      strictSSL: this.strictSSL,
      trustedCertificates: this.trustedCertificates.size,
      certificateExceptions: this.certificateExceptions.size,
    };
  }

  setStrictSSL(enabled: boolean): void {
    this.strictSSL = enabled;
    if (this.httpsAgent) {
      this.httpsAgent.options.rejectUnauthorized = enabled;
    }
  }

  addTrustedCertificate(fingerprint: string): void {
    this.trustedCertificates.add(fingerprint);
  }
  removeTrustedCertificate(fingerprint: string): void {
    this.trustedCertificates.delete(fingerprint);
  }

  addCertificateException(domain: string, fingerprint: string): void {
    if (!this.certificateExceptions.has(domain)) {
      this.certificateExceptions.set(domain, new Set());
    }
    this.certificateExceptions.get(domain)!.add(fingerprint);
  }

  removeCertificateException(domain: string): void {
    this.certificateExceptions.delete(domain);
  }

  getCertificateInfo() {
    return {
      strictSSL: this.strictSSL,
      trustedCertificates: Array.from(this.trustedCertificates),
      certificateExceptions: Array.from(this.certificateExceptions.entries()).map(([domain, fingerprints]) => ({
        domain,
        fingerprints: Array.from(fingerprints),
      })),
    };
  }

  async clearCache(): Promise<void> {
    await this.cache.clear();
  }
  async getCacheStats() {
    return await this.cache.getStats();
  }
  async getCacheEntries() {
    return await this.cache.getCacheEntries();
  }
  setCacheEnabled(enabled: boolean): void {
    this.cacheEnabled = enabled;
  }

  async saveRule(rule: ProxyRule): Promise<{ success: boolean; error?: string }> {
    try {
      await this.ruleStore.saveRule(rule);
      return { success: true };
    } catch (error: unknown) {
      this.log.error('Failed to save proxy rule:', error);
      return { success: false, error: errorMessage(error) };
    }
  }

  async deleteRule(ruleId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.ruleStore.deleteRule(ruleId);
      return { success: true };
    } catch (error: unknown) {
      this.log.error('Failed to delete proxy rule:', error);
      return { success: false, error: errorMessage(error) };
    }
  }

  getRules(): ProxyRule[] {
    return this.ruleStore.getRules();
  }
}

// Singleton instance
const proxyService = new ProxyService();

export { ProxyService, proxyService };
export default proxyService;
