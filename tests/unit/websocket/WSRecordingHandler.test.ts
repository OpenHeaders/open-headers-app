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
        appDataPath: '/tmp/test-app-data',
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

    // ------- constructor -------
    describe('constructor', () => {
        it('initializes with wsService reference', () => {
            expect(handler.wsService).toBe(mockService);
        });

        it('initializes with null videoCaptureService', () => {
            expect(handler.videoCaptureService).toBeNull();
        });
    });

    // ------- broadcastVideoRecordingState -------
    describe('broadcastVideoRecordingState', () => {
        it('broadcasts enabled=true to all clients', () => {
            handler.broadcastVideoRecordingState(true);
            expect(mockService._broadcastToAll).toHaveBeenCalledTimes(1);
            const message = JSON.parse(mockService._broadcastToAll.mock.calls[0][0]);
            expect(message.type).toBe('videoRecordingStateChanged');
            expect(message.enabled).toBe(true);
        });

        it('broadcasts enabled=false to all clients', () => {
            handler.broadcastVideoRecordingState(false);
            const message = JSON.parse(mockService._broadcastToAll.mock.calls[0][0]);
            expect(message.type).toBe('videoRecordingStateChanged');
            expect(message.enabled).toBe(false);
        });

        it('calls broadcastToAll with JSON string', () => {
            handler.broadcastVideoRecordingState(true);
            const rawMessage = mockService._broadcastToAll.mock.calls[0][0];
            expect(typeof rawMessage).toBe('string');
            expect(() => JSON.parse(rawMessage)).not.toThrow();
        });
    });

    // ------- broadcastRecordingHotkeyChange -------
    describe('broadcastRecordingHotkeyChange', () => {
        it('broadcasts hotkey change with enabled=true by default', () => {
            handler.broadcastRecordingHotkeyChange('Ctrl+Shift+R');
            expect(mockService._broadcastToAll).toHaveBeenCalledTimes(1);
            const message = JSON.parse(mockService._broadcastToAll.mock.calls[0][0]);
            expect(message.type).toBe('recordingHotkeyChanged');
            expect(message.hotkey).toBe('Ctrl+Shift+R');
            expect(message.enabled).toBe(true);
        });

        it('broadcasts hotkey change with enabled=false', () => {
            handler.broadcastRecordingHotkeyChange('Ctrl+Shift+R', false);
            const message = JSON.parse(mockService._broadcastToAll.mock.calls[0][0]);
            expect(message.enabled).toBe(false);
        });

        it('broadcasts hotkey change with enabled=true explicitly', () => {
            handler.broadcastRecordingHotkeyChange('Alt+R', true);
            const message = JSON.parse(mockService._broadcastToAll.mock.calls[0][0]);
            expect(message.hotkey).toBe('Alt+R');
            expect(message.enabled).toBe(true);
        });

        it('does not throw when broadcastToAll throws', () => {
            mockService._broadcastToAll.mockImplementation(() => { throw new Error('fail'); });
            expect(() => handler.broadcastRecordingHotkeyChange('Ctrl+R')).not.toThrow();
        });
    });

    // ------- _sendVideoRecordingStatus -------
    describe('_sendVideoRecordingStatus', () => {
        it('sends status to open websocket', () => {
            const mockWs = createMockWs();
            handler._sendVideoRecordingStatus(mockWs, 'rec-123', 'started');
            expect(mockWs.send).toHaveBeenCalledTimes(1);
            const message = JSON.parse(mockWs.send.mock.calls[0][0] as string);
            expect(message.type).toBe('videoRecordingStatus');
            expect(message.data.recordingId).toBe('rec-123');
            expect(message.data.status).toBe('started');
            expect(message.data.error).toBeNull();
        });

        it('sends status with error message', () => {
            const mockWs = createMockWs();
            handler._sendVideoRecordingStatus(mockWs, 'rec-456', 'error', 'Something went wrong');
            const message = JSON.parse(mockWs.send.mock.calls[0][0] as string);
            expect(message.data.status).toBe('error');
            expect(message.data.error).toBe('Something went wrong');
        });

        it('does not send when ws is null', () => {
            expect(() => handler._sendVideoRecordingStatus(null as unknown as WebSocket, 'rec-1', 'started')).not.toThrow();
        });

        it('does not send when ws readyState is not OPEN', () => {
            const mockWs = createMockWs(3); // CLOSED
            handler._sendVideoRecordingStatus(mockWs, 'rec-1', 'started');
            expect(mockWs.send).not.toHaveBeenCalled();
        });

        it('uses null for error when not provided', () => {
            const mockWs = createMockWs();
            handler._sendVideoRecordingStatus(mockWs, 'rec-1', 'stopped');
            const message = JSON.parse(mockWs.send.mock.calls[0][0] as string);
            expect(message.data.error).toBeNull();
        });
    });

    // ------- handleRecordingStateSync -------
    describe('handleRecordingStateSync', () => {
        it('does nothing when videoCaptureService is null', async () => {
            handler.videoCaptureService = null;
            const mockWs = createMockWs();
            await handler.handleRecordingStateSync(mockWs, { recordingId: 'r1', state: 'paused' });
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
            await handler.handleRecordingStateSync(mockWs, { recordingId: 'r1', state: 'paused' });
            expect(mockCapture.updateRecordingState).toHaveBeenCalledWith('r1', 'paused');
        });

        it('does not throw when updateRecordingState throws', async () => {
            const mockCapture = {
                initialize: vi.fn(),
                startRecording: vi.fn(),
                stopRecording: vi.fn(),
                updateRecordingState: vi.fn().mockRejectedValue(new Error('fail'))
            };
            handler.videoCaptureService = mockCapture as typeof handler.videoCaptureService;
            const mockWs = createMockWs();
            await expect(
                handler.handleRecordingStateSync(mockWs, { recordingId: 'r1', state: 'error' })
            ).resolves.not.toThrow();
        });
    });

    // ------- handleSaveRecordingMessage -------
    describe('handleSaveRecordingMessage', () => {
        it('generates record ID when metadata has no recordId', () => {
            const mockWs = createMockWs();
            const metadata: RecordingMetadata = { startTime: Date.now(), url: 'https://example.com', timestamp: 1000 };
            const data = {
                type: 'saveRecording',
                recording: {
                    record: {
                        metadata,
                        events: [{ type: 'click', timestamp: 0 }]
                    }
                }
            };

            handler.handleSaveRecording = vi.fn().mockResolvedValue({ success: true, recordId: 'test-id' });
            handler.notifyRecordingProcessing = vi.fn();

            handler.handleSaveRecordingMessage(mockWs, data);

            expect(metadata.recordId).toBeDefined();
            expect(metadata.recordId).toMatch(/^record-/);
        });

        it('uses existing recordId when present', () => {
            const mockWs = createMockWs();
            const metadata: RecordingMetadata = { startTime: Date.now(), recordId: 'existing-id', url: 'https://example.com' };
            const data = {
                type: 'saveRecording',
                recording: {
                    record: {
                        metadata,
                        events: []
                    }
                }
            };

            handler.handleSaveRecording = vi.fn().mockResolvedValue({ success: true, recordId: 'existing-id' });
            handler.notifyRecordingProcessing = vi.fn();

            handler.handleSaveRecordingMessage(mockWs, data);

            expect(metadata.recordId).toBe('existing-id');
        });

        it('focuses app with record-viewer tab', () => {
            const mockWs = createMockWs();
            const data = {
                type: 'saveRecording',
                recording: {
                    record: {
                        metadata: { startTime: Date.now(), recordId: 'rec-1', url: 'https://example.com' } satisfies RecordingMetadata,
                        events: []
                    }
                }
            };

            handler.handleSaveRecording = vi.fn().mockResolvedValue({ success: true, recordId: 'rec-1' });
            handler.notifyRecordingProcessing = vi.fn();

            handler.handleSaveRecordingMessage(mockWs, data);

            expect(mockService._handleFocusApp).toHaveBeenCalledWith({
                tab: 'record-viewer',
                action: 'highlight',
                itemId: 'rec-1'
            });
        });

        it('calls notifyRecordingProcessing with metadata', () => {
            const mockWs = createMockWs();
            const data = {
                type: 'saveRecording',
                recording: {
                    record: {
                        metadata: { startTime: Date.now(), recordId: 'rec-2', url: 'https://test.com', timestamp: 12345 } satisfies RecordingMetadata,
                        events: [{ type: 'a', timestamp: 0 }, { type: 'b', timestamp: 1 }]
                    }
                }
            };

            handler.handleSaveRecording = vi.fn().mockResolvedValue({ success: true, recordId: 'rec-2' });
            handler.notifyRecordingProcessing = vi.fn();

            handler.handleSaveRecordingMessage(mockWs, data);

            expect(handler.notifyRecordingProcessing).toHaveBeenCalledWith('rec-2', {
                url: 'https://test.com',
                timestamp: 12345,
                eventCount: 2
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
            expect((data.recording.record as { metadata?: RecordingMetadata }).metadata?.recordId).toMatch(/^record-/);
        });
    });
});
