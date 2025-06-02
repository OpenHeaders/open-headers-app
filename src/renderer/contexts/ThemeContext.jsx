import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { ConfigProvider, theme } from 'antd';
import { useSettings } from './SettingsContext';
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
    currentTheme: 'light' // actual theme being used
};

export function ThemeProvider({ children }) {
    const { settings, saveSettings } = useSettings();
    const [currentTheme, setCurrentTheme] = useState(defaultThemeSettings.currentTheme);
    const isMounted = useRef(true);
    const mediaQueryRef = useRef(null);

    useEffect(() => {
        return () => {
            isMounted.current = false;
        };
    }, []);

    // Handle system theme changes
    const handleSystemThemeChange = (e) => {
        if (settings.theme === THEME_MODES.AUTO && isMounted.current) {
            const systemTheme = e.matches ? 'dark' : 'light';
            setCurrentTheme(systemTheme);
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

    // Update theme when settings change
    useEffect(() => {
        if (!settings.theme) return;
        
        // Determine current theme based on mode
        let newTheme = settings.theme;
        if (settings.theme === THEME_MODES.AUTO) {
            newTheme = detectSystemTheme();
        }
        
        if (isMounted.current) {
            setCurrentTheme(newTheme);
            log.debug(`Theme mode: ${settings.theme}, current theme: ${newTheme}`);
        }
    }, [settings.theme]);

    // Set up media query listener after theme settings are loaded
    useEffect(() => {
        if (window.matchMedia && settings.theme === THEME_MODES.AUTO) {
            const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQueryRef.current = darkModeQuery;
            
            // Add listener for system theme changes
            darkModeQuery.addEventListener('change', handleSystemThemeChange);
            
            // Cleanup
            return () => {
                darkModeQuery.removeEventListener('change', handleSystemThemeChange);
            };
        }
    }, [settings.theme]);

    // Apply dark class to body element when theme changes
    useEffect(() => {
        if (currentTheme === 'dark') {
            document.body.classList.add('dark');
        } else {
            document.body.classList.remove('dark');
        }
        
        // Cleanup
        return () => {
            document.body.classList.remove('dark');
        };
    }, [currentTheme]);

    // Save theme settings
    const saveThemeMode = async (mode) => {
        try {
            // Update settings with new theme mode
            const success = await saveSettings({
                ...settings,
                theme: mode
            });
            
            if (success) {
                // Update current theme if mode changed to/from auto
                let newTheme = mode;
                if (mode === THEME_MODES.AUTO) {
                    newTheme = detectSystemTheme();
                }
                
                if (isMounted.current) {
                    setCurrentTheme(newTheme);
                    log.debug(`Theme mode changed to: ${mode}, current theme: ${newTheme}`);
                }
            }
            
            return success;
        } catch (error) {
            log.error('Error saving theme settings:', error);
            return false;
        }
    };

    // Get Ant Design theme config based on current theme
    const getAntdThemeConfig = () => {
        const isDark = currentTheme === 'dark';
        
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
        themeMode: settings.theme || THEME_MODES.AUTO,
        currentTheme: currentTheme,
        loading: false,
        saveThemeSettings: saveThemeMode,
        isSystemTheme: settings.theme === THEME_MODES.AUTO,
        isDarkMode: currentTheme === 'dark'
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