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
        // When extensionless import fails, try .ts
        if (err.code === 'MODULE_NOT_FOUND' && !request.match(/\.\w+$/)) {
            try {
                return originalResolve.call(this, request + '.ts', parent, isMain, options);
            } catch (_) { /* fall through */ }
        }
        throw err;
    }
};
