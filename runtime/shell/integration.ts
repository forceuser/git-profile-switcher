import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { generateCompletionScript } from "#cli/completion";
import type { PromptFormat } from "#prompt/status";

export type SupportedShell = "bash" | "fish" | "zsh";

const PROMPT_BLOCK_START = "# >>> gip prompt >>>";
const PROMPT_BLOCK_END = "# <<< gip prompt <<<";
const COMPLETION_BLOCK_START = "# >>> gip completion >>>";
const COMPLETION_BLOCK_END = "# <<< gip completion <<<";
const SHELL_BLOCK_START = "# >>> gip shell >>>";
const SHELL_BLOCK_END = "# <<< gip shell <<<";
const PROMPT_BLOCK_PATTERN = new RegExp(
  `${escapeRegExp(PROMPT_BLOCK_START)}\\n[\\s\\S]*?\\n${escapeRegExp(PROMPT_BLOCK_END)}\\n?`,
  "g",
);
const COMPLETION_BLOCK_PATTERN = new RegExp(
  `${escapeRegExp(COMPLETION_BLOCK_START)}\\n[\\s\\S]*?\\n${escapeRegExp(COMPLETION_BLOCK_END)}\\n?`,
  "g",
);
const SHELL_BLOCK_PATTERN = new RegExp(
  `${escapeRegExp(SHELL_BLOCK_START)}\\n[\\s\\S]*?\\n${escapeRegExp(SHELL_BLOCK_END)}\\n?`,
  "g",
);

export async function installShellPrompt(input: {
  shell: SupportedShell;
  configPath?: string;
  promptFormat?: PromptFormat;
}) {
  const path = resolve(input.configPath ?? getDefaultShellConfigPath(input.shell));
  const current = await readOptionalText(path);
  const next = appendManagedBlock(
    removeShellPromptBlock(current),
    renderPromptBlock(input.shell, input.promptFormat),
  );
  return await writeIfChanged(path, current, next);
}

export async function uninstallShellPrompt(input: { shell: SupportedShell; configPath?: string }) {
  const path = resolve(input.configPath ?? getDefaultShellConfigPath(input.shell));
  const current = await readOptionalText(path);
  return await writeIfChanged(path, current, removeShellPromptBlock(current));
}

export async function installShellCompletion(input: {
  shell: SupportedShell;
  configPath?: string;
}) {
  const path = resolve(input.configPath ?? getDefaultShellConfigPath(input.shell));
  const current = await readOptionalText(path);
  const next = appendManagedBlock(
    removeShellCompletionBlock(current),
    renderCompletionBlock(input.shell),
  );
  return await writeIfChanged(path, current, next);
}

export async function uninstallShellCompletion(input: {
  shell: SupportedShell;
  configPath?: string;
}) {
  const path = resolve(input.configPath ?? getDefaultShellConfigPath(input.shell));
  const current = await readOptionalText(path);
  return await writeIfChanged(path, current, removeShellCompletionBlock(current));
}

export async function installShellSession(input: { shell: SupportedShell; configPath?: string }) {
  const path = resolve(input.configPath ?? getDefaultShellConfigPath(input.shell));
  const current = await readOptionalText(path);
  const next = appendManagedBlock(
    removeShellSessionBlock(current),
    renderShellSessionBlock(input.shell),
  );
  return await writeIfChanged(path, current, next);
}

export async function uninstallShellSession(input: { shell: SupportedShell; configPath?: string }) {
  const path = resolve(input.configPath ?? getDefaultShellConfigPath(input.shell));
  const current = await readOptionalText(path);
  return await writeIfChanged(path, current, removeShellSessionBlock(current));
}

export async function installShellAll(input: {
  shell: SupportedShell;
  configPath?: string;
  promptFormat?: PromptFormat;
}) {
  const path = resolve(input.configPath ?? getDefaultShellConfigPath(input.shell));
  const current = await readOptionalText(path);
  const cleaned = removeShellSessionBlock(
    removeShellPromptBlock(removeShellCompletionBlock(current)),
  );
  const next = appendManagedBlock(
    appendManagedBlock(
      appendManagedBlock(cleaned, renderCompletionBlock(input.shell)),
      renderShellSessionBlock(input.shell),
    ),
    renderPromptBlock(input.shell, input.promptFormat),
  );
  return await writeIfChanged(path, current, next);
}

export async function uninstallShellAll(input: { shell: SupportedShell; configPath?: string }) {
  const path = resolve(input.configPath ?? getDefaultShellConfigPath(input.shell));
  const current = await readOptionalText(path);
  const next = removeShellSessionBlock(removeShellPromptBlock(removeShellCompletionBlock(current)));
  return await writeIfChanged(path, current, next);
}

export function detectShell(env: NodeJS.ProcessEnv = process.env): SupportedShell | null {
  const shell = env.SHELL?.toLowerCase() ?? "";
  if (shell.endsWith("/zsh") || env.ZSH_VERSION) {
    return "zsh";
  }
  if (shell.endsWith("/bash") || env.BASH_VERSION) {
    return "bash";
  }
  if (shell.endsWith("/fish") || env.FISH_VERSION) {
    return "fish";
  }
  return null;
}

