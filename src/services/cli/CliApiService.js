/**
 * CliApiService - Local HTTP server for CLI communication
 *
 * Provides a local REST API on port 59213 (localhost only) that the
 * mc2-installer scripts use to programmatically join workspaces and
 * import environment configurations without manual UI interaction.
 *
 * Discovery: Writes cli.json to userData on start, deletes on stop.
 * Auth: Every request requires Authorization: Bearer <token> matching cli.json.
 *
 * Port allocation:
 *   59210 = WebSocket (WS)
 *   59211 = WebSocket (WSS)
 *   59212 = Proxy
 *   59213 = CLI API (this service)
 */

const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { app } = require('electron');
const { createLogger } = require('../../utils/mainLogger');

const CLI_PORT = 59213;
const CLI_HOST = '127.0.0.1';

const log = createLogger('CliApi');

class CliApiService {
    constructor() {
        this.port = CLI_PORT;
        this.token = crypto.randomBytes(32).toString('hex');
        this.server = null;
        this.mainWindow = null;
        this.setupHandler = null;
        this.discoveryPath = path.join(app.getPath('userData'), 'cli.json');
        this.logsPath = path.join(app.getPath('userData'), 'cli-logs.jsonl');
        this.requestLogs = [];
        this.startedAt = null;

        // Restore persisted logs from disk
        this._loadLogs();
    }

    /**
     * Set the main window reference for renderer notifications
     */
    setMainWindow(window) {
        this.mainWindow = window;
        if (this.setupHandler) {
            this.setupHandler.setMainWindow(window);
        }
    }

    /**
     * Set the setup handler for business logic
     */
    setSetupHandler(handler) {
        this.setupHandler = handler;
        if (this.mainWindow) {
            handler.setMainWindow(this.mainWindow);
        }
    }

    /**
     * Start the CLI API server and write discovery file
     */
    async start() {
        // Guard against double-start — would leak the old server reference
        if (this.server && this.server.listening) {
            log.info('CLI API server is already running');
            return;
        }

        // Start HTTP server first, then write discovery file
        // (avoids race condition where installer reads cli.json before server is listening)
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => this._handleRequest(req, res));

