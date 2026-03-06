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

        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    log.info('CLI API server stopped');
                    resolve();
                });
                // Force close after 2 seconds
                setTimeout(resolve, 2000);
            });
        }
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
        // CORS headers for local use
        res.setHeader('Content-Type', 'application/json');

        try {
            // Auth check
            if (!this._validateAuth(req)) {
                res.writeHead(401);
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }

            // Parse URL
            const url = new URL(req.url, `http://${CLI_HOST}:${this.port}`);
            const pathname = url.pathname;

            // Route
            if (req.method === 'GET' && pathname === '/cli/health') {
                return this._handleHealth(req, res);
            }
            if (req.method === 'POST' && pathname === '/cli/workspace/join') {
                return this._handleWithBody(req, res, (body) => this._handleWorkspaceJoin(body, res));
            }
            if (req.method === 'POST' && pathname === '/cli/environments/import') {
                return this._handleWithBody(req, res, (body) => this._handleEnvironmentImport(body, res));
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
