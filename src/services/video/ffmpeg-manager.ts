import electron from 'electron';
import { errorMessage as errMsg } from '../../types/common';
import https from 'https';
import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import mainLogger from '../../utils/mainLogger';

const { app, dialog } = electron;
const { exec } = child_process;
const { createLogger } = mainLogger;

const log = createLogger('FFmpegManager');

interface DownloadCallback {
    resolve: (value: string) => void;
    reject: (reason: Error) => void;
}

interface DownloadProgress {
    percent: number;
    downloaded: number;
    total: number;
}

interface ExecResult {
    stdout: string;
    stderr: string;
}

interface FFmpegCheckResult {
    available: boolean;
    path?: string;
    isSystem?: boolean;
}

/**
 * FFmpeg Manager for on-demand installation and management
 */
class FFmpegManager {
    ffmpegPath: string | null = null;
    platform: string = process.platform;
    ffmpegDir: string = '';
    isDownloading: boolean = false;
    downloadCallbacks: DownloadCallback[] = [];

    constructor() {
        try {
            this.ffmpegDir = path.join(app.getPath('userData'), 'ffmpeg');
        } catch {
            // Outside Electron (tests) — use temp path
            this.ffmpegDir = path.join('/tmp', 'ffmpeg');
        }
    }

    /**
     * Check if FFmpeg is available
     */
    async checkFFmpeg(): Promise<FFmpegCheckResult> {
        // First, check if we already downloaded FFmpeg
        const localFFmpeg = this.getLocalFFmpegPath();
        if (fs.existsSync(localFFmpeg)) {
            // Verify it works
            try {
                await this.execPromise(`"${localFFmpeg}" -version`);
                this.ffmpegPath = localFFmpeg;
                log.info('Found local FFmpeg at:', localFFmpeg);
                return { available: true, path: localFFmpeg };
            } catch (error: unknown) {
                log.warn('Local FFmpeg found but not working, removing:', errMsg(error));
                try {
                    await fs.promises.unlink(localFFmpeg);
                } catch (e) {
                    // Ignore deletion errors
                }
            }
        }

        // Check system FFmpeg
        const systemFFmpeg = await this.findSystemFFmpeg();
        if (systemFFmpeg) {
            this.ffmpegPath = systemFFmpeg;
            log.info('Found system FFmpeg at:', systemFFmpeg);
            return { available: true, path: systemFFmpeg, isSystem: true };
        }

        log.info('FFmpeg not found');
        return { available: false };
    }

    /**
     * Find system FFmpeg installation
     */
    async findSystemFFmpeg(): Promise<string | null> {
        const paths = process.platform === 'win32'
            ? ['ffmpeg.exe', 'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe', 'C:\\ffmpeg\\bin\\ffmpeg.exe']
            : ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg', 'ffmpeg'];

        for (const ffmpegPath of paths) {
            try {
                const result = await this.execPromise(`"${ffmpegPath}" -version`);
                log.info(`Found system FFmpeg: ${ffmpegPath} Version: ${result.stdout.split('\n')[0]}`);
                return ffmpegPath;
            } catch (e) {
                log.debug('FFmpeg not found at:', ffmpegPath);
                continue;
            }
        }
        return null;
    }

    /**
     * Get local FFmpeg path
     */
    getLocalFFmpegPath(): string {
        const filename = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
        return path.join(this.ffmpegDir, filename);
    }

