import { useState, useEffect, useCallback } from 'react';

export const useRecordPlayer = () => {
    const [rrwebPlayer, setRrwebPlayer] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Override console methods BEFORE loading rrweb-player
        const originalConsoleError = console.error;
        const originalConsoleWarn = console.warn;
        const originalConsoleLog = console.log;

        const suppressPatterns = [
            '[Intervention]',
            'Slow network is detected',
            'Fallback font will be used',
            'Blocked script execution',
            'sandboxed and the \'allow-scripts\'',
            'Failed to load resource',
            'CORS',
            'Cross-Origin',
            'net::ERR_',
            'index.html:1 Blocked',
            'file:///Applications/OpenHeaders.app'
        ];

        const filterConsole = (originalMethod) => (...args) => {
            const message = args[0]?.toString() || '';
            if (suppressPatterns.some(pattern => message.includes(pattern))) {
                return;
            }
            originalMethod.apply(console, args);
        };

        console.error = filterConsole(originalConsoleError);
        console.warn = filterConsole(originalConsoleWarn);
        console.log = filterConsole(originalConsoleLog);

        const loadRrwebPlayer = async () => {
            try {
                setLoading(true);
                setError(null);

                // Check if already loaded
                if (window.rrwebPlayer) {
                    const player = window.rrwebPlayer?.default || window.rrwebPlayer?.Player || window.rrwebPlayer;
                    setRrwebPlayer(() => player);
                    return;
                }

                // Load rrweb-player from local files
                const script = document.createElement('script');
                script.src = './lib/rrweb-player.js';

                await new Promise((resolve, reject) => {
                    script.onload = () => {
                        // The UMD bundle exports the player as default or Player property
                        const player = window.rrwebPlayer?.default || window.rrwebPlayer?.Player || window.rrwebPlayer;
                        setRrwebPlayer(() => player);
                        resolve();
                    };
                    script.onerror = () => reject(new Error('Failed to load rrweb-player script'));
                    document.head.appendChild(script);
                });

                // Load CSS
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = './lib/rrweb-player.css';
                document.head.appendChild(link);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        loadRrwebPlayer();

        // Restore console methods on cleanup
        return () => {
            console.error = originalConsoleError;
            console.warn = originalConsoleWarn;
            console.log = originalConsoleLog;
        };
    }, []);

    const processRecordForProxy = useCallback(async (record, proxyStatus) => {
        if (!proxyStatus.running) return record;

        const proxyUrl = `http://localhost:${proxyStatus.port}`;

        // Convert the entire record to JSON string
        let recordString = JSON.stringify(record);

        // First, replace protocol-relative URLs (//example.com) with https://
        recordString = recordString.replace(
            /"\/\/([^"'\s]+)"/g,
            '"https://$1"'
        );

        // Then replace all HTTP/HTTPS URLs with proxied versions
        recordString = recordString.replace(
            /(https?:\/\/[^"'\s)]+)/g,
            (match, url) => {
                // Don't proxy URLs that are already proxied
                if (url.includes('localhost:' + proxyStatus.port)) {
                    return match;
                }

                // Don't proxy data: or blob: URLs
                if (url.startsWith('data:') || url.startsWith('blob:')) {
                    return match;
                }

                // Keep proxying font files for auth headers
                // The slow network warnings will be suppressed by console overrides

                return `${proxyUrl}/${url}`;
            }
        );

        // Parse back to object
        return JSON.parse(recordString);
    }, []);

    const createConsoleOverrides = useCallback(() => {
        const originalConsoleError = console.error;
        const originalConsoleWarn = console.warn;

        const overriddenError = (...args) => {
            const errorMessage = args[0]?.toString() || '';
            const suppressPatterns = [
                'Failed to load resource',
                'Failed to decode downloaded font',
                'OTS parsing error',
                'CORS',
                'Cross-Origin',
                'net::ERR_',
                '302',
                'Redirect',
                'Node with id', // Suppress node not found errors
                'Failed to execute \'removeChild\'', // DOM mutation errors
                'Cannot read properties of null', // Null reference errors during replay
                'Blocked script execution', // Suppress sandbox iframe errors
                'sandboxed and the \'allow-scripts\'', // Suppress sandbox permission errors
                '[Intervention]', // Suppress browser intervention messages
                'Slow network is detected', // Suppress slow network warnings
                'An iframe which has both allow-scripts and allow-same-origin',
                'can escape its sandboxing'
            ];

            if (suppressPatterns.some(pattern => errorMessage.includes(pattern))) {
                return;
            }
            originalConsoleError.apply(console, args);
        };

        const overriddenWarn = (...args) => {
            const warnMessage = args[0]?.toString() || '';
            const suppressPatterns = [
                'Failed to load resource',
                'CORS',
                'Cross-Origin',
                '[replayer] Node with id',
                'not found',
                'Failed to execute',
                'Cannot read properties',
                'Blocked script execution', // Suppress sandbox iframe warnings
                'sandboxed and the \'allow-scripts\'', // Suppress sandbox permission warnings
                '[Intervention]', // Suppress browser intervention messages
                'Slow network is detected', // Suppress slow network warnings
                'Fallback font will be used' // Suppress font loading warnings
            ];

            if (suppressPatterns.some(pattern => warnMessage.includes(pattern))) {
                return;
            }
            originalConsoleWarn.apply(console, args);
        };

        console.error = overriddenError;
        console.warn = overriddenWarn;

        return () => {
            console.error = originalConsoleError;
            console.warn = originalConsoleWarn;
        };
    }, []);

    return {
        rrwebPlayer,
        loading,
        error,
        processRecordForProxy,
        createConsoleOverrides
    };
};