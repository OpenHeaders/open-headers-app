import electron from 'electron';
const { ipcRenderer } = electron;

const recordingAPI = {
    // Recording storage APIs
    loadRecordings: (): Promise<unknown> => ipcRenderer.invoke('loadRecordings'),
    loadRecording: (recordId: string): Promise<unknown> => ipcRenderer.invoke('loadRecording', recordId),
    saveRecording: (recordData: unknown): Promise<unknown> => ipcRenderer.invoke('saveRecording', recordData),
    saveUploadedRecording: (recordData: unknown): Promise<unknown> => ipcRenderer.invoke('saveUploadedRecording', recordData),
    deleteRecording: (recordId: string): Promise<unknown> => ipcRenderer.invoke('deleteRecording', recordId),
    downloadRecording: (record: unknown): Promise<unknown> => ipcRenderer.invoke('downloadRecording', record),
    updateRecordingMetadata: (data: unknown): Promise<unknown> => ipcRenderer.invoke('updateRecordingMetadata', data),

    // Record recording events from extension
    onOpenRecordRecording: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (_: unknown, data: unknown) => callback(data);
        ipcRenderer.on('open-record-recording', subscription);
        return () => ipcRenderer.removeListener('open-record-recording', subscription);
    },

    // Recording received event
    onRecordingReceived: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (_: unknown, data: unknown) => callback(data);
        ipcRenderer.on('recording-received', subscription);
        return () => ipcRenderer.removeListener('recording-received', subscription);
    },

    // Recording deleted event
    onRecordingDeleted: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (_: unknown, data: unknown) => callback(data);
        ipcRenderer.on('recording-deleted', subscription);
        return () => ipcRenderer.removeListener('recording-deleted', subscription);
    },

    onRecordingMetadataUpdated: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (_: unknown, data: unknown) => callback(data);
        ipcRenderer.on('recording-metadata-updated', subscription);
        return () => ipcRenderer.removeListener('recording-metadata-updated', subscription);
    },

    // Recording processing events
    onRecordingProcessing: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (_: unknown, data: unknown) => callback(data);
        ipcRenderer.on('recording-processing', subscription);
        return () => ipcRenderer.removeListener('recording-processing', subscription);
    },

    onRecordingProgress: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (_: unknown, data: unknown) => callback(data);
        ipcRenderer.on('recording-progress', subscription);
        return () => ipcRenderer.removeListener('recording-progress', subscription);
    }
};

export default recordingAPI;
