/**
 * useVideoLoader Hook
 *
 * Manages video loading and availability checking for recordings
 *
 * @param {Object} record - The current record
 * @param {string} viewMode - Current view mode ('dom' or 'video')
 * @returns {Object} Video state and loading information
 */

import { useState, useEffect, useRef } from 'react';
import { createLogger } from '../../../../utils/error-handling/logger';

const log = createLogger('useVideoLoader');

export const useVideoLoader = (record, viewMode) => {
    const [hasVideo, setHasVideo] = useState(false);
    const [videoLoading, setVideoLoading] = useState(true);
    const videoRef = useRef(null);

    // Check if video exists for this recording
    useEffect(() => {
        const checkVideo = async () => {
            if (!record?.metadata?.recordId) {
                setHasVideo(false);
                return;
            }

            try {
                // Check if recording has video
                const recordings = await window.electronAPI.loadRecordings();
                const currentRecording = recordings.find(r => r.id === record.metadata.recordId);
                setHasVideo(currentRecording?.hasVideo || false);
            } catch (error) {
                log.error('Error checking video availability:', error);
                setHasVideo(false);
            }
        };

        checkVideo().catch(error => {
            log.error('Failed to check video availability:', error);
        });
    }, [record?.metadata?.recordId]);

    // Load video when view mode changes to video
    useEffect(() => {
        const loadVideo = async () => {
            if (viewMode === 'video' && hasVideo && record?.metadata?.recordId && videoRef.current) {
                setVideoLoading(true);
                try {
                    // Get the app data path and construct video path
                    const appPath = await window.electronAPI.getAppPath();
                    const videoPath = `${appPath}/recordings/${record.metadata.recordId}/video.webm`;

                    // Convert to file URL for video element
                    const fileUrl = `file://${videoPath}`;
                    videoRef.current.src = fileUrl;

                    log.debug('Loading video from:', fileUrl);
                } catch (error) {
                    log.error('Error loading video:', error);
                    setVideoLoading(false);
                }
            }
        };

        loadVideo().catch(error => {
            log.error('Failed to load video:', error);
        });
    }, [viewMode, hasVideo, record?.metadata?.recordId]);

    /**
     * Handle video loading completion
     */
    const handleVideoLoaded = () => {
        setVideoLoading(false);
    };

    /**
     * Handle video loading error
     */
    const handleVideoError = (error) => {
        log.error('Video loading error:', error);
        setVideoLoading(false);
    };

    return {
        hasVideo,
        videoLoading,
        videoRef,
        handleVideoLoaded,
        handleVideoError
    };
};