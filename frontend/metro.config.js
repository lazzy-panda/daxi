const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Resolve @react-navigation/core, native, routers from expo-router's bundled copy
// to avoid having two copies of the navigator context
const expoRouterNavPath = path.resolve(
  __dirname,
  'node_modules/expo-router/node_modules/@react-navigation'
);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@react-navigation/core': path.join(expoRouterNavPath, 'core'),
  '@react-navigation/routers': path.join(expoRouterNavPath, 'routers'),
};

module.exports = config;
