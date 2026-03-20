import electron from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { RecordingData } from '../../services/websocket/utils/recordingPreprocessor';

const { ipcRenderer } = electron;

const recordingAPI = {
    loadRecordings: (): Promise<RecordingMetadataEvent[]> => ipcRenderer.invoke('loadRecordings'),
    loadRecording: (recordId: string): Promise<RecordingData> => ipcRenderer.invoke('loadRecording', recordId),
    saveRecording: (recordData: RecordingData): Promise<{ success: boolean; recordId?: string }> => ipcRenderer.invoke('saveRecording', recordData),
    saveUploadedRecording: (recordData: RecordingData): Promise<{ success: boolean; recordId?: string }> => ipcRenderer.invoke('saveUploadedRecording', recordData),
    deleteRecording: (recordId: string): Promise<{ success: boolean }> => ipcRenderer.invoke('deleteRecording', recordId),
    downloadRecording: (record: RecordingMetadataEvent): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('downloadRecording', record),
    updateRecordingMetadata: (data: RecordingMetadataUpdateRequest): Promise<{ success: boolean; metadata?: RecordingMetadataEvent }> => ipcRenderer.invoke('updateRecordingMetadata', data),

    onOpenRecordRecording: (callback: (data: { recordId: string }) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, data: { recordId: string }) => callback(data);
        ipcRenderer.on('open-record-recording', subscription);
        return () => ipcRenderer.removeListener('open-record-recording', subscription);
    },

    onRecordingReceived: (callback: (data: RecordingMetadataEvent) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, data: RecordingMetadataEvent) => callback(data);
        ipcRenderer.on('recording-received', subscription);
        return () => ipcRenderer.removeListener('recording-received', subscription);
    },

    onRecordingDeleted: (callback: (data: { recordId: string }) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, data: { recordId: string }) => callback(data);
        ipcRenderer.on('recording-deleted', subscription);
        return () => ipcRenderer.removeListener('recording-deleted', subscription);
    },

    onRecordingMetadataUpdated: (callback: (data: { recordId: string; updates: RecordingMetadataUpdateRequest['updates']; metadata?: RecordingMetadataEvent }) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, data: { recordId: string; updates: RecordingMetadataUpdateRequest['updates']; metadata?: RecordingMetadataEvent }) => callback(data);
        ipcRenderer.on('recording-metadata-updated', subscription);
        return () => ipcRenderer.removeListener('recording-metadata-updated', subscription);
    },

    onRecordingProcessing: (callback: (data: RecordingProcessingEvent) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, data: RecordingProcessingEvent) => callback(data);
        ipcRenderer.on('recording-processing', subscription);
        return () => ipcRenderer.removeListener('recording-processing', subscription);
    },

    onRecordingProgress: (callback: (data: RecordingProgressEvent) => void): (() => void) => {
        const subscription = (_event: IpcRendererEvent, data: RecordingProgressEvent) => callback(data);
        ipcRenderer.on('recording-progress', subscription);
        return () => ipcRenderer.removeListener('recording-progress', subscription);
    }
};

export default recordingAPI;