    /**
     * Download FFmpeg with progress callback
     */
    async downloadFFmpeg(
        progressCallback?: (progress: DownloadProgress) => void,
        phaseCallback?: (phase: string) => void
    ): Promise<string> {
        // If already downloading, wait for it
        if (this.isDownloading) {
            return new Promise<string>((resolve, reject) => {
                this.downloadCallbacks.push({ resolve, reject });
            });
        }

        this.isDownloading = true;
        this.downloadCallbacks = [];

        try {
            // Determine the correct file based on platform and architecture
            const platform = process.platform;
            const arch = process.arch;
            let filename: string;

            if (platform === 'darwin') {
                filename = arch === 'arm64' ? 'ffmpeg-macos-arm64.zip' : 'ffmpeg-macos-x64.zip';
            } else if (platform === 'win32') {
                filename = 'ffmpeg-windows-x64.zip';
            } else if (platform === 'linux') {
                filename = arch === 'arm64' ? 'ffmpeg-linux-arm64.tar.gz' : 'ffmpeg-linux-x64.tar.gz';
            } else {
                throw new Error(`Unsupported platform: ${platform}`);
            }

            const url = `https://github.com/OpenHeaders/open-headers-app/releases/download/v2.12.0/${filename}`;
            log.info('Downloading FFmpeg from:', url);

            // Create directory
            await fs.promises.mkdir(this.ffmpegDir, { recursive: true });

            // Clean up any existing files to ensure fresh extraction
            try {
                const existingFiles = await fs.promises.readdir(this.ffmpegDir);
                for (const file of existingFiles) {
                    // Skip temp files that might be in use
                    if (file.startsWith('ffmpeg-temp')) continue;

                    const filePath = path.join(this.ffmpegDir, file);
                    const stat = await fs.promises.stat(filePath);
                    if (stat.isDirectory()) {
                        await fs.promises.rm(filePath, { recursive: true, force: true });
                    } else {
                        await fs.promises.unlink(filePath);
                    }
                }
                log.info('Cleaned up existing ffmpeg directory');
            } catch (cleanupError) {
                log.warn('Error cleaning up ffmpeg directory:', cleanupError);
            }

            // Download file
            const tempFile = path.join(this.ffmpegDir, 'ffmpeg-temp' + path.extname(url));
            await this.downloadFile(url, tempFile, progressCallback);

            // Extract file
            if (phaseCallback) phaseCallback('extracting');
            await this.extractFFmpeg(tempFile);

            // Clean up
            await fs.promises.unlink(tempFile);

            // Make executable on Unix systems
            if (process.platform !== 'win32') {
                const ffmpegPath = this.getLocalFFmpegPath();
                await fs.promises.chmod(ffmpegPath, '755');
            }

            this.ffmpegPath = this.getLocalFFmpegPath();

            // Verify FFmpeg works
            if (phaseCallback) phaseCallback('verifying');
            await this.verifyFFmpeg();

            log.info('FFmpeg downloaded and verified successfully');

            // Notify all waiting callbacks
            this.downloadCallbacks.forEach(cb => cb.resolve(this.ffmpegPath!));

            return this.ffmpegPath;

        } catch (error: unknown) {
            log.error('Failed to download FFmpeg:', error);

            // Notify all waiting callbacks
            const err = error instanceof Error ? error : new Error(String(error));
            this.downloadCallbacks.forEach(cb => cb.reject(err));

            throw error;
        } finally {
            this.isDownloading = false;
            this.downloadCallbacks = [];
        }
    }

    /**
     * Download file with progress
     */
    async downloadFile(
        url: string,
        destination: string,
        progressCallback?: (progress: DownloadProgress) => void
    ): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const file = fs.createWriteStream(destination);
            let downloadedSize = 0;

            const makeRequest = (urlToFollow: string) => {
                https.get(urlToFollow, (response) => {
                    // Handle redirects
                    if (response.statusCode === 302 || response.statusCode === 301) {
                        response.destroy();
                        makeRequest(response.headers.location!);
                        return;
                    }

                    if (response.statusCode !== 200) {
                        file.close();
                        fs.unlinkSync(destination);
                        reject(new Error(`Failed to download: ${response.statusCode}`));
                        return;
                    }

                    const totalSize = parseInt(response.headers['content-length'] as string, 10);

                    response.on('data', (chunk: Buffer) => {
                        downloadedSize += chunk.length;
                        if (progressCallback && totalSize) {
                            progressCallback({
                                percent: Math.round((downloadedSize / totalSize) * 100),
                                downloaded: downloadedSize,
                                total: totalSize
                            });
                        }
                    });

                    response.pipe(file);

                    file.on('finish', () => {
                        file.close(() => resolve());
                    });
                }).on('error', (err) => {
                    file.close();
                    if (fs.existsSync(destination)) {
                        fs.unlinkSync(destination);
                    }
                    reject(err);
                });
            };

            file.on('error', (err) => {
                if (fs.existsSync(destination)) {
                    fs.unlinkSync(destination);
                }
                reject(err);
            });