            this.server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    log.warn(`CLI API port ${this.port} is in use, skipping CLI API server`);
                    resolve(); // Non-fatal — app works without CLI API
                } else {
                    log.error('CLI API server error:', err);
                    reject(err);
                }
            });

            this.server.listen(this.port, CLI_HOST, async () => {
                this.startedAt = Date.now();
                log.info(`CLI API server listening on ${CLI_HOST}:${this.port}`);

                // Write discovery file only after server is confirmed listening
                try {
                    const discoveryData = JSON.stringify({
                        port: this.port,
                        token: this.token,
                        pid: process.pid,
                        version: app.getVersion()
                    }, null, 2);

                    const dir = path.dirname(this.discoveryPath);
                    await fs.promises.mkdir(dir, { recursive: true });
                    await fs.promises.writeFile(this.discoveryPath, discoveryData, 'utf8');
                    log.info('CLI discovery file written');
                } catch (err) {
                    log.warn('Failed to write CLI discovery file:', err.message);
                }

                resolve();
            });
        });
    }

    /**
     * Stop the CLI API server and delete discovery file
     */
    async stop() {
        this._deleteDiscoveryFile();
        this.startedAt = null;

        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    log.info('CLI API server stopped');
                    this.server = null;
                    resolve();
                });
                // Force close after 2 seconds
                setTimeout(() => {
                    this.server = null;
                    resolve();
                }, 2000);
            });
        }
    }

    /**
     * Get current server status for renderer
     */
    getStatus() {
        const running = this.server !== null && this.server.listening;
        return {
            running,
            port: this.port,
            discoveryPath: this.discoveryPath,
            token: this.token,
            startedAt: this.startedAt,
            totalRequests: this.requestLogs.length
        };
    }

    /**
     * Get recent request logs for renderer
     */
    getLogs() {
        return this.requestLogs.slice();
    }

    /**
     * Clear request logs
     */
    clearLogs() {
        this.requestLogs = [];
        // Truncate the log file
        fs.promises.writeFile(this.logsPath, '', 'utf8').catch(err => {
            log.warn('Failed to clear CLI API log file:', err.message);
        });
    }

    /**
     * Regenerate the auth token and rewrite the discovery file
     */
    async regenerateToken() {
        this.token = crypto.randomBytes(32).toString('hex');
        log.info('CLI API token regenerated');

        // Rewrite discovery file if server is running
        if (this.server && this.server.listening) {
            try {
                const discoveryData = JSON.stringify({
                    port: this.port,
                    token: this.token,
                    pid: process.pid,
                    version: app.getVersion()
                }, null, 2);
                await fs.promises.writeFile(this.discoveryPath, discoveryData, 'utf8');
                log.info('CLI discovery file rewritten with new token');
            } catch (err) {
                log.warn('Failed to rewrite CLI discovery file:', err.message);
            }
        }

        return this.token;
    }

    /**
     * Add a request log entry — appends one JSON line to the JSONL file
     */
    _addLog(entry) {
        const logEntry = { timestamp: Date.now(), ...entry };
        this.requestLogs.unshift(logEntry);
        // Append single line to JSONL file
        const line = JSON.stringify(logEntry) + '\n';
        fs.promises.appendFile(this.logsPath, line, 'utf8').catch(err => {
            log.warn('Failed to append CLI API log:', err.message);
        });
    }

    /**
     * Load persisted logs from JSONL file (sync, called once at construction)
     * Each line is one self-contained JSON object.
     */
    _loadLogs() {
        try {
            const data = fs.readFileSync(this.logsPath, 'utf8');
            const lines = data.trim().split('\n').filter(Boolean);
            // Parse each line, skip corrupt lines
            this.requestLogs = [];
            for (const line of lines) {
                try { this.requestLogs.push(JSON.parse(line)); } catch { /* skip */ }
            }
            // Sort newest first (file is append-order = oldest first)
            this.requestLogs.reverse();
            log.info(`Loaded ${this.requestLogs.length} persisted CLI API logs`);
        } catch {
            // File doesn't exist — start fresh
        }
    }

    /**
     * Look up the client process that owns the given remote port.
     * Runs synchronously to ensure the TCP socket is still alive during lookup.
     * Cross-platform: lsof (macOS), ss (Linux), netstat+tasklist (Windows).
     * Returns e.g. "curl (PID 12345)" or null if lookup fails.
     */
    // Map known system process names to friendly app names
    static PROCESS_NAMES = {
        'com.apple.WebKit.Networking': 'Safari',
        'com.apple.WebKit.Content': 'Safari',
    };

    /**
     * Look up the client process that owns the given remote port (synchronous).
     * Must run while the TCP connection is alive (before response is sent).
     * Optimized: port-scoped queries, piped stdio, single ps call per tree level.
     */
    _lookupClientProcess(remotePort) {
        try {
            switch (process.platform) {
                case 'darwin': return this._lookupLsof(remotePort);
                case 'linux': return this._lookupSs(remotePort);
                case 'win32': return this._lookupNetstat(remotePort);
                default: return null;
            }
        } catch {
            return null;
        }
    }

    /**
     * Build the process tree from PID up to init/launchd.
     * Uses a single `ps` call per level (ppid + comm combined).
     * Returns e.g. "Terminal → zsh → curl (PID 1234)"
     */
    _buildProcessTree(command, pid) {
        const friendly = CliApiService.PROCESS_NAMES[command];
        if (friendly) return `${friendly} (PID ${pid})`;
        if (process.platform === 'win32') return `${command} (PID ${pid})`;

        const chain = [command];
        let currentPid = pid;
        const execOpts = { timeout: 500, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };
        for (let i = 0; i < 5; i++) {
            try {
                const out = execFileSync('ps', ['-o', 'ppid=,comm=', '-p', String(currentPid)], execOpts).trim();
                const spaceIdx = out.indexOf(' ');
                if (spaceIdx === -1) break;
                const ppid = parseInt(out.slice(0, spaceIdx).trim(), 10);
                if (!ppid || ppid <= 1) break;
                const parentName = path.basename(out.slice(spaceIdx).trim());
                if (['launchd', 'systemd', 'init'].includes(parentName)) break;
                chain.push(parentName);
                currentPid = ppid;
            } catch {
                break;
            }
        }
        chain.reverse();
        const tree = chain.slice(0, -1).join(' → ');
        const process_str = `${command} (PID ${pid})`;
        return tree ? `${tree} → ${process_str}` : process_str;
    }

    /** macOS: use lsof scoped to our server port */
    _lookupLsof(remotePort) {
        const execOpts = { timeout: 1500, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };
        const stdout = execFileSync('lsof', [
            '-nP', '-i', `TCP:${this.port}`, '-sTCP:ESTABLISHED',
            '-Fp', '-Fc', '-Fn'
        ], execOpts);
        if (!stdout) return null;
        const lines = stdout.trim().split('\n');
        const myPid = process.pid;
        const needle = `:${remotePort}->`;
        let currentPid = null, currentCommand = null;
        for (const line of lines) {
            if (line.startsWith('p')) { currentPid = parseInt(line.slice(1), 10); currentCommand = null; }
            if (line.startsWith('c')) currentCommand = line.slice(1);
            if (line.startsWith('n') && currentPid !== myPid && currentCommand && line.includes(needle)) {
                return this._buildProcessTree(currentCommand, currentPid);
            }
        }
        return null;
    }

    /** Linux: use ss filtered to our port only */
    _lookupSs(remotePort) {
        const execOpts = { timeout: 1500, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };
        const stdout = execFileSync('ss', ['-tnp', 'sport', '=', `:${this.port}`], execOpts);
        if (!stdout) return null;
        const myPid = process.pid;
        for (const line of stdout.split('\n')) {
            if (!line.includes(`127.0.0.1:${remotePort}`)) continue;
            const match = line.match(/\(\("([^"]+)",pid=(\d+)/);
            if (match) {
                const pid = parseInt(match[2], 10);
                if (pid !== myPid) return this._buildProcessTree(match[1], pid);
            }
        }
        return null;
    }

    /** Windows: run netstat directly, parse in JS (avoids findstr exit-code issues) */
    _lookupNetstat(remotePort) {
        const execOpts = { timeout: 3000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] };
        let stdout;
        try {
            stdout = execFileSync('netstat', ['-ano', '-p', 'TCP'], execOpts);
        } catch {
            return null;
        }
        if (!stdout) return null;
        const myPid = process.pid;
        const serverPort = `:${this.port}`;
        const clientPort = `:${remotePort}`;
        for (const line of stdout.split('\n')) {
            if (!line.includes('ESTABLISHED') && !line.includes('CLOSE_WAIT')) continue;
            if (!line.includes(serverPort) || !line.includes(clientPort)) continue;
            // Typical: TCP    127.0.0.1:59213    127.0.0.1:50123    ESTABLISHED    1234
            const parts = line.trim().split(/\s+/);
            if (parts.length < 5) continue;
            // Precise match: one side must be our server port, the other the remote port
            const addr1 = parts[1], addr2 = parts[2];
            const match = (addr1.endsWith(serverPort) && addr2.endsWith(clientPort)) ||
                          (addr1.endsWith(clientPort) && addr2.endsWith(serverPort));
            if (!match) continue;
            const pid = parseInt(parts[parts.length - 1], 10);
            if (!pid || pid === myPid) continue;
            try {
                const taskOut = execFileSync('tasklist',
                    ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], execOpts);
                const m = taskOut.trim().match(/^"([^"]+)"/);
                return `${m ? m[1] : 'unknown'} (PID ${pid})`;
            } catch {
                return `PID ${pid}`;
            }
        }
        return null;
    }

    /**
     * Redact sensitive values from a POST body for logging.
     * Preserves structure and keys but masks secret strings with "***".
     */
    _summarizeBody(pathname, body) {
        if (!body || typeof body !== 'object') return null;
        try {
            return this._redactDeep(body);
        } catch {
            return null;
        }
    }

    /**
     * Deep-clone an object, replacing string values that look sensitive with "***".
     * Keeps keys, booleans, numbers, and short non-secret strings visible.
     */
    _redactDeep(obj) {
        if (Array.isArray(obj)) return obj.map(item => this._redactDeep(item));
        if (obj === null || typeof obj !== 'object') {
            if (typeof obj === 'string') return this._redactString(obj);
            return obj;
        }
        const result = {};
        const sensitiveKeys = ['token', 'password', 'secret', 'authData', 'sshKey', 'sshPassphrase', 'value'];
        for (const [key, val] of Object.entries(obj)) {
            if (sensitiveKeys.includes(key) && typeof val === 'string') {
                result[key] = '***';
            } else if (typeof val === 'object' && val !== null) {
                result[key] = this._redactDeep(val);
            } else {
                result[key] = val;
            }
        }
        return result;
    }

    _redactString(str) {
        // Redact strings that look like tokens/keys/passwords
        if (str.length > 20 && /^(ghp_|sk-|eyJ|Bearer )/.test(str)) return '***';
        return str;
    }

    /**
     * Delete the discovery file (best-effort)
     */
    _deleteDiscoveryFile() {
        try {
            fs.unlinkSync(this.discoveryPath);
        } catch {
            // Ignore — file may not exist
        }
    }

    /**
     * Handle incoming HTTP request — auth, routing, error handling
     */
    async _handleRequest(req, res) {
        const startTime = Date.now();

        // CORS headers for local use
        res.setHeader('Content-Type', 'application/json');

        // Intercept writeHead to capture status code for logging
        const originalWriteHead = res.writeHead.bind(res);
        let loggedStatusCode = 200;
        res.writeHead = (statusCode, ...args) => {
            loggedStatusCode = statusCode;
            return originalWriteHead(statusCode, ...args);
        };

        // Intercept res.end to capture error messages from response body
        const originalEnd = res.end.bind(res);
        let errorMessage = null;
        res.end = (data, ...args) => {
            if (loggedStatusCode >= 400 && data) {
                try {
                    const parsed = JSON.parse(typeof data === 'string' ? data : data.toString());
                    errorMessage = parsed.error || null;
                } catch { /* ignore non-JSON responses */ }
            }
            return originalEnd(data, ...args);
        };

        const url = new URL(req.url, `http://${CLI_HOST}:${this.port}`);
        const pathname = url.pathname;

        // Only log actual API requests (skip favicon, apple-touch-icon, etc.)
        const skipLog = !pathname.startsWith('/cli/');

        // Shared context for body summary (populated by _handleWithBody)
        const logContext = { bodySummary: null };

        // Look up client process synchronously while TCP connection is alive
        const userAgent = req.headers['user-agent'] || null;
        const remoteAddress = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
        const clientProcess = skipLog ? null : this._lookupClientProcess(req.socket.remotePort);

        // Log after response is finished
        res.on('finish', () => {
            if (skipLog) return;
            this._addLog({
                method: req.method,
                path: pathname,
                statusCode: loggedStatusCode,
                userAgent,
                remoteAddress,
                duration: Date.now() - startTime,
                errorMessage,
                bodySummary: logContext.bodySummary,
                clientProcess
            });
        });

        try {
            // Auth check
            if (!this._validateAuth(req)) {
                res.writeHead(401);
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }

            // Route
            if (req.method === 'GET' && pathname === '/cli/health') {
                return this._handleHealth(req, res);
            }
            if (req.method === 'POST' && pathname === '/cli/workspace/join') {
                return this._handleWithBody(req, res, (body) => {
                    logContext.bodySummary = this._summarizeBody(pathname, body);
                    return this._handleWorkspaceJoin(body, res);
                });
            }
            if (req.method === 'POST' && pathname === '/cli/environments/import') {
                return this._handleWithBody(req, res, (body) => {
                    logContext.bodySummary = this._summarizeBody(pathname, body);
                    return this._handleEnvironmentImport(body, res);
                });
            }

            // 404
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
        } catch (err) {
            log.error('CLI API request error:', err);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    }

    /**
     * Validate bearer token
     */
    _validateAuth(req) {
        const authHeader = req.headers['authorization'];
        if (!authHeader) return false;
        const parts = authHeader.split(' ');
        return parts.length === 2 && parts[0] === 'Bearer' && parts[1] === this.token;
    }

    /**
     * Read and parse JSON body, then call handler
     */
    _handleWithBody(req, res, handler) {
        let body = '';
        let responseSent = false;
        req.on('data', (chunk) => {
            body += chunk;
            // Limit body size to 1MB
            if (body.length > 1024 * 1024 && !responseSent) {
                responseSent = true;
                res.writeHead(413);
                res.end(JSON.stringify({ error: 'Request body too large' }));
                req.destroy();
            }
        });
        req.on('end', async () => {
            if (responseSent) return;
            try {
                const parsed = JSON.parse(body);
                await handler(parsed);
            } catch (err) {
                if (err instanceof SyntaxError) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                } else {
                    log.error('CLI API handler error:', err);
                    res.writeHead(500);
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
            }
        });
    }

    // ── Route handlers ─────────────────────────────────────────────────

    /**
     * GET /cli/health — Check if app is ready
     */
    _handleHealth(req, res) {
        res.writeHead(200);
        res.end(JSON.stringify({
            status: 'ok',
            version: app.getVersion()
        }));
    }

    /**
     * POST /cli/workspace/join — Join a team workspace
     */
    async _handleWorkspaceJoin(body, res) {
        if (!this.setupHandler) {
            res.writeHead(503);
            res.end(JSON.stringify({ success: false, error: 'Setup handler not ready' }));
            return;
        }

        const result = await this.setupHandler.joinWorkspace(body);
        res.writeHead(result.success ? 200 : 400);
        res.end(JSON.stringify(result));
    }

    /**
     * POST /cli/environments/import — Import environment variables
     */
    async _handleEnvironmentImport(body, res) {
        if (!this.setupHandler) {
            res.writeHead(503);
            res.end(JSON.stringify({ success: false, error: 'Setup handler not ready' }));
            return;
        }

        const result = await this.setupHandler.importEnvironment(body);
        res.writeHead(result.success ? 200 : 400);
        res.end(JSON.stringify(result));
    }
}

module.exports = CliApiService;
