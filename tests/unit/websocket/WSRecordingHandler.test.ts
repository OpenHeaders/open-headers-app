import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WSRecordingHandler } from '../../../src/services/websocket/ws-recording-handler';

// Mock atomicFileWriter
vi.mock('../../../src/utils/atomicFileWriter', () => ({
    default: {
        writeJson: vi.fn().mockResolvedValue(undefined)
    }
}));

function createMockWSService(): ConstructorParameters<typeof WSRecordingHandler>[0] {
    return {
        appDataPath: '/tmp/test-app-data',
        _broadcastToAll: vi.fn().mockReturnValue(3),
        _handleFocusApp: vi.fn()
    };
}

// WebSocket.OPEN constant
const WS_OPEN = 1;

describe('WSRecordingHandler', () => {
    let handler: WSRecordingHandler;
    let mockService: ReturnType<typeof createMockWSService>;

    beforeEach(() => {
        mockService = createMockWSService();
        handler = new WSRecordingHandler(mockService);
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
            const mockWs = { readyState: WS_OPEN, send: vi.fn() };
            handler._sendVideoRecordingStatus(mockWs, 'rec-123', 'started');
            expect(mockWs.send).toHaveBeenCalledTimes(1);
            const message = JSON.parse(mockWs.send.mock.calls[0][0]);
            expect(message.type).toBe('videoRecordingStatus');
            expect(message.data.recordingId).toBe('rec-123');
            expect(message.data.status).toBe('started');
            expect(message.data.error).toBeNull();
        });

        it('sends status with error message', () => {
            const mockWs = { readyState: WS_OPEN, send: vi.fn() };
            handler._sendVideoRecordingStatus(mockWs, 'rec-456', 'error', 'Something went wrong');
            const message = JSON.parse(mockWs.send.mock.calls[0][0]);
            expect(message.data.status).toBe('error');
            expect(message.data.error).toBe('Something went wrong');
        });

        it('does not send when ws is null', () => {
            expect(() => handler._sendVideoRecordingStatus(null, 'rec-1', 'started')).not.toThrow();
        });

        it('does not send when ws readyState is not OPEN', () => {
            const mockWs = { readyState: 3, send: vi.fn() }; // CLOSED
            handler._sendVideoRecordingStatus(mockWs, 'rec-1', 'started');
            expect(mockWs.send).not.toHaveBeenCalled();
        });

        it('uses null for error when not provided', () => {
            const mockWs = { readyState: WS_OPEN, send: vi.fn() };
            handler._sendVideoRecordingStatus(mockWs, 'rec-1', 'stopped');
            const message = JSON.parse(mockWs.send.mock.calls[0][0]);
            expect(message.data.error).toBeNull();
        });
    });

    // ------- handleRecordingStateSync -------
    describe('handleRecordingStateSync', () => {
        it('does nothing when videoCaptureService is null', async () => {
            handler.videoCaptureService = null;
            const mockWs = { readyState: WS_OPEN, send: vi.fn() };
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
            handler.videoCaptureService = mockCapture;
            const mockWs = { readyState: WS_OPEN, send: vi.fn() };
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
            handler.videoCaptureService = mockCapture;
            const mockWs = { readyState: WS_OPEN, send: vi.fn() };
            await expect(
                handler.handleRecordingStateSync(mockWs, { recordingId: 'r1', state: 'error' })
            ).resolves.not.toThrow();
        });
    });

    // ------- handleSaveRecordingMessage -------
    describe('handleSaveRecordingMessage', () => {
        it('generates record ID when metadata has no recordId', () => {
            const mockWs = { readyState: WS_OPEN, send: vi.fn() };
            const data = {
                type: 'saveRecording',
                recording: {
                    record: {
                        metadata: { url: 'https://example.com', timestamp: 1000 },
                        events: [{ type: 'click' }]
                    }
                }
            };

            // handleSaveRecording is async and will fail due to missing electron require,
            // but the ID generation is synchronous
            handler.handleSaveRecording = vi.fn().mockResolvedValue({ success: true, recordId: 'test-id' });
            handler.notifyRecordingProcessing = vi.fn();

            handler.handleSaveRecordingMessage(mockWs, data);

            // Should have generated a recordId
            expect(data.recording.record.metadata.recordId).toBeDefined();
            expect(data.recording.record.metadata.recordId).toMatch(/^record-/);
        });

        it('uses existing recordId when present', () => {
            const mockWs = { readyState: WS_OPEN, send: vi.fn() };
            const data = {
                type: 'saveRecording',
                recording: {
                    record: {
                        metadata: { recordId: 'existing-id', url: 'https://example.com' },
                        events: []
                    }
                }
            };

            handler.handleSaveRecording = vi.fn().mockResolvedValue({ success: true, recordId: 'existing-id' });
            handler.notifyRecordingProcessing = vi.fn();

            handler.handleSaveRecordingMessage(mockWs, data);

            expect(data.recording.record.metadata.recordId).toBe('existing-id');
        });

        it('focuses app with record-viewer tab', () => {
            const mockWs = { readyState: WS_OPEN, send: vi.fn() };
            const data = {
                type: 'saveRecording',
                recording: {
                    record: {
                        metadata: { recordId: 'rec-1', url: 'https://example.com' },
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
            const mockWs = { readyState: WS_OPEN, send: vi.fn() };
            const data = {
                type: 'saveRecording',
                recording: {
                    record: {
                        metadata: { recordId: 'rec-2', url: 'https://test.com', timestamp: 12345 },
                        events: [{ type: 'a' }, { type: 'b' }]
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
            const mockWs = { readyState: WS_OPEN, send: vi.fn() };
            const data = {
                type: 'saveRecording',
                recording: {
                    record: { events: [] }
                }
            };

            handler.handleSaveRecording = vi.fn().mockResolvedValue({ success: true, recordId: 'test' });
            handler.notifyRecordingProcessing = vi.fn();

            handler.handleSaveRecordingMessage(mockWs, data);

            expect(data.recording.record.metadata).toBeDefined();
            expect(data.recording.record.metadata.recordId).toMatch(/^record-/);
        });
    });
});
