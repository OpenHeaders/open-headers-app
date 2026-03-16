// Override Node's module resolution for electron and electron-log
// This must run before any source modules are imported
import Module from 'node:module';

const originalResolve = Module._resolveFilename;

const mockModules = {
    'electron': new URL('./__mocks__/electron.mjs', import.meta.url).pathname,
    'electron-log': new URL('./__mocks__/electron-log.js', import.meta.url).pathname,
};

Module._resolveFilename = function (request, parent, isMain, options) {
    if (mockModules[request]) {
        return mockModules[request];
    }
    try {
        return originalResolve.call(this, request, parent, isMain, options);
    } catch (err) {
        // When resolution fails for extensionless imports, try .ts then .js
        // This handles both CJS require('./foo') and ESM import from .ts files
        if (err.code === 'MODULE_NOT_FOUND' && !request.match(/\.\w+$/)) {
            for (const ext of ['.ts', '.js']) {
                try {
                    return originalResolve.call(this, request + ext, parent, isMain, options);
                } catch (_) { /* try next */ }
            }
        }
        throw err;
    }
};
