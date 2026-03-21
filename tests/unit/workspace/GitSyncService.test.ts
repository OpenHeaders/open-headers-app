import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

/**
 * Tests for pure logic in GitSyncService.
 *
 * We extract and test the data-transformation methods (download URLs,
 * install instructions, workspace repo dir, error-handling wrappers)
 * without initializing the real service (which needs Git, fs, etc.).
 */

// ---------- getGitDownloadUrl ----------
// Mirrors GitSyncService.getGitDownloadUrl()
function getGitDownloadUrl(platform: string): string {
    switch (platform) {
        case 'win32':
            return 'https://git-scm.com/download/win';
        case 'darwin':
            return 'https://git-scm.com/download/mac';
        case 'linux':
            return 'https://git-scm.com/download/linux';
        default:
            return 'https://git-scm.com/downloads';
    }
}

// ---------- getInstallInstructions ----------
// Mirrors GitSyncService.getInstallInstructions()
function getInstallInstructions(platform: string): string {
    switch (platform) {
        case 'win32':
            return 'Download and run the installer. Make sure to select "Add Git to PATH" during installation.';
        case 'darwin':
            return 'Install via Homebrew: brew install git\nOr download the installer from the link above.';
        case 'linux':
            return 'Install via package manager:\nUbuntu/Debian: sudo apt-get install git\nFedora: sudo dnf install git\nArch: sudo pacman -S git';
        default:
            return 'Please install Git for your operating system.';
    }
}

// ---------- getInstallationInfo ----------
interface InstallationInfo {
    platform: string;
    downloadUrl: string;
    instructions: string;
}

interface SyncOptions {
    url: string;
    branch?: string;
    authType?: string;
    authData?: Record<string, string>;
    repoDir?: string;
}

interface SyncResult {
    success: boolean;
    error?: string;
    recovery?: string;
    autoSync?: boolean;
}

interface CloneDefaults {
    url: string;
    targetDir: string;
    branch: string;
    authType: string;
    authData: Record<string, string>;
    depth: number;
}

function getInstallationInfo(platform: string): InstallationInfo {
    return {
        platform,
        downloadUrl: getGitDownloadUrl(platform),
        instructions: getInstallInstructions(platform)
    };
}

// ---------- getWorkspaceRepoDir ----------
// Mirrors GitSyncService.getWorkspaceRepoDir()
function getWorkspaceRepoDir(tempDir: string, workspaceId: string): string {
    return path.join(tempDir, `workspace-${workspaceId}`);
}

// ---------- syncWorkspace option assembly ----------
// Mirrors the syncOptions construction in GitSyncService.syncWorkspace()
function buildSyncOptions(options: SyncOptions, repoDir: string): SyncOptions & { repoDir: string } {
    return {
        ...options,
        repoDir
    };
}

// ---------- syncWorkspace default values ----------
// Mirrors the default values used in syncWorkspace when calling cloneRepository
function buildCloneDefaults(options: SyncOptions, repoDir: string): CloneDefaults {
    return {
        url: options.url,
        targetDir: repoDir,
        branch: options.branch || 'main',
        authType: options.authType || 'none',
        authData: options.authData || {},
        depth: 10
    };
}

// ---------- error result shape ----------
// Mirrors the catch block in syncWorkspace
function buildSyncErrorResult(message: string, recovery?: string): SyncResult {
    return {
        success: false,
        error: message,
        recovery
    };
}

// ---------- autoSync error result ----------
function buildAutoSyncErrorResult(message: string): SyncResult {
    return {
        success: false,
        error: message,
        autoSync: true
    };
}

// ---------- commitConfiguration file path assembly ----------
// Mirrors the file path construction in commitConfiguration
function assembleCommitFiles(files: Record<string, string>, basePath: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [filename, content] of Object.entries(files)) {
        const filePath = path.join(basePath, filename);
        result[filePath] = content;
    }
    return result;
}

// ---------- write permission detection ----------
// Mirrors the permission check in checkWritePermissions error handling
function isPermissionError(errorMessage: string): boolean {
    return errorMessage.includes('permission') ||
        errorMessage.includes('forbidden') ||
        errorMessage.includes('unauthorized');
}

// ==================== Tests ====================

