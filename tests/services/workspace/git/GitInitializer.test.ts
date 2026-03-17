import { describe, it, expect } from 'vitest';
import { GitInitializer, COMMON_GIT_PATHS } from '../../../../src/services/workspace/git/core/GitInitializer';

describe('GitInitializer', () => {
    // ------- COMMON_GIT_PATHS -------
    describe('COMMON_GIT_PATHS', () => {
        it('includes standard Unix paths', () => {
            expect(COMMON_GIT_PATHS).toContain('/usr/bin/git');
            expect(COMMON_GIT_PATHS).toContain('/usr/local/bin/git');
        });

        it('includes Apple Silicon Homebrew path', () => {
            expect(COMMON_GIT_PATHS).toContain('/opt/homebrew/bin/git');
        });

        it('includes MacPorts path', () => {
            expect(COMMON_GIT_PATHS).toContain('/opt/local/bin/git');
        });

        it('includes Windows paths', () => {
            expect(COMMON_GIT_PATHS).toContain('C:\\Program Files\\Git\\cmd\\git.exe');
            expect(COMMON_GIT_PATHS).toContain('C:\\Program Files (x86)\\Git\\cmd\\git.exe');
        });

        it('has at least 5 known paths', () => {
            expect(COMMON_GIT_PATHS.length).toBeGreaterThanOrEqual(5);
        });
    });

    // ------- constructor -------
    describe('constructor', () => {
        it('creates instance without errors', () => {
            const initializer = new GitInitializer();
            expect(initializer).toBeDefined();
        });
    });

    // ------- getStatus -------
    describe('getStatus', () => {
        it('returns correct initial status', () => {
            const initializer = new GitInitializer();
            const status = initializer.getStatus();

            expect(status.gitPath).toBeNull();
            expect(status.isInstalled).toBe(false);
            expect(status.initialized).toBe(false);
            expect(status.platform).toBe(process.platform);
            expect(typeof status.tempDir).toBe('string');
            expect(typeof status.sshDir).toBe('string');
        });

        it('reports isInstalled as false before initialization', () => {
            const initializer = new GitInitializer();
            expect(initializer.getStatus().isInstalled).toBe(false);
        });

        it('includes correct platform', () => {
            const initializer = new GitInitializer();
            expect(initializer.getStatus().platform).toBe(process.platform);
        });

        it('tempDir ends with workspace-sync', () => {
            const initializer = new GitInitializer();
            expect(initializer.getStatus().tempDir).toMatch(/workspace-sync$/);
        });

        it('sshDir ends with ssh-keys', () => {
            const initializer = new GitInitializer();
            expect(initializer.getStatus().sshDir).toMatch(/ssh-keys$/);
        });
    });

    // ------- getPaths -------
    describe('getPaths', () => {
        it('returns tempDir and sshDir', () => {
            const initializer = new GitInitializer();
            const paths = initializer.getPaths();

            expect(paths).toHaveProperty('tempDir');
            expect(paths).toHaveProperty('sshDir');
            expect(typeof paths.tempDir).toBe('string');
            expect(typeof paths.sshDir).toBe('string');
        });

        it('returns consistent paths with getStatus', () => {
            const initializer = new GitInitializer();
            const paths = initializer.getPaths();
            const status = initializer.getStatus();

            expect(paths.tempDir).toBe(status.tempDir);
            expect(paths.sshDir).toBe(status.sshDir);
        });
    });

    // ------- getExecutor -------
    describe('getExecutor', () => {
        it('returns a GitExecutor instance', () => {
            const initializer = new GitInitializer();
            const executor = initializer.getExecutor();
            expect(executor).toBeDefined();
            expect(typeof executor.execute).toBe('function');
            expect(typeof executor.setGitPath).toBe('function');
        });

        it('returns same executor on multiple calls', () => {
            const initializer = new GitInitializer();
            const exec1 = initializer.getExecutor();
            const exec2 = initializer.getExecutor();
            expect(exec1).toBe(exec2);
        });
    });

    // ------- initialize -------
    describe('initialize', () => {
        it('sets initialized to true after successful init', async () => {
            const initializer = new GitInitializer();
            await initializer.initialize();
            expect(initializer.getStatus().initialized).toBe(true);
        });

        it('returns true on successful initialization', async () => {
            const initializer = new GitInitializer();
            const result = await initializer.initialize();
            expect(result).toBe(true);
        });
    });

    // ------- findGitExecutable -------
    describe('findGitExecutable', () => {
        it('finds git and updates status', async () => {
            const initializer = new GitInitializer();
            const gitPath = await initializer.findGitExecutable();

            // On CI or a dev machine, git should be available
            // If git is not installed, it returns null
            if (gitPath) {
                expect(typeof gitPath).toBe('string');
                expect(initializer.getStatus().gitPath).toBe(gitPath);
                expect(initializer.getStatus().isInstalled).toBe(true);
            } else {
                expect(gitPath).toBeNull();
                expect(initializer.getStatus().isInstalled).toBe(false);
            }
        });
    });
});
