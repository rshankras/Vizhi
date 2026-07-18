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

The result is written as `VizhiPlugin/bin/Vizhi_<version>.lplug4`, including the default profile, bundled Codex hook, and physical Voice helper. The package version reflects pre-public development iterations rather than prior public Vizhi releases.

Before publishing to Logi Marketplace, set real `supportPageUrl` and `homePageUrl` values in `VizhiPlugin/src/package/metadata/LoupedeckPackage.yaml`, increment the semantic version, and test the package on supported physical hardware.
