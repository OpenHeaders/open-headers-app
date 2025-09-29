/**
 * usePlayerManager Hook
 *
 * Manages rrweb player initialization, cleanup, and event handling
 * Handles player lifecycle and playback state management
 *
 * @param {Object} record - The current record
 * @param {Object} rrwebPlayer - The rrweb player class
 * @param {string} viewMode - Current view mode ('dom' or 'video')
 * @param {boolean} autoHighlight - Whether auto-highlighting is enabled
 * @param {Function} processRecordForProxy - Function to process record for proxy
 * @param {Function} createConsoleOverrides - Function to create console overrides
 * @param {Function} onPlaybackTimeChange - Callback for playback time changes
 * @param {Function} onPlayingStateChange - Callback for playing state changes
 * @returns {Object} Player state and refs
 */

import { useState, useEffect, useRef } from 'react';
import { calculateViewportScale } from '../utils/playerUtils.js';
import { createLogger } from '../../../../utils/error-handling/logger';

const log = createLogger('usePlayerManager');

export const usePlayerManager = (
    record,
    rrwebPlayer,
    viewMode,
    autoHighlight,
    processRecordForProxy,
    createConsoleOverrides,
    onPlaybackTimeChange,
    onPlayingStateChange
) => {
    const [player, setPlayer] = useState(null);
    const playerContainerRef = useRef(null);
    const isInitializingRef = useRef(false);
    const recordIdRef = useRef(null);
    const lastPlaybackTimeRef = useRef(0);
    const wasPlayingRef = useRef(false);
    const autoHighlightKeyRef = useRef(autoHighlight);
    const previousViewModeRef = useRef('dom');

    const callbacksRef = useRef({ onPlaybackTimeChange, onPlayingStateChange });
    callbacksRef.current = { onPlaybackTimeChange, onPlayingStateChange };

    // Clean up player when switching to video mode
    useEffect(() => {
        if (viewMode === 'video' && previousViewModeRef.current === 'dom' && player) {
            log.debug('Destroying player when switching to video mode');
            if (typeof player['$destroy'] === 'function') {
                // $destroy is a Svelte component method
                player['$destroy']();
            }
            setPlayer(null);
        }
        previousViewModeRef.current = viewMode;
    }, [viewMode, player]);

    // Initialize player effect
    useEffect(() => {
        const initializePlayer = async () => {
            if (!record || !playerContainerRef.current || !rrwebPlayer) return;

            // Skip initialization if we're not in DOM view mode
            if (viewMode !== 'dom') return;

            // Skip if we're already initializing
            if (isInitializingRef.current) return;

            // Check if this is the same record and auto-highlight hasn't changed
            const isSameRecord = recordIdRef.current === record.metadata.recordId;
            const autoHighlightChanged = autoHighlightKeyRef.current !== autoHighlight;

            log.debug('RecordPlayer init check:', {
                isSameRecord,
                autoHighlightChanged,
                currentAutoHighlight: autoHighlight,
                previousAutoHighlight: autoHighlightKeyRef.current,
                recordId: record.metadata.recordId,
                previousRecordId: recordIdRef.current,
                viewMode: viewMode
            });

            // Always re-initialize when switching back to DOM mode, or when record/autoHighlight changes
            if (isSameRecord && !autoHighlightChanged && player) return;

            // Store current playback state before destroying
            if (player && autoHighlightChanged) {
                log.debug('Storing playback state before reload due to autoHighlight change');
                try {
                    const replayer = player.getReplayer();
                    if (replayer) {
                        lastPlaybackTimeRef.current = replayer.getCurrentTime();
                        const metadata = replayer.getMetaData();
                        wasPlayingRef.current = metadata?.playing || false;
                        log.debug('Stored state:', { time: lastPlaybackTimeRef.current, playing: wasPlayingRef.current });
                    }
                } catch (e) {
                    log.warn('Could not get current playback state:', e);
                }
            }

            isInitializingRef.current = true;
            recordIdRef.current = record.metadata.recordId;
            autoHighlightKeyRef.current = autoHighlight;

            try {
                log.info('Starting player initialization');

                // Check if proxy is running
                const proxyStatus = await window.electronAPI.proxyStatus();
                log.info('Proxy status check:', {
                    running: proxyStatus.running,
                    port: proxyStatus.port,
                    rulesCount: proxyStatus.rulesCount,
                    sourcesCount: proxyStatus.sourcesCount
                });

                // Set up console overrides
                const restoreConsole = createConsoleOverrides();

                // Override window.onerror to catch errors before they reach console
                const originalOnError = window.onerror;
                window.onerror = function(message, source, lineno, colno, error) {
                    const suppressPatterns = [
                        'Blocked script execution',
                        'sandboxed and the \'allow-scripts\'',
                        '[Intervention]',
                        'Slow network is detected',
                        'An iframe which has both allow-scripts'
                    ];
                    
                    if (suppressPatterns.some(pattern => message?.includes(pattern))) {
                        return true; // Prevent default error handling
                    }
                    
                    if (originalOnError) {
                        return originalOnError.call(window, message, source, lineno, colno, error);
                    }
                    return false;
                };

                // Intercept iframe creation to fix sandbox issues and inject console overrides
                const originalCreateElement = document.createElement;
                const iframeRefs = [];
                
                document.createElement = function(tagName) {
                    const element = originalCreateElement.call(document, tagName);
                    
                    if (tagName.toLowerCase() === 'iframe') {
                        // Store reference for cleanup
                        iframeRefs.push(element);
                        
                        // Override setAttribute to intercept sandbox attribute
                        const originalSetAttribute = element.setAttribute;
                        element.setAttribute = function(name, value) {
                            if (name === 'sandbox') {
                                // Always add allow-scripts to prevent errors
                                const sandboxValues = value.split(' ').filter(Boolean);
                                if (!sandboxValues.includes('allow-scripts')) {
                                    sandboxValues.push('allow-scripts');
                                }
                                // Don't add allow-same-origin if allow-scripts is present
                                // This prevents the security warning
                                value = sandboxValues.join(' ');
                            }
                            return originalSetAttribute.call(this, name, value);
                        };
                        
                        // When iframe loads, inject console overrides into it
                        element.addEventListener('load', () => {
                            try {
                                const iframeWindow = element.contentWindow;
                                if (iframeWindow && element.contentDocument) {
                                    // Inject styles to prevent font loading warnings
                                    const style = element.contentDocument.createElement('style');
                                    style.textContent = `
                                        @font-face {
                                            font-display: optional !important;
                                        }
                                        * {
                                            font-display: optional !important;
                                        }
                                    `;
                                    if (element.contentDocument.head) {
                                        element.contentDocument.head.appendChild(style);
                                    }
                                    
                                    // Inject console overrides into iframe
                                    const script = element.contentDocument.createElement('script');
                                    script.textContent = `
                                        (() => {
                                            const originalError = console.error;
                                            const originalWarn = console.warn;
                                            const originalLog = console.log;
                                            
                                            const suppressPatterns = [
                                                'Blocked script execution',
                                                'sandboxed and the \\'allow-scripts\\'',
                                                'file:///Applications/OpenHeaders.app',
                                                '[Intervention]',
                                                'Slow network is detected',
                                                'Fallback font will be used',
                                                'An iframe which has both allow-scripts and allow-same-origin',
                                                'can escape its sandboxing'
                                            ];
                                            
                                            const shouldSuppress = (args) => {
                                                const message = args[0]?.toString() || '';
                                                return suppressPatterns.some(pattern => message.includes(pattern));
                                            };
                                            
                                            console.error = function(...args) {
                                                if (!shouldSuppress(args)) {
                                                    originalError.apply(console, args);
                                                }
                                            };
                                            
                                            console.warn = function(...args) {
                                                if (!shouldSuppress(args)) {
                                                    originalWarn.apply(console, args);
                                                }
                                            };
                                            
                                            console.log = function(...args) {
                                                if (!shouldSuppress(args)) {
                                                    originalLog.apply(console, args);
                                                }
                                            };
                                        })();
                                    `;
                                    if (element.contentDocument.head) {
                                        element.contentDocument.head.appendChild(script);
                                    } else if (element.contentDocument.body) {
                                        element.contentDocument.body.appendChild(script);
                                    }
                                }
                            } catch (e) {
                                // Ignore errors if we can't access iframe content
                            }
                        });
                    }
                    
                    return element;
                };

                // Clear previous player
                if (player) {
                    log.debug('Destroying previous player');
                    if (typeof player['$destroy'] === 'function') {
                        // $destroy is a Svelte component method
                        player['$destroy']();
                    }
                    if (player._restoreCreateElement) {
                        player._restoreCreateElement();
                    }
                }
                playerContainerRef.current.innerHTML = '';
                log.debug('Creating new player instance');

                // Get viewport dimensions and calculate scale
                const { width, height } = record.metadata.viewport || { width: 1024, height: 768 };
                const containerWidth = playerContainerRef.current.offsetWidth;
                const containerHeight = 450;
                const scale = calculateViewportScale(record.metadata.viewport, containerWidth, containerHeight);

                // Process the recording through proxy if running
                // Note: The recording should already be preprocessed when saved
                let processedRecord = await processRecordForProxy(record, proxyStatus);
                
                log.info('Creating player instance');

                // Create player with processed record
                const newPlayer = new rrwebPlayer({
                    target: playerContainerRef.current,
                    props: {
                        events: processedRecord.events,
                        width: width * scale,
                        height: height * scale,
                        autoPlay: false,
                        showController: true,
                        mouseTail: true,
                        triggerFocus: true,
                        UNSAFE_replayCanvas: false,
                        skipInactive: true,
                        showDebug: false,
                        blockClass: 'oh-block',
                        liveMode: false,
                        // Add these for better performance:
                        speed: 1,
                        unpackFn: null,
                        showWarning: false,
                        insertStyleRules: [],
                        // Prevent iframe issues
                        pauseAnimation: false,
                        // Disable iframe creation to prevent sandbox errors
                        useVirtualDom: false,
                        // Add error handling for missing nodes
                        plugins: [
                            {
                                handler: (event) => {
                                    if (event.type === 3 && event.data) { // Incremental snapshot
                                        // Add error boundary for mutations
                                        try {
                                            return event;
                                        } catch (e) {
                                            log.warn('Skipping problematic mutation:', e);
                                            return null;
                                        }
                                    }
                                    return event;
                                }
                            },
                            // Custom iframe handler plugin
                            {
                                handler: (event, isSync, context) => {
                                    // Handle iframe-related events
                                    if (event.type === 2) { // Full snapshot
                                        // Already handled by preprocessor
                                        return event;
                                    }
                                    
                                    if (event.type === 3 && event.data?.source === 0) { // DOM mutation
                                        // Filter out iframe script errors
                                        if (event.data.adds) {
                                            event.data.adds = event.data.adds.filter(add => {
                                                if (add.node?.tagName === 'script' && 
                                                    add.node?.textContent?.includes('Blocked script execution')) {
                                                    return false;
                                                }
                                                return true;
                                            });
                                        }
                                    }
                                    
                                    return event;
                                }
                            }
                        ]
                    }
                });

                setPlayer(newPlayer);

                // Restore function for cleanup
                newPlayer._restoreConsole = restoreConsole;
                newPlayer._restoreCreateElement = () => {
                    document.createElement = originalCreateElement;
                    window.onerror = originalOnError;
                    // Clean up iframe references
                    iframeRefs.forEach(iframe => {
                        if (iframe.parentNode) {
                            iframe.parentNode.removeChild(iframe);
                        }
                    });
                };

                // Store event handlers so we can remove them later
                newPlayer._eventHandlers = {
                    timeUpdate: null,
                    stateUpdate: null
                };

                // Restore playback position if this was a reload due to autoHighlight change
                if (autoHighlightChanged && lastPlaybackTimeRef.current > 0) {
                    setTimeout(() => {
                        try {
                            const replayer = newPlayer.getReplayer();
                            if (replayer) {
                                replayer.pause();
                                replayer.play(lastPlaybackTimeRef.current);
                                if (!wasPlayingRef.current) {
                                    setTimeout(() => replayer.pause(), 50);
                                }
                            }
                        } catch (e) {
                            log.warn('Could not restore playback position:', e);
                        }
                    }, 100);
                }

                log.info('Player initialization complete');

            } catch (error) {
                log.error('Failed to initialize player:', error);
            } finally {
                isInitializingRef.current = false;
            }
        };

        initializePlayer().catch(error => {
            log.error('Failed to initialize player:', error);
        });
    }, [record?.metadata?.recordId, rrwebPlayer, autoHighlight, processRecordForProxy, createConsoleOverrides, viewMode]);

    // Set up event listeners only when autoHighlight is enabled
    useEffect(() => {
        if (!player || typeof player.addEventListener !== 'function' || !autoHighlight) return;

        // Initialize tracking variables
        let lastTime = null;

        const timeUpdateHandler = (event) => {
            const time = event.payload;

            // Only update if time changed by at least 1000ms
            if (lastTime === null || Math.abs(time - lastTime) >= 1000) {
                lastTime = time;
                if (callbacksRef.current.onPlaybackTimeChange) {
                    callbacksRef.current.onPlaybackTimeChange(time);
                }
            }
        };

        const stateUpdateHandler = (event) => {
            const state = event.payload;
            if (state && typeof state.playing === 'boolean' && callbacksRef.current.onPlayingStateChange) {
                callbacksRef.current.onPlayingStateChange(state.playing);
            }
        };

        // Add event listeners only when autoHighlight is true
        player.addEventListener('ui-update-current-time', timeUpdateHandler);
        player.addEventListener('ui-update-player-state', stateUpdateHandler);

        // Store reference to handlers for cleanup purposes
        player._eventHandlers = {
            timeUpdate: timeUpdateHandler,
            stateUpdate: stateUpdateHandler
        };
    }, [player, autoHighlight]);

    // Cleanup effect
    useEffect(() => {
        return () => {
            if (player) {
                if (typeof player['$destroy'] === 'function') {
                    // $destroy is a Svelte component method
                    player['$destroy']();
                }
                if (player._restoreConsole) {
                    player._restoreConsole();
                }
                if (player._restoreCreateElement) {
                    player._restoreCreateElement();
                }
            }
            recordIdRef.current = null;
        };
    }, [player]);

    return {
        player,
        playerContainerRef
    };
};