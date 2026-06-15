import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPromptSession,
  isPromptCancelError,
  isPromptInterruptError,
  type PromptSession,
} from "#cli/prompts";
import type { AppPaths } from "#config/paths";
import { applyGitProfileConfig, findMatchingRule, readActiveGitIdentity } from "#git/config";
import type { ProfileRepository } from "#profiles/repository";
import {
  createProfileExportBundle,
  mergeProfileStoreData,
  parseProfileImportBundle,
} from "#profiles/transfer";
import {
  PROFILE_PROMPT_COLOR_CODES,
  PROFILE_PROMPT_COLORS,
  type DirectoryRule,
  type GitIdentityProfile,
  type ProfilePromptColor,
} from "#profiles/types";
import { getPromptStatus, renderPromptStatus, type PromptFormat } from "#prompt/status";
import {
  detectShell,
  installShellAll,
  installShellCompletion,
  installShellPrompt,
  installShellSession,
  type SupportedShell,
  uninstallShellAll,
  uninstallShellCompletion,
  uninstallShellPrompt,
  uninstallShellSession,
} from "#shell/integration";

const PACKAGE_NAME = "@forceuser/git-profile-switcher";
const DEFAULT_TRANSFER_FILE_NAME = "gip-profiles.json";

type MenuAction = {
  label: string;
  run(): Promise<"continue" | "back" | "quit">;
};

type ProfileMenuItem =
  | { type: "add"; label: "[Add profile]" }
  | { type: "profile"; profile: GitIdentityProfile }
  | { type: "back"; label: "[Back]" };

type RuleMenuItem =
  | { type: "add"; label: "[Add rule]" }
  | { type: "rule"; rule: DirectoryRule }
  | { type: "back"; label: "[Back]" };

export async function runTui(input: {
  repository: ProfileRepository;
  paths: AppPaths;
  input: NodeJS.ReadStream;
  output: NodeJS.WriteStream;
}) {
  if (!input.input.isTTY || !input.output.isTTY) {
    throw new Error("TUI requires an interactive terminal.");
  }

  const prompts = createPromptSession(input.input, input.output);
  const context = { ...input, prompts, menuSelection: new Map<string, string>() };
  try {
    await runMenu(context, "Main menu", [
      { label: "Profiles", run: () => profilesMenu(context) },
      { label: "Directory rules", run: () => rulesMenu(context) },
      { label: "Diagnostics and prompt", run: () => diagnosticsMenu(context) },
      { label: "Import and export", run: () => migrationMenu(context) },
      { label: "Shell integration", run: () => shellMenu(context) },
      { label: "Quit", run: async () => "quit" },
    ]);
  } finally {
    prompts.close();
  }
}

async function profilesMenu(context: TuiContext) {
  for (;;) {
    const data = await context.repository.read();
    const options = [
      { type: "add", label: "[Add profile]" },
      ...data.profiles.map((profile) => ({ type: "profile" as const, profile })),
      { type: "back", label: "[Back]" },
    ] satisfies ProfileMenuItem[];
    let item: ProfileMenuItem;
    try {
      item = await context.prompts.selectOne({
        prompt: "Profiles",
        emptyMessage: "No profile actions available.",
        options,
        renderOption: renderProfileMenuItem,
        getValue: (option) => (option.type === "profile" ? option.profile.name : option.label),
        defaultIndex: getRememberedIndex(
          context,
          "profiles",
          options,
          (option) => (option.type === "profile" ? option.profile.name : option.label),
          getPromptStatus({ data }).profileName ?? "[Add profile]",
        ),
      });
      if (item.type !== "back") {
        rememberSelection(
          context,
          "profiles",
          item.type === "profile" ? item.profile.name : item.label,
        );
      }
    } catch (error) {
      if (isPromptInterruptError(error)) {
        return "quit";
      }
      if (isPromptCancelError(error)) {
        return "continue";
      }
      throw error;
    }

    if (item.type === "back") {
      return "continue";
    }
    if (item.type === "add") {
      await runCancellableAction(() => addProfile(context));
      continue;
    }

    const result = await runCancellableAction(() => profileActionsMenu(context, item.profile));
    if (result === "quit") {
      return "quit";
    }
  }
}

