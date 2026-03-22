import { describe, it, expect } from 'vitest';
import path from 'path';
import { FFmpegManager } from '../../../src/services/video/ffmpeg-manager';

describe('FFmpegManager', () => {
    describe('constructor', () => {
        it('initializes with null ffmpegPath', () => {
            const mgr = new FFmpegManager();
            expect(mgr.ffmpegPath).toBeNull();
        });

        it('sets platform from process.platform', () => {
            const mgr = new FFmpegManager();
            expect(mgr.platform).toBe(process.platform);
        });

        it('initializes isDownloading as false', () => {
            const mgr = new FFmpegManager();
            expect(mgr.isDownloading).toBe(false);
        });

        it('initializes downloadCallbacks as empty array', () => {
            const mgr = new FFmpegManager();
            expect(mgr.downloadCallbacks).toEqual([]);
        });

        it('sets ffmpegDir to a path containing ffmpeg', () => {
            const mgr = new FFmpegManager();
            expect(mgr.ffmpegDir).toContain('ffmpeg');
        });
    });

    describe('getLocalFFmpegPath()', () => {
        it('returns a path inside ffmpegDir', () => {
            const mgr = new FFmpegManager();
            const localPath = mgr.getLocalFFmpegPath();
            expect(localPath.startsWith(mgr.ffmpegDir)).toBe(true);
        });

        it('returns platform-appropriate binary name', () => {
            const mgr = new FFmpegManager();
            const localPath = mgr.getLocalFFmpegPath();
            if (process.platform === 'win32') {
                expect(path.basename(localPath)).toBe('ffmpeg.exe');
            } else {
                expect(path.basename(localPath)).toBe('ffmpeg');
            }
        });

        it('joins ffmpegDir with the binary name exactly', () => {
            const mgr = new FFmpegManager();
            const filename = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
            expect(mgr.getLocalFFmpegPath()).toBe(path.join(mgr.ffmpegDir, filename));
        });
    });

    describe('getFFmpegPath()', () => {
        it('returns null initially', () => {
            const mgr = new FFmpegManager();
            expect(mgr.getFFmpegPath()).toBeNull();
        });

        it('returns the set path after assignment', () => {
            const mgr = new FFmpegManager();
            mgr.ffmpegPath = '/opt/homebrew/bin/ffmpeg';
            expect(mgr.getFFmpegPath()).toBe('/opt/homebrew/bin/ffmpeg');
        });

        it('returns Windows path after assignment', () => {
            const mgr = new FFmpegManager();
            mgr.ffmpegPath = 'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe';
            expect(mgr.getFFmpegPath()).toBe('C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe');
        });
    });

    describe('fileExists()', () => {
        it('returns false for non-existent path', async () => {
            const mgr = new FFmpegManager();
            const exists = await mgr.fileExists('/non/existent/ffmpeg-binary');
            expect(exists).toBe(false);
        });

        it('returns true for an existing directory', async () => {
            const mgr = new FFmpegManager();
            const exists = await mgr.fileExists('/tmp');
            expect(exists).toBe(true);
        });
    });

    describe('findFilesRecursive()', () => {
        it('returns an array', async () => {
            const mgr = new FFmpegManager();
            // Use a known small directory
            const files = await mgr.findFilesRecursive('/tmp');
            expect(Array.isArray(files)).toBe(true);
        });
    });

    describe('execPromise()', () => {
        it('resolves with stdout/stderr for valid command', async () => {
            const mgr = new FFmpegManager();
            const result = await mgr.execPromise('echo "hello"');
            expect(result.stdout).toContain('hello');
            expect(typeof result.stderr).toBe('string');
        });

        it('rejects for invalid command', async () => {
            const mgr = new FFmpegManager();
            await expect(mgr.execPromise('nonexistent_command_xyz')).rejects.toThrow();
        });
    });
});
