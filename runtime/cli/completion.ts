import { getHelpCommandFlags, getHelpCommandNames } from "#cli/help";
import type { ProfileRepository } from "#profiles/repository";
import { PROFILE_PROMPT_COLORS } from "#profiles/types";

export type CompletionShell = "bash" | "fish" | "zsh";

export interface CompletionRuntime {
  repository: ProfileRepository;
}

const COMMANDS = getHelpCommandNames();
const GLOBAL_FLAGS = ["--help", "--version"] as const;
const SHELLS = ["bash", "fish", "zsh"] as const;
const PROMPT_FORMATS = ["auto", "identity", "profile"] as const;
const PROMPT_COLOR_CLEAR_VALUES = ["no-color", "none", "default"] as const;
const INSTALL_GROUPS = ["all", "completion", "prompt", "shell"] as const;

export function generateCompletionScript(shell: CompletionShell) {
  if (shell === "bash") {
    return `# git-profile-switcher bash completion
_gip_completion() {
  local suggestions
  suggestions="$(gip __complete --shell bash -- "\${COMP_WORDS[@]:1}")"
  COMPREPLY=($(compgen -W "$suggestions" -- "\${COMP_WORDS[COMP_CWORD]}"))
}
complete -F _gip_completion gip git-profile-switcher
`;
  }

  if (shell === "fish") {
    return `# git-profile-switcher fish completion
complete -c gip -f -a '(gip __complete --shell fish -- (commandline -opc)[2..-1])'
complete -c git-profile-switcher -f -a '(git-profile-switcher __complete --shell fish -- (commandline -opc)[2..-1])'
`;
  }

  return `#compdef gip git-profile-switcher
# git-profile-switcher zsh completion
_gip() {
  local -a suggestions
  suggestions=("\${(@f)$(gip __complete --shell zsh -- \${words[@]:1})}")
  compadd -- "\${suggestions[@]}"
}
compdef _gip gip git-profile-switcher
`;
}

export async function buildCompletionSuggestions(runtime: CompletionRuntime, words: string[]) {
  const rawCommand = words[0];
  const command = normalizeCompletionCommand(rawCommand);

  if (!rawCommand || !isKnownCommand(command)) {
    return uniqueSorted([...COMMANDS, ...GLOBAL_FLAGS]);
  }

  if (words.includes("--")) {
    return [];
  }

  const valueFlag = findValueFlagNeedingCompletion(words);
  if (valueFlag) {
    return completeFlagValue(command, valueFlag);
  }

  const positionalWords = words.slice(1).filter((word) => !word.startsWith("-"));
  const positionalSuggestions = await completePositionalValue(runtime, command, positionalWords);
  if (positionalSuggestions.length > 0) {
    return uniqueSorted(positionalSuggestions);
  }

  return uniqueSorted([...getHelpCommandFlags(command), ...GLOBAL_FLAGS]);
}

function normalizeCompletionCommand(command: string | undefined) {
  return command;
}

async function completePositionalValue(
  runtime: CompletionRuntime,
  command: string | undefined,
  positionalWords: string[],
) {
  if (!command) {
    return [];
  }

  if (command === "install") {
    if (positionalWords.length <= 1) {
      return [...INSTALL_GROUPS, ...SHELLS];
    }
    if (INSTALL_GROUPS.includes(positionalWords[0] as (typeof INSTALL_GROUPS)[number])) {
      return positionalWords.length === 2 ? [...SHELLS] : [];
    }
    return [];
  }

  if (
    command === "completion" ||
    command === "install:all" ||
    command === "install:completion" ||
    command === "install:prompt" ||
    command === "install:shell" ||
    command === "uninstall:all" ||
    command === "uninstall:completion" ||
    command === "uninstall:prompt" ||
    command === "uninstall:shell" ||
    command === "update"
  ) {
    return positionalWords.length <= 1 ? [...SHELLS] : [];
  }

  if (command === "bind" || command === "use" || command === "profile:remove") {
    return positionalWords.length <= 1 ? completeProfiles(runtime) : [];
  }

  if (command === "profile:color") {
    if (positionalWords.length <= 1) {
      return completeProfiles(runtime);
    }
    if (positionalWords.length === 2) {
      return [...PROMPT_COLOR_CLEAR_VALUES, ...PROFILE_PROMPT_COLORS];
    }
    return [];
  }

  if (command === "rule:add") {
    return positionalWords.length <= 1 ? completeProfiles(runtime) : [];
  }

  if (command === "rule:remove") {
    return positionalWords.length <= 1 ? completeRules(runtime) : [];
  }

  return [];
}

function completeFlagValue(command: string | undefined, flag: string) {
  if (!command) {
    return [];
  }

  if (
    flag === "--format" &&
    (command === "prompt" ||
      command === "install" ||
      command === "install:all" ||
      command === "install:prompt" ||
      command === "update")
  ) {
    return [...PROMPT_FORMATS];
  }

  if (flag === "--shell") {
    return [...SHELLS];
  }

  return [];
}

async function completeProfiles(runtime: CompletionRuntime) {
  const data = await runtime.repository.read();
  return data.profiles.map((profile) => profile.name);
}

async function completeRules(runtime: CompletionRuntime) {
  const data = await runtime.repository.read();
  return data.rules.map((rule) => rule.id);
}

function findValueFlagNeedingCompletion(words: string[]) {
  const previous = words.at(-2);
  const current = words.at(-1);
  if (previous?.startsWith("--") && !current?.startsWith("-")) {
    return previous;
  }
  return null;
}

function isKnownCommand(command: string | undefined) {
  return Boolean(command && (COMMANDS.includes(command) || command === "__complete"));
}

function uniqueSorted(values: readonly string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
