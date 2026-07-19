import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const profileName = "9FC71D9CD70C4C1CA3E776D893217E8D";
const workspaceName = "A7634D8FC4EE4AE6A049C90A9A7E81A7";
const profileApplicationName = "@_vizhi";
const terminalBundleName = "com.apple.Terminal";

function readVersion(metadataPath) {
  const content = readFileSync(metadataPath, "utf8");
  const match = content.match(/^version:\s*([0-9]+(?:\.[0-9]+){2})\s*$/m);
  if (!match) throw new Error(`Could not read plugin version from ${metadataPath}`);
  return match[1];
}

function control(controlId, pressAction) {
  return {
    $type: "Loupedeck.Service.Devices.Loupedeck7Devices.ProfileLayoutControl7, LoupedeckService",
    controlId,
    pressAction,
    rotateAction: null,
  };
}

function page(name, displayName, actions) {
  return {
    $type: "Loupedeck.Service.Devices.Loupedeck7Devices.ProfileLayoutPage7, LoupedeckService",
    name,
    displayName,
    description: null,
    controls: actions.map((action, controlId) => control(controlId, action)),
  };
}

function action(command, parameter) {
  return `$Vizhi___Loupedeck.VizhiPlugin.${command}${parameter ? `___${parameter}` : ""}`;
}

const showActionsRingAction = "$@Generic___Loupedeck.GenericPlugin.ShowRadialMenuDynamicAction";
const staticActionIcons = [
  { actionId: action("NavigationCommand", "down"), label: "Down", icon: "down" },
  { actionId: action("NavigationCommand", "enter"), label: "Enter", icon: "enter" },
  { actionId: action("NavigationCommand", "page_down"), label: "Page Down", icon: "pagedown" },
  { actionId: action("NavigationCommand", "page_up"), label: "Page Up", icon: "pageup" },
  { actionId: action("NavigationCommand", "up"), label: "Up", icon: "up" },
  { actionId: action("ContextCommand", "clipboard"), label: "Clipboard", icon: "clipboard" },
  { actionId: action("ContextCommand", "screenshot"), label: "Screenshot", icon: "capture" },
  { actionId: action("NewTerminalTabCommand"), label: "New Tab", icon: "terminaltab" },
  { actionId: action("NewTerminalWindowCommand"), label: "New Window", icon: "terminalwindow" },
  { actionId: action("TemplateCommand", "explain"), label: "Explain", icon: "explain" },
  { actionId: action("TemplateCommand", "fix_bug"), label: "Fix Bug", icon: "fixbug" },
  { actionId: action("TemplateCommand", "refactor"), label: "Refactor", icon: "refactor" },
  { actionId: action("TemplateCommand", "review"), label: "Review", icon: "review" },
  { actionId: action("TemplateCommand", "security"), label: "Security", icon: "security" },
  { actionId: action("TemplateCommand", "write_tests"), label: "Write Tests", icon: "tests" },
  { actionId: action("TemplateCommand", "plan"), label: "Plan", icon: "plan" },
  { actionId: action("TemplateCommand", "handoff"), label: "Handoff", icon: "handoff" },
  { actionId: action("TemplateCommand", "safe_revert"), label: "Safe Revert", icon: "revert" },
  { actionId: action("CompactSessionCommand"), label: "Compact", icon: "compact" },
  { actionId: action("InterruptSessionCommand"), label: "Esc", icon: "interrupt" },
  { actionId: action("ModelSessionCommand"), label: "Model", icon: "model" },
  { actionId: action("NewSessionCommand"), label: "New", icon: "newsession" },
  { actionId: action("FavoritePromptCommand"), label: "Favorite", icon: "favorite" },
  { actionId: action("AgentSessionCommand"), label: "Agent", icon: "agent" },
  { actionId: action("ForkSessionCommand"), label: "Fork", icon: "fork" },
  { actionId: action("ExitSessionCommand"), label: "Exit", icon: "exit" },
  { actionId: action("TemplateCommand", "commit"), label: "Commit", icon: "commit" },
  { actionId: action("TemplateCommand", "create_pr"), label: "Create PR", icon: "createpr" },
  { actionId: action("TemplateCommand", "diff"), label: "Diff", icon: "diff" },
  { actionId: action("TemplateCommand", "log"), label: "Git Log", icon: "gitlog" },
  { actionId: action("TemplateCommand", "push"), label: "Push", icon: "push" },
  { actionId: action("TemplateCommand", "status"), label: "Status", icon: "status" },
];

