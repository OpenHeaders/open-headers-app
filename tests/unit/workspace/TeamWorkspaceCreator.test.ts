import { describe, it, expect } from 'vitest';
import { TeamWorkspaceCreator } from '../../../src/services/workspace/git/operations/TeamWorkspaceCreator';

type CreateOptions = Parameters<TeamWorkspaceCreator['validateOptions']>[0];

function makeCreateOptions(overrides: Record<string, unknown> = {}): CreateOptions {
    return {
        workspaceId: 'ws-1',
        workspaceName: 'Test',
        repositoryUrl: 'https://github.com/owner/repo',
        tempDir: '/tmp/test',
        ...overrides,
    } as CreateOptions;
}

describe('TeamWorkspaceCreator', () => {
    const creator = new TeamWorkspaceCreator({
        repositoryManager: {},
        branchManager: {},
        sparseCheckoutManager: {},
        commitManager: {},
        configDetector: {},
        configValidator: {}
    } as unknown as ConstructorParameters<typeof TeamWorkspaceCreator>[0]);

    describe('validateOptions()', () => {
        it('accepts valid options', () => {
            expect(() => creator.validateOptions(makeCreateOptions({
                workspaceId: 'ws-123',
                workspaceName: 'Test Workspace',
            }))).not.toThrow();
        });

        it('throws when workspaceId is missing', () => {
            expect(() => creator.validateOptions(makeCreateOptions({
                workspaceId: undefined,
            }))).toThrow('Missing required field: workspaceId');
        });

        it('throws when workspaceName is missing', () => {
            expect(() => creator.validateOptions(makeCreateOptions({
                workspaceName: undefined,
            }))).toThrow('Missing required field: workspaceName');
        });

        it('throws when repositoryUrl is missing', () => {
            expect(() => creator.validateOptions(makeCreateOptions({
                repositoryUrl: undefined,
            }))).toThrow('Missing required field: repositoryUrl');
        });

        it('throws for invalid workspace ID format', () => {
            expect(() => creator.validateOptions(makeCreateOptions({
                workspaceId: 'ws 123!',
            }))).toThrow('Invalid workspace ID format');
        });

        it('accepts workspace IDs with letters, numbers, hyphens, underscores', () => {
            expect(() => creator.validateOptions(makeCreateOptions({
                workspaceId: 'my_workspace-123',
            }))).not.toThrow();
        });

        it('throws for invalid repository URL', () => {
            expect(() => creator.validateOptions(makeCreateOptions({
                repositoryUrl: 'not-a-valid-url',
            }))).toThrow('Invalid repository URL');
        });
    });
});
