import { describe, it, expect, beforeEach } from 'vitest';
import { VideoCaptureService } from '../../../src/services/video/video-capture-service';

describe('VideoCaptureService', () => {
    let service: VideoCaptureService;

    beforeEach(() => {
        service = new VideoCaptureService();
    });

    describe('constructor', () => {
        it('initializes with empty activeRecordings map', () => {
            expect(service.activeRecordings.size).toBe(0);
        });

        it('initializes with null appDataPath', () => {
            expect(service.appDataPath).toBeNull();
        });

        it('initializes with null recordingsPath', () => {
            expect(service.recordingsPath).toBeNull();
        });
    });

    describe('getActiveRecordings()', () => {
        it('returns empty array when no recordings', () => {
            expect(service.getActiveRecordings()).toEqual([]);
        });

        it('returns array of active recordings', () => {
            const recording = {
                recordingId: 'test-1',
                sourceId: 'screen:0',
                url: 'https://example.com',
                title: 'Test',
                startTime: Date.now(),
                recordingDir: '/tmp/recordings/test-1',
                status: 'recording'
            };
            service.activeRecordings.set('test-1', recording);
            const result = service.getActiveRecordings();
            expect(result).toHaveLength(1);
            expect(result[0].recordingId).toBe('test-1');
        });
    });

    describe('updateRecordingState()', () => {
        it('updates state for existing recording', async () => {
            const recording = {
                recordingId: 'test-1',
                sourceId: 'screen:0',
                url: 'https://example.com',
                title: 'Test',
                startTime: Date.now(),
                recordingDir: '/tmp/recordings/test-1',
                status: 'recording'
            };
            service.activeRecordings.set('test-1', recording);
            await service.updateRecordingState('test-1', 'paused');
            expect(service.activeRecordings.get('test-1')!.state).toBe('paused');
        });

        it('does nothing for non-existent recording', async () => {
            // Should not throw
            await service.updateRecordingState('nonexistent', 'paused');
            expect(service.activeRecordings.size).toBe(0);
        });
    });

    describe('fileExists()', () => {
        it('returns false for non-existent path', async () => {
            const exists = await service.fileExists('/non/existent/path');
            expect(exists).toBe(false);
        });

        it('returns true for existing path', async () => {
            const exists = await service.fileExists('/tmp');
            expect(exists).toBe(true);
        });
    });
});