function actionIconTemplate(label, iconPath) {
  return {
    backgroundColor: 0xFF000000,
    items: [
      {
        image: readFileSync(iconPath).toString("base64"),
        imageFileName: null,
        imageColor: 0xffffffff,
        imageRotation: "None",
        isVisible: true,
        itemType: "Image",
        area: { x: 17, y: 0, width: 65, height: 65 },
      },
      {
        text: label,
        originalText: label,
        textColor: 0xffffffff,
        fontSize: 5,
        fontName: "Brown Logitech Pan Light",
        isVisible: true,
        itemType: "Text",
        area: { x: 0, y: 50, width: 100, height: 45 },
      },
    ],
  };
}

function writeActionIcons(actionIconsDirectory, resourcesDirectory) {
  mkdirSync(actionIconsDirectory, { recursive: true });
  for (const definition of staticActionIcons) {
    const iconPath = join(resourcesDirectory, `${definition.icon}.png`);
    if (!existsSync(iconPath)) throw new Error(`Could not find action icon at ${iconPath}`);
    writeJson(join(actionIconsDirectory, `${definition.actionId}.ict`), actionIconTemplate(definition.label, iconPath));
  }
}

function profileInfo() {
  const pages = [
    page("F6F9A8E9B8B44852A3B454AF4C439A01", "Sessions", [
      action("GridCommand", "1"),
      action("GridCommand", "2"),
      action("GridCommand", "3"),
      action("GridCommand", "4"),
      action("GridCommand", "5"),
      action("GridCommand", "6"),
      action("ApproveFocusedCommand"),
      action("DenyFocusedCommand"),
      action("VoiceCommand"),
    ]),
    page("A29EC2E0DACA4AFAAAEFD7B372B58304", "Navigate", [
      action("NavigationCommand", "down"),
      action("NavigationCommand", "enter"),
      action("NavigationCommand", "page_down"),
      action("NavigationCommand", "page_up"),
      action("NavigationCommand", "up"),
      action("ContextCommand", "clipboard"),
      action("ContextCommand", "screenshot"),
      action("NewTerminalTabCommand"),
      action("NewTerminalWindowCommand"),
    ]),
    page("2F4EDB77C9C443B1B7CD6D6B9C247C03", "Prompts", [
      action("TemplateCommand", "explain"),
      action("TemplateCommand", "fix_bug"),
      action("TemplateCommand", "refactor"),
      action("TemplateCommand", "review"),
      action("TemplateCommand", "security"),
      action("TemplateCommand", "write_tests"),
      action("TemplateCommand", "plan"),
      action("TemplateCommand", "handoff"),
      action("TemplateCommand", "safe_revert"),
    ]),
    page("E5B064CC1B484AE3BC0225475EAB1B02", "Commands", [
      action("CompactSessionCommand"),
      action("InterruptSessionCommand"),
      action("ModelSessionCommand"),
      action("NewSessionCommand"),
      action("FavoritePromptCommand"),
      action("AgentSessionCommand"),
      action("ForkSessionCommand"),
      action("ExitSessionCommand"),
      showActionsRingAction,
    ]),
    page("63AFD7F73F8B47D6935C94D8B0E94A05", "Git", [
      action("TemplateCommand", "commit"),
      action("TemplateCommand", "create_pr"),
      action("TemplateCommand", "diff"),
      action("TemplateCommand", "log"),
      action("TemplateCommand", "push"),
      action("TemplateCommand", "status"),
      null,
      null,
      null,
    ]),
  ];

  return {
    $type: "Loupedeck.Service.ApplicationProfile, LoupedeckService",
    name: profileName,
    profileFlags: "None",
    displayName: "Vizhi",
    description: "Live Codex sessions and controls.",
    deviceType: "Loupedeck70",
    applicationName: profileApplicationName,
    nativePluginName: "Vizhi",
    hasNativePlugin: true,
    additionalNativePluginNames: ["DefaultMac"],
    lastModifiedTimeUtc: "2026-07-19T00:00:00.000000Z",
    profileSettings: {
      $type: "Loupedeck.DictionaryNoCase`1[[System.String, System.Private.CoreLib]], PluginApi",
    },
    actionImages90: null,
    actionImages60: null,
    wheelImages: null,
    actionColors: null,
    layout: {
      $type: "Loupedeck.Service.Devices.Loupedeck7Devices.ProfileLayout7, LoupedeckService",
      deviceType: "Loupedeck70",
      profileFlags: "None",
      layoutModes: [{
        $type: "Loupedeck.Service.Devices.Loupedeck7Devices.ProfileLayoutMode7, LoupedeckService",
        deviceType: "Loupedeck70",
        modeName: "main",
        parentModeName: null,
        actions: null,
        dynamicButtonPages: null,
        dynamicEncoderPages: null,
        workspaces: [{
          $type: "Loupedeck.Service.Devices.Loupedeck7Devices.ProfileLayoutWorkspace7, LoupedeckService",
          name: workspaceName,
          displayName: "Vizhi",
          description: null,
          pressPages: pages,
          rotatePages: [],
        }],
        homeWorkspaceName: workspaceName,
      }],
      folderPages: [],
    },
    macroCommands: [],
    macroAdjustments: [],
    profileCommands: [],
    profileAdjustments: [],
    conversionHistory: null,
    packageName: profileName,
    packageVersion: null,
    profileActions: [],
  };
}

