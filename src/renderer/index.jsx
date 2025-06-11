import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from 'antd';
import AppComponent from './App';
import { SourceProvider } from './contexts/SourceContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { TotpProvider } from './contexts/TotpContext';
import { MessageProvider } from './utils/MessageProvider';
import { MessageInitializer } from './utils/messageUtil';
import './App.less';

// Create a root for React 18
const container = document.getElementById('root');
const root = createRoot(container);

// Render the React application with React 18 API and Ant Design App wrapper
root.render(
    <SettingsProvider>
        <ThemeProvider>
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

                    <TotpProvider>
                        <SourceProvider>
                            <WebSocketProvider>
                                <AppComponent />
                            </WebSocketProvider>
                        </SourceProvider>
                    </TotpProvider>
                </MessageProvider>
            </App>
        </ThemeProvider>
    </SettingsProvider>
);