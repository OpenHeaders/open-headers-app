import electron from 'electron';
const { ipcRenderer } = electron;

const videoAPI = {
    onStartVideoRecording: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (_: unknown, data: unknown) => callback(data);
        ipcRenderer.on('start-video-recording', subscription);
        return () => ipcRenderer.removeListener('start-video-recording', subscription);
    },

    onStopVideoRecording: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (_: unknown, data: unknown) => callback(data);
        ipcRenderer.on('stop-video-recording', subscription);
        return () => ipcRenderer.removeListener('stop-video-recording', subscription);
    },

    sendVideoRecordingStarted: (channel: string, result: unknown): void => {
        ipcRenderer.send(channel, result);
    },

    sendVideoRecordingStopped: (channel: string, result: unknown): void => {
        ipcRenderer.send(channel, result);
    },

    checkFFmpeg: (): Promise<unknown> => ipcRenderer.invoke('check-ffmpeg'),
    downloadFFmpeg: (): Promise<unknown> => ipcRenderer.invoke('download-ffmpeg'),
    convertVideo: (inputPath: string, outputPath: string): Promise<unknown> => ipcRenderer.invoke('convert-video', inputPath, outputPath),
    exportVideo: (recordingPath: string): Promise<unknown> => ipcRenderer.invoke('export-video', recordingPath),

    onFFmpegDownloadProgress: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (_: unknown, data: unknown) => callback(data);
        ipcRenderer.on('ffmpeg-download-progress', subscription);
        return () => ipcRenderer.removeListener('ffmpeg-download-progress', subscription);
    },

    onFFmpegInstallStatus: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (_: unknown, data: unknown) => callback(data);
        ipcRenderer.on('ffmpeg-install-status', subscription);
        return () => ipcRenderer.removeListener('ffmpeg-install-status', subscription);
    },

    onVideoConversionProgress: (callback: (data: unknown) => void): (() => void) => {
        const subscription = (_: unknown, data: unknown) => callback(data);
        ipcRenderer.on('video-conversion-progress', subscription);
        return () => ipcRenderer.removeListener('video-conversion-progress', subscription);
    }
};

export default videoAPI;
