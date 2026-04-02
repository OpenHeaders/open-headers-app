// Mock electron-log for testing outside Electron runtime

const noop = () => {};
const transport = { format: '', level: 'info', getFile: () => ({ path: '/tmp/test.log' }) };

const logger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  transports: { console: transport, file: transport },
};

export default logger;
