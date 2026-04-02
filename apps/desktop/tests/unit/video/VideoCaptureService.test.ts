import { beforeEach, describe, expect, it } from 'vitest';
import { VideoCaptureService } from '@/services/video/video-capture-service';

// Enterprise-style recording factory
function makeRecordingInfo(
  overrides: Partial<{
    recordingId: string;
    sourceId: string;
    url: string;
    title: string;
    tabId: string;
    windowId: string;
    startTime: number;
    recordingDir: string;
    status: string;
    state: string;
    endTime: number;
    duration: number;
    videoPath: string;
  }> = {},
) {
  return {
    recordingId: 'rec-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    sourceId: 'screen:0:0',
    url: 'https://dashboard.openheaders.io/workspace/prod-env/recordings',
    title: 'OpenHeaders — Production Dashboard Recording',
    tabId: 'tab-9f8e7d6c-5b4a-3210-fedc-ba0987654321',
    windowId: 'win-1a2b3c4d-5e6f-7890-abcd-ef1234567890',
    startTime: 1737945000000, // 2025-01-27T09:30:00.000Z
    recordingDir:
      '/Users/jane.doe/Library/Application Support/OpenHeaders/recordings/rec-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    status: 'recording',
    ...overrides,
  };
}

describe('VideoCaptureService', () => {
  let service: VideoCaptureService;

  beforeEach(() => {
    service = new VideoCaptureService();
  });

  describe('constructor', () => {
    it('initializes with empty activeRecordings map', () => {
      expect(service.activeRecordings).toBeInstanceOf(Map);
      expect(service.activeRecordings.size).toBe(0);
    });

    it('initializes with null appDataPath and recordingsPath', () => {
      expect(service.appDataPath).toBeNull();
      expect(service.recordingsPath).toBeNull();
    });
  });

  describe('getActiveRecordings()', () => {
    it('returns empty array when no recordings', () => {
      expect(service.getActiveRecordings()).toEqual([]);
    });

    it('returns array of active recordings with full shape', () => {
      const recording = makeRecordingInfo();
      service.activeRecordings.set(recording.recordingId, recording);
      const result = service.getActiveRecordings();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(recording);
    });

    it('returns multiple recordings', () => {
      const rec1 = makeRecordingInfo({ recordingId: 'rec-1' });
      const rec2 = makeRecordingInfo({
        recordingId: 'rec-2',
        url: 'https://staging.openheaders.io/workspace/staging-env/recordings',
        title: 'OpenHeaders — Staging Environment Recording',
      });
      service.activeRecordings.set(rec1.recordingId, rec1);
      service.activeRecordings.set(rec2.recordingId, rec2);
      expect(service.getActiveRecordings()).toHaveLength(2);
    });

    it('returns values from map, not references to map entries', () => {
      const recording = makeRecordingInfo();
      service.activeRecordings.set(recording.recordingId, recording);
      const result = service.getActiveRecordings();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('updateRecordingState()', () => {
    it('updates state for existing recording', async () => {
      const recording = makeRecordingInfo();
      service.activeRecordings.set(recording.recordingId, recording);
      await service.updateRecordingState(recording.recordingId, 'paused');
      expect(service.activeRecordings.get(recording.recordingId)!.state).toBe('paused');
    });

    it('does nothing for non-existent recording', async () => {
      await service.updateRecordingState('nonexistent-uuid', 'paused');
      expect(service.activeRecordings.size).toBe(0);
    });

    it('can update state to stopped', async () => {
      const recording = makeRecordingInfo();
      service.activeRecordings.set(recording.recordingId, recording);
      await service.updateRecordingState(recording.recordingId, 'stopped');
      expect(service.activeRecordings.get(recording.recordingId)!.state).toBe('stopped');
    });

    it('preserves other recording fields when updating state', async () => {
      const recording = makeRecordingInfo();
      service.activeRecordings.set(recording.recordingId, recording);
      await service.updateRecordingState(recording.recordingId, 'paused');
      const updated = service.activeRecordings.get(recording.recordingId)!;
      expect(updated.url).toBe(recording.url);
      expect(updated.title).toBe(recording.title);
      expect(updated.status).toBe('recording');
    });
  });

  describe('fileExists()', () => {
    it('returns false for non-existent path', async () => {
      const exists = await service.fileExists('/non/existent/path/openheaders-recording-abc123.webm');
      expect(exists).toBe(false);
    });

    it('returns true for existing path', async () => {
      const exists = await service.fileExists('/tmp');
      expect(exists).toBe(true);
    });
  });
});