function applicationInfo() {
  return {
    $type: "Loupedeck.Service.SupportedApplicationInfo, LoupedeckService",
    name: profileApplicationName,
    displayName: "Vizhi",
    description: "Vizhi Codex sessions and controls for Terminal.app.",
    deviceType: "Loupedeck70",
    nativePluginName: "Vizhi",
    hasNativePlugin: true,
    processOrBundleName: terminalBundleName,
    modes: [{
      $type: "Loupedeck.Service.ApplicationMode, LoupedeckService",
      name: "main",
      parentModeName: null,
      displayName: "Main",
    }],
    defaultProfileName: profileName,
    isEnabled: true,
  };
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const packageRoot = resolve(process.argv[2] ?? "VizhiPlugin/src/package");
  const metadataPath = join(packageRoot, "metadata", "LoupedeckPackage.yaml");
  const iconPath = join(packageRoot, "metadata", "Icon256x256.png");
  if (!existsSync(iconPath)) throw new Error(`Could not find package icon at ${iconPath}`);

  const outputDirectory = join(packageRoot, "profiles");
  const outputPath = join(outputDirectory, "DefaultProfile70.lp5");
  const resourcesDirectory = resolve(packageRoot, "..", "Resources", "icons");
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "vizhi-default-profile-"));
  const metadataDirectory = join(temporaryDirectory, "metadata");
  const actionIconsDirectory = join(temporaryDirectory, "ActionIcons");

  try {
    mkdirSync(metadataDirectory, { recursive: true });
    writeActionIcons(actionIconsDirectory, resourcesDirectory);
    copyFileSync(iconPath, join(temporaryDirectory, "ApplicationIcon.png"));
    writeJson(join(temporaryDirectory, "ApplicationInfo.json"), applicationInfo());
    writeJson(join(temporaryDirectory, "ProfileInfo.json"), profileInfo());
    writeJson(join(metadataDirectory, "AdvancedInfo.json"), { additionalPluginNames: ["DefaultMac"] });
    writeJson(join(metadataDirectory, "ProfilePreview.json"), { buttonPages: [], encoderPages: [] });
    writeFileSync(join(metadataDirectory, "LoupedeckPackage.yaml"), [
      "type: Profile5",
      `name: ${profileName}`,
      "displayName: Vizhi",
      `version: ${readVersion(metadataPath)}.0`,
      "",
    ].join("\n"));

    mkdirSync(outputDirectory, { recursive: true });
    rmSync(outputPath, { force: true });
    execFileSync("/usr/bin/zip", ["-q", "-r", outputPath, ".", "-x", ".DS_Store"], { cwd: temporaryDirectory });
    process.stdout.write(`Generated ${basename(outputPath)}\n`);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main();