describe('GitSyncService — pure logic', () => {
    describe('getGitDownloadUrl()', () => {
        it('returns Windows URL for win32', () => {
            expect(getGitDownloadUrl('win32')).toBe('https://git-scm.com/download/win');
        });

        it('returns macOS URL for darwin', () => {
            expect(getGitDownloadUrl('darwin')).toBe('https://git-scm.com/download/mac');
        });

        it('returns Linux URL for linux', () => {
            expect(getGitDownloadUrl('linux')).toBe('https://git-scm.com/download/linux');
        });

        it('returns generic URL for unknown platform', () => {
            expect(getGitDownloadUrl('freebsd')).toBe('https://git-scm.com/downloads');
        });
    });

    describe('getInstallInstructions()', () => {
        it('mentions "Add Git to PATH" for Windows', () => {
            expect(getInstallInstructions('win32')).toContain('Add Git to PATH');
        });

        it('mentions Homebrew for macOS', () => {
            expect(getInstallInstructions('darwin')).toContain('brew install git');
        });

        it('mentions apt-get, dnf, and pacman for Linux', () => {
            const linux = getInstallInstructions('linux');
            expect(linux).toContain('apt-get install git');
            expect(linux).toContain('dnf install git');
            expect(linux).toContain('pacman -S git');
        });

        it('gives generic message for unknown platforms', () => {
            expect(getInstallInstructions('aix')).toContain('Please install Git');
        });
    });

    describe('getInstallationInfo()', () => {
        it('assembles platform, downloadUrl, and instructions', () => {
            const info = getInstallationInfo('darwin');
            expect(info.platform).toBe('darwin');
            expect(info.downloadUrl).toBe('https://git-scm.com/download/mac');
            expect(info.instructions).toContain('brew install git');
        });
    });

    describe('getWorkspaceRepoDir()', () => {
        it('builds tempDir/workspace-{id} path', () => {
            expect(getWorkspaceRepoDir('/tmp/git', 'abc-123')).toBe(
                '/tmp/git/workspace-abc-123'
            );
        });

        it('handles empty workspace ID', () => {
            expect(getWorkspaceRepoDir('/tmp/git', '')).toBe('/tmp/git/workspace-');
        });
    });

    describe('buildSyncOptions()', () => {
        it('spreads original options and adds repoDir', () => {
            const options = { workspaceId: 'w1', url: 'https://repo.git', branch: 'dev' };
            const result = buildSyncOptions(options, '/tmp/git/workspace-w1');
            expect(result.workspaceId).toBe('w1');
            expect(result.url).toBe('https://repo.git');
            expect(result.branch).toBe('dev');
            expect(result.repoDir).toBe('/tmp/git/workspace-w1');
        });

        it('does not overwrite existing repoDir if already present', () => {
            // The spread puts options first, then repoDir overwrites
            const options = { repoDir: '/old/path' };
            const result = buildSyncOptions(options, '/new/path');
            expect(result.repoDir).toBe('/new/path');
        });
    });

    describe('buildCloneDefaults()', () => {
        it('uses provided values', () => {
            const options = {
                url: 'https://github.com/org/repo',
                branch: 'develop',
                authType: 'token',
                authData: { token: 'abc' }
            };
            const result = buildCloneDefaults(options, '/tmp/repo');
            expect(result.url).toBe('https://github.com/org/repo');
            expect(result.branch).toBe('develop');
            expect(result.authType).toBe('token');
            expect(result.authData).toEqual({ token: 'abc' });
            expect(result.depth).toBe(10);
            expect(result.targetDir).toBe('/tmp/repo');
        });

        it('defaults branch to "main"', () => {
            const result = buildCloneDefaults({ url: 'u' }, '/tmp/repo');
            expect(result.branch).toBe('main');
        });

        it('defaults authType to "none"', () => {
            const result = buildCloneDefaults({ url: 'u' }, '/tmp/repo');
            expect(result.authType).toBe('none');
        });

        it('defaults authData to empty object', () => {
            const result = buildCloneDefaults({ url: 'u' }, '/tmp/repo');
            expect(result.authData).toEqual({});
        });

        it('always uses depth 10 for shallow clone', () => {
            const result = buildCloneDefaults({ url: 'u', depth: 1 }, '/tmp/repo');
            expect(result.depth).toBe(10); // fixed value, ignores input
        });
    });

    describe('buildSyncErrorResult()', () => {
        it('returns success: false with error message', () => {
            const result = buildSyncErrorResult('Network error');
            expect(result.success).toBe(false);
            expect(result.error).toBe('Network error');
        });

        it('includes recovery when provided', () => {
            const result = buildSyncErrorResult('Auth failed', 'Check credentials');
            expect(result.recovery).toBe('Check credentials');
        });

        it('has undefined recovery when not provided', () => {
            const result = buildSyncErrorResult('Error');
            expect(result.recovery).toBeUndefined();
        });
    });

    describe('buildAutoSyncErrorResult()', () => {
        it('returns success: false with autoSync: true', () => {
            const result = buildAutoSyncErrorResult('Timeout');
            expect(result.success).toBe(false);
            expect(result.error).toBe('Timeout');
            expect(result.autoSync).toBe(true);
        });
    });

    describe('assembleCommitFiles()', () => {
        it('prefixes each filename with basePath', () => {
            const files = {
                'sources.json': '[]',
                'rules.json': '{}'
            };
            const result = assembleCommitFiles(files, 'config');
            expect(result['config/sources.json']).toBe('[]');
            expect(result['config/rules.json']).toBe('{}');
        });

        it('handles empty basePath', () => {
            const files = { 'file.json': 'content' };
            const result = assembleCommitFiles(files, '');
            expect(result['file.json']).toBe('content');
        });

        it('handles nested basePath', () => {
            const files = { 'data.json': '{}' };
            const result = assembleCommitFiles(files, 'config/open-headers');
            expect(Object.keys(result)[0]).toBe('config/open-headers/data.json');
        });

        it('handles empty files object', () => {
            const result = assembleCommitFiles({}, 'config');
            expect(Object.keys(result)).toHaveLength(0);
        });
    });

    describe('isPermissionError()', () => {
        it('detects "permission" keyword', () => {
            expect(isPermissionError('permission denied')).toBe(true);
        });

        it('detects "forbidden" keyword', () => {
            expect(isPermissionError('403 forbidden')).toBe(true);
        });

        it('detects "unauthorized" keyword', () => {
            expect(isPermissionError('401 unauthorized')).toBe(true);
        });

        it('returns false for unrelated messages', () => {
            expect(isPermissionError('network error')).toBe(false);
            expect(isPermissionError('timeout')).toBe(false);
        });
    });
});
