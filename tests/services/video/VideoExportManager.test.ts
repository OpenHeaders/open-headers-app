import { describe, it, expect } from 'vitest';
import { VideoExportManager } from '../../../src/services/video/video-export-manager';

describe('VideoExportManager', () => {
    describe('constructor', () => {
        it('creates an FFmpegManager instance', () => {
            const mgr = new VideoExportManager();
            expect(mgr.ffmpegManager).toBeDefined();
            expect(mgr.ffmpegManager.ffmpegPath).toBeNull();
        });
    });

    describe('fileExists()', () => {
        it('returns false for non-existent path', async () => {
            const mgr = new VideoExportManager();
            const exists = await mgr.fileExists('/non/existent/path');
            expect(exists).toBe(false);
        });

        it('returns true for existing path', async () => {
            const mgr = new VideoExportManager();
            const exists = await mgr.fileExists('/tmp');
            expect(exists).toBe(true);
        });
    });
});
