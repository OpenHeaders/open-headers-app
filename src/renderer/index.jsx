// Global console override to suppress iframe sandbox errors from rrweb
// This MUST be before any other imports to catch all console messages
(() => {
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalLog = console.log;
    
    const suppressPatterns = [
        'Blocked script execution',
        'sandboxed and the \'allow-scripts\'',
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

import React from 'react';
import { createRoot } from 'react-dom/client';
import AppComponent from './App';
import { AppProvider } from './contexts';
import './App.less';

// Initialize video recording manager
import './services/VideoRecordingManager';

// Create a root for React 18
const container = document.getElementById('root');
const root = createRoot(container);

// Render the React application with React 18 API and optimized context structure
root.render(
    <AppProvider>
        <AppComponent />
    </AppProvider>
);