async function rulesMenu(context: TuiContext) {
  for (;;) {
    const data = await context.repository.read();
    const activeRuleId = getPromptStatus({ data }).ruleId;
    const options = [
      { type: "add", label: "[Add rule]" },
      ...data.rules.map((rule) => ({ type: "rule" as const, rule })),
      { type: "back", label: "[Back]" },
    ] satisfies RuleMenuItem[];
    let item: RuleMenuItem;
    try {
      item = await context.prompts.selectOne({
        prompt: "Directory rules",
        emptyMessage: "No directory rule actions available.",
        options,
        renderOption: renderRuleMenuItem,
        getValue: (option) => (option.type === "rule" ? option.rule.id : option.label),
        defaultIndex: getRememberedIndex(
          context,
          "rules",
          options,
          (option) => (option.type === "rule" ? option.rule.id : option.label),
          activeRuleId ?? "[Add rule]",
        ),
      });
      if (item.type !== "back") {
        rememberSelection(context, "rules", item.type === "rule" ? item.rule.id : item.label);
      }
    } catch (error) {
      if (isPromptInterruptError(error)) {
        return "quit";
      }
      if (isPromptCancelError(error)) {
        return "continue";
      }
      throw error;
    }

    if (item.type === "back") {
      return "continue";
    }
    if (item.type === "add") {
      await runCancellableAction(() => addRule(context));
      continue;
    }

    const result = await runCancellableAction(() => ruleActionsMenu(context, item.rule));
    if (result === "quit") {
      return "quit";
    }
  }
}

async function diagnosticsMenu(context: TuiContext) {
  return await runMenu(context, "Diagnostics and prompt", [
    { label: "Doctor for current directory", run: () => doctor(context, process.cwd()) },
    { label: "Doctor for another directory", run: () => doctorPromptedDirectory(context) },
    { label: "Preview prompt status", run: () => previewPrompt(context) },
    { label: "Show storage paths", run: () => showPaths(context) },
    { label: "Back", run: async () => "back" },
  ]);
}

async function migrationMenu(context: TuiContext) {
  return await runMenu(context, "Import and export", [
    { label: "Export profiles", run: () => exportProfiles(context) },
    { label: "Import profiles", run: () => importProfiles(context) },
    { label: "Back", run: async () => "back" },
  ]);
}

async function shellMenu(context: TuiContext) {
  return await runMenu(context, "Shell integration", [
    { label: "Install all shell blocks", run: () => installShellBundle(context, "all") },
    { label: "Install completion block", run: () => installShellBundle(context, "completion") },
    { label: "Install shell wrapper block", run: () => installShellBundle(context, "shell") },
    { label: "Install prompt block", run: () => installShellBundle(context, "prompt") },
    { label: "Uninstall all shell blocks", run: () => uninstallShellBundle(context, "all") },
    { label: "Uninstall completion block", run: () => uninstallShellBundle(context, "completion") },
    { label: "Uninstall shell wrapper block", run: () => uninstallShellBundle(context, "shell") },
    { label: "Uninstall prompt block", run: () => uninstallShellBundle(context, "prompt") },
    {
      label: "Install package globally and shell blocks",
      run: () => packageInstallOrUpdate(context, "install"),
    },
    {
      label: "Update global package and shell blocks",
      run: () => packageInstallOrUpdate(context, "update"),
    },
    { label: "Back", run: async () => "back" },
  ]);
}

