import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    // Allow import from 'foo.js' to resolve to 'foo.ts' (matches webpack extensionAlias)
    plugins: [{
        name: 'resolve-js-to-ts',
        resolveId(source, importer) {
            if (source.endsWith('.js') && importer && !source.includes('node_modules')) {
                return this.resolve(source.replace(/\.js$/, '.ts'), importer, { skipSelf: true })
                    .then(resolved => resolved || null)
                    .catch(() => null);
            }
        },
    }],

    test: {
        environment: 'node',
        setupFiles: ['./tests/setup.js'],
        include: ['tests/**/*.test.{js,ts}'],
        deps: {
            inline: [/src\//, 'electron', 'electron-log'],
        },
        testTimeout: 10000,
        coverage: {
            provider: 'v8',
            include: ['src/services/**', 'src/utils/**', 'src/main/**'],
            exclude: ['src/renderer/**'],
        },
    },

    resolve: {
        alias: {
            'electron': path.resolve(__dirname, 'tests/__mocks__/electron.mjs'),
            '@services': path.resolve(__dirname, 'src/services'),
            '@utils': path.resolve(__dirname, 'src/utils'),
        },
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },
});
