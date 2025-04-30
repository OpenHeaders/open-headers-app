import { useCallback, useRef } from 'react';

/**
 * Custom hook for file system operations
 */
export function useFileSystem() {
    // Track active watchers
    const activeWatchers = useRef(new Map());

    /**
     * Read a file
     */
    const readFile = useCallback(async (filePath) => {
        try {
            return await window.electronAPI.readFile(filePath);
        } catch (error) {
            throw new Error(`Error reading file: ${error.message}`);
        }
    }, []);

    /**
     * Write to a file
     */
    const writeFile = useCallback(async (filePath, content) => {
        try {
            await window.electronAPI.writeFile(filePath, content);
            return true;
        } catch (error) {
            throw new Error(`Error writing to file: ${error.message}`);
        }
    }, []);

    /**
     * Watch a file for changes - using polling for cross-platform consistency
     */
    const watchFile = useCallback(async (sourceId, filePath) => {
        try {
            // Read initial content - this also sets up the watcher with polling in main process
            const initialContent = await window.electronAPI.watchFile(sourceId, filePath);

            // Store in active watchers
            activeWatchers.current.set(sourceId, filePath);

            console.log(`Set up file watcher (with polling) for source ${sourceId}: ${filePath}`);
            return initialContent;
        } catch (error) {
            throw new Error(`Error watching file: ${error.message}`);
        }
    }, []);

    /**
     * Stop watching a file
     */
    const unwatchFile = useCallback(async (sourceId, filePath) => {
        try {
            if (activeWatchers.current.has(sourceId)) {
                await window.electronAPI.unwatchFile(filePath);
                activeWatchers.current.delete(sourceId);
                console.log(`Stopped watching file: ${filePath}`);
                return true;
            }
            return false;
        } catch (error) {
            throw new Error(`Error unwatching file: ${error.message}`);
        }
    }, []);

    /**
     * Select a file using the file dialog
     */
    const selectFile = useCallback(async () => {
        try {
            const filePath = await window.electronAPI.openFileDialog();
            return filePath; // Will be null if user cancels
        } catch (error) {
            throw new Error(`Error selecting file: ${error.message}`);
        }
    }, []);

    /**
     * Save to a file using the save dialog
     */
    const saveFile = useCallback(async (options = {}, content) => {
        try {
            const filePath = await window.electronAPI.saveFileDialog(options);
            if (filePath && content) {
                await writeFile(filePath, content);
            }
            return filePath; // Will be null if user cancels
        } catch (error) {
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