import React, { useEffect } from 'react';
import { message } from 'antd';

const TrayMenu = () => {
    useEffect(() => {
        // Create safe handler functions that check if the API exists
        const handleShowApp = () => {
            console.log('App shown');
            message.info('Application window shown');
        };

        const handleHideApp = () => {
            console.log('App hidden');
        };

        const handleQuitApp = () => {
            console.log('App quit requested');
        };

        // Only subscribe to events if they exist in the API
        let unsubscribeShow;
        let unsubscribeHide;
        let unsubscribeQuit;

        if (window.electronAPI) {
            // Register event handlers if the functions exist
            if (typeof window.electronAPI.onShowApp === 'function') {
                unsubscribeShow = window.electronAPI.onShowApp(handleShowApp);
            }

            if (typeof window.electronAPI.onHideApp === 'function') {
                unsubscribeHide = window.electronAPI.onHideApp(handleHideApp);
            }

            if (typeof window.electronAPI.onQuitApp === 'function') {
                unsubscribeQuit = window.electronAPI.onQuitApp(handleQuitApp);
            }
        }

        // Cleanup function
        return () => {
            // Only call unsubscribe if it's a function
            if (typeof unsubscribeShow === 'function') unsubscribeShow();
            if (typeof unsubscribeHide === 'function') unsubscribeHide();
            if (typeof unsubscribeQuit === 'function') unsubscribeQuit();
        };
    }, []);

    // This component doesn't render anything visible
    return null;
};

export default TrayMenu;