async function runMenu(context: TuiContext, title: string, actions: MenuAction[]) {
  for (;;) {
    let action: MenuAction;
    try {
      action = await context.prompts.selectOne({
        prompt: title,
        emptyMessage: "No menu actions available.",
        options: actions,
        renderOption: (option) => option.label,
        getValue: (option) => option.label,
        defaultIndex: getRememberedIndex(
          context,
          title,
          actions,
          (option) => option.label,
          actions[0]?.label,
        ),
      });
      if (!isBackMenuValue(action.label)) {
        rememberSelection(context, title, action.label);
      }
    } catch (error) {
      if (isPromptInterruptError(error)) {
        return "quit";
      }
      if (isPromptCancelError(error)) {
        return "continue";
      }
      throw error;
    }

    const result = await runCancellableAction(action.run);
    if (result === "quit") {
      return "quit";
    }
    if (result === "back") {
      return "continue";
    }
  }
}

async function runCancellableAction(action: () => Promise<"continue" | "back" | "quit">) {
  try {
    return await action();
  } catch (error) {
    if (isPromptInterruptError(error)) {
      return "quit";
    }
    if (isPromptCancelError(error)) {
      return "continue";
    }
    throw error;
  }
}

async function profileActionsMenu(context: TuiContext, profile: GitIdentityProfile) {
  return await runMenu(context, `Profile: ${profile.name}`, [
    {
      label: `[Bind profile here ${process.cwd()}]`,
      run: () => useSelectedProfileForCurrentDirectory(context, profile),
    },
    { label: "[Edit profile]", run: () => editProfile(context, profile) },
    { label: "[Set prompt color]", run: () => setProfilePromptColor(context, profile) },
    { label: "[Remove profile]", run: () => removeSelectedProfile(context, profile) },
    { label: "[Back]", run: async () => "back" },
  ]);
}

async function addProfile(context: TuiContext) {
  const name = await context.prompts.askRequired("Profile name: ");
  const userName = await context.prompts.askRequired("Git user.name: ");
  const userEmail = await context.prompts.askRequired("Git user.email: ");
  const profile = await context.repository.upsertProfile({ name, userName, userEmail });
  context.output.write(
    `Saved profile ${profile.name}: ${profile.userName} <${profile.userEmail}>\n`,
  );
  return pause(context);
}

async function editProfile(context: TuiContext, profile: GitIdentityProfile) {
  context.output.write(`Editing ${profile.name}. Leave a value blank to keep the current one.\n`);
  const userName = await context.prompts.ask(`Git user.name [${profile.userName}]: `);
  const userEmail = await context.prompts.ask(`Git user.email [${profile.userEmail}]: `);
  const nextProfile = await context.repository.upsertProfile({
    name: profile.name,
    userName: userName || profile.userName,
    userEmail: userEmail || profile.userEmail,
  });
  context.output.write(
    `Saved profile ${nextProfile.name}: ${nextProfile.userName} <${nextProfile.userEmail}>\n`,
  );
  await applyConfig(context, false);
  return pause(context);
}

async function setProfilePromptColor(context: TuiContext, profile: GitIdentityProfile) {
  const promptColor = await selectProfilePromptColor(context, profile.promptColor ?? null);
  const nextProfile = await context.repository.setProfilePromptColor({
    name: profile.name,
    promptColor,
  });
  context.output.write(
    nextProfile.promptColor
      ? `Set prompt color for ${nextProfile.name} to ${nextProfile.promptColor}.\n`
      : `Cleared prompt color for ${nextProfile.name}.\n`,
  );
  return pause(context);
}

async function removeSelectedProfile(context: TuiContext, profile: GitIdentityProfile) {
  const confirmed = await yesNo(context, `Remove profile ${profile.name}?`, false);
  if (!confirmed) {
    return "continue";
  }
  const removed = await context.repository.removeProfile(profile.name);
  context.output.write(
    removed ? `Removed profile ${profile.name}.\n` : `Profile not found: ${profile.name}\n`,
  );
  await applyConfig(context, false);
  return pause(context);
}

