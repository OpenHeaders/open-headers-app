import React from 'react';
import ReactDOM from 'react-dom';
import { ConfigProvider } from 'antd';
import App from './App';
import { SourceProvider } from './contexts/SourceContext';
import { SettingsProvider } from './contexts/SettingsContext';
import './App.less';

// Render the React application
ReactDOM.render(
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
        }}
    >
        <SettingsProvider>
            <SourceProvider>
                <App />
            </SourceProvider>
        </SettingsProvider>
    </ConfigProvider>,
    document.getElementById('root')
);