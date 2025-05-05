const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
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
                        presets: ['@babel/preset-env']
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
            // Force all fsevents to be disabled
            'fsevents': false,
            'chokidar': path.resolve(__dirname, 'node_modules/chokidar'),
            // Add config directory alias
            'config': path.resolve(__dirname, 'config')
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
    externals: {
        'fsevents': 'empty'
    },
    optimization: {
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                terserOptions: {
                    compress: {
                        drop_console: false, // Keep console.log statements
                        drop_debugger: false, // Keep debugger statements too
                    }
                }
            })
        ]
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
                        presets: ['@babel/preset-env']
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
            // Force all fsevents to be disabled
            'fsevents': false,
            // Add config directory alias
            'config': path.resolve(__dirname, 'config')
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
    externals: {
        'fsevents': 'empty'
    },
    optimization: {
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                terserOptions: {
                    compress: {
                        drop_console: false, // Keep console.log statements
                        drop_debugger: false, // Keep debugger statements too
                    }
                }
            })
        ]
    },
    devtool: process.env.NODE_ENV === 'production' ? false : 'source-map'
};

// Renderer process config (React)
const rendererConfig = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    target: 'web',
    entry: './src/renderer/index.jsx',
    performance: {
        hints: false, // Disable performance warnings
    },
    output: {
        path: path.resolve(__dirname, 'dist-webpack'),
        filename: 'bundle.js',
        // Add this to ensure unique filenames for chunks
        chunkFilename: '[name].[chunkhash].js'
    },
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env', '@babel/preset-react']
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
            "fsevents": false
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
        new CopyPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, 'src/renderer/index.html'),
                    to: path.resolve(__dirname, 'dist-webpack/renderer/index.html')
                },
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
                }
            ]
        })
    ],
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                terserOptions: {
                    parse: {
                        ecma: 8,
                    },
                    compress: {
                        ecma: 5,
                        warnings: false,
                        comparisons: false,
                        inline: 2,
                        drop_console: false, // Keep console.log statements
                        drop_debugger: false, // Keep debugger statements too
                        pure_funcs: [], // Don't remove any console methods
                    },
                    output: {
                        ecma: 5,
                        comments: false,
                        ascii_only: true,
                    },
                    safari10: true, // Compatibility for older Safari
                }
            })
        ],
        // Disable splitChunks to avoid the conflict
        splitChunks: false
    },
    devtool: process.env.NODE_ENV === 'production' ? false : 'source-map'
};

module.exports = [mainConfig, preloadConfig, rendererConfig];