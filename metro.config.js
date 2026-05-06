const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.watchFolders = [__dirname];
config.resolver = {
  ...config.resolver,
  blockList: [
    ...(config.resolver?.blockList ? [config.resolver.blockList].flat() : []),
    /\.local[/\\]/,
  ],
  extraNodeModules: {
    ...config.resolver?.extraNodeModules,
    "react-is": path.resolve(__dirname, "node_modules/react-is"),
  },
  resolveRequest: (context, moduleName, platform) => {
    // Fix nested react-is CJS resolution inside @react-navigation/core
    if (
      moduleName.startsWith("./cjs/react-is") &&
      context.originModulePath.includes("@react-navigation/core/node_modules/react-is")
    ) {
      const cjsFile = path.basename(moduleName);
      return {
        filePath: path.resolve(__dirname, "node_modules/react-is/cjs", cjsFile),
        type: "sourceFile",
      };
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

config.watcher = {
  ...config.watcher,
  watchman: {
    deferStates: ["hg.update"],
  },
  additionalExts: config.watcher?.additionalExts ?? [],
};

module.exports = config;