export function renderPromptBlock(shell: SupportedShell, promptFormat: PromptFormat = "auto") {
  const promptCommand = renderPromptCommand(promptFormat);
  if (shell === "fish") {
    return `${PROMPT_BLOCK_START}
if functions -q fish_prompt; and not functions -q __gip_original_fish_prompt
    functions -c fish_prompt __gip_original_fish_prompt
end

function fish_prompt
    set -lx GIP_PROMPT_SHELL fish
    set -l gip_segment (${promptCommand} 2>/dev/null)
    set -l gip_original_prompt
    if functions -q __gip_original_fish_prompt
        set gip_original_prompt (__gip_original_fish_prompt | string collect)
    end

    if test -n "$gip_segment"
        if test -n "$gip_original_prompt"; and string match -q "*\\n*" "$gip_original_prompt"
            printf "%s " "$gip_segment"
        else
            printf "%s\\n" "$gip_segment"
        end
    end

    printf "%s" "$gip_original_prompt"
end
${PROMPT_BLOCK_END}
`;
  }

  if (shell === "zsh") {
    return `${PROMPT_BLOCK_START}
setopt prompt_subst

_gip_prompt_segment() {
  local gip_segment
  gip_segment="$(GIP_PROMPT_SHELL=zsh ${promptCommand} 2>/dev/null)" || return
  if [ -n "$gip_segment" ]; then
    case "$GIP_ORIGINAL_PROMPT" in
      *$'\\n'*|*'\\n'*)
        printf '%s ' "$gip_segment"
        ;;
      *)
        printf '%s\\n%%{%%}' "$gip_segment"
        ;;
    esac
  fi
}

if [ -z "\${GIP_ORIGINAL_PROMPT+x}" ]; then
  GIP_ORIGINAL_PROMPT="$PROMPT"
fi

PROMPT='$(_gip_prompt_segment)'"\${GIP_ORIGINAL_PROMPT}"
${PROMPT_BLOCK_END}
`;
  }

  return `${PROMPT_BLOCK_START}
_gip_prompt_segment() {
  local gip_segment
  if [ -n "\${GIP_PROMPT_DEBUG_LOG:-}" ]; then
    gip_segment="$(GIP_PROMPT_SHELL=bash ${promptCommand} 2>>"\${GIP_PROMPT_DEBUG_LOG}")" || return
  else
    gip_segment="$(GIP_PROMPT_SHELL=bash ${promptCommand} 2>/dev/null)" || return
  fi
  if [ -n "$gip_segment" ]; then
    case "$GIP_ORIGINAL_PS1" in
      *$'\\n'*|*'\\n'*)
        printf '%s ' "$gip_segment"
        ;;
      *)
        printf '%s\\n\\001\\002' "$gip_segment"
        ;;
    esac
  fi
}

if [ -z "\${GIP_ORIGINAL_PS1+x}" ]; then
  GIP_ORIGINAL_PS1="$PS1"
fi

PS1='$(_gip_prompt_segment)'"\${GIP_ORIGINAL_PS1}"
${PROMPT_BLOCK_END}
`;
}

export function renderCompletionBlock(shell: SupportedShell) {
  return `${COMPLETION_BLOCK_START}
${generateCompletionScript(shell).trimEnd()}
${COMPLETION_BLOCK_END}
`;
}

export function renderShellSessionBlock(shell: SupportedShell) {
  return `${SHELL_BLOCK_START}
${renderSessionCommandWrapper(shell).trimEnd()}
${SHELL_BLOCK_END}
`;
}

function renderSessionCommandWrapper(shell: SupportedShell) {
  if (shell === "fish") {
    return `function gip
    if test (count $argv) -gt 0; and test "$argv[1]" = now; and not contains -- --help $argv; and not contains -- -h $argv
        command gip $argv --exports --shell fish | source
    else
        command gip $argv
    end
end
`;
  }

  const shellName = shell === "zsh" ? "zsh" : "bash";
  return `gip() {
  if [ "\${1:-}" = "now" ]; then
    local gip_arg
    for gip_arg in "$@"; do
      case "$gip_arg" in
        --help|-h)
          command gip "$@"
          return
          ;;
      esac
    done
    local gip_session
    gip_session="$(command gip "$@" --exports --shell ${shellName})" || return
    eval "$gip_session"
  else
    command gip "$@"
  fi
}
`;
}

function renderPromptCommand(promptFormat: PromptFormat) {
  if (promptFormat === "auto") {
    return "gip prompt";
  }
  return `gip prompt --format ${promptFormat}`;
}

export function removeShellPromptBlock(text: string) {
  return text.replace(PROMPT_BLOCK_PATTERN, "").trimEnd();
}

export function removeShellCompletionBlock(text: string) {
  return text.replace(COMPLETION_BLOCK_PATTERN, "").trimEnd();
}

export function removeShellSessionBlock(text: string) {
  return text.replace(SHELL_BLOCK_PATTERN, "").trimEnd();
}

export function getDefaultShellConfigPath(shell: SupportedShell) {
  const home = homedir();
  if (shell === "zsh") {
    return join(home, ".zshrc");
  }
  if (shell === "bash") {
    return join(home, ".bashrc");
  }
  return join(home, ".config", "fish", "config.fish");
}

function appendManagedBlock(text: string, block: string) {
  const trimmed = text.trimEnd();
  if (!trimmed) {
    return block;
  }
  return `${trimmed}\n\n${block}`;
}

async function writeIfChanged(path: string, current: string, next: string) {
  if (next === current) {
    return { path, changed: false };
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, next);
  return { path, changed: true };
}

async function readOptionalText(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
