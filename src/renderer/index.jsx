import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, theme, App } from 'antd';
import AppComponent from './App';
import { SourceProvider } from './contexts/SourceContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { MessageProvider } from './utils/MessageProvider';
import { MessageInitializer } from './utils/messageUtil';
import './App.less';

// Create a root for React 18
const container = document.getElementById('root');
const root = createRoot(container);

// Render the React application with React 18 API and Ant Design App wrapper
root.render(
    <ConfigProvider
        theme={{
            token: {
                colorPrimary: '#0071e3',
                colorSuccess: '#34c759',
                colorWarning: '#ff9f0a',
                colorError: '#ff3b30',
                colorInfo: '#0071e3',
                borderRadius: 6,
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
            },
            algorithm: theme.defaultAlgorithm,
        }}
    >
        <App
            message={{ maxCount: 5 }}
            notification={{
                top: 70,
                duration: 3,
                maxCount: 5,
                placement: 'topRight'
            }}
        >
            <MessageProvider>
                {/* This initializer sets up the message API for use outside React components */}
                <MessageInitializer />

                <SettingsProvider>
                    <SourceProvider>
                        {/* Note: WebSocketProvider is now inside App.jsx */}
                        <AppComponent />
                    </SourceProvider>
                </SettingsProvider>
            </MessageProvider>
        </App>
    </ConfigProvider>
);