            makeRequest(url);
        });
    }

    /**
     * Extract FFmpeg from archive
     */
    async extractFFmpeg(archivePath: string): Promise<void> {
        const ext = path.extname(archivePath);

        if (ext === '.zip') {
            // Windows and macOS
            await this.extractZip(archivePath);
        } else if (ext === '.xz' || ext === '.tar') {
            // Linux
            await this.extractTar(archivePath);
        } else {
            throw new Error(`Unsupported archive format: ${ext}`);
        }
    }

    /**
     * Extract ZIP file
     */
    async extractZip(archivePath: string): Promise<void> {
        const zip = new AdmZip(archivePath);

        // Extract all contents to maintain directory structure
        zip.extractAllTo(this.ffmpegDir, true);
        log.info('Extracted all files to:', this.ffmpegDir);

        // Check if extraction created a nested directory (e.g., ffmpeg-macos-arm64-bundle)
        const extractedItems = await fs.promises.readdir(this.ffmpegDir);
        const bundleDir = extractedItems.find(item =>
            item.includes('ffmpeg') && item.includes('bundle')
        );

        if (bundleDir) {
            // Move contents from bundle directory to parent
            const bundlePath = path.join(this.ffmpegDir, bundleDir);
            const bundleContents = await fs.promises.readdir(bundlePath);

            log.info(`Found bundle directory: ${bundleDir}, moving contents up`);

            for (const item of bundleContents) {
                const sourcePath = path.join(bundlePath, item);
                const destPath = path.join(this.ffmpegDir, item);

                // Remove destination if it exists
                try {
                    await fs.promises.rm(destPath, { recursive: true, force: true });
                } catch (e) {
                    // Ignore errors
                }

                // Move item
                await fs.promises.rename(sourcePath, destPath);
            }

            // Remove empty bundle directory
            await fs.promises.rmdir(bundlePath);
            log.info('Moved bundle contents to ffmpeg directory');
        }

        // Verify the ffmpeg binary exists
        const ffmpegPath = this.getLocalFFmpegPath();
        if (!await this.fileExists(ffmpegPath)) {
            throw new Error('FFmpeg executable not found after extraction');
        }

        // Make ffmpeg executable
        await fs.promises.chmod(ffmpegPath, '755');

        // For macOS, also check if libs directory exists (for bundled dylibs)
        if (process.platform === 'darwin') {
            const libsPath = path.join(this.ffmpegDir, 'libs');
            if (await this.fileExists(libsPath)) {
                log.info('Found libs directory for macOS dynamic libraries');

                // Make all .dylib files executable
                const libFiles = await fs.promises.readdir(libsPath);
                for (const libFile of libFiles) {
                    if (libFile.endsWith('.dylib')) {
                        const libPath = path.join(libsPath, libFile);
                        await fs.promises.chmod(libPath, '755');
                    }
                }
            }
        }

        log.info('FFmpeg extraction completed successfully');
    }

    /**
     * Extract TAR file
     */
    async extractTar(archivePath: string): Promise<void> {
        // Extract all contents to maintain directory structure
        await tar.x({
            file: archivePath,
            cwd: this.ffmpegDir
        });

        // Verify the ffmpeg binary exists
        const ffmpegPath = this.getLocalFFmpegPath();
        if (!await this.fileExists(ffmpegPath)) {
            throw new Error('FFmpeg executable not found after extraction');
        }

        log.info('Extracted FFmpeg to:', ffmpegPath);

        // For Linux, check if libs directory exists (for bundled libraries)
        const libsPath = path.join(this.ffmpegDir, 'libs');
        if (await this.fileExists(libsPath)) {
            log.info('Found libs directory for Linux shared libraries');

            // Make all .so files executable
            const libFiles = await fs.promises.readdir(libsPath);
            for (const libFile of libFiles) {
                if (libFile.endsWith('.so') || libFile.includes('.so.')) {
                    const libPath = path.join(libsPath, libFile);
                    await fs.promises.chmod(libPath, '755');
                }
            }
        }
    }

    /**
     * Find files recursively
     */
    async findFilesRecursive(dir: string): Promise<string[]> {
        const files: string[] = [];
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...await this.findFilesRecursive(fullPath));
            } else {
                files.push(fullPath);
            }
        }

        return files;
    }

    /**
     * Verify FFmpeg installation
     */
    async verifyFFmpeg(): Promise<void> {
        const result = await this.execPromise(`"${this.ffmpegPath}" -version`);
        if (!result.stdout.includes('ffmpeg version')) {
            throw new Error('FFmpeg verification failed');
        }
        log.info('FFmpeg verified:', result.stdout.split('\n')[0]);
    }

    /**
     * Execute command as promise
     */
    execPromise(command: string): Promise<ExecResult> {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) reject(error);
                else resolve({ stdout, stderr });
            });
        });
    }

    /**
     * Get FFmpeg path
     */
    getFFmpegPath(): string | null {
        return this.ffmpegPath;
    }

    /**
     * Check if file exists
     */
    async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
}

export { FFmpegManager };
export default FFmpegManager;
