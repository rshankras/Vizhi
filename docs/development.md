# Development and packaging

[← Back to the README](../README.md)

## Requirements

- A current Node.js LTS release.
- .NET 10 SDK when building the Logitech plugin.
- `logiplugintool` from the Logi Actions SDK for local package installation.
- macOS, Terminal.app, and Codex CLI for end-to-end hardware testing.

## Test the TypeScript service

```sh
npm install
npm test
```

## Run the local dashboard

```sh
npm start
```

For a replayable demo without a keypad, Codex account, or macOS:

```sh
npm run demo
```

## Build the plugin

Use the normal build during development. Use the development build only when you want Logi Plugin Service to create or refresh its `.link` development plugin:

```sh
npm run plugin:build
npm run plugin:dev
```

Create a distributable package with one repeatable build, pack, and verification command:

```sh
npm run plugin:package
```

The result is written as `VizhiPlugin/bin/Vizhi_<version>.lplug4`, including the default profile, bundled Codex hook, and physical Voice helper.

## Create a release

For a public release, use the release command instead of copying a build manually:

```sh
npm run plugin:release
```

It builds and verifies the package, copies it to `release/v<version>/`, writes a SHA-256 checksum, and removes only older local `.lplug4` artifacts from `VizhiPlugin/bin/`. It never commits, tags, pushes, or changes installed plugins.

Before publishing to Logi Marketplace, verify the support and home-page URLs in `VizhiPlugin/src/package/metadata/LoupedeckPackage.yaml`, increment the semantic version, and test the package on supported physical hardware.

## Uninstall and cleanup

For a normal Logi Options+ installation, remove Vizhi in Logi Options+ first, then clean up the local Vizhi integration from this source checkout:

```sh
npm run plugin:cleanup
```

For a local SDK installation, the following also asks `logiplugintool` to remove the Vizhi package:

```sh
npm run plugin:uninstall
```

Both commands compile only the TypeScript cleanup CLI; they do not build or package a `.lplug4` file. They delete only Vizhi's marked Codex-hook block, remove local hook files and the physical Voice helper/model, clear `/tmp/vizhi` runtime state, and reset the separate `Vizhi Voice Helper` microphone authorization. Custom prompt templates and the `config.toml.vizhi.bak` backup remain by default.

To remove custom prompt templates too, run:

```sh
npm run plugin:cleanup -- --purge
```

The script intentionally does not revoke Accessibility, Automation, or Screen & System Audio Recording for `LogiPluginService`: those are permissions for Logi's shared host service and may be used by other Logi plugins. See the [permission cleanup steps](permissions.md#removing-vizhi) when you no longer use any of those actions.
