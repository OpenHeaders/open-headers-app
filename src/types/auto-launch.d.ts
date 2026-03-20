/**
 * Extended type declarations for auto-launch.
 *
 * The library supports `args` in its constructor options but
 * @types/auto-launch does not declare it. Since auto-launch uses
 * `export =`, we override the full module declaration.
 */

declare module 'auto-launch' {
    interface AutoLaunchOptions {
        name: string;
        path?: string;
        isHidden?: boolean;
        args?: string[];
        mac?: {
            useLaunchAgent?: boolean;
        };
    }

    class AutoLaunch {
        constructor(options: AutoLaunchOptions);
        enable(): Promise<void>;
        disable(): Promise<void>;
        isEnabled(): Promise<boolean>;
    }

    export = AutoLaunch;
}
