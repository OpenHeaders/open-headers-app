import { describe, it, expect } from 'vitest';
import { WindowManager } from '../../../src/main/modules/window/windowManager';

describe('WindowManager', () => {
    describe('setLaunchedByProtocol', () => {
        it('starts with launchedByProtocol as false', () => {
            const wm = new WindowManager();
            // Access private field via type assertion — acceptable for testing
            expect((wm as unknown as { _launchedByProtocol: boolean })._launchedByProtocol).toBe(false);
        });

        it('sets launchedByProtocol to true', () => {
            const wm = new WindowManager();
            wm.setLaunchedByProtocol();
            expect((wm as unknown as { _launchedByProtocol: boolean })._launchedByProtocol).toBe(true);
        });
    });
});
