import type { IpcRendererEvent } from 'electron';
import electron from 'electron';

const { ipcRenderer } = electron;

const videoAPI = {
  onStartVideoRecording: (callback: (data: VideoRecordingEvent) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, data: VideoRecordingEvent) => callback(data);
    ipcRenderer.on('start-video-recording', subscription);
    return () => ipcRenderer.removeListener('start-video-recording', subscription);
  },

  onStopVideoRecording: (callback: (data: VideoRecordingEvent) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, data: VideoRecordingEvent) => callback(data);
    ipcRenderer.on('stop-video-recording', subscription);
    return () => ipcRenderer.removeListener('stop-video-recording', subscription);
  },

  sendVideoRecordingStarted: (channel: string, result: { success: boolean; error?: string }): void => {
    ipcRenderer.send(channel, result);
  },

  sendVideoRecordingStopped: (
    channel: string,
    result: { success: boolean; error?: string } | { success: boolean },
  ): void => {
    ipcRenderer.send(channel, result);
  },

  checkFFmpeg: (): Promise<{ available: boolean } | boolean> => ipcRenderer.invoke('check-ffmpeg'),
  downloadFFmpeg: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('download-ffmpeg'),
  convertVideo: (inputPath: string, outputPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('convert-video', inputPath, outputPath),
  exportVideo: (recordingPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('export-video', recordingPath),

  onFFmpegDownloadProgress: (callback: (data: FFmpegDownloadProgressEvent) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, data: FFmpegDownloadProgressEvent) => callback(data);
    ipcRenderer.on('ffmpeg-download-progress', subscription);
    return () => ipcRenderer.removeListener('ffmpeg-download-progress', subscription);
  },

  onFFmpegInstallStatus: (callback: (data: FFmpegInstallStatusEvent) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, data: FFmpegInstallStatusEvent) => callback(data);
    ipcRenderer.on('ffmpeg-install-status', subscription);
    return () => ipcRenderer.removeListener('ffmpeg-install-status', subscription);
  },

  onVideoConversionProgress: (callback: (data: VideoConversionProgressEvent) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, data: VideoConversionProgressEvent) => callback(data);
    ipcRenderer.on('video-conversion-progress', subscription);
    return () => ipcRenderer.removeListener('video-conversion-progress', subscription);
  },
};

export default videoAPI;