async function addRule(context: TuiContext) {
  const data = await context.repository.read();
  const profile = await selectProfile(
    context,
    data.profiles,
    "Choose profile for rule",
    getPromptStatus({ data }).profileName,
  );
  if (!profile) {
    return "continue";
  }
  const directory = await context.prompts.askRequired("Directory: ");
  const rule = await context.repository.addRule({
    profileName: profile.name,
    directory,
    homeDir: context.paths.homeDir,
  });
  context.output.write(`Saved rule ${rule.id}: ${rule.profileName} -> ${rule.directory}\n`);
  return pause(context);
}

async function ruleActionsMenu(context: TuiContext, rule: DirectoryRule) {
  return await runMenu(context, `Rule: ${rule.profileName} -> ${rule.directory}`, [
    { label: "[Remove rule]", run: () => removeSelectedRule(context, rule) },
    { label: "[Back]", run: async () => "back" },
  ]);
}

async function removeSelectedRule(context: TuiContext, rule: DirectoryRule) {
  const confirmed = await yesNo(
    context,
    `Remove rule ${rule.profileName} -> ${rule.directory}?`,
    false,
  );
  if (!confirmed) {
    return "continue";
  }
  const removed = await context.repository.removeRule(rule.id);
  context.output.write(removed ? `Removed rule ${rule.id}.\n` : `Rule not found: ${rule.id}\n`);
  await applyConfig(context, false);
  return pause(context);
}

async function useSelectedProfileForCurrentDirectory(
  context: TuiContext,
  profile: GitIdentityProfile,
) {
  const rule = await context.repository.setDirectoryProfile({
    profileName: profile.name,
    directory: process.cwd(),
    homeDir: context.paths.homeDir,
  });
  context.output.write(`Bound profile ${rule.profileName} for ${rule.directory}\n`);
  await applyConfig(context, false);
  return pause(context);
}

async function applyConfig(context: TuiContext, pauseAfter = true) {
  const data = await context.repository.read();
  const result = await applyGitProfileConfig({
    data,
    globalGitConfigPath: context.paths.globalGitConfigPath,
    generatedGitConfigDir: context.paths.generatedGitConfigDir,
  });
  context.output.write(`Generated ${result.generatedFiles.length} profile config file(s).\n`);
  writeGitConfigResult(context, result);
  return pauseAfter ? pause(context) : "continue";
}

async function doctorPromptedDirectory(context: TuiContext) {
  const directory = await context.prompts.askRequired("Directory: ");
  return doctor(context, directory);
}

async function doctor(context: TuiContext, directory: string) {
  const data = await context.repository.read();
  const cwd = resolve(directory);
  const rule = findMatchingRule(data, cwd);
  const identity = readActiveGitIdentity(cwd);
  context.output.write(`Directory: ${cwd}\n`);
  context.output.write(`Git user.name: ${identity.userName ?? "[unset]"}\n`);
  context.output.write(`Git user.email: ${identity.userEmail ?? "[unset]"}\n`);
  context.output.write(
    rule
      ? `Managed rule: ${rule.id} (${rule.profileName} -> ${rule.directory})\n`
      : "Managed rule: [none]\n",
  );
  return pause(context);
}

async function previewPrompt(context: TuiContext) {
  const format = await selectPromptFormat(context);
  const data = await context.repository.read();
  const rendered = renderPromptStatus(getPromptStatus({ data }), format);
  context.output.write(rendered ? `${rendered}\n` : "Prompt status is empty.\n");
  return pause(context);
}

async function showPaths(context: TuiContext) {
  for (const [key, value] of Object.entries(context.paths)) {
    context.output.write(`${key}: ${value}\n`);
  }
  return pause(context);
}

