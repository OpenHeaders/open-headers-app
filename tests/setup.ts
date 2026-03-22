// Override Node's module resolution for electron and electron-log
// This must run before any source modules are imported
import Module from 'node:module';

// _resolveFilename is a private Node.js API not in the type definitions
const ModuleInternal = Module as typeof Module & {
    _resolveFilename: (request: string, parent: Module, isMain: boolean, options: object) => string;
};

const originalResolve = ModuleInternal._resolveFilename;

const mockModules: Record<string, string> = {
    'electron': new URL('./__mocks__/electron.mjs', import.meta.url).pathname,
    'electron-log': new URL('./__mocks__/electron-log.js', import.meta.url).pathname,
};

ModuleInternal._resolveFilename = function (request: string, parent: Module, isMain: boolean, options: object) {
    if (mockModules[request]) {
        return mockModules[request];
    }
    try {
        return originalResolve.call(this, request, parent, isMain, options);
    } catch (err: unknown) {
        // When extensionless import fails, try .ts
        const error = err as NodeJS.ErrnoException;
        if (error.code === 'MODULE_NOT_FOUND' && !request.match(/\.\w+$/)) {
            try {
                return originalResolve.call(this, request + '.ts', parent, isMain, options);
            } catch (_) { /* fall through */ }
        }
        throw err;
    }
};
