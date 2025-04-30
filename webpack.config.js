const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

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
            'chokidar': path.resolve(__dirname, 'node_modules/chokidar')
        }
    },
    externals: {
        'fsevents': 'empty'
    },
    optimization: {
        minimizer: [
            new TerserPlugin({
                extractComments: false,
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
            'fsevents': false
        }
    },
    externals: {
        'fsevents': 'empty'
    },
    optimization: {
        minimizer: [
            new TerserPlugin({
                extractComments: false,
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
    output: {
        path: path.resolve(__dirname, 'dist-webpack'),
        filename: 'bundle.js'
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
            'fsevents': false
        }
    },
    externals: {
        'fsevents': 'empty'
    },
    plugins: [
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
                }
            ]
        })
    ],
    optimization: {
        minimizer: [
            new TerserPlugin({
                extractComments: false,
            })
        ]
    },
    devtool: process.env.NODE_ENV === 'production' ? false : 'source-map'
};

module.exports = [mainConfig, preloadConfig, rendererConfig];