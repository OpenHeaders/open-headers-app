import { describe, it, expect } from 'vitest';
import { TeamWorkspaceCreator } from '../../../../src/services/workspace/git/operations/TeamWorkspaceCreator';

describe('TeamWorkspaceCreator', () => {
    const creator = new TeamWorkspaceCreator({
        repositoryManager: {},
        branchManager: {},
        sparseCheckoutManager: {},
        commitManager: {},
        configDetector: {},
        configValidator: {}
    });

    describe('validateOptions()', () => {
        it('accepts valid options', () => {
            expect(() => creator.validateOptions({
                workspaceId: 'ws-123',
                workspaceName: 'Test Workspace',
                repositoryUrl: 'https://github.com/owner/repo'
            })).not.toThrow();
        });

        it('throws when workspaceId is missing', () => {
            expect(() => creator.validateOptions({
                workspaceName: 'Test',
                repositoryUrl: 'https://github.com/owner/repo'
            })).toThrow('Missing required field: workspaceId');
        });

        it('throws when workspaceName is missing', () => {
            expect(() => creator.validateOptions({
                workspaceId: 'ws-1',
                repositoryUrl: 'https://github.com/owner/repo'
            })).toThrow('Missing required field: workspaceName');
        });

        it('throws when repositoryUrl is missing', () => {
            expect(() => creator.validateOptions({
                workspaceId: 'ws-1',
                workspaceName: 'Test'
            })).toThrow('Missing required field: repositoryUrl');
        });

        it('throws for invalid workspace ID format', () => {
            expect(() => creator.validateOptions({
                workspaceId: 'ws 123!',
                workspaceName: 'Test',
                repositoryUrl: 'https://github.com/owner/repo'
            })).toThrow('Invalid workspace ID format');
        });

        it('accepts workspace IDs with letters, numbers, hyphens, underscores', () => {
            expect(() => creator.validateOptions({
                workspaceId: 'my_workspace-123',
                workspaceName: 'Test',
                repositoryUrl: 'https://github.com/owner/repo'
            })).not.toThrow();
        });

        it('throws for invalid repository URL', () => {
            expect(() => creator.validateOptions({
                workspaceId: 'ws-1',
                workspaceName: 'Test',
                repositoryUrl: 'not-a-valid-url'
            })).toThrow('Invalid repository URL');
        });
    });
});
