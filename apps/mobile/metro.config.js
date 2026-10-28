// The app lives outside the npm workspaces (Expo pins its own React and React
// Native), so Metro is told where the shared package's source lives.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const shared = path.resolve(__dirname, '../../packages/shared');

config.watchFolders = [...(config.watchFolders ?? []), shared];
// Resolve everything from the app's own node_modules first, so the shared
// package uses the app's copies of its dependencies.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules'), path.resolve(__dirname, '../../node_modules')];

module.exports = config;
