const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

// Main process config
const mainConfig = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    target: 'electron-main',
    entry: './src/main.js',
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
                        presets: ['@babel/preset-env'],
                        cacheDirectory: true
                    }
                }
            }
        ]
    },
    resolve: {
        fallback: {
            "fsevents": false
        },
        alias: {
            'fsevents': false,
            'chokidar': path.resolve(__dirname, 'node_modules/chokidar'),
            'config': path.resolve(__dirname, 'config')
        }
    },
    externals: {
        'fsevents': 'empty'
    },
    cache: {
        type: 'filesystem',
        buildDependencies: {
            config: [__filename]
        }
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
            'process.env.RUNNING_IN_PRODUCTION': JSON.stringify(true),
            // Add config path
            'process.env.CONFIG_PATH': JSON.stringify(path.resolve(__dirname, 'config'))
        })
    ],
    optimization: {
        minimize: process.env.NODE_ENV === 'production',
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                parallel: true,
                terserOptions: {
                    compress: {
                        drop_console: false,
                        drop_debugger: false,
                        passes: 2
                    }
                }
            })
        ],
        // Disable code splitting for main process
        splitChunks: false,
        runtimeChunk: false
    },
    devtool: process.env.NODE_ENV === 'production' ? false : 'source-map'
};

// Preload script config
const preloadConfig = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    target: 'electron-preload',
    entry: './src/preload.js',
    output: {
        path: path.resolve(__dirname, 'dist-webpack'),
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
                        presets: ['@babel/preset-env'],
                        cacheDirectory: true
                    }
                }
            }
        ]
    },
    resolve: {
        fallback: {
            "fsevents": false
        },
        alias: {
            'fsevents': false,
            'config': path.resolve(__dirname, 'config')
        }
    },
    externals: {
        'fsevents': 'empty'
    },
    cache: {
        type: 'filesystem',
        buildDependencies: {
            config: [__filename]
        }
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
            'process.env.RUNNING_IN_PRODUCTION': JSON.stringify(true),
            // Add config path
            'process.env.CONFIG_PATH': JSON.stringify(path.resolve(__dirname, 'config'))
        })
    ],
    optimization: {
        minimize: process.env.NODE_ENV === 'production',
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                parallel: true,
                terserOptions: {
                    compress: {
                        drop_console: false,
                        drop_debugger: false,
                        passes: 2
                    }
                }
            })
        ],
        // Disable code splitting for main process
        splitChunks: false,
        runtimeChunk: false
    },
    devtool: process.env.NODE_ENV === 'production' ? false : 'source-map'
};

// Renderer process config (React)
const rendererConfig = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    target: 'web', // Changed from 'electron-renderer' to 'web' to avoid node polyfills
    entry: './src/renderer/index.jsx',
    performance: {
        hints: false, // Disable performance warnings
    },
    output: {
        path: path.resolve(__dirname, 'dist-webpack'),
        filename: process.env.NODE_ENV === 'production' ? '[name].[contenthash].js' : 'bundle.js',
        chunkFilename: process.env.NODE_ENV === 'production' ? '[name].[contenthash].js' : '[name].js',
        clean: false // Don't clean to avoid deleting main.js and preload.js
    },
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env', '@babel/preset-react'],
                        cacheDirectory: true
                    }
                }
            },
            {
                test: /\.less$/,
                use: [
                    'style-loader',
                    'css-loader',
                    {
                        loader: 'less-loader',
                        options: {
                            lessOptions: {
                                javascriptEnabled: true,
                                math: 'always',
                                modifyVars: {
                                    // Apple-inspired theme variables for Ant Design v5
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
                    }
                ]
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            }
        ]
    },
    resolve: {
        extensions: ['.js', '.jsx'],
        fallback: {
            "fsevents": false,
            "buffer": false,
            "process": false
        },
        alias: {
            // Force all fsevents to be disabled
            'fsevents': false,
            // Force production version of React
            'react': path.resolve('./node_modules/react'),
            'react-dom': path.resolve('./node_modules/react-dom'),
            'scheduler': path.resolve('./node_modules/scheduler'),
            // Add config directory alias
            'config': path.resolve(__dirname, 'config')
        }
    },
    cache: {
        type: 'filesystem',
        buildDependencies: {
            config: [__filename]
        }
    },
    externals: {
        'fsevents': 'empty'
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
            // Add explicit React production mode flag
            'process.env.RUNNING_IN_PRODUCTION': JSON.stringify(true),
            // Add config path
            'process.env.CONFIG_PATH': JSON.stringify(path.resolve(__dirname, 'config'))
        }),
        new webpack.ProvidePlugin({
            global: 'globalThis',
        }),
        new HtmlWebpackPlugin({
            template: path.resolve(__dirname, 'src/renderer/index.html'),
            filename: 'renderer/index.html',
            inject: 'body',
            scriptLoading: 'defer'
        }),
        new CopyPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, 'src/renderer/images'),
                    to: path.resolve(__dirname, 'dist-webpack/renderer/images'),
                    noErrorOnMissing: true
                },
                // Copy config directory files needed at runtime
                {
                    from: path.resolve(__dirname, 'config'),
                    to: path.resolve(__dirname, 'dist-webpack/config'),
                    noErrorOnMissing: true
                },
                {
                    from: path.resolve(__dirname, 'scripts/debian'),
                    to: path.resolve(__dirname, 'dist-webpack/scripts/debian'),
                    noErrorOnMissing: true
                },
                {
                    from: path.resolve(__dirname, 'build/linux/install-open-headers.sh'),
                    to: path.resolve(__dirname, 'dist-webpack/install-open-headers.sh')
                }
            ]
        })
    ],
    optimization: {
        minimize: process.env.NODE_ENV === 'production',
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                parallel: true,
                terserOptions: {
                    parse: {
                        ecma: 8,
                    },
                    compress: {
                        ecma: 5,
                        warnings: false,
                        comparisons: false,
                        inline: 2,
                        drop_console: false,
                        drop_debugger: false,
                        pure_funcs: [],
                        passes: 2
                    },
                    output: {
                        ecma: 5,
                        comments: false,
                        ascii_only: true,
                    },
                    safari10: true,
                }
            })
        ],
        splitChunks: process.env.NODE_ENV === 'production' ? {
            chunks: 'all',
            cacheGroups: {
                vendor: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendor',
                    priority: 10
                },
                antd: {
                    test: /[\\/]node_modules[\\/](antd|@ant-design|rc-[^/]+)[\\/]/,
                    name: 'antd',
                    priority: 20
                },
                react: {
                    test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                    name: 'react',
                    priority: 20
                }
            }
        } : false,
        runtimeChunk: process.env.NODE_ENV === 'production' ? 'single' : false
    },
    devtool: process.env.NODE_ENV === 'production' ? false : 'source-map'
};

module.exports = [mainConfig, preloadConfig, rendererConfig];