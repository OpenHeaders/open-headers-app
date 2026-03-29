import { useCallback, useRef } from 'react';

interface SaveFileOptions {
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  title?: string;
}

interface UseFileSystemReturn {
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<boolean>;
  watchFile: (sourceId: string, filePath: string) => Promise<string>;
  unwatchFile: (sourceId: string, filePath: string) => Promise<boolean>;
  selectFile: () => Promise<string | null>;
  saveFile: (options?: SaveFileOptions, content?: string) => Promise<string | null>;
}

/**
 * Custom hook for file system operations
 */
export function useFileSystem(): UseFileSystemReturn {
  // Track active watchers
  const activeWatchers = useRef<Map<string, string>>(new Map());

  /**
   * Read a file
   */
  const readFile = useCallback(async (filePath: string): Promise<string> => {
    try {
      return String(await window.electronAPI.readFile(filePath));
    } catch (error: unknown) {
      throw new Error(`Error reading file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  /**
   * Write to a file
   */
  const writeFile = useCallback(async (filePath: string, content: string): Promise<boolean> => {
    try {
      await window.electronAPI.writeFile(filePath, content);
      return true;
    } catch (error: unknown) {
      throw new Error(`Error writing to file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  /**
   * Watch a file for changes - using polling for cross-platform consistency
   */
  const watchFile = useCallback(async (sourceId: string, filePath: string): Promise<string> => {
    try {
      // Read initial content - this also sets up the watcher with polling in main process
      const initialContent = await window.electronAPI.watchFile(sourceId, filePath);

      // Store in active watchers
      activeWatchers.current.set(sourceId, filePath);

      return initialContent;
    } catch (error: unknown) {
      throw new Error(`Error watching file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  /**
   * Stop watching a file
   */
  const unwatchFile = useCallback(async (sourceId: string, filePath: string): Promise<boolean> => {
    try {
      if (activeWatchers.current.has(sourceId)) {
        await window.electronAPI.unwatchFile(filePath);
        activeWatchers.current.delete(sourceId);
        return true;
      }
      return false;
    } catch (error: unknown) {
      throw new Error(`Error unwatching file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  /**
   * Select a file using the file dialog
   */
  const selectFile = useCallback(async (): Promise<string | null> => {
    try {
      const filePath = await window.electronAPI.openFileDialog();
      return filePath; // Will be null if user cancels
    } catch (error: unknown) {
      throw new Error(`Error selecting file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  /**
   * Save to a file using the save dialog
   */
  const saveFile = useCallback(
    async (options: SaveFileOptions = {}, content?: string): Promise<string | null> => {
      try {
        const filePath = await window.electronAPI.saveFileDialog(options);
        if (filePath && content) {
          await writeFile(filePath, content);
        }
        return filePath; // Will be null if user cancels
      } catch (error: unknown) {
        throw new Error(`Error saving file: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [writeFile],
  );

  return {
    readFile,
    writeFile,
    watchFile,
    unwatchFile,
    selectFile,
    saveFile,
  };
}
