import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    extraResource: [
      // Include only essential files needed for initial setup
      // The rest will be installed via the wheel
      '../backend/requirements.txt'
    ],
    executableName: 'gaia-ui',
    name: 'gaiaui' // This ensures the output directory doesn't have spaces
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'GaiaUi',
      exe: 'gaia-ui.exe',
      setupExe: 'raux-setup.exe',
      setupIcon: './static/favicon.ico'
    }),
    new MakerZIP({}, ['darwin']),
    new MakerDeb({
      options: {
        name: 'gaiaui',
        productName: 'GAIA UI',
        homepage: 'https://github.com/aigdat/raux',
        categories: ['Development', 'Utility'],
        mimeType: ['x-scheme-handler/gaiaui'],
        section: 'devel',
        priority: 'optional',
        maintainer: 'AMD GAIA Team',
        desktopTemplate: './linux/gaiaui.desktop'
      }
    })
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/pages/loading/loading.html',
            js: './src/renderer.ts',
            name: 'main_window',
            preload: {
              js: './src/preload.ts',
            },
          },
        ],
      },
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
