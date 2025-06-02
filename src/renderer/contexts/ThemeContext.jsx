import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { ConfigProvider, theme } from 'antd';
import { showMessage } from '../utils/messageUtil';
import { createLogger } from '../utils/logger';

const log = createLogger('ThemeContext');

// Create context
const ThemeContext = createContext();

// Theme modes
export const THEME_MODES = {
    AUTO: 'auto',
    LIGHT: 'light',
    DARK: 'dark'
};

// Default theme settings
const defaultThemeSettings = {
    mode: THEME_MODES.AUTO, // auto, light, dark
    currentTheme: 'light' // actual theme being used
};

export function ThemeProvider({ children }) {
    const [themeSettings, setThemeSettings] = useState(defaultThemeSettings);
    const [loading, setLoading] = useState(true);
    const isMounted = useRef(true);
    const mediaQueryRef = useRef(null);

    useEffect(() => {
        return () => {
            isMounted.current = false;
        };
    }, []);

    // Handle system theme changes
    const handleSystemThemeChange = (e) => {
        if (themeSettings.mode === THEME_MODES.AUTO && isMounted.current) {
            const systemTheme = e.matches ? 'dark' : 'light';
            setThemeSettings(prev => ({
                ...prev,
                currentTheme: systemTheme
            }));
            log.debug(`System theme changed to: ${systemTheme}`);
        }
    };

    // Detect system theme preference
    const detectSystemTheme = () => {
        if (window.matchMedia) {
            const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
            return darkModeQuery.matches ? 'dark' : 'light';
        }
        return 'light'; // Default to light if matchMedia not supported
    };

    // Load theme settings on mount
    useEffect(() => {
        const loadThemeSettings = async () => {
            try {
                // Try to load saved theme settings
                const savedSettings = await window.electronAPI.loadFromStorage('theme-settings.json');
                const settings = JSON.parse(savedSettings);
                
                // Determine current theme based on mode
                let currentTheme = settings.mode;
                if (settings.mode === THEME_MODES.AUTO) {
                    currentTheme = detectSystemTheme();
                }
                
                if (isMounted.current) {
                    setThemeSettings({
                        mode: settings.mode,
                        currentTheme
                    });
                }
            } catch (error) {
                // This is expected on first run when no theme settings exist
                log.debug('No saved theme settings found, using system theme');
                
                // Fall back to system theme
                const systemTheme = detectSystemTheme();
                if (isMounted.current) {
                    setThemeSettings({
                        mode: THEME_MODES.AUTO,
                        currentTheme: systemTheme
                    });
                }
            } finally {
                if (isMounted.current) {
                    setLoading(false);
                }
            }
        };

        loadThemeSettings();
    }, []);

    // Set up media query listener after theme settings are loaded
    useEffect(() => {
        if (window.matchMedia && themeSettings.mode === THEME_MODES.AUTO) {
            const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQueryRef.current = darkModeQuery;
            
            // Add listener for system theme changes
            darkModeQuery.addEventListener('change', handleSystemThemeChange);
            
            // Cleanup
            return () => {
                darkModeQuery.removeEventListener('change', handleSystemThemeChange);
            };
        }
    }, [themeSettings.mode]);

    // Apply dark class to body element when theme changes
    useEffect(() => {
        if (themeSettings.currentTheme === 'dark') {
            document.body.classList.add('dark');
        } else {
            document.body.classList.remove('dark');
        }
        
        // Cleanup
        return () => {
            document.body.classList.remove('dark');
        };
    }, [themeSettings.currentTheme]);

    // Save theme settings
    const saveThemeSettings = async (mode) => {
        try {
            // Determine the current theme based on the new mode
            let currentTheme = mode;
            if (mode === THEME_MODES.AUTO) {
                currentTheme = detectSystemTheme();
            }

            const newSettings = {
                mode,
                currentTheme
            };

            // Save to storage
            await window.electronAPI.saveToStorage('theme-settings.json', JSON.stringify({ mode }));
            
            if (isMounted.current) {
                setThemeSettings(newSettings);
                log.debug(`Theme mode changed to: ${mode}, current theme: ${currentTheme}`);
            }
            
            return true;
        } catch (error) {
            log.error('Error saving theme settings:', error);
            if (isMounted.current) {
                showMessage('error', 'Failed to save theme settings');
            }
            return false;
        }
    };

    // Get Ant Design theme config based on current theme
    const getAntdThemeConfig = () => {
        const isDark = themeSettings.currentTheme === 'dark';
        
        return {
            algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
            token: {
                // Primary color
                colorPrimary: isDark ? '#0a84ff' : '#0071e3',
                
                // Background colors
                colorBgContainer: isDark ? '#1c1c1e' : '#ffffff',
                colorBgElevated: isDark ? '#2c2c2e' : '#ffffff',
                colorBgLayout: isDark ? '#000000' : '#f5f5f7',
                
                // Text colors
                colorText: isDark ? '#ffffff' : '#1d1d1f',
                colorTextSecondary: isDark ? '#98989d' : '#86868b',
                
                // Border colors
                colorBorder: isDark ? '#38383a' : '#d2d2d7',
                colorBorderSecondary: isDark ? '#48484a' : '#e5e5e7',
                
                // Component specific
                borderRadius: 8,
                boxShadow: isDark 
                    ? '0 1px 3px rgba(0, 0, 0, 0.3)' 
                    : '0 1px 2px rgba(0, 0, 0, 0.06)',
                
                // Font
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            },
            components: {
                Layout: {
                    headerBg: isDark ? '#1c1c1e' : '#ffffff',
                    bodyBg: isDark ? '#000000' : '#f5f5f7',
                },
                Card: {
                    colorBgContainer: isDark ? '#1c1c1e' : '#ffffff',
                },
                Modal: {
                    contentBg: isDark ? '#1c1c1e' : '#ffffff',
                    headerBg: isDark ? '#1c1c1e' : '#ffffff',
                    footerBg: isDark ? '#1c1c1e' : '#ffffff',
                    titleColor: isDark ? '#ffffff' : '#1d1d1f',
                    colorText: isDark ? '#ffffff' : '#1d1d1f',
                    colorTextHeading: isDark ? '#ffffff' : '#1d1d1f',
                    colorIcon: isDark ? '#98989d' : '#86868b',
                    colorIconHover: isDark ? '#ffffff' : '#1d1d1f',
                },
                Form: {
                    labelColor: isDark ? '#ffffff' : '#1d1d1f',
                    colorText: isDark ? '#ffffff' : '#1d1d1f',
                },
                Table: {
                    headerBg: isDark ? '#2c2c2e' : '#f5f5f7',
                    rowHoverBg: isDark ? '#2c2c2e' : '#f5f5f5',
                },
                Input: {
                    colorBgContainer: isDark ? '#2c2c2e' : '#ffffff',
                    colorBorder: isDark ? '#48484a' : '#d2d2d7',
                    hoverBorderColor: isDark ? '#0a84ff' : '#0071e3',
                    activeBorderColor: isDark ? '#0a84ff' : '#0071e3',
                },
                Select: {
                    colorBgContainer: isDark ? '#2c2c2e' : '#ffffff',
                    colorBorder: isDark ? '#48484a' : '#d2d2d7',
                },
                Button: {
                    colorBgContainer: isDark ? '#2c2c2e' : '#ffffff',
                },
                Switch: {
                    colorPrimary: isDark ? '#0a84ff' : '#0071e3',
                    colorPrimaryHover: isDark ? '#0a84ff' : '#0071e3',
                },
                Tag: {
                    defaultBg: isDark ? '#2c2c2e' : '#f5f5f7',
                    defaultColor: isDark ? '#ffffff' : '#1d1d1f',
                },
                Tabs: {
                    cardBg: isDark ? '#2c2c2e' : '#fafafa',
                    itemColor: isDark ? '#98989d' : '#86868b',
                    itemSelectedColor: isDark ? '#0a84ff' : '#0071e3',
                    itemHoverColor: isDark ? '#ffffff' : '#1d1d1f',
                    inkBarColor: isDark ? '#0a84ff' : '#0071e3',
                    cardGutter: 2,
                    titleFontSize: 14,
                },
                Message: {
                    contentBg: isDark ? '#2c2c2e' : '#ffffff',
                },
                Notification: {
                    colorBgElevated: isDark ? '#2c2c2e' : '#ffffff',
                },
            }
        };
    };

    // Context value
    const value = {
        themeMode: themeSettings.mode,
        currentTheme: themeSettings.currentTheme,
        loading,
        saveThemeSettings,
        isSystemTheme: themeSettings.mode === THEME_MODES.AUTO,
        isDarkMode: themeSettings.currentTheme === 'dark'
    };

    return (
        <ThemeContext.Provider value={value}>
            <ConfigProvider theme={getAntdThemeConfig()}>
                {children}
            </ConfigProvider>
        </ThemeContext.Provider>
    );
}

// Custom hook for using the theme context
export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}