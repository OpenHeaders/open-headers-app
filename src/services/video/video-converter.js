const { spawn } = require('child_process');
const path = require('path');
const { createLogger } = require('../../utils/mainLogger');

const log = createLogger('VideoConverter');

/**
 * Video converter for converting WebM to MP4
 */
class VideoConverter {
    constructor(ffmpegPath) {
        this.ffmpegPath = ffmpegPath;
    }

    /**
     * Convert WebM to MP4
     * @param {string} inputPath Input WebM file path
     * @param {string} outputPath Output MP4 file path
     * @param {Function} progressCallback Progress callback
     * @returns {Promise<Object>} Result object
     */
    async convertToMP4(inputPath, outputPath, progressCallback) {
        // First validate the input file
        try {
            await this.validateInputFile(inputPath);
        } catch (error) {
            log.error('Input validation failed:', error);
            throw error;
        }
        
        return new Promise((resolve, reject) => {
            // Optimized settings for chat app compatibility
            // Add more robust input handling for WebM files from MediaRecorder
            const args = [
                '-i', inputPath,
                // Scale to ensure dimensions are divisible by 2 (required for H.264)
                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                '-c:v', 'libx264',           // H.264 codec
                '-preset', 'fast',            // Balance between speed and compression
                '-crf', '23',                 // Good quality (lower = better, 23 is good)
                '-an',                        // No audio (MediaRecorder doesn't record audio)
                '-movflags', '+faststart',    // Enable streaming (metadata at beginning)
                '-pix_fmt', 'yuv420p',        // Maximum compatibility
                '-profile:v', 'baseline',     // Compatible with all devices
                '-level', '3.0',              // Compatibility level
                '-maxrate', '4M',             // Max bitrate 4Mbps
                '-bufsize', '8M',             // Buffer size
                '-f', 'mp4',                  // Force MP4 format
                '-y',                         // Overwrite output
                outputPath
            ];

            log.info('Starting conversion:', { 
                input: inputPath, 
                output: outputPath,
                ffmpegPath: this.ffmpegPath,
                args: args.join(' ')
            });

            const ffmpeg = spawn(this.ffmpegPath, args);
            
            let stderr = '';
            let duration = 0;
            let lastProgress = 0;
            
            ffmpeg.stderr.on('data', (data) => {
                stderr += data.toString();
                
                // Parse duration
                const durationMatch = data.toString().match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
                if (durationMatch && duration === 0) {
                    duration = parseInt(durationMatch[1]) * 3600 + 
                              parseInt(durationMatch[2]) * 60 + 
                              parseInt(durationMatch[3]);
                    log.info('Video duration:', duration, 'seconds');
                }
                
                // Parse progress
                const progressMatch = data.toString().match(/time=(\d{2}):(\d{2}):(\d{2})/);
                if (progressMatch && duration > 0) {
                    const currentTime = parseInt(progressMatch[1]) * 3600 + 
                                      parseInt(progressMatch[2]) * 60 + 
                                      parseInt(progressMatch[3]);
                    const percent = Math.min(Math.round((currentTime / duration) * 100), 100);
                    
                    // Only call progress callback if progress changed
                    if (percent !== lastProgress) {
                        lastProgress = percent;
                        if (progressCallback) {
                            progressCallback({ 
                                percent, 
                                currentTime, 
                                duration,
                                eta: duration - currentTime
                            });
                        }
                    }
                }
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    log.info('Conversion completed successfully');
                    resolve({ success: true, outputPath });
                } else {
                    log.error('FFmpeg exited with code:', code);
                    log.error('FFmpeg stderr output:', stderr);
                    
                    // Try to extract meaningful error from stderr
                    let errorMessage = `FFmpeg exited with code ${code}`;
                    if (stderr.includes('No such file')) {
                        errorMessage = 'Input file not found';
                    } else if (stderr.includes('Permission denied')) {
                        errorMessage = 'Permission denied writing output file';
                    } else if (stderr.includes('Invalid data')) {
                        errorMessage = 'Invalid input video format';
                    }
                    
                    reject(new Error(errorMessage + '\n' + stderr.slice(-500))); // Include last 500 chars of stderr
                }
            });

            ffmpeg.on('error', (err) => {
                log.error('Failed to start FFmpeg:', err);
                reject(new Error(`Failed to start FFmpeg: ${err.message}`));
            });
        });
    }

    /**
     * Optimize video for specific file size
     * @param {string} inputPath Input file path
     * @param {string} outputPath Output file path
     * @param {number} targetSizeMB Target size in MB
     * @param {Function} progressCallback Progress callback
     * @returns {Promise<Object>} Result object
     */
    async optimizeForSize(inputPath, outputPath, targetSizeMB, progressCallback) {
        // First, get video duration
        const duration = await this.getVideoDuration(inputPath);
        
        // Calculate required bitrate (in bits)
        const targetBits = targetSizeMB * 1024 * 1024 * 8;
        const targetBitrate = Math.floor(targetBits / duration * 0.95); // 95% to be safe
        
        log.info('Optimizing for size:', {
            targetSizeMB,
            duration,
            targetBitrate: `${Math.round(targetBitrate / 1000)}k`
        });

        const args = [
            '-i', inputPath,
            '-c:v', 'libx264',
            '-b:v', targetBitrate,
            '-maxrate', Math.floor(targetBitrate * 1.1),
            '-bufsize', targetBitrate * 2,
            '-an',
            '-movflags', '+faststart',
            '-pix_fmt', 'yuv420p',
            '-profile:v', 'baseline',
            '-preset', 'medium',
            '-y',
            outputPath
        ];

        return this.runFFmpeg(args, progressCallback);
    }

    /**
     * Get video duration
     * @param {string} videoPath Video file path
     * @returns {Promise<number>} Duration in seconds
     */
    async getVideoDuration(videoPath) {
        return new Promise((resolve, reject) => {
            const ffmpeg = spawn(this.ffmpegPath, ['-i', videoPath]);
            let stderr = '';
            
            ffmpeg.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            ffmpeg.on('close', () => {
                const match = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
                if (match) {
                    const duration = parseInt(match[1]) * 3600 + 
                                   parseInt(match[2]) * 60 + 
                                   parseInt(match[3]);
                    resolve(duration);
                } else {
                    reject(new Error('Could not determine video duration'));
                }
            });

            ffmpeg.on('error', (err) => {
                reject(err);
            });
        });
    }

    /**
     * Run FFmpeg with arguments
     * @param {string[]} args FFmpeg arguments
     * @param {Function} progressCallback Progress callback
     * @returns {Promise<Object>} Result object
     */
    async runFFmpeg(args, progressCallback) {
        return new Promise((resolve, reject) => {
            const ffmpeg = spawn(this.ffmpegPath, args);
            
            let stderr = '';
            let duration = 0;
            
            ffmpeg.stderr.on('data', (data) => {
                stderr += data.toString();
                
                // Parse duration and progress
                const durationMatch = data.toString().match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
                if (durationMatch && duration === 0) {
                    duration = parseInt(durationMatch[1]) * 3600 + 
                              parseInt(durationMatch[2]) * 60 + 
                              parseInt(durationMatch[3]);
                }
                
                const progressMatch = data.toString().match(/time=(\d{2}):(\d{2}):(\d{2})/);
                if (progressMatch && duration > 0 && progressCallback) {
                    const currentTime = parseInt(progressMatch[1]) * 3600 + 
                                      parseInt(progressMatch[2]) * 60 + 
                                      parseInt(progressMatch[3]);
                    const percent = Math.round((currentTime / duration) * 100);
                    progressCallback({ percent, currentTime, duration });
                }
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true });
                } else {
                    reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
                }
            });

            ffmpeg.on('error', (err) => {
                reject(err);
            });
        });
    }

    /**
     * Generate thumbnail from video
     * @param {string} videoPath Video file path
     * @param {string} outputPath Thumbnail output path
     * @param {number} timeSeconds Time in seconds to capture
     * @returns {Promise<string>} Thumbnail path
     */
    async generateThumbnail(videoPath, outputPath, timeSeconds = 2) {
        const args = [
            '-i', videoPath,
            '-ss', timeSeconds.toString(),  // Seek to time
            '-vframes', '1',                // Extract one frame
            '-vf', 'scale=320:-1',          // Scale to 320px width, maintain aspect ratio
            '-y',
            outputPath
        ];

        return new Promise((resolve, reject) => {
            const ffmpeg = spawn(this.ffmpegPath, args);
            
            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve(outputPath);
                } else {
                    reject(new Error(`Thumbnail generation failed with code ${code}`));
                }
            });

            ffmpeg.on('error', (err) => {
                reject(err);
            });
        });
    }

    /**
     * Validate input file before processing
     * @param {string} inputPath Input file path
     * @returns {Promise<void>}
     */
    async validateInputFile(inputPath) {
        const fs = require('fs').promises;
        
        // Check if file exists
        try {
            const stats = await fs.stat(inputPath);
            log.info('Input file stats:', {
                path: inputPath,
                size: stats.size,
                isFile: stats.isFile()
            });
            
            if (!stats.isFile()) {
                throw new Error('Input path is not a file');
            }
            
            if (stats.size === 0) {
                throw new Error('Input file is empty (0 bytes)');
            }
            
            // Use ffprobe to validate the video format
            await this.validateVideoFormat(inputPath);
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`Input file not found: ${inputPath}`);
            }
            throw error;
        }
    }

    /**
     * Validate video format using ffprobe
     * @param {string} videoPath Video file path
     * @returns {Promise<Object>} Video info
     */
    async validateVideoFormat(videoPath) {
        return new Promise((resolve, reject) => {
            // Use ffprobe (comes with ffmpeg) to check the video
            const ffprobePath = this.ffmpegPath.replace('ffmpeg', 'ffprobe');
            const args = [
                '-v', 'error',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=codec_name,width,height,duration',
                '-of', 'json',
                videoPath
            ];
            
            const ffprobe = spawn(ffprobePath, args);
            let stdout = '';
            let stderr = '';
            
            ffprobe.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            ffprobe.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            ffprobe.on('close', (code) => {
                if (code === 0) {
                    try {
                        const info = JSON.parse(stdout);
                        log.info('Video format info:', info);
                        
                        if (!info.streams || info.streams.length === 0) {
                            reject(new Error('No video streams found in file'));
                        } else {
                            resolve(info);
                        }
                    } catch (error) {
                        reject(new Error('Failed to parse video info: ' + error.message));
                    }
                } else {
                    log.error('ffprobe failed:', stderr);
                    reject(new Error('Invalid video format or corrupted file'));
                }
            });
            
            ffprobe.on('error', (err) => {
                // If ffprobe doesn't exist, skip validation
                if (err.code === 'ENOENT') {
                    log.warn('ffprobe not found, skipping format validation');
                    resolve({ skipped: true });
                } else {
                    reject(err);
                }
            });
        });
    }
}

module.exports = VideoConverter;