async function exportProfiles(context: TuiContext) {
  const defaultOutputPath = join(context.paths.homeDir, DEFAULT_TRANSFER_FILE_NAME);
  const outputPath =
    (await context.prompts.ask(`Output path [${defaultOutputPath}]: `)) || defaultOutputPath;
  const data = await context.repository.read();
  const scope = await selectTransferScope(context, "Export scope");
  const exportData = scope === "profiles-only" ? { ...data, rules: [] } : data;
  const json = `${JSON.stringify(createProfileExportBundle(exportData), null, 2)}\n`;
  if (outputPath === "-") {
    context.output.write(json);
    return pause(context);
  }
  const path = resolve(outputPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, json, { mode: 0o600 });
  context.output.write(
    `Exported ${exportData.profiles.length} profile(s) and ${exportData.rules.length} rule(s) to ${path}\n`,
  );
  return pause(context);
}

async function importProfiles(context: TuiContext) {
  const defaultInputPath = join(context.paths.homeDir, DEFAULT_TRANSFER_FILE_NAME);
  const inputPath =
    (await context.prompts.ask(`Input path [${defaultInputPath}]: `)) || defaultInputPath;
  const importModes: Array<"merge" | "replace"> = ["merge", "replace"];
  const mode = await context.prompts.selectOne({
    prompt: "Import mode",
    emptyMessage: "No import modes available.",
    options: importModes,
    renderOption: (option) =>
      option === "merge" ? "Merge with local profiles" : "Replace local profiles",
    getValue: (option) => option,
    defaultIndex: getRememberedIndex(context, "Import mode", importModes, (option) => option),
  });
  rememberSelection(context, "Import mode", mode);
  const scope = await selectTransferScope(context, "Import scope");
  const applyAfter = await yesNo(context, "Run apply after import?", true);
  const path = resolve(inputPath);
  const incoming = parseProfileImportBundle(JSON.parse(await readFile(path, "utf8")));
  const importData = scope === "profiles-only" ? { ...incoming, rules: [] } : incoming;
  const current = await context.repository.read();
  const next = mode === "replace" ? importData : mergeProfileStoreData(current, importData);
  await context.repository.save(next);
  context.output.write(
    `Imported ${importData.profiles.length} profile(s) and ${importData.rules.length} rule(s) from ${path} with ${mode} mode.\n`,
  );
  if (applyAfter) {
    await applyConfig(context, false);
  }
  return pause(context);
}

async function installShellBundle(
  context: TuiContext,
  target: "all" | "completion" | "prompt" | "shell",
) {
  const shell = await selectShell(context);
  const configPath = await optionalConfigPath(context);
  const promptFormat =
    target === "completion" || target === "shell" ? "auto" : await selectPromptFormat(context);
  const result =
    target === "all"
      ? await installShellAll({ shell, configPath, promptFormat })
      : target === "completion"
        ? await installShellCompletion({ shell, configPath })
        : target === "shell"
          ? await installShellSession({ shell, configPath })
          : await installShellPrompt({ shell, configPath, promptFormat });
  context.output.write(`Installed ${target} shell integration for ${shell}: ${result.path}\n`);
  writeShellResult(context, result);
  return pause(context);
}

async function uninstallShellBundle(
  context: TuiContext,
  target: "all" | "completion" | "prompt" | "shell",
) {
  const shell = await selectShell(context);
  const configPath = await optionalConfigPath(context);
  const result =
    target === "all"
      ? await uninstallShellAll({ shell, configPath })
      : target === "completion"
        ? await uninstallShellCompletion({ shell, configPath })
        : target === "shell"
          ? await uninstallShellSession({ shell, configPath })
          : await uninstallShellPrompt({ shell, configPath });
  context.output.write(`Uninstalled ${target} shell integration for ${shell}: ${result.path}\n`);
  writeShellResult(context, result);
  return pause(context);
}

async function packageInstallOrUpdate(context: TuiContext, mode: "install" | "update") {
  const shell = await selectShell(context);
  const configPath = await optionalConfigPath(context);
  const promptFormat = await selectPromptFormat(context);
  const packageSpec = mode === "update" ? `${PACKAGE_NAME}@latest` : readCurrentPackageSpec();
  context.output.write(`Installing ${packageSpec} globally with npm...\n`);
  await runNpmInstallGlobal(packageSpec);
  const result = await installShellAll({ shell, configPath, promptFormat });
  context.output.write(
    `${mode === "update" ? "Updated" : "Installed"} package and shell integration for ${shell}: ${result.path}\n`,
  );
  writeShellResult(context, result);
  return pause(context);
}

async function selectProfile(
  context: TuiContext,
  profiles: GitIdentityProfile[],
  title: string,
  defaultProfileName?: string | null,
) {
  if (profiles.length === 0) {
    context.output.write("No profiles yet. Add one first.\n");
    await pause(context);
    return null;
  }
  const profile = await context.prompts.selectOne({
    prompt: title,
    emptyMessage: "No profiles yet. Add one first.",
    options: profiles,
    renderOption: renderProfileLine,
    getValue: (profile) => profile.name,
    defaultIndex: getRememberedIndex(
      context,
      title,
      profiles,
      (profile) => profile.name,
      defaultProfileName,
    ),
  });
  rememberSelection(context, title, profile.name);
  return profile;
}

async function selectShell(context: TuiContext): Promise<SupportedShell> {
  const detected = detectShell();
  const shells: SupportedShell[] = ["zsh", "bash", "fish"];
  const shell = await context.prompts.selectOne({
    prompt: "Choose shell",
    emptyMessage: "No shells available.",
    options: shells,
    renderOption: (shell) => (shell === detected ? `${shell} (detected)` : shell),
    getValue: (shell) => shell,
    defaultIndex: getRememberedIndex(context, "Choose shell", shells, (shell) => shell, detected),
  });
  rememberSelection(context, "Choose shell", shell);
  return shell;
}

async function selectPromptFormat(context: TuiContext): Promise<PromptFormat> {
  const formats: PromptFormat[] = ["auto", "profile", "identity"];
  const format = await context.prompts.selectOne({
    prompt: "Prompt format",
    emptyMessage: "No prompt formats available.",
    options: formats,
    renderOption: (format) => format,
    getValue: (format) => format,
    defaultIndex: getRememberedIndex(context, "Prompt format", formats, (format) => format),
  });
  rememberSelection(context, "Prompt format", format);
  return format;
}

async function selectTransferScope(context: TuiContext, prompt: string) {
  const scopes: Array<"profiles-only" | "profiles-and-rules"> = [
    "profiles-only",
    "profiles-and-rules",
  ];
  const scope = await context.prompts.selectOne({
    prompt,
    emptyMessage: "No transfer scopes available.",
    options: scopes,
    renderOption: (option) =>
      option === "profiles-and-rules" ? "Profiles and directory rules" : "Profiles only",
    getValue: (option) => option,
    defaultIndex: getRememberedIndex(context, prompt, scopes, (option) => option),
  });
  rememberSelection(context, prompt, scope);
  return scope;
}

async function selectProfilePromptColor(
  context: TuiContext,
  currentColor: ProfilePromptColor | null,
) {
  const options: Array<"" | ProfilePromptColor> = ["", ...PROFILE_PROMPT_COLORS];
  const defaultIndex = currentColor ? Math.max(0, options.indexOf(currentColor)) : 0;
  const choice = await context.prompts.selectOne({
    prompt: "Profile prompt color",
    emptyMessage: "No prompt colors available.",
    options,
    renderOption: (color) => {
      const label = color ? renderPromptColorLabel(color) : "[no color]";
      return color === currentColor || (!color && !currentColor) ? `${label} (current)` : label;
    },
    getValue: (color) => color || "no-color",
    defaultIndex,
  });
  return choice === "" ? null : choice;
}

async function yesNo(context: TuiContext, prompt: string, defaultValue: boolean) {
  const answer = await context.prompts.selectOne({
    prompt,
    emptyMessage: "No choices available.",
    options: ["yes", "no"] as const,
    renderOption: (option) => option,
    getValue: (option) => option,
    defaultIndex: defaultValue ? 0 : 1,
  });
  return answer === "yes";
}

async function optionalConfigPath(context: TuiContext) {
  const value = await context.prompts.ask("Shell config path (blank for default): ");
  return value || undefined;
}

async function pause(context: TuiContext): Promise<"continue"> {
  await context.prompts.ask("Press Enter to continue...");
  return "continue";
}

function writeGitConfigResult(
  context: TuiContext,
  result: { changed: boolean; globalGitConfigPath: string },
) {
  context.output.write(
    result.changed
      ? `Updated ${result.globalGitConfigPath}.\n`
      : `${result.globalGitConfigPath} was already up to date.\n`,
  );
}

function writeShellResult(context: TuiContext, result: { changed: boolean }) {
  context.output.write(
    result.changed ? "Updated shell config.\n" : "Shell config was already up to date.\n",
  );
}

function readCurrentPackageSpec() {
  const version = readPackageVersion();
  return version ? `${PACKAGE_NAME}@${version}` : PACKAGE_NAME;
}

function getRememberedIndex<T>(
  context: TuiContext,
  menuKey: string,
  options: T[],
  getValue: (option: T) => string,
  fallbackValue?: string | null,
) {
  const rememberedValue = context.menuSelection.get(menuKey);
  const value = rememberedValue ?? fallbackValue;
  const index = value ? options.findIndex((option) => getValue(option) === value) : -1;
  return index >= 0 ? index : 0;
}

function rememberSelection(context: TuiContext, menuKey: string, value: string) {
  context.menuSelection.set(menuKey, value);
}

function isBackMenuValue(value: string) {
  return value === "Back" || value === "[Back]";
}

function renderProfileMenuItem(item: ProfileMenuItem) {
  if (item.type === "profile") {
    return renderProfileLine(item.profile);
  }
  return item.label;
}

function renderProfileLine(profile: GitIdentityProfile) {
  const swatch = profile.promptColor ? `${renderPromptColorSwatch(profile.promptColor)} ` : "";
  return `${swatch}${profile.name}\t${profile.userName} <${profile.userEmail}>`;
}

function renderPromptColorLabel(promptColor: ProfilePromptColor) {
  return `${renderPromptColorSwatch(promptColor)} ${promptColor}`;
}

function renderPromptColorSwatch(promptColor: ProfilePromptColor) {
  return `\x1b[${PROFILE_PROMPT_COLOR_CODES[promptColor]}m■\x1b[0m`;
}

function renderRuleMenuItem(item: RuleMenuItem) {
  if (item.type === "rule") {
    return `${item.rule.profileName}\t${item.rule.directory}`;
  }
  return item.label;
}

function readPackageVersion() {
  for (const packageJsonPath of getPackageJsonCandidates()) {
    if (!existsSync(packageJsonPath)) {
      continue;
    }
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      name?: string;
      version?: string;
    };
    if (parsed.name === PACKAGE_NAME) {
      return parsed.version ?? null;
    }
  }
  return null;
}

function getPackageJsonCandidates() {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(here, "..", "..", "package.json"),
    join(here, "..", "..", "..", "package.json"),
    join(process.cwd(), "package.json"),
  ];
}

function runNpmInstallGlobal(packageSpec: string) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn("npm", ["install", "-g", packageSpec], {
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (status) => {
      if (status === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`npm install -g ${packageSpec} exited with ${status}`));
    });
  });
}

type TuiContext = {
  repository: ProfileRepository;
  paths: AppPaths;
  input: NodeJS.ReadStream;
  output: NodeJS.WriteStream;
  prompts: PromptSession;
  menuSelection: Map<string, string>;
};
