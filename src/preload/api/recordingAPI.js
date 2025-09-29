const { ipcRenderer } = require('electron');

const recordingAPI = {
    // Recording storage APIs
    loadRecordings: () => ipcRenderer.invoke('loadRecordings'),
    loadRecording: (recordId) => ipcRenderer.invoke('loadRecording', recordId),
    saveRecording: (recordData) => ipcRenderer.invoke('saveRecording', recordData),
    saveUploadedRecording: (recordData) => ipcRenderer.invoke('saveUploadedRecording', recordData),
    deleteRecording: (recordId) => ipcRenderer.invoke('deleteRecording', recordId),
    downloadRecording: (record) => ipcRenderer.invoke('downloadRecording', record),
    updateRecordingMetadata: (data) => ipcRenderer.invoke('updateRecordingMetadata', data),
    
    // Record recording events from extension
    onOpenRecordRecording: (callback) => {
        const subscription = (_, data) => callback(data);
        ipcRenderer.on('open-record-recording', subscription);
        return () => ipcRenderer.removeListener('open-record-recording', subscription);
    },
    
    // Recording received event
    onRecordingReceived: (callback) => {
        const subscription = (_, data) => callback(data);
        ipcRenderer.on('recording-received', subscription);
        return () => ipcRenderer.removeListener('recording-received', subscription);
    },
    
    // Recording deleted event
    onRecordingDeleted: (callback) => {
        const subscription = (_, data) => callback(data);
        ipcRenderer.on('recording-deleted', subscription);
        return () => ipcRenderer.removeListener('recording-deleted', subscription);
    },
    
    onRecordingMetadataUpdated: (callback) => {
        const subscription = (_, data) => callback(data);
        ipcRenderer.on('recording-metadata-updated', subscription);
        return () => ipcRenderer.removeListener('recording-metadata-updated', subscription);
    },
    
    // Recording processing events
    onRecordingProcessing: (callback) => {
        const subscription = (_, data) => callback(data);
        ipcRenderer.on('recording-processing', subscription);
        return () => ipcRenderer.removeListener('recording-processing', subscription);
    },
    
    onRecordingProgress: (callback) => {
        const subscription = (_, data) => callback(data);
        ipcRenderer.on('recording-progress', subscription);
        return () => ipcRenderer.removeListener('recording-progress', subscription);
    }
};

module.exports = recordingAPI;