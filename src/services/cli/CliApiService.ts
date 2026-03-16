import http from 'http';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import electron from 'electron';
import mainLogger from '../../utils/mainLogger.js';

const { app } = electron;
const { createLogger } = mainLogger;

const CLI_PORT = 59213;
const CLI_HOST = '127.0.0.1';
const log = createLogger('CliApi');

// Map known system process names to friendly app names
const PROCESS_NAMES: Record<string, string> = {
    'com.apple.WebKit.Networking': 'Safari',
    'com.apple.WebKit.Content': 'Safari',
};

class CliApiService {
    port = CLI_PORT;
    token = crypto.randomBytes(32).toString('hex');
    server: http.Server | null = null;
    mainWindow: any = null;
    setupHandler: any = null;
    discoveryPath = '';
    logsPath = '';
    requestLogs: any[] = [];
    startedAt: number | null = null;
    private _connections?: Set<any>;

    constructor() {
        try {
            this.discoveryPath = path.join(app.getPath('userData'), 'cli.json');
            this.logsPath = path.join(app.getPath('userData'), 'cli-logs.jsonl');
            this._loadLogs();
        } catch {
            // Outside Electron (tests) — paths will be empty
        }
    }

    setMainWindow(window: any): void {
        this.mainWindow = window;
        if (this.setupHandler) {
            this.setupHandler.setMainWindow(window);
        }
    }

    setSetupHandler(handler: any): void {
        this.setupHandler = handler;
        if (this.mainWindow) {
            handler.setMainWindow(this.mainWindow);
        }
    }

    async start(): Promise<void> {
        if (this.server && this.server.listening) {
            log.info('CLI API server is already running');
            return;
        }

        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => this._handleRequest(req, res));

            this.server.on('connection', (socket: any) => {
                if (!this._connections) this._connections = new Set();
                this._connections.add(socket);
                socket.once('close', () => this._connections?.delete(socket));
            });

            let attempts = 0;
            const maxRetries = 5;
            const retryDelay = 500;

            const retryHandler = (err: any) => {
                if (err.code === 'EADDRINUSE' && attempts < maxRetries) {
                    attempts++;
                    log.warn(`CLI API port ${this.port} in use, retrying in ${retryDelay}ms (attempt ${attempts}/${maxRetries})`);
                    setTimeout(() => this.server!.listen(this.port, CLI_HOST), retryDelay);
                } else if (err.code === 'EADDRINUSE') {
                    log.warn(`CLI API port ${this.port} still in use after ${maxRetries} retries, skipping`);
                    this.server!.removeListener('error', retryHandler);
                    resolve();
                } else {
                    log.error('CLI API server error:', err);
                    this.server!.removeListener('error', retryHandler);
                    reject(err);
                }
            };

            this.server.on('error', retryHandler);

