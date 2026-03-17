import { useCallback, useRef } from 'react';

interface SaveFileOptions {
  [key: string]: any;
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
            return await (window as any).electronAPI.readFile(filePath);
        } catch (error: any) {
            throw new Error(`Error reading file: ${error.message}`);
        }
    }, []);

    /**
     * Write to a file
     */
    const writeFile = useCallback(async (filePath: string, content: string): Promise<boolean> => {
        try {
            await (window as any).electronAPI.writeFile(filePath, content);
            return true;
        } catch (error: any) {
            throw new Error(`Error writing to file: ${error.message}`);
        }
    }, []);

    /**
     * Watch a file for changes - using polling for cross-platform consistency
     */
    const watchFile = useCallback(async (sourceId: string, filePath: string): Promise<string> => {
        try {
            // Read initial content - this also sets up the watcher with polling in main process
            const initialContent = await (window as any).electronAPI.watchFile(sourceId, filePath);

            // Store in active watchers
            activeWatchers.current.set(sourceId, filePath);

            return initialContent;
        } catch (error: any) {
            throw new Error(`Error watching file: ${error.message}`);
        }
    }, []);

    /**
     * Stop watching a file
     */
    const unwatchFile = useCallback(async (sourceId: string, filePath: string): Promise<boolean> => {
        try {
            if (activeWatchers.current.has(sourceId)) {
                await (window as any).electronAPI.unwatchFile(filePath);
                activeWatchers.current.delete(sourceId);
                return true;
            }
            return false;
        } catch (error: any) {
            throw new Error(`Error unwatching file: ${error.message}`);
        }
    }, []);

    /**
     * Select a file using the file dialog
     */
    const selectFile = useCallback(async (): Promise<string | null> => {
        try {
            const filePath = await (window as any).electronAPI.openFileDialog();
            return filePath; // Will be null if user cancels
        } catch (error: any) {
            throw new Error(`Error selecting file: ${error.message}`);
        }
    }, []);

    /**
     * Save to a file using the save dialog
     */
    const saveFile = useCallback(async (options: SaveFileOptions = {}, content?: string): Promise<string | null> => {
        try {
            const filePath = await (window as any).electronAPI.saveFileDialog(options);
            if (filePath && content) {
                await writeFile(filePath, content);
            }
            return filePath; // Will be null if user cancels
        } catch (error: any) {
            throw new Error(`Error saving file: ${error.message}`);
        }
    }, [writeFile]);

    return {
        readFile,
        writeFile,
        watchFile,
        unwatchFile,
        selectFile,
        saveFile
    };
}
