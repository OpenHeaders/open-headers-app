const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

// Main process config
const mainConfig = {
    mode: 'production',
    target: 'electron-main',
    entry: './main.js',
    output: {
        path: path.resolve(__dirname, 'dist-webpack'),
        filename: 'main.js'
    },
    node: {
        __dirname: false,
        __filename: false
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: false, // Keep console logs
                        drop_debugger: true
                    },
                    mangle: true,
                    output: {
                        comments: false
                    }
                },
                extractComments: false
            })
        ]
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'src/ui', to: 'src/ui' },
                { from: 'src/config', to: 'src/config' },
                { from: 'package.json', to: 'package.json' },
                { from: 'build', to: 'build' }
            ],
        }),
    ],
};

// Preload script config
const preloadConfig = {
    mode: 'production',
    target: 'electron-preload',
    entry: './src/preload/preload.js',
    output: {
        path: path.resolve(__dirname, 'dist-webpack/src/preload'),
        filename: 'preload.js'
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: false,
                        drop_debugger: true
                    },
                    mangle: true,
                    output: {
                        comments: false
                    }
                },
                extractComments: false
            })
        ]
    }
};

// Renderer process config
const rendererConfig = {
    mode: 'production',
    target: 'web',
    entry: {
        renderer: './src/ui/renderer.js',
        'source-form-controller': './src/ui/source-form-controller.js',
        'source-table-controller': './src/ui/source-table-controller.js',
        utils: './src/ui/utils.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist-webpack/src/ui'),
        filename: '[name].js'
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: false,
                        drop_debugger: true
                    },
                    mangle: true,
                    output: {
                        comments: false
                    }
                },
                extractComments: false
            })
        ]
    }
};

// Service/Controller modules config
const modulesConfig = {
    mode: 'production',
    target: 'electron-main',
    entry: {
        'source-service': './src/services/source-service.js',
        'file-service': './src/services/file-service.js',
        'env-service': './src/services/env-service.js',
        'http-service': './src/services/http-service.js',
        'tray-service': './src/services/tray-service.js', // Added for tray functionality
        'source-controller': './src/controllers/source-controller.js',
        'settings-controller': './src/controllers/settings-controller.js', // Added for settings management
        'ws-controller': './src/controllers/ws-controller.js',
        'source-repository': './src/repositories/source-repository.js',
        'source': './src/models/source.js',
        'app-config': './src/config/app-config.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist-webpack/src'),
        filename: (pathData) => {
            const name = pathData.chunk.name;
            if (name === 'source') {
                return 'models/source.js';
            } else if (name === 'source-repository') {
                return 'repositories/source-repository.js';
            } else if (name.endsWith('-controller')) {
                return `controllers/${name}.js`;
            } else if (name.endsWith('-service')) {
                return `services/${name}.js`;
            } else if (name === 'app-config') {
                return 'config/app-config.js';
            }
            return name;
        },
        library: {
            type: 'commonjs2'
        }
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: false, // Keep console logs
                        drop_debugger: true
                    },
                    mangle: true,
                    output: {
                        comments: false
                    }
                },
                extractComments: false
            })
        ]
    },
    externals: ['electron', 'ws', 'chokidar', 'path', 'fs', 'http', 'https', 'events', 'querystring']
};

module.exports = [mainConfig, preloadConfig, rendererConfig, modulesConfig];