            this.server.once('listening', async () => {
                this.server!.removeListener('error', retryHandler);
                this.startedAt = Date.now();
                log.info(`CLI API server listening on ${CLI_HOST}:${this.port}`);
                if (attempts > 0) {
                    log.info(`CLI API server bound after ${attempts} retries`);
                }

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
                } catch (err: any) {
                    log.warn('Failed to write CLI discovery file:', err.message);
                }

                resolve();
            });

            this.server.listen(this.port, CLI_HOST);
        });
    }

    async stop(): Promise<void> {
        this._deleteDiscoveryFile();
        this.startedAt = null;

        if (this.server) {
            if (this._connections) {
                for (const socket of this._connections) {
                    try { socket.destroy(); } catch (e) { /* ignore */ }
                }
                this._connections.clear();
            }

            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    log.warn('CLI API server close timed out after 2s, forcing');
                    this.server = null;
                    resolve();
                }, 2000);

                this.server!.close(() => {
                    clearTimeout(timeout);
                    log.info('CLI API server stopped');
                    this.server = null;
                    resolve();
                });
            });
        }
    }

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

    getLogs(): any[] { return this.requestLogs.slice(); }

    clearLogs(): void {
        this.requestLogs = [];
        if (this.logsPath) {
            fs.promises.writeFile(this.logsPath, '', 'utf8').catch((err: any) => {
                log.warn('Failed to clear CLI API log file:', err.message);
            });
        }
    }

    async regenerateToken(): Promise<string> {
        this.token = crypto.randomBytes(32).toString('hex');
        log.info('CLI API token regenerated');

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
            } catch (err: any) {
                log.warn('Failed to rewrite CLI discovery file:', err.message);
            }
        }

        return this.token;
    }

    _addLog(entry: any): void {
        const logEntry = { timestamp: Date.now(), ...entry };
        this.requestLogs.unshift(logEntry);
        if (this.logsPath) {
            const line = JSON.stringify(logEntry) + '\n';
            fs.promises.appendFile(this.logsPath, line, 'utf8').catch((err: any) => {
                log.warn('Failed to append CLI API log:', err.message);
            });
        }
    }

    _loadLogs(): void {
        try {
            if (!this.logsPath) return;
            const data = fs.readFileSync(this.logsPath, 'utf8');
            const lines = data.trim().split('\n').filter(Boolean);
            this.requestLogs = [];
            for (const line of lines) {
                try { this.requestLogs.push(JSON.parse(line)); } catch { /* skip */ }
            }
            this.requestLogs.reverse();
            log.info(`Loaded ${this.requestLogs.length} persisted CLI API logs`);
        } catch {
            // File doesn't exist — start fresh
        }
    }

    _lookupClientProcess(remotePort: number): string | null {
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

    _buildProcessTree(command: string, pid: number): string {
        const friendly = PROCESS_NAMES[command];
        if (friendly) return `${friendly} (PID ${pid})`;
        if (process.platform === 'win32') return `${command} (PID ${pid})`;

        const chain = [command];
        let currentPid = pid;
        const execOpts = { timeout: 500, encoding: 'utf8' as const, stdio: ['pipe' as const, 'pipe' as const, 'pipe' as const] };
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

    _lookupLsof(remotePort: number): string | null {
        const execOpts = { timeout: 1500, encoding: 'utf8' as const, stdio: ['pipe' as const, 'pipe' as const, 'pipe' as const] };
        const stdout = execFileSync('lsof', ['-nP', '-i', `TCP:${this.port}`, '-sTCP:ESTABLISHED', '-Fp', '-Fc', '-Fn'], execOpts);
        if (!stdout) return null;
        const lines = stdout.trim().split('\n');
        const myPid = process.pid;
        const needle = `:${remotePort}->`;
        let currentPid: number | null = null, currentCommand: string | null = null;
        for (const line of lines) {
            if (line.startsWith('p')) { currentPid = parseInt(line.slice(1), 10); currentCommand = null; }
            if (line.startsWith('c')) currentCommand = line.slice(1);
            if (line.startsWith('n') && currentPid !== myPid && currentCommand && line.includes(needle)) {
                return this._buildProcessTree(currentCommand, currentPid!);
            }
        }
        return null;
    }

    _lookupSs(remotePort: number): string | null {
        const execOpts = { timeout: 1500, encoding: 'utf8' as const, stdio: ['pipe' as const, 'pipe' as const, 'pipe' as const] };
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

    _lookupNetstat(remotePort: number): string | null {
        const execOpts = { timeout: 3000, encoding: 'utf8' as const, stdio: ['pipe' as const, 'pipe' as const, 'pipe' as const] };
        let stdout: string;
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
            const parts = line.trim().split(/\s+/);
            if (parts.length < 5) continue;
            const addr1 = parts[1], addr2 = parts[2];
            const match = (addr1.endsWith(serverPort) && addr2.endsWith(clientPort)) ||
                          (addr1.endsWith(clientPort) && addr2.endsWith(serverPort));
            if (!match) continue;
            const pid = parseInt(parts[parts.length - 1], 10);
            if (!pid || pid === myPid) continue;
            try {
                const taskOut = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], execOpts);
                const m = taskOut.trim().match(/^"([^"]+)"/);
                return `${m ? m[1] : 'unknown'} (PID ${pid})`;
            } catch {
                return `PID ${pid}`;
            }
        }
        return null;
    }

    _summarizeBody(pathname: string, body: any): any {
        if (!body || typeof body !== 'object') return null;
        try {
            return this._redactDeep(body);
        } catch {
            return null;
        }
    }

    _redactDeep(obj: any): any {
        if (Array.isArray(obj)) return obj.map(item => this._redactDeep(item));
        if (obj === null || typeof obj !== 'object') {
            if (typeof obj === 'string') return this._redactString(obj);
            return obj;
        }
        const result: Record<string, any> = {};
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

    _redactString(str: string): string {
        if (str.length > 20 && /^(ghp_|sk-|eyJ|Bearer )/.test(str)) return '***';
        return str;
    }

    _validateAuth(req: http.IncomingMessage): boolean {
        const authHeader = req.headers['authorization'];
        if (!authHeader) return false;
        const parts = authHeader.split(' ');
        return parts.length === 2 && parts[0] === 'Bearer' && parts[1] === this.token;
    }

    _deleteDiscoveryFile(): void {
        try {
            if (this.discoveryPath) fs.unlinkSync(this.discoveryPath);
        } catch { /* Ignore */ }
    }

    _handleWithBody(req: http.IncomingMessage, res: http.ServerResponse, handler: (body: any) => Promise<void>): void {
        let body = '';
        let responseSent = false;
        req.on('data', (chunk) => {
            body += chunk;
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
            } catch (err: any) {
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

    async _handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const startTime = Date.now();
        res.setHeader('Content-Type', 'application/json');

        const originalWriteHead = res.writeHead.bind(res);
        let loggedStatusCode = 200;
        (res as any).writeHead = (statusCode: number, ...args: any[]) => {
            loggedStatusCode = statusCode;
            return originalWriteHead(statusCode, ...args);
        };

        const originalEnd = res.end.bind(res);
        let errorMessage: string | null = null;
        (res as any).end = (data?: any, ...args: any[]) => {
            if (loggedStatusCode >= 400 && data) {
                try {
                    const parsed = JSON.parse(typeof data === 'string' ? data : data.toString());
                    errorMessage = parsed.error || null;
                } catch { /* ignore */ }
            }
            return originalEnd(data, ...args);
        };

        const url = new URL(req.url || '/', `http://${CLI_HOST}:${this.port}`);
        const pathname = url.pathname;
        const skipLog = !pathname.startsWith('/cli/');
        const logContext: { bodySummary: any } = { bodySummary: null };

        const userAgent = req.headers['user-agent'] || null;
        const remoteAddress = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
        const clientProcess = skipLog ? null : this._lookupClientProcess(req.socket.remotePort!);

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
            if (!this._validateAuth(req)) {
                res.writeHead(401);
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }

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

            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
        } catch (err: any) {
            log.error('CLI API request error:', err);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    }

    _handleHealth(_req: http.IncomingMessage, res: http.ServerResponse): void {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok', version: app.getVersion() }));
    }

    async _handleWorkspaceJoin(body: any, res: http.ServerResponse): Promise<void> {
        if (!this.setupHandler) {
            res.writeHead(503);
            res.end(JSON.stringify({ success: false, error: 'Setup handler not ready' }));
            return;
        }
        const result = await this.setupHandler.joinWorkspace(body);
        res.writeHead(result.success ? 200 : 400);
        res.end(JSON.stringify(result));
    }

    async _handleEnvironmentImport(body: any, res: http.ServerResponse): Promise<void> {
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

export { CliApiService };
export default CliApiService;
