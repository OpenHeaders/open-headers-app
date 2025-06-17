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
    const [isCompactMode, setIsCompactMode] = useState(settings.compactMode || false);
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

    // Update compact mode when settings change
    useEffect(() => {
        if (settings.compactMode !== undefined) {
            setIsCompactMode(settings.compactMode);
        }
    }, [settings.compactMode]);

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

    // Toggle compact mode
    const toggleCompactMode = async () => {
        try {
            const newCompactMode = !isCompactMode;
            const success = await saveSettings({
                ...settings,
                compactMode: newCompactMode
            });
            
            if (success) {
                setIsCompactMode(newCompactMode);
                log.debug(`Compact mode changed to: ${newCompactMode}`);
            }
            
            return success;
        } catch (error) {
            log.error('Error saving compact mode:', error);
            return false;
        }
    };

    // Configure Ant Design theme algorithms
    const getThemeAlgorithms = () => {
        const algorithms = [];
        const isDark = currentTheme === 'dark';
        
        // Add dark/light algorithm
        algorithms.push(isDark ? theme.darkAlgorithm : theme.defaultAlgorithm);
        
        // Add compact algorithm if enabled
        if (isCompactMode) {
            algorithms.push(theme.compactAlgorithm);
        }
        
        return algorithms.length === 1 ? algorithms[0] : algorithms;
    };

    // Get Ant Design theme config based on current theme
    const getAntdThemeConfig = () => {
        return {
            algorithm: getThemeAlgorithms(),
            token: {
                // Primary colors
                colorPrimary: '#0071e3',
                
                // Component specific
                borderRadius: 8,
                
                // Font
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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
        isDarkMode: currentTheme === 'dark',
        isCompactMode,
        toggleCompactMode
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