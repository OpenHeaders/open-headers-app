import { describe, expect, it } from 'vitest';
import { VideoExportManager } from '../../../src/services/video/video-export-manager';

describe('VideoExportManager', () => {
  describe('constructor', () => {
    it('creates an FFmpegManager instance with null path', () => {
      const mgr = new VideoExportManager();
      expect(mgr.ffmpegManager).toBeDefined();
      expect(mgr.ffmpegManager.ffmpegPath).toBeNull();
    });

    it('ffmpegManager has expected methods', () => {
      const mgr = new VideoExportManager();
      expect(typeof mgr.ffmpegManager.checkFFmpeg).toBe('function');
      expect(typeof mgr.ffmpegManager.getLocalFFmpegPath).toBe('function');
      expect(typeof mgr.ffmpegManager.getFFmpegPath).toBe('function');
      expect(typeof mgr.ffmpegManager.downloadFFmpeg).toBe('function');
    });
  });

  describe('fileExists()', () => {
    it('returns false for non-existent recording path', async () => {
      const mgr = new VideoExportManager();
      const exists = await mgr.fileExists(
        '/Users/jane.doe/Library/Application Support/OpenHeaders/recordings/rec-abc123/video.webm',
      );
      expect(exists).toBe(false);
    });

    it('returns true for existing path', async () => {
      const mgr = new VideoExportManager();
      const exists = await mgr.fileExists('/tmp');
      expect(exists).toBe(true);
    });

    it('returns false for empty string path', async () => {
      const mgr = new VideoExportManager();
      const exists = await mgr.fileExists('');
      expect(exists).toBe(false);
    });
  });
});
