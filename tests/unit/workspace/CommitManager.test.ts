import { describe, it, expect } from 'vitest';
import { CommitManager } from '../../../src/services/workspace/git/operations/CommitManager';

describe('CommitManager (pure logic)', () => {
    // Use a dummy executor for pure logic tests
    const manager = new CommitManager({} as any);

    describe('generateCommitMessage()', () => {
        it('generates create message', () => {
            const msg = manager.generateCommitMessage('create', 'My Workspace');
            expect(msg).toContain('Create workspace');
            expect(msg).toContain('My Workspace');
        });

        it('generates update message', () => {
            const msg = manager.generateCommitMessage('update', 'WS');
            expect(msg).toContain('Update workspace');
        });

        it('generates sync message', () => {
            const msg = manager.generateCommitMessage('sync', 'WS');
            expect(msg).toContain('Synchronize');
        });

        it('generates auto-sync message', () => {
            const msg = manager.generateCommitMessage('auto-sync', 'WS');
            expect(msg).toContain('Auto-sync');
        });

        it('uses default for unknown action', () => {
            const msg = manager.generateCommitMessage('unknown', 'WS');
            expect(msg).toContain('Update workspace WS');
        });
    });

    describe('generateAutoCommitMessage()', () => {
        it('includes modified count', () => {
            const msg = manager.generateAutoCommitMessage({
                hasChanges: true,
                modified: ['a.json', 'b.json'],
                added: [],
                deleted: [],
                renamed: [],
                untracked: []
            });
            expect(msg).toContain('2 modified');
        });

        it('includes added count', () => {
            const msg = manager.generateAutoCommitMessage({
                hasChanges: true,
                modified: [],
                added: ['new.json'],
                deleted: [],
                renamed: [],
                untracked: []
            });
            expect(msg).toContain('1 added');
        });

        it('includes deleted count', () => {
            const msg = manager.generateAutoCommitMessage({
                hasChanges: true,
                modified: [],
                added: [],
                deleted: ['old.json'],
                renamed: [],
                untracked: []
            });
            expect(msg).toContain('1 deleted');
        });

        it('combines multiple change types', () => {
            const msg = manager.generateAutoCommitMessage({
                hasChanges: true,
                modified: ['a'],
                added: ['b'],
                deleted: ['c'],
                renamed: [],
                untracked: []
            });
            expect(msg).toContain('1 modified');
            expect(msg).toContain('1 added');
            expect(msg).toContain('1 deleted');
        });
    });

    describe('escapeMessage()', () => {
        it('escapes double quotes', () => {
            expect(manager.escapeMessage('say "hello"')).toBe('say \\"hello\\"');
        });

        it('escapes dollar signs', () => {
            expect(manager.escapeMessage('cost $5')).toBe('cost \\$5');
        });

        it('returns unchanged string without special chars', () => {
            expect(manager.escapeMessage('simple message')).toBe('simple message');
        });
    });
});
