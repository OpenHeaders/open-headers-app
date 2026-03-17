import { describe, it, expect } from 'vitest';
import path from 'path';

/**
 * Tests for pure logic extracted from RecordingHandlers.
 *
 * We test path construction, metadata building, ID generation, and
 * sort logic directly without importing the handler (which needs
 * electron, atomicFileWriter, and filesystem access).
 */

// ---------- record ID generation ----------
// Mirrors handleSaveRecording's fallback ID generation
function generateRecordId(recordData: any): string {
    return recordData.record?.metadata?.recordId ||
        `record-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Mirrors handleSaveUploadedRecording's fallback ID generation
function generateUploadRecordId(recordData: any): string {
    return recordData.record?.metadata?.recordId ||
        `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ---------- path construction ----------
function buildRecordingsPath(userDataPath: string): string {
    return path.join(userDataPath, 'recordings');
}

function buildRecordingDir(userDataPath: string, recordId: string): string {
    return path.join(userDataPath, 'recordings', recordId);
}

function buildProcessedPath(userDataPath: string, recordId: string): string {
    return path.join(userDataPath, 'recordings', recordId, 'record-processed.json');
}

function buildMetaPath(userDataPath: string, recordId: string): string {
    return path.join(userDataPath, 'recordings', `${recordId}.meta.json`);
}

function buildVideoPath(userDataPath: string, recordId: string): string {
    return path.join(userDataPath, 'recordings', recordId, 'video.webm');
}

function buildVideoMetaPath(userDataPath: string, recordId: string): string {
    return path.join(userDataPath, 'recordings', recordId, 'video-metadata.json');
}

// ---------- metadata construction ----------
// Mirrors the metadata object built in handleSaveRecording
function buildRecordingMetadata(recordId: string, recordData: any): any {
    return {
        id: recordId,
        timestamp: recordData.record.metadata.timestamp || Date.now(),
        url: recordData.record.metadata.url || recordData.record.metadata.initialUrl || 'Unknown',
        duration: recordData.record.metadata.duration || 0,
        eventCount: recordData.record.events?.length || 0,
        size: Buffer.byteLength(JSON.stringify(recordData)),
        source: recordData.source || 'extension',
        hasVideo: false,
        tag: recordData.tag || null,
        description: recordData.description || null,
        metadata: recordData.record.metadata
    };
}

// Mirrors the metadata object built in handleSaveUploadedRecording
function buildUploadedRecordingMetadata(recordId: string, recordData: any, processedData: any): any {
    return {
        id: recordId,
        timestamp: recordData.record?.metadata?.timestamp || Date.now(),
        url: recordData.record?.metadata?.url || 'Unknown',
        duration: recordData.record?.metadata?.duration || 0,
        eventCount: recordData.record?.events?.length || 0,
        size: Buffer.byteLength(JSON.stringify(processedData)),
        source: 'upload',
        hasVideo: false,
        hasProcessedVersion: true,
        tag: recordData.tag || null,
        description: recordData.description || null,
        metadata: recordData.record?.metadata
    };
}

// ---------- recording sort ----------
// Mirrors the sort in handleLoadRecordings
function sortRecordings(recordings: any[]): any[] {
    return [...recordings].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
}

// ---------- metadata update merge ----------
// Mirrors handleUpdateRecordingMetadata merge logic
function mergeMetadataUpdates(existingMetadata: any, updates: any): any {
    return {
        ...existingMetadata,
        ...updates,
        lastModified: Date.now()
    };
}

// ---------- meta file filter ----------
// Mirrors the filter used in handleLoadRecordings
function isMetaFile(filename: string): boolean {
    return filename.endsWith('.meta.json');
}

// ==================== Tests ====================

describe('RecordingHandlers — pure logic', () => {
    describe('record ID generation', () => {
        it('uses recordId from metadata when present', () => {
            const data = { record: { metadata: { recordId: 'custom-id-123' } } };
            expect(generateRecordId(data)).toBe('custom-id-123');
        });

        it('generates a fallback ID starting with "record-" when metadata has no recordId', () => {
            const data = { record: { metadata: {} } };
            const id = generateRecordId(data);
            expect(id).toMatch(/^record-\d+-[a-z0-9]+$/);
        });

        it('generates a fallback upload ID starting with "upload-"', () => {
            const data = { record: { metadata: {} } };
            const id = generateUploadRecordId(data);
            expect(id).toMatch(/^upload-\d+-[a-z0-9]+$/);
        });

        it('handles deeply missing metadata gracefully for upload ID', () => {
            const data = {};
            const id = generateUploadRecordId(data);
            expect(id).toMatch(/^upload-/);
        });
    });

    describe('path construction', () => {
        const userData = '/home/user/.config/app';

        it('builds recordings base path', () => {
            expect(buildRecordingsPath(userData)).toBe('/home/user/.config/app/recordings');
        });

        it('builds recording directory path', () => {
            expect(buildRecordingDir(userData, 'rec-1')).toBe(
                '/home/user/.config/app/recordings/rec-1'
            );
        });

        it('builds processed record path', () => {
            expect(buildProcessedPath(userData, 'rec-1')).toBe(
                '/home/user/.config/app/recordings/rec-1/record-processed.json'
            );
        });

        it('builds meta path with .meta.json extension', () => {
            expect(buildMetaPath(userData, 'rec-1')).toBe(
                '/home/user/.config/app/recordings/rec-1.meta.json'
            );
        });

        it('builds video file path', () => {
            expect(buildVideoPath(userData, 'rec-1')).toBe(
                '/home/user/.config/app/recordings/rec-1/video.webm'
            );
        });

        it('builds video metadata path', () => {
            expect(buildVideoMetaPath(userData, 'rec-1')).toBe(
                '/home/user/.config/app/recordings/rec-1/video-metadata.json'
            );
        });
    });

    describe('metadata construction', () => {
        it('builds metadata with all standard fields', () => {
            const recordData = {
                record: {
                    metadata: { timestamp: 1700000000000, url: 'https://example.com', duration: 5000 },
                    events: [{ type: 'click' }, { type: 'keypress' }]
                },
                source: 'extension',
                tag: 'regression',
                description: 'Login flow test'
            };
            const meta = buildRecordingMetadata('rec-1', recordData);

            expect(meta.id).toBe('rec-1');
            expect(meta.timestamp).toBe(1700000000000);
            expect(meta.url).toBe('https://example.com');
            expect(meta.duration).toBe(5000);
            expect(meta.eventCount).toBe(2);
            expect(meta.source).toBe('extension');
            expect(meta.hasVideo).toBe(false);
            expect(meta.tag).toBe('regression');
            expect(meta.description).toBe('Login flow test');
            expect(meta.size).toBeGreaterThan(0);
        });

        it('defaults url to initialUrl when url is missing', () => {
            const recordData = {
                record: {
                    metadata: { initialUrl: 'https://fallback.com' },
                    events: []
                }
            };
            const meta = buildRecordingMetadata('rec-2', recordData);
            expect(meta.url).toBe('https://fallback.com');
        });

        it('defaults url to "Unknown" when both url and initialUrl are missing', () => {
            const recordData = {
                record: { metadata: {}, events: [] }
            };
            const meta = buildRecordingMetadata('rec-3', recordData);
            expect(meta.url).toBe('Unknown');
        });

        it('defaults source to "extension"', () => {
            const recordData = {
                record: { metadata: {}, events: [] }
            };
            const meta = buildRecordingMetadata('rec-4', recordData);
            expect(meta.source).toBe('extension');
        });

        it('defaults tag and description to null', () => {
            const recordData = {
                record: { metadata: {}, events: [] }
            };
            const meta = buildRecordingMetadata('rec-5', recordData);
            expect(meta.tag).toBeNull();
            expect(meta.description).toBeNull();
        });

        it('defaults eventCount to 0 when events is missing', () => {
            const recordData = {
                record: { metadata: {} }
            };
            const meta = buildRecordingMetadata('rec-6', recordData);
            expect(meta.eventCount).toBe(0);
        });
    });

    describe('uploaded recording metadata', () => {
        it('always sets source to "upload" and hasProcessedVersion to true', () => {
            const recordData = {
                record: { metadata: { timestamp: 100 }, events: [] },
                source: 'extension' // should be overridden
            };
            const meta = buildUploadedRecordingMetadata('up-1', recordData, recordData);
            expect(meta.source).toBe('upload');
            expect(meta.hasProcessedVersion).toBe(true);
            expect(meta.hasVideo).toBe(false);
        });

        it('uses processed data for size calculation', () => {
            const recordData = {
                record: { metadata: {}, events: [1, 2, 3] }
            };
            const processedData = { record: { metadata: {}, events: [1] } };
            const meta = buildUploadedRecordingMetadata('up-2', recordData, processedData);
            // eventCount comes from original data, not processed
            expect(meta.eventCount).toBe(3);
            // size comes from processed data
            expect(meta.size).toBe(Buffer.byteLength(JSON.stringify(processedData)));
        });
    });

    describe('sortRecordings()', () => {
        it('sorts newest-first by timestamp', () => {
            const recordings = [
                { id: 'a', timestamp: '2024-01-01T00:00:00Z' },
                { id: 'c', timestamp: '2024-03-01T00:00:00Z' },
                { id: 'b', timestamp: '2024-02-01T00:00:00Z' }
            ];
            const sorted = sortRecordings(recordings);
            expect(sorted.map((r: any) => r.id)).toEqual(['c', 'b', 'a']);
        });

        it('handles numeric timestamps', () => {
            const recordings = [
                { id: 'old', timestamp: 1000 },
                { id: 'new', timestamp: 9000 },
                { id: 'mid', timestamp: 5000 }
            ];
            const sorted = sortRecordings(recordings);
            expect(sorted.map((r: any) => r.id)).toEqual(['new', 'mid', 'old']);
        });

        it('does not mutate the original array', () => {
            const original = [{ id: 'a', timestamp: 1 }, { id: 'b', timestamp: 2 }];
            sortRecordings(original);
            expect(original[0].id).toBe('a');
        });

        it('handles single-element array', () => {
            const recordings = [{ id: 'only', timestamp: 1000 }];
            expect(sortRecordings(recordings)).toHaveLength(1);
        });

        it('handles empty array', () => {
            expect(sortRecordings([])).toEqual([]);
        });
    });

    describe('mergeMetadataUpdates()', () => {
        it('merges updates into existing metadata', () => {
            const existing = { id: 'rec-1', tag: null, description: null };
            const result = mergeMetadataUpdates(existing, { tag: 'smoke' });
            expect(result.id).toBe('rec-1');
            expect(result.tag).toBe('smoke');
            expect(result.description).toBeNull();
        });

        it('adds lastModified timestamp', () => {
            const result = mergeMetadataUpdates({}, { tag: 'test' });
            expect(result.lastModified).toBeTypeOf('number');
            expect(result.lastModified).toBeGreaterThan(0);
        });

        it('updates can overwrite existing fields', () => {
            const existing = { tag: 'old', description: 'old desc' };
            const result = mergeMetadataUpdates(existing, { tag: 'new', description: 'new desc' });
            expect(result.tag).toBe('new');
            expect(result.description).toBe('new desc');
        });
    });

    describe('isMetaFile()', () => {
        it('matches .meta.json files', () => {
            expect(isMetaFile('rec-123.meta.json')).toBe(true);
        });

        it('does not match regular .json files', () => {
            expect(isMetaFile('rec-123.json')).toBe(false);
        });

        it('does not match partial .meta suffix', () => {
            expect(isMetaFile('something.meta')).toBe(false);
        });

        it('does not match directories', () => {
            expect(isMetaFile('rec-123')).toBe(false);
        });
    });
});
