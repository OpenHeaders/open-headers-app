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

        it('returns path ending with ffmpeg on non-windows', () => {
            const mgr = new FFmpegManager();
            const localPath = mgr.getLocalFFmpegPath();
            if (process.platform === 'win32') {
                expect(path.basename(localPath)).toBe('ffmpeg.exe');
            } else {
                expect(path.basename(localPath)).toBe('ffmpeg');
            }
        });

        it('joins ffmpegDir with the binary name', () => {
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
            mgr.ffmpegPath = '/test/ffmpeg';
            expect(mgr.getFFmpegPath()).toBe('/test/ffmpeg');
        });
    });

    describe('fileExists()', () => {
        it('returns false for non-existent path', async () => {
            const mgr = new FFmpegManager();
            const exists = await mgr.fileExists('/non/existent/path');
            expect(exists).toBe(false);
        });

        it('returns true for an existing directory', async () => {
            const mgr = new FFmpegManager();
            const exists = await mgr.fileExists('/tmp');
            expect(exists).toBe(true);
        });
    });
});
