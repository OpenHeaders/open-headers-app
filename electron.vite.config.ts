import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import copy from 'rollup-plugin-copy';

export default defineConfig({
    // Main process
    main: {
        plugins: [
            externalizeDepsPlugin(),
            copy({
                targets: [
                    {
                        src: 'build/linux/install-open-headers.sh',
                        dest: 'dist-webpack/main'
                    }
                ],
                hook: 'writeBundle'
            })
        ],
        build: {
            outDir: 'dist-webpack/main',
            lib: {
                entry: 'src/main.ts'
            },
            rollupOptions: {
                output: {
                    entryFileNames: 'index.js'
                }
            },
            minify: process.env.NODE_ENV === 'production' ? 'terser' : false,
            sourcemap: process.env.NODE_ENV !== 'production'
        },
        resolve: {
            alias: {
                'chokidar': resolve(__dirname, 'node_modules/chokidar')
            }
        },
        define: {
            'process.env.RUNNING_IN_PRODUCTION': JSON.stringify(true)
        }
    },

    // Preload script
    preload: {
        plugins: [externalizeDepsPlugin()],
        build: {
            outDir: 'dist-webpack/preload',
            lib: {
                entry: 'src/preload.ts'
            },
            rollupOptions: {
                output: {
                    entryFileNames: 'index.js'
                }
            },
            minify: process.env.NODE_ENV === 'production' ? 'terser' : false,
            sourcemap: process.env.NODE_ENV !== 'production'
        },
        define: {
            'process.env.RUNNING_IN_PRODUCTION': JSON.stringify(true)
        }
    },

    // Renderer process (React)
    renderer: {
        root: 'src/renderer',
        build: {
            outDir: resolve('dist-webpack/renderer'),
            rollupOptions: {
                input: resolve(__dirname, 'src/renderer/index.html'),
                output: {
                    manualChunks: process.env.NODE_ENV === 'production'
                        ? (id: string) => {
                            if (id.includes('node_modules')) {
                                if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
                                    return 'react';
                                }
                                if (id.includes('antd') || id.includes('@ant-design') || id.match(/rc-[^/]+/)) {
                                    return 'antd';
                                }
                            }
                            return undefined;
                        }
                        : undefined
                }
            },
            minify: process.env.NODE_ENV === 'production' ? 'terser' : false,
            sourcemap: process.env.NODE_ENV !== 'production'
        },
        plugins: [
            copy({
                targets: [
                    {
                        src: 'src/renderer/images/*',
                        dest: 'dist-webpack/renderer/images'
                    },
                    {
                        src: 'node_modules/rrweb-player/dist/rrweb-player.umd.cjs',
                        dest: 'dist-webpack/renderer/lib',
                        rename: 'rrweb-player.js'
                    },
                    {
                        src: 'node_modules/rrweb-player/dist/style.css',
                        dest: 'dist-webpack/renderer/lib',
                        rename: 'rrweb-player.css'
                    }
                ],
                hook: 'writeBundle'
            })
        ],
        resolve: {
            alias: {
                'react': resolve(__dirname, 'node_modules/react'),
                'react-dom': resolve(__dirname, 'node_modules/react-dom'),
                'scheduler': resolve(__dirname, 'node_modules/scheduler')
            }
        },
        css: {
            preprocessorOptions: {
                less: {
                    javascriptEnabled: true,
                    math: 'always',
                    modifyVars: {
                        '@primary-color': '#0071e3',
                        '@link-color': '#0071e3',
                        '@success-color': '#34c759',
                        '@warning-color': '#ff9f0a',
                        '@error-color': '#ff3b30',
                        '@font-size-base': '14px',
                        '@heading-color': '#1d1d1f',
                        '@text-color': '#1d1d1f',
                        '@text-color-secondary': '#86868b',
                        '@disabled-color': '#d2d2d7',
                        '@border-radius-base': '6px',
                        '@border-color-base': '#d2d2d7',
                        '@box-shadow-base': '0 1px 2px rgba(0, 0, 0, 0.08)',
                        '@font-family': '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, sans-serif'
                    }
                }
            }
        },
        define: {
            'process.env.RUNNING_IN_PRODUCTION': JSON.stringify(true)
        }
    }
});
