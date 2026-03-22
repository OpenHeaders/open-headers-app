import { describe, it, expect } from 'vitest';
import { TeamWorkspaceCreator } from '../../../src/services/workspace/git/operations/TeamWorkspaceCreator';

type CreateOptions = Parameters<TeamWorkspaceCreator['validateOptions']>[0];

function makeCreateOptions(overrides: Partial<CreateOptions> = {}): CreateOptions {
    return {
        workspaceId: 'ws-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        workspaceName: 'OpenHeaders Staging Environment',
        repositoryUrl: 'https://github.com/OpenHeaders/open-headers-app.git',
        tempDir: '/Users/jane.doe/.openheaders/workspace-sync',
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
        it('accepts valid options with enterprise data', () => {
            expect(() => creator.validateOptions(makeCreateOptions())).not.toThrow();
        });

        it('accepts workspace IDs with letters, numbers, hyphens, underscores', () => {
            expect(() => creator.validateOptions(makeCreateOptions({
                workspaceId: 'ws-staging_env-2025',
            }))).not.toThrow();
        });

        it('accepts GitLab URL', () => {
            expect(() => creator.validateOptions(makeCreateOptions({
                repositoryUrl: 'https://gitlab.openheaders.io/platform/shared-headers.git',
            }))).not.toThrow();
        });

        it('throws when workspaceId is missing', () => {
            expect(() => creator.validateOptions(makeCreateOptions({
                workspaceId: undefined as unknown as string,
            }))).toThrow('Missing required field: workspaceId');
        });

        it('throws when workspaceId is empty string', () => {
            expect(() => creator.validateOptions(makeCreateOptions({
                workspaceId: '',
            }))).toThrow('Missing required field: workspaceId');
        });

        it('throws when workspaceName is missing', () => {
            expect(() => creator.validateOptions(makeCreateOptions({
                workspaceName: undefined as unknown as string,
            }))).toThrow('Missing required field: workspaceName');
        });

        it('throws when repositoryUrl is missing', () => {
            expect(() => creator.validateOptions(makeCreateOptions({
                repositoryUrl: undefined as unknown as string,
            }))).toThrow('Missing required field: repositoryUrl');
        });

        it('throws for workspace ID with spaces', () => {
            expect(() => creator.validateOptions(makeCreateOptions({
                workspaceId: 'ws 123 with spaces',
            }))).toThrow('Invalid workspace ID format');
        });

        it('throws for workspace ID with special characters', () => {
            expect(() => creator.validateOptions(makeCreateOptions({
                workspaceId: 'ws@123!',
            }))).toThrow('Invalid workspace ID format');
        });

        it('throws for invalid repository URL', () => {
            expect(() => creator.validateOptions(makeCreateOptions({
                repositoryUrl: 'not-a-valid-url',
            }))).toThrow('Invalid repository URL');
        });

        it('throws for repository URL without protocol', () => {
            expect(() => creator.validateOptions(makeCreateOptions({
                repositoryUrl: 'github.com/OpenHeaders/open-headers-app',
            }))).toThrow('Invalid repository URL');
        });
    });
});
