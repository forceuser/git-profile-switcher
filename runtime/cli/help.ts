export interface CommandHelp {
  name: string;
  summary: string;
  usage: string;
  examples: string[];
  completionFlags?: string[];
}

export const COMMANDS: CommandHelp[] = [
  {
    name: "profile:add",
    summary: "Create or update a Git identity profile.",
    usage: "gip profile:add [profile] [--user-name <name>] [--user-email <email>]",
    completionFlags: ["--user-name", "--user-email", "--help"],
    examples: [
      "gip profile:add",
      'gip profile:add work --user-name "Work Name" --user-email work@example.com',
      'gip profile:add personal --user-name "Personal Name" --user-email me@example.com',
    ],
  },
  {
    name: "profile:list",
    summary: "List saved Git identity profiles.",
    usage: "gip profile:list [--json]",
    completionFlags: ["--json", "--help"],
    examples: ["gip profile:list", "gip profile:list --json"],
  },
  {
    name: "profile:remove",
    summary: "Remove a profile and its directory rules.",
    usage: "gip profile:remove <profile>",
    completionFlags: ["--help"],
    examples: ["gip profile:remove old-work"],
  },
  {
    name: "profile:color",
    summary: "Set or clear the shell prompt color for a profile.",
    usage: "gip profile:color [profile] [color|no-color]",
    completionFlags: ["--help"],
    examples: [
      "gip profile:color",
      "gip profile:color work cyan",
      "gip profile:color work no-color",
    ],
  },
  {
    name: "rule:add",
    summary: "Map a profile to a directory tree.",
    usage: "gip rule:add [profile] [directory]",
    completionFlags: ["--help"],
    examples: [
      "gip rule:add",
      "gip rule:add ~/Developer/Work",
      "gip rule:add work ~/Developer/Work",
      "gip apply",
    ],
  },
  {
    name: "rule:list",
    summary: "List directory rules.",
    usage: "gip rule:list [--json]",
    completionFlags: ["--json", "--help"],
    examples: ["gip rule:list"],
  },
  {
    name: "rule:remove",
    summary: "Remove a directory rule.",
    usage: "gip rule:remove <rule-id>",
    completionFlags: ["--help"],
    examples: ["gip rule:remove rule_abc123"],
  },
  {
    name: "use",
    summary: "Assign a profile to the current directory and apply Git config.",
    usage: "gip use [profile] [directory] [--global|-g]",
    completionFlags: ["--global", "-g", "--help"],
    examples: [
      "gip use",
      "gip use work",
      "gip use personal ~/Developer/personal-app",
      "gip use work --global",
      "gip use -g",
    ],
  },
  {
    name: "now",
    summary: "Use a profile only in the current shell session.",
    usage: "gip now [profile] [--clear] [--exports] [--shell <zsh|bash|fish>]",
    completionFlags: ["--clear", "--exports", "--shell", "--help"],
    examples: [
      "gip now work",
      "gip now --clear",
      'eval "$(gip now work --exports)"',
      "gip now work --exports --shell fish",
    ],
  },
  {
    name: "clear",
    summary: "Clear a directory profile rule or the global Git identity.",
    usage: "gip clear [directory] [--global|-g]",
    completionFlags: ["--global", "-g", "--help"],
    examples: ["gip clear", "gip clear ~/Developer/Work", "gip clear --global", "gip clear -g"],
  },
  {
    name: "apply",
    summary: "Write generated profile gitconfigs and the managed includeIf block.",
    usage: "gip apply",
    completionFlags: ["--help"],
    examples: ["gip apply"],
  },
  {
    name: "export",
    summary: "Export profiles and directory rules for migration.",
    usage: "gip export [--output <path>] [--profiles-only]\n  gip export <path>",
    completionFlags: ["--output", "--profiles-only", "--help"],
    examples: [
      "gip export",
      "gip export --profiles-only",
      "gip export --output ./gip-profiles.backup.json",
      "gip export ./gip.json",
    ],
  },
  {
    name: "import",
    summary: "Import profiles and directory rules from a migration file.",
    usage:
      "gip import [--input <path>] [--replace] [--profiles-only] [--no-apply]\n  gip import <path>",
    completionFlags: ["--input", "--replace", "--profiles-only", "--no-apply", "--help"],
    examples: [
      "gip import",
      "gip import --input ./gip-profiles.backup.json",
      "gip import --profiles-only",
      "gip import ./gip.json --replace",
      "gip import ./gip.json --no-apply",
    ],
  },
  {
    name: "doctor",
    summary: "Explain the effective identity for a directory.",
    usage: "gip doctor [cwd] [--json]",
    completionFlags: ["--json", "--help"],
    examples: ["gip doctor", "gip doctor ~/Developer/Work/app --json"],
  },
  {
    name: "prompt",
    summary: "Print the current Git identity for shell prompts.",
    usage: "gip prompt [--json] [--format identity|profile|auto] [--profile]",
    completionFlags: ["--json", "--format", "--profile", "--help"],
    examples: [
      "gip prompt",
      "gip prompt --format identity",
      "gip prompt --format profile",
      "gip prompt --format auto",
      "gip prompt --profile",
      "gip prompt --json",
    ],
  },
  {
    name: "install:prompt",
    summary: "Install managed shell prompt integration.",
    usage:
      "gip install:prompt [zsh|bash|fish] [--format identity|profile|auto] [--profile] [--config <path>]",
    completionFlags: ["--format", "--profile", "--config", "--help"],
    examples: [
      "gip install:prompt zsh",
      "gip install:prompt zsh --format identity",
      "gip install:prompt zsh --format profile",
      "gip install:prompt zsh --format auto",
    ],
  },
  {
    name: "install:all",
    summary: "Install all managed shell integrations.",
    usage:
      "gip install:all [zsh|bash|fish] [--shell <zsh|bash|fish>] [--config <path>] [--format identity|profile|auto] [--profile]",
    completionFlags: ["--shell", "--config", "--format", "--profile", "--help"],
    examples: ["gip install:all zsh", "gip install all zsh", "gip install --shell zsh"],
  },
  {
    name: "install",
    summary: "Install the package globally and configure shell integrations.",
    usage:
      "gip install [zsh|bash|fish] [--shell <zsh|bash|fish>] [--config <path>]\n  gip install <all|completion|shell|prompt> [zsh|bash|fish] [--config <path>]",
    completionFlags: ["--shell", "--config", "--path", "--format", "--profile", "--help"],
    examples: [
      "gip install",
      "gip install zsh",
      "gip install all zsh",
      "gip install completion zsh",
      "gip install shell zsh",
    ],
  },
  {
    name: "update",
    summary: "Update the global package and refresh shell integrations.",
    usage:
      "gip update [zsh|bash|fish] [--shell <zsh|bash|fish>] [--config <path>] [--format identity|profile|auto] [--profile]",
    completionFlags: ["--shell", "--config", "--path", "--format", "--profile", "--help"],
    examples: ["gip update", "gip update zsh", "gip update --shell zsh"],
  },
  {
    name: "uninstall:prompt",
    summary: "Remove managed shell prompt integration.",
    usage: "gip uninstall:prompt [zsh|bash|fish] [--config <path>]",
    completionFlags: ["--config", "--help"],
    examples: ["gip uninstall:prompt zsh"],
  },
  {
    name: "completion",
    summary: "Generate shell completion script.",
    usage: "gip completion [zsh|bash|fish]",
    completionFlags: ["--help"],
    examples: [
      "gip completion zsh",
      "gip completion bash",
      "gip completion fish",
      "source <(gip completion zsh)",
    ],
  },
  {
    name: "install:completion",
    summary: "Install managed shell completion integration.",
    usage: "gip install:completion [zsh|bash|fish] [--config <path>]",
    completionFlags: ["--config", "--help"],
    examples: ["gip install:completion zsh", "gip install:completion fish"],
  },
  {
    name: "install:shell",
    summary: "Install the managed shell wrapper for session commands.",
    usage: "gip install:shell [zsh|bash|fish] [--config <path>]",
    completionFlags: ["--config", "--help"],
    examples: ["gip install:shell zsh", "gip install shell zsh"],
  },
  {
    name: "uninstall:completion",
    summary: "Remove managed shell completion integration.",
    usage: "gip uninstall:completion [zsh|bash|fish] [--config <path>]",
    completionFlags: ["--config", "--help"],
    examples: ["gip uninstall:completion zsh"],
  },
  {
    name: "uninstall:shell",
    summary: "Remove the managed shell wrapper.",
    usage: "gip uninstall:shell [zsh|bash|fish] [--config <path>]",
    completionFlags: ["--config", "--help"],
    examples: ["gip uninstall:shell zsh"],
  },
  {
    name: "uninstall:all",
    summary: "Remove all managed shell integrations.",
    usage: "gip uninstall:all [zsh|bash|fish] [--shell <zsh|bash|fish>] [--config <path>]",
    completionFlags: ["--shell", "--config", "--help"],
    examples: ["gip uninstall:all zsh"],
  },
  {
    name: "paths",
    summary: "Print resolved storage and Git config paths.",
    usage: "gip paths [--json]",
    completionFlags: ["--json", "--help"],
    examples: ["gip paths", "gip paths --json"],
  },
  {
    name: "tui",
    summary: "Open the terminal UI.",
    usage: "gip tui",
    completionFlags: ["--help"],
    examples: ["gip tui"],
  },
];

export function renderHelp(commandName?: string) {
  if (commandName) {
    const command = COMMANDS.find((candidate) => candidate.name === commandName);
    if (!command) {
      return `Unknown command: ${commandName}\n\n${renderHelp()}`;
    }
    return [
      `${command.name} - ${command.summary}`,
      "",
      `Usage: ${command.usage}`,
      "",
      "Examples:",
      ...command.examples.map((example) => `  ${example}`),
    ].join("\n");
  }

  return [
    "gip - Git Profile Switcher",
    "",
    "Usage: gip <command> [options]",
    "",
    "Commands:",
    ...COMMANDS.map((command) => `  ${command.name.padEnd(18)} ${command.summary}`),
    "",
    "Run `gip help <command>` for command details.",
  ].join("\n");
}

export function getHelpCommandNames() {
  return COMMANDS.map((command) => command.name);
}

export function getHelpCommandFlags(commandName: string) {
  return COMMANDS.find((command) => command.name === commandName)?.completionFlags ?? [];
}
