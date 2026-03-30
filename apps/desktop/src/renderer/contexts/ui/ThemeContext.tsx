import { ConfigProvider, theme } from 'antd';
import type { MappingAlgorithm } from 'antd/es/theme/interface';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createLogger } from '@/renderer/utils/error-handling/logger';
import type { AppSettings } from '@/types/settings';
import { useSettings } from './SettingsContext';

const log = createLogger('ThemeContext');

interface ThemeContextValue {
  themeMode: AppSettings['theme'];
  currentTheme: 'light' | 'dark';
  loading: boolean;
  saveThemeSettings: (mode: AppSettings['theme']) => Promise<boolean>;
  isSystemTheme: boolean;
  isDarkMode: boolean;
  isCompactMode: boolean;
  toggleCompactMode: () => Promise<boolean>;
}

// Create context
export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// Theme modes
export const THEME_MODES = {
  AUTO: 'auto',
  LIGHT: 'light',
  DARK: 'dark',
} as const;

// Default theme settings
const defaultThemeSettings: { currentTheme: 'light' | 'dark' } = {
  currentTheme: 'light',
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings, saveSettings } = useSettings();
  const [currentTheme, setCurrentTheme] = useState(defaultThemeSettings.currentTheme);
  const [isCompactMode, setIsCompactMode] = useState(settings.compactMode || false);
  const isMounted = useRef(true);
  const mediaQueryRef = useRef<MediaQueryList | null>(null);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Detect system theme preference
  const detectSystemTheme = useCallback((): 'light' | 'dark' => {
    if (window.matchMedia) {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      return darkModeQuery.matches ? 'dark' : 'light';
    }
    return 'light'; // Default to light if matchMedia not supported
  }, []);

  // Handle system theme changes
  const handleSystemThemeChange = useCallback(
    (e: MediaQueryListEvent) => {
      if (settings.theme === THEME_MODES.AUTO && isMounted.current) {
        const systemTheme = e.matches ? 'dark' : 'light';
        setCurrentTheme(systemTheme);
        log.debug(`System theme changed to: ${systemTheme}`);
      }
    },
    [settings.theme],
  );

  // Update theme when settings change
  useEffect(() => {
    if (!settings.theme) return;

    // Determine current theme based on mode
    const newTheme = settings.theme === THEME_MODES.AUTO ? detectSystemTheme() : settings.theme;

    if (isMounted.current) {
      setCurrentTheme(newTheme);
    }
  }, [settings.theme, detectSystemTheme]);

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
  }, [settings.theme, handleSystemThemeChange]);

  // Update compact mode when settings change
  useEffect(() => {
    if (settings.compactMode !== undefined) {
      setIsCompactMode(settings.compactMode);
    }
  }, [settings.compactMode]);

  // Save theme settings
  const saveThemeMode = async (mode: AppSettings['theme']): Promise<boolean> => {
    try {
      const success = await saveSettings({
        ...settings,
        theme: mode,
      });

      if (success) {
        const newTheme = mode === THEME_MODES.AUTO ? detectSystemTheme() : mode;

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
  const toggleCompactMode = async (): Promise<boolean> => {
    try {
      const newCompactMode = !isCompactMode;
      const success = await saveSettings({
        ...settings,
        compactMode: newCompactMode,
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
    const algorithms: MappingAlgorithm[] = [];
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
    const isDark = currentTheme === 'dark';

    return {
      algorithm: getThemeAlgorithms(),
      token: {
        // Primary colors
        colorPrimary: '#0071e3',

        // Component specific
        borderRadius: 8,

        // Font
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',

        // Custom tokens for highlight colors
        colorPrimaryBg: isDark ? '#074360' : '#e6f7ff',
        colorPrimaryBgHover: isDark ? '#0a5a82' : '#bae7ff',
      },
    };
  };

  // Sync body background with current theme so overlays/modals don't flash white
  useEffect(() => {
    document.body.style.backgroundColor = currentTheme === 'dark' ? '#141414' : '#f5f5f5';
  }, [currentTheme]);

  // Context value
  const value: ThemeContextValue = {
    themeMode: settings.theme || THEME_MODES.AUTO,
    currentTheme: currentTheme,
    loading: false,
    saveThemeSettings: saveThemeMode,
    isSystemTheme: settings.theme === THEME_MODES.AUTO,
    isDarkMode: currentTheme === 'dark',
    isCompactMode,
    toggleCompactMode,
  };

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider theme={getAntdThemeConfig()}>{children}</ConfigProvider>
    </ThemeContext.Provider>
  );
}

// Custom hook for using the theme context
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
