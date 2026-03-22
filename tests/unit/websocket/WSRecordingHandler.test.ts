import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import type WebSocket from 'ws';
import { WSRecordingHandler } from '../../../src/services/websocket/ws-recording-handler';
import type { RecordingMetadata } from '../../../src/types/recording';

// Mock atomicFileWriter
vi.mock('../../../src/utils/atomicFileWriter', () => ({
    default: {
        writeJson: vi.fn().mockResolvedValue(undefined)
    }
}));

interface MockWSService {
    appDataPath: string;
    _broadcastToAll: Mock<(message: string) => number>;
    _handleFocusApp: Mock;
}

function createMockWSService(): MockWSService {
    return {
        appDataPath: '/Users/jane.doe/Library/Application Support/OpenHeaders',
        _broadcastToAll: vi.fn().mockReturnValue(3),
        _handleFocusApp: vi.fn()
    };
}

// WebSocket.OPEN constant
const WS_OPEN = 1;

function createMockWs(readyState = WS_OPEN) {
    return { readyState, send: vi.fn() } as unknown as WebSocket & { send: Mock };
}

describe('WSRecordingHandler', () => {
    let handler: WSRecordingHandler;
    let mockService: MockWSService;

    beforeEach(() => {
        mockService = createMockWSService();
        handler = new WSRecordingHandler(mockService as ConstructorParameters<typeof WSRecordingHandler>[0]);
    });

    describe('constructor', () => {
        it('initializes with wsService reference and null videoCaptureService', () => {
            expect(handler.wsService).toBe(mockService);
            expect(handler.videoCaptureService).toBeNull();
        });
    });

    describe('broadcastVideoRecordingState', () => {
        it('broadcasts enabled=true with correct message shape', () => {
            handler.broadcastVideoRecordingState(true);
            expect(mockService._broadcastToAll).toHaveBeenCalledTimes(1);
            const message = JSON.parse(mockService._broadcastToAll.mock.calls[0][0]);
            expect(message).toEqual({
                type: 'videoRecordingStateChanged',
                enabled: true,
            });
        });

        it('broadcasts enabled=false with correct message shape', () => {
            handler.broadcastVideoRecordingState(false);
            const message = JSON.parse(mockService._broadcastToAll.mock.calls[0][0]);
            expect(message).toEqual({
                type: 'videoRecordingStateChanged',
                enabled: false,
            });
        });

        it('sends JSON string to broadcastToAll', () => {
            handler.broadcastVideoRecordingState(true);
            const rawMessage = mockService._broadcastToAll.mock.calls[0][0];
            expect(typeof rawMessage).toBe('string');
            expect(() => JSON.parse(rawMessage)).not.toThrow();
        });
    });

    describe('broadcastRecordingHotkeyChange', () => {
        it('broadcasts hotkey change with enabled=true by default', () => {
            handler.broadcastRecordingHotkeyChange('CommandOrControl+Shift+E');
            expect(mockService._broadcastToAll).toHaveBeenCalledTimes(1);
            const message = JSON.parse(mockService._broadcastToAll.mock.calls[0][0]);
            expect(message).toEqual({
                type: 'recordingHotkeyChanged',
                hotkey: 'CommandOrControl+Shift+E',
                enabled: true,
            });
        });

        it('broadcasts hotkey change with enabled=false', () => {
            handler.broadcastRecordingHotkeyChange('Alt+Shift+R', false);
            const message = JSON.parse(mockService._broadcastToAll.mock.calls[0][0]);
            expect(message).toEqual({
                type: 'recordingHotkeyChanged',
                hotkey: 'Alt+Shift+R',
                enabled: false,
            });
        });

        it('broadcasts hotkey change with enabled=true explicitly', () => {
            handler.broadcastRecordingHotkeyChange('Ctrl+Shift+F12', true);
            const message = JSON.parse(mockService._broadcastToAll.mock.calls[0][0]);
            expect(message.hotkey).toBe('Ctrl+Shift+F12');
            expect(message.enabled).toBe(true);
        });

        it('does not throw when broadcastToAll throws', () => {
            mockService._broadcastToAll.mockImplementation(() => { throw new Error('WebSocket server crashed'); });
            expect(() => handler.broadcastRecordingHotkeyChange('Ctrl+R')).not.toThrow();
        });
    });

    describe('_sendVideoRecordingStatus', () => {
        it('sends full status shape to open websocket', () => {
            const mockWs = createMockWs();
            handler._sendVideoRecordingStatus(mockWs, 'record-1709123456789-x7y8z9', 'started');
            expect(mockWs.send).toHaveBeenCalledTimes(1);
            const message = JSON.parse(mockWs.send.mock.calls[0][0] as string);
            expect(message).toEqual({
                type: 'videoRecordingStatus',
                data: {
                    recordingId: 'record-1709123456789-x7y8z9',
                    status: 'started',
                    error: null,
                },
            });
        });

        it('sends status with error message', () => {
            const mockWs = createMockWs();
            handler._sendVideoRecordingStatus(
                mockWs,
                'record-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                'error',
                'FFmpeg not installed — video recording requires FFmpeg 6.0+'
            );
            const message = JSON.parse(mockWs.send.mock.calls[0][0] as string);
            expect(message.data).toEqual({
                recordingId: 'record-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                status: 'error',
                error: 'FFmpeg not installed — video recording requires FFmpeg 6.0+',
            });
        });

        it('sends stopped status with null error', () => {
            const mockWs = createMockWs();
            handler._sendVideoRecordingStatus(mockWs, 'rec-abc', 'stopped');
            const message = JSON.parse(mockWs.send.mock.calls[0][0] as string);
            expect(message.data.status).toBe('stopped');
            expect(message.data.error).toBeNull();
        });

        it('sends disabled status with explanation', () => {
            const mockWs = createMockWs();
            handler._sendVideoRecordingStatus(mockWs, 'rec-abc', 'disabled', 'Video recording is disabled in settings');
            const message = JSON.parse(mockWs.send.mock.calls[0][0] as string);
            expect(message.data.status).toBe('disabled');
            expect(message.data.error).toBe('Video recording is disabled in settings');
        });

        it('does not send when ws is null', () => {
            expect(() => handler._sendVideoRecordingStatus(null as unknown as WebSocket, 'rec-1', 'started')).not.toThrow();
        });

        it('does not send when ws readyState is CLOSED (3)', () => {
            const mockWs = createMockWs(3);
            handler._sendVideoRecordingStatus(mockWs, 'rec-1', 'started');
            expect(mockWs.send).not.toHaveBeenCalled();
        });

        it('does not send when ws readyState is CLOSING (2)', () => {
            const mockWs = createMockWs(2);
            handler._sendVideoRecordingStatus(mockWs, 'rec-1', 'started');
            expect(mockWs.send).not.toHaveBeenCalled();
        });

        it('does not send when ws readyState is CONNECTING (0)', () => {
            const mockWs = createMockWs(0);
            handler._sendVideoRecordingStatus(mockWs, 'rec-1', 'started');
            expect(mockWs.send).not.toHaveBeenCalled();
        });
    });

    describe('handleRecordingStateSync', () => {
        it('does nothing when videoCaptureService is null', async () => {
            handler.videoCaptureService = null;
            const mockWs = createMockWs();
            await handler.handleRecordingStateSync(mockWs, {
                recordingId: 'record-1709123456789-x7y8z9',
                state: 'paused',
            });
            // Should not throw
        });

        it('calls updateRecordingState when service is available', async () => {
            const mockCapture = {
                initialize: vi.fn(),
                startRecording: vi.fn(),
                stopRecording: vi.fn(),
                updateRecordingState: vi.fn().mockResolvedValue(undefined)
            };
            handler.videoCaptureService = mockCapture as typeof handler.videoCaptureService;
            const mockWs = createMockWs();

            await handler.handleRecordingStateSync(mockWs, {
                recordingId: 'record-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                state: 'recording',
            });

            expect(mockCapture.updateRecordingState).toHaveBeenCalledWith(
                'record-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                'recording'
            );
        });

        it('handles various recording states', async () => {
            const mockCapture = {
                initialize: vi.fn(),
                startRecording: vi.fn(),
                stopRecording: vi.fn(),
                updateRecordingState: vi.fn().mockResolvedValue(undefined)
            };
            handler.videoCaptureService = mockCapture as typeof handler.videoCaptureService;
            const mockWs = createMockWs();

            const states = ['recording', 'paused', 'stopped', 'error'];
            for (const state of states) {
                await handler.handleRecordingStateSync(mockWs, { recordingId: 'rec-1', state });
            }
            expect(mockCapture.updateRecordingState).toHaveBeenCalledTimes(4);
        });

        it('does not throw when updateRecordingState throws', async () => {
            const mockCapture = {
                initialize: vi.fn(),
                startRecording: vi.fn(),
                stopRecording: vi.fn(),
                updateRecordingState: vi.fn().mockRejectedValue(new Error('Database write failed'))
            };
            handler.videoCaptureService = mockCapture as typeof handler.videoCaptureService;
            const mockWs = createMockWs();

            await expect(
                handler.handleRecordingStateSync(mockWs, { recordingId: 'rec-1', state: 'error' })
            ).resolves.not.toThrow();
        });
    });

    describe('handleSaveRecordingMessage', () => {
        it('generates record ID when metadata has no recordId', () => {
            const mockWs = createMockWs();
            const metadata: RecordingMetadata = {
                startTime: 1709123456789,
                url: 'https://app.openheaders.io/dashboard/sources',
                timestamp: 1709123456789,
            };
            const data = {
                type: 'saveRecording',
                recording: {
                    record: {
                        metadata,
                        events: [{ type: 'rrweb', timestamp: 1709123456789, data: { type: 4 } }]
                    }
                }
            };

            handler.handleSaveRecording = vi.fn().mockResolvedValue({ success: true, recordId: 'generated-id' });
            handler.notifyRecordingProcessing = vi.fn();

            handler.handleSaveRecordingMessage(mockWs, data);

            expect(metadata.recordId).toBeDefined();
            expect(metadata.recordId).toMatch(/^record-\d+-[a-z0-9]+$/);
        });

        it('uses existing recordId when present', () => {
            const mockWs = createMockWs();
            const recordId = 'record-1709123456789-x7y8z9a1b';
            const metadata: RecordingMetadata = {
                startTime: 1709123456789,
                recordId,
                url: 'https://app.openheaders.io/dashboard',
            };
            const data = {
                type: 'saveRecording',
                recording: {
                    record: {
                        metadata,
                        events: []
                    }
                }
            };

            handler.handleSaveRecording = vi.fn().mockResolvedValue({ success: true, recordId });
            handler.notifyRecordingProcessing = vi.fn();

            handler.handleSaveRecordingMessage(mockWs, data);

            expect(metadata.recordId).toBe(recordId);
        });

        it('focuses app with record-viewer tab and highlight action', () => {
            const mockWs = createMockWs();
            const recordId = 'record-1709123456789-a1b2c3d4e';
            const data = {
                type: 'saveRecording',
                recording: {
                    record: {
                        metadata: {
                            startTime: 1709123456789,
                            recordId,
                            url: 'https://app.openheaders.io/recordings',
                        } satisfies RecordingMetadata,
                        events: []
                    }
                }
            };

            handler.handleSaveRecording = vi.fn().mockResolvedValue({ success: true, recordId });
            handler.notifyRecordingProcessing = vi.fn();

            handler.handleSaveRecordingMessage(mockWs, data);

            expect(mockService._handleFocusApp).toHaveBeenCalledWith({
                tab: 'record-viewer',
                action: 'highlight',
                itemId: recordId,
            });
        });

        it('calls notifyRecordingProcessing with correct metadata', () => {
            const mockWs = createMockWs();
            const recordId = 'record-1709123456789-f5g6h7i8j';
            const data = {
                type: 'saveRecording',
                recording: {
                    record: {
                        metadata: {
                            startTime: 1709123456789,
                            recordId,
                            url: 'https://auth.openheaders.internal:8443/oauth2/authorize',
                            timestamp: 1709123456789,
                        } satisfies RecordingMetadata,
                        events: [
                            { type: 'rrweb', timestamp: 1709123456789 },
                            { type: 'rrweb', timestamp: 1709123456800 },
                            { type: 'rrweb', timestamp: 1709123456900 },
                        ]
                    }
                }
            };

            handler.handleSaveRecording = vi.fn().mockResolvedValue({ success: true, recordId });
            handler.notifyRecordingProcessing = vi.fn();

            handler.handleSaveRecordingMessage(mockWs, data);

            expect(handler.notifyRecordingProcessing).toHaveBeenCalledWith(recordId, {
                url: 'https://auth.openheaders.internal:8443/oauth2/authorize',
                timestamp: 1709123456789,
                eventCount: 3,
            });
        });

        it('creates record and metadata objects when missing', () => {
            const mockWs = createMockWs();
            const data = {
                type: 'saveRecording',
                recording: {
                    record: { events: [] as { type: string; timestamp: number }[] }
                }
            };

            handler.handleSaveRecording = vi.fn().mockResolvedValue({ success: true, recordId: 'test' });
            handler.notifyRecordingProcessing = vi.fn();

            handler.handleSaveRecordingMessage(mockWs, data);

            expect(data.recording.record).toHaveProperty('metadata');
            const metadata = (data.recording.record as { metadata?: RecordingMetadata }).metadata;
            expect(metadata?.recordId).toMatch(/^record-/);
            expect(metadata?.startTime).toBeGreaterThan(0);
        });

        it('handles saveWorkflow type the same as saveRecording', () => {
            const mockWs = createMockWs();
            const recordId = 'record-1709123456789-workflow';
            const data = {
                type: 'saveWorkflow',
                recording: {
                    record: {
                        metadata: {
                            startTime: 1709123456789,
                            recordId,
                            url: 'https://app.openheaders.io/workflows',
                        } satisfies RecordingMetadata,
                        events: []
                    }
                }
            };

            handler.handleSaveRecording = vi.fn().mockResolvedValue({ success: true, recordId });
            handler.notifyRecordingProcessing = vi.fn();

            handler.handleSaveRecordingMessage(mockWs, data);

            expect(mockService._handleFocusApp).toHaveBeenCalledWith({
                tab: 'record-viewer',
                action: 'highlight',
                itemId: recordId,
            });
            expect(handler.handleSaveRecording).toHaveBeenCalled();
        });

        it('sends success response back to ws after save completes', async () => {
            const mockWs = createMockWs();
            const recordId = 'record-1709123456789-success';

            let resolvePromise!: (value: { success: boolean; recordId: string }) => void;
            const savePromise = new Promise<{ success: boolean; recordId: string }>((resolve) => {
                resolvePromise = resolve;
            });
            handler.handleSaveRecording = vi.fn().mockReturnValue(savePromise);
            handler.notifyRecordingProcessing = vi.fn();

            handler.handleSaveRecordingMessage(mockWs, {
                type: 'saveRecording',
                recording: {
                    record: {
                        metadata: { startTime: 1709123456789, recordId, url: 'https://openheaders.io' } satisfies RecordingMetadata,
                        events: [],
                    }
                }
            });

            // Resolve the save promise
            resolvePromise({ success: true, recordId });
            await vi.waitFor(() => {
                expect(mockWs.send).toHaveBeenCalled();
            });

            const responseMsg = JSON.parse(mockWs.send.mock.calls[0][0] as string);
            expect(responseMsg).toEqual({
                type: 'saveRecordingResponse',
                success: true,
                recordId,
            });
        });

        it('sends error response back to ws on save failure', async () => {
            const mockWs = createMockWs();
            const recordId = 'record-1709123456789-fail';

            handler.handleSaveRecording = vi.fn().mockRejectedValue(new Error('Disk full'));
            handler.notifyRecordingProcessing = vi.fn();

            handler.handleSaveRecordingMessage(mockWs, {
                type: 'saveRecording',
                recording: {
                    record: {
                        metadata: { startTime: 1709123456789, recordId, url: 'https://openheaders.io' } satisfies RecordingMetadata,
                        events: [],
                    }
                }
            });

            await vi.waitFor(() => {
                expect(mockWs.send).toHaveBeenCalled();
            });

            const responseMsg = JSON.parse(mockWs.send.mock.calls[0][0] as string);
            expect(responseMsg).toEqual({
                type: 'saveRecordingResponse',
                success: false,
                error: 'Disk full',
            });
        });

        it('does not crash when ws is closed during save', async () => {
            const closedWs = createMockWs(3); // CLOSED
            const recordId = 'record-1709123456789-closed';

            handler.handleSaveRecording = vi.fn().mockResolvedValue({ success: true, recordId });
            handler.notifyRecordingProcessing = vi.fn();

            // Should not throw even though ws is closed
            handler.handleSaveRecordingMessage(closedWs, {
                type: 'saveRecording',
                recording: {
                    record: {
                        metadata: { startTime: 1709123456789, recordId, url: 'https://openheaders.io' } satisfies RecordingMetadata,
                        events: [],
                    }
                }
            });

            // Wait for async completion
            await vi.waitFor(() => {
                expect(handler.handleSaveRecording).toHaveBeenCalled();
            });
            // No response sent since ws is closed
            expect(closedWs.send).not.toHaveBeenCalled();
        });
    });
});
