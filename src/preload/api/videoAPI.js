const { ipcRenderer } = require('electron');

const videoAPI = {
    onStartVideoRecording: (callback) => {
        const subscription = (_, data) => callback(data);
        ipcRenderer.on('start-video-recording', subscription);
        return () => ipcRenderer.removeListener('start-video-recording', subscription);
    },

    onStopVideoRecording: (callback) => {
        const subscription = (_, data) => callback(data);
        ipcRenderer.on('stop-video-recording', subscription);
        return () => ipcRenderer.removeListener('stop-video-recording', subscription);
    },

    sendVideoRecordingStarted: (channel, result) => {
        ipcRenderer.send(channel, result);
    },

    sendVideoRecordingStopped: (channel, result) => {
        ipcRenderer.send(channel, result);
    },

    checkFFmpeg: () => ipcRenderer.invoke('check-ffmpeg'),
    downloadFFmpeg: () => ipcRenderer.invoke('download-ffmpeg'),
    convertVideo: (inputPath, outputPath) => ipcRenderer.invoke('convert-video', inputPath, outputPath),

    onFFmpegDownloadProgress: (callback) => {
        const subscription = (_, data) => callback(data);
        ipcRenderer.on('ffmpeg-download-progress', subscription);
        return () => ipcRenderer.removeListener('ffmpeg-download-progress', subscription);
    },

    onFFmpegInstallStatus: (callback) => {
        const subscription = (_, data) => callback(data);
        ipcRenderer.on('ffmpeg-install-status', subscription);
        return () => ipcRenderer.removeListener('ffmpeg-install-status', subscription);
    },

    onVideoConversionProgress: (callback) => {
        const subscription = (_, data) => callback(data);
        ipcRenderer.on('video-conversion-progress', subscription);
        return () => ipcRenderer.removeListener('video-conversion-progress', subscription);
    }
};

module.exports = videoAPI;