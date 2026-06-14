import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const runtimeApp = join(root, "runtime", "app", "index.ts");

test("use assigns a profile to the current directory and applies git config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-use-"));
  const appDataParent = join(dir, "config");
  const globalGitConfigPath = join(dir, ".gitconfig");
  const projectDir = join(dir, "project");
  const env = {
    ...process.env,
    GIP_APP_DATA_DIR: appDataParent,
    GIP_GLOBAL_GITCONFIG: globalGitConfigPath,
  };

  try {
    await mkdir(projectDir);
    await execGip(
      ["profile:add", "work", "--user-name", "Work Name", "--user-email", "work@example.com"],
      {
        cwd: dir,
        env,
      },
    );

    const { stdout } = await execGip(["use", "work"], {
      cwd: projectDir,
      env,
    });

    assert.match(stdout, /Using profile work for /);
    assert.match(stdout, /Generated 1 profile config file/);

    const profiles = JSON.parse(
      await readFile(join(appDataParent, "git-profile-switcher", "profiles.json"), "utf8"),
    ) as {
      rules: Array<{ profileName: string; directory: string }>;
    };
    const resolvedProjectDir = await realpath(projectDir);
    assert.equal(profiles.rules[0]!.profileName, "work");
    assert.equal(profiles.rules[0]!.directory, `${resolvedProjectDir}/`);
    assert.match(await readFile(globalGitConfigPath, "utf8"), /gitdir:/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("use --global writes the selected profile to global gitconfig", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-use-global-"));
  const appDataParent = join(dir, "config");
  const globalGitConfigPath = join(dir, ".gitconfig");
  const env = {
    ...process.env,
    GIP_APP_DATA_DIR: appDataParent,
    GIP_GLOBAL_GITCONFIG: globalGitConfigPath,
    GIT_CONFIG_GLOBAL: globalGitConfigPath,
  };

  try {
    await execGip(
      ["profile:add", "work", "--user-name", "Work Name", "--user-email", "work@example.com"],
      {
        cwd: dir,
        env,
      },
    );

    const { stdout } = await execGip(["use", "work", "--global"], {
      cwd: dir,
      env,
    });

    assert.match(stdout, /Using global profile work: Work Name <work@example\.com>/);
    const gitConfig = await readFile(globalGitConfigPath, "utf8");
    assert.match(gitConfig, /\[user\]/);
    assert.match(gitConfig, /name = Work Name/);
    assert.match(gitConfig, /email = work@example\.com/);

    const prompt = await execGip(["prompt", "--format", "profile"], {
      cwd: dir,
      env,
    });
    assert.equal(prompt.stdout.trim(), "[gip work]");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("now prints session-scoped Git identity environment", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-now-"));
  const env = {
    ...process.env,
    GIP_APP_DATA_DIR: join(dir, "config"),
    GIP_GLOBAL_GITCONFIG: join(dir, ".gitconfig"),
  };

  try {
    await execGip(
      ["profile:add", "work", "--user-name", "Work Name", "--user-email", "work@example.com"],
      { cwd: dir, env },
    );
    await execGip(["profile:color", "work", "cyan"], { cwd: dir, env });

    const plain = await execGip(["now", "work"], { cwd: dir, env });
    assert.match(plain.stdout, /Selected session profile work/);
    assert.doesNotMatch(plain.stdout, /export GIP_PROFILE_NAME/);

    const bash = await execGip(["now", "work", "--exports", "--shell", "bash"], { cwd: dir, env });
    assert.match(bash.stdout, /export GIP_PROFILE_NAME='work'/);
    assert.match(bash.stdout, /export GIT_AUTHOR_NAME='Work Name'/);
    assert.match(bash.stdout, /export GIT_AUTHOR_EMAIL='work@example\.com'/);
    assert.match(bash.stdout, /export GIT_COMMITTER_NAME='Work Name'/);
    assert.match(bash.stdout, /export GIT_COMMITTER_EMAIL='work@example\.com'/);
    assert.match(bash.stdout, /export GIT_CONFIG_COUNT='2'/);
    assert.match(bash.stdout, /export GIT_CONFIG_KEY_0='user\.name'/);
    assert.match(bash.stdout, /export GIT_CONFIG_VALUE_0='Work Name'/);
    assert.match(bash.stdout, /export GIT_CONFIG_KEY_1='user\.email'/);
    assert.match(bash.stdout, /export GIT_CONFIG_VALUE_1='work@example\.com'/);

    const fish = await execGip(["now", "work", "--exports", "--shell", "fish"], { cwd: dir, env });
    assert.match(fish.stdout, /set -gx GIP_PROFILE_NAME 'work'/);

    const selected = await spawnGip(["now", "--exports", "--shell", "bash"], {
      cwd: dir,
      env,
      input: "\n",
    });
    assert.match(selected.stderr, profileOptionPattern(1, "work", "Work Name", "work@example.com"));
    assert.match(selected.stdout, /export GIP_PROFILE_NAME='work'/);

    const clear = await execGip(["now", "--clear", "--exports", "--shell", "bash"], {
      cwd: dir,
      env,
    });
    assert.match(clear.stdout, /unset GIP_PROFILE_NAME GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL/);
    assert.match(clear.stdout, /GIT_CONFIG_COUNT/);
    assert.match(clear.stdout, /GIT_CONFIG_VALUE_1/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("profile selectors default to the active profile", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-active-selector-"));
  const appDataParent = join(dir, "config");
  const globalGitConfigPath = join(dir, ".gitconfig");
  const projectDir = join(dir, "project");
  const env = {
    ...process.env,
    GIP_APP_DATA_DIR: appDataParent,
    GIP_GLOBAL_GITCONFIG: globalGitConfigPath,
  };

  try {
    await mkdir(projectDir);
    await execGip(
      [
        "profile:add",
        "personal",
        "--user-name",
        "Personal Name",
        "--user-email",
        "personal@example.com",
      ],
      { cwd: dir, env },
    );
    await execGip(
      ["profile:add", "work", "--user-name", "Work Name", "--user-email", "work@example.com"],
      { cwd: dir, env },
    );
    await execGip(["use", "work"], { cwd: projectDir, env });

    const selectedUse = await spawnGip(["use"], {
      cwd: projectDir,
      env,
      input: "\n",
    });
    assert.match(selectedUse.stdout, /Using profile work for /);

    const selectedNow = await spawnGip(["now", "--exports", "--shell", "bash"], {
      cwd: dir,
      env: { ...env, GIP_PROFILE_NAME: "work" },
      input: "\n",
    });
    assert.match(selectedNow.stdout, /export GIP_PROFILE_NAME='work'/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("prompt uses now session environment before git config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-now-prompt-"));
  const appDataParent = join(dir, "config");
  const globalGitConfigPath = join(dir, ".gitconfig");
  const env = {
    ...process.env,
    GIP_APP_DATA_DIR: appDataParent,
    GIP_GLOBAL_GITCONFIG: globalGitConfigPath,
    GIT_CONFIG_GLOBAL: globalGitConfigPath,
  };

  try {
    await execGip(
      ["profile:add", "global", "--user-name", "Global Name", "--user-email", "global@example.com"],
      { cwd: dir, env },
    );
    await execGip(
      [
        "profile:add",
        "session",
        "--user-name",
        "Session Name",
        "--user-email",
        "session@example.com",
      ],
      { cwd: dir, env },
    );
    await execGip(["profile:color", "session", "cyan"], { cwd: dir, env });
    await execGip(["use", "global", "--global"], { cwd: dir, env });

    const prompt = await execGip(["prompt"], {
      cwd: dir,
      env: {
        ...env,
        GIP_PROMPT_SHELL: "zsh",
        GIP_PROFILE_NAME: "session",
        GIT_AUTHOR_NAME: "Session Name",
        GIT_AUTHOR_EMAIL: "session@example.com",
        GIT_COMMITTER_NAME: "Session Name",
        GIT_COMMITTER_EMAIL: "session@example.com",
      },
    });

    assert.equal(prompt.stdout.trim(), "[gip %{\x1b[36m%}session%{\x1b[0m%}]");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("profile:color sets prompt color for shell prompt output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-profile-color-"));
  const appDataParent = join(dir, "config");
  const globalGitConfigPath = join(dir, ".gitconfig");
  const env = {
    ...process.env,
    GIP_APP_DATA_DIR: appDataParent,
    GIP_GLOBAL_GITCONFIG: globalGitConfigPath,
    GIT_CONFIG_GLOBAL: globalGitConfigPath,
  };

  try {
    await execGip(
      ["profile:add", "work", "--user-name", "Work Name", "--user-email", "work@example.com"],
      {
        cwd: dir,
        env,
      },
    );
    await execGip(["use", "work", "--global"], { cwd: dir, env });

    const { stdout } = await execGip(["profile:color", "work", "cyan"], {
      cwd: dir,
      env,
    });
    assert.match(stdout, /Set prompt color for work to cyan/);

    const list = await execGip(["profile:list"], { cwd: dir, env });
    assert.match(list.stdout, /prompt: cyan/);

    const prompt = await execGip(["prompt", "--format", "profile"], {
      cwd: dir,
      env: { ...env, GIP_PROMPT_SHELL: "zsh" },
    });
    assert.equal(prompt.stdout.trim(), "[gip %{\x1b[36m%}work%{\x1b[0m%}]");

    await execGip(["profile:color", "work", "no-color"], { cwd: dir, env });
    const plainPrompt = await execGip(["prompt", "--format", "profile"], {
      cwd: dir,
      env: { ...env, GIP_PROMPT_SHELL: "zsh" },
    });
    assert.equal(plainPrompt.stdout.trim(), "[gip work]");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("clear removes the current directory profile rule and applies git config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-clear-"));
  const appDataParent = join(dir, "config");
  const globalGitConfigPath = join(dir, ".gitconfig");
  const projectDir = join(dir, "project");
  const env = {
    ...process.env,
    GIP_APP_DATA_DIR: appDataParent,
    GIP_GLOBAL_GITCONFIG: globalGitConfigPath,
  };

  try {
    await mkdir(projectDir);
    await execGip(
      ["profile:add", "work", "--user-name", "Work Name", "--user-email", "work@example.com"],
      {
        cwd: dir,
        env,
      },
    );
    await execGip(["use", "work"], {
      cwd: projectDir,
      env,
    });

    const { stdout } = await execGip(["clear"], {
      cwd: projectDir,
      env,
    });

    assert.match(stdout, /Cleared 1 profile rule/);
    const profiles = JSON.parse(
      await readFile(join(appDataParent, "git-profile-switcher", "profiles.json"), "utf8"),
    ) as {
      rules: Array<{ profileName: string; directory: string }>;
    };
    assert.equal(profiles.rules.length, 0);
    assert.doesNotMatch(await readFile(globalGitConfigPath, "utf8"), /gitdir:/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("prompt prefers managed directory profile over global git identity", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-prompt-rule-over-global-"));
  const appDataParent = join(dir, "config");
  const globalGitConfigPath = join(dir, ".gitconfig");
  const projectDir = join(dir, "project");
  const env = {
    ...process.env,
    GIP_APP_DATA_DIR: appDataParent,
    GIP_GLOBAL_GITCONFIG: globalGitConfigPath,
    GIT_CONFIG_GLOBAL: globalGitConfigPath,
  };

  try {
    await mkdir(projectDir);
    await execGip(
      ["profile:add", "personal", "--user-name", "Personal Name", "--user-email", "me@example.com"],
      {
        cwd: dir,
        env,
      },
    );
    await execGip(
      ["profile:add", "work", "--user-name", "Work Name", "--user-email", "work@example.com"],
      {
        cwd: dir,
        env,
      },
    );
    await execGip(["use", "personal", "--global"], {
      cwd: dir,
      env,
    });
    await execGip(["use", "work"], {
      cwd: projectDir,
      env,
    });

    const prompt = await execGip(["prompt"], {
      cwd: projectDir,
      env,
    });
    const identityPrompt = await execGip(["prompt", "--format", "identity"], {
      cwd: projectDir,
      env,
    });
    const promptJson = await execGip(["prompt", "--json"], {
      cwd: projectDir,
      env,
    });

    assert.equal(prompt.stdout.trim(), "[gip work]");
    assert.equal(identityPrompt.stdout.trim(), "Work Name <work@example.com>");
    const status = JSON.parse(promptJson.stdout) as {
      profileName: string;
      userName: string;
      userEmail: string;
    };
    assert.equal(status.profileName, "work");
    assert.equal(status.userName, "Work Name");
    assert.equal(status.userEmail, "work@example.com");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("clear --global removes global git identity", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-clear-global-"));
  const appDataParent = join(dir, "config");
  const globalGitConfigPath = join(dir, ".gitconfig");
  const env = {
    ...process.env,
    GIP_APP_DATA_DIR: appDataParent,
    GIP_GLOBAL_GITCONFIG: globalGitConfigPath,
  };

  try {
    await execGip(
      ["profile:add", "work", "--user-name", "Work Name", "--user-email", "work@example.com"],
      {
        cwd: dir,
        env,
      },
    );
    await execGip(["use", "work", "-g"], {
      cwd: dir,
      env,
    });

    const { stdout } = await execGip(["clear", "-g"], {
      cwd: dir,
      env,
    });

    assert.match(stdout, /Cleared global Git user identity/);
    const gitConfig = await readFile(globalGitConfigPath, "utf8");
    assert.doesNotMatch(gitConfig, /name = Work Name/);
    assert.doesNotMatch(gitConfig, /email = work@example\.com/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("profile:add prompts for missing profile fields", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-profile-add-"));
  const appDataParent = join(dir, "config");
  const globalGitConfigPath = join(dir, ".gitconfig");
  const env = {
    ...process.env,
    GIP_APP_DATA_DIR: appDataParent,
    GIP_GLOBAL_GITCONFIG: globalGitConfigPath,
  };

  try {
    const { stdout } = await spawnGip(["profile:add"], {
      cwd: dir,
      env,
      input: "work\nWork Name\nwork@example.com\n",
    });

    assert.match(stdout, /Profile name: /);
    assert.match(stdout, /Git user\.name: /);
    assert.match(stdout, /Git user\.email: /);
    assert.match(stdout, /Saved profile work: Work Name <work@example\.com>/);

    const profiles = JSON.parse(
      await readFile(join(appDataParent, "git-profile-switcher", "profiles.json"), "utf8"),
    ) as {
      profiles: Array<{ name: string; userName: string; userEmail: string }>;
    };
    assert.equal(profiles.profiles[0]!.name, "work");
    assert.equal(profiles.profiles[0]!.userName, "Work Name");
    assert.equal(profiles.profiles[0]!.userEmail, "work@example.com");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("use prompts for a profile when none is passed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-use-select-"));
  const appDataParent = join(dir, "config");
  const globalGitConfigPath = join(dir, ".gitconfig");
  const projectDir = join(dir, "project");
  const env = {
    ...process.env,
    GIP_APP_DATA_DIR: appDataParent,
    GIP_GLOBAL_GITCONFIG: globalGitConfigPath,
  };

  try {
    await mkdir(projectDir);
    await execGip(
      ["profile:add", "personal", "--user-name", "Personal Name", "--user-email", "me@example.com"],
      { cwd: dir, env },
    );
    await execGip(
      ["profile:add", "work", "--user-name", "Work Name", "--user-email", "work@example.com"],
      { cwd: dir, env },
    );
    await execGip(["profile:color", "work", "cyan"], { cwd: dir, env });

    const { stdout } = await spawnGip(["use"], {
      cwd: projectDir,
      env,
      input: "2\n",
    });

    assert.match(stdout, /1\. personal\s+Personal Name <me@example\.com>/);
    assert.match(stdout, profileOptionPattern(2, "work", "Work Name", "work@example.com"));
    assert.match(stdout, /Choose profile \[1\]: /);
    assert.match(stdout, /Using profile work for /);

    const profiles = JSON.parse(
      await readFile(join(appDataParent, "git-profile-switcher", "profiles.json"), "utf8"),
    ) as {
      rules: Array<{ profileName: string; directory: string }>;
    };
    const resolvedProjectDir = await realpath(projectDir);
    assert.equal(profiles.rules[0]!.profileName, "work");
    assert.equal(profiles.rules[0]!.directory, `${resolvedProjectDir}/`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("use defaults to the first profile when selection is empty", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-use-default-"));
  const appDataParent = join(dir, "config");
  const globalGitConfigPath = join(dir, ".gitconfig");
  const projectDir = join(dir, "project");
  const env = {
    ...process.env,
    GIP_APP_DATA_DIR: appDataParent,
    GIP_GLOBAL_GITCONFIG: globalGitConfigPath,
  };

  try {
    await mkdir(projectDir);
    await execGip(
      ["profile:add", "personal", "--user-name", "Personal Name", "--user-email", "me@example.com"],
      { cwd: dir, env },
    );
    await execGip(
      ["profile:add", "work", "--user-name", "Work Name", "--user-email", "work@example.com"],
      { cwd: dir, env },
    );

    const { stdout } = await spawnGip(["use"], {
      cwd: projectDir,
      env,
      input: "\n",
    });

    assert.match(stdout, /Choose profile \[1\]: /);
    assert.match(stdout, /Using profile personal for /);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rule:add prompts for a profile when only directory is passed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-rule-add-select-"));
  const appDataParent = join(dir, "config");
  const globalGitConfigPath = join(dir, ".gitconfig");
  const projectDir = join(dir, "project");
  const env = {
    ...process.env,
    GIP_APP_DATA_DIR: appDataParent,
    GIP_GLOBAL_GITCONFIG: globalGitConfigPath,
  };

  try {
    await mkdir(projectDir);
    await execGip(
      ["profile:add", "personal", "--user-name", "Personal Name", "--user-email", "me@example.com"],
      { cwd: dir, env },
    );
    await execGip(
      ["profile:add", "work", "--user-name", "Work Name", "--user-email", "work@example.com"],
      { cwd: dir, env },
    );

    const { stdout } = await spawnGip(["rule:add", projectDir], {
      cwd: dir,
      env,
      input: "work\n",
    });

    assert.match(stdout, /1\. personal\s+Personal Name <me@example\.com>/);
    assert.match(stdout, /2\. work\s+Work Name <work@example\.com>/);
    assert.match(stdout, /Choose profile \[1\]: /);
    assert.match(stdout, /Saved rule rule_[a-z0-9]+: work -> /);

    const profiles = JSON.parse(
      await readFile(join(appDataParent, "git-profile-switcher", "profiles.json"), "utf8"),
    ) as {
      rules: Array<{ profileName: string; directory: string }>;
    };
    const resolvedProjectDir = await realpath(projectDir);
    assert.equal(profiles.rules[0]!.profileName, "work");
    assert.equal(profiles.rules[0]!.directory, `${resolvedProjectDir}/`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rule:add prompts for profile and directory when both are omitted", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-rule-add-prompts-"));
  const appDataParent = join(dir, "config");
  const globalGitConfigPath = join(dir, ".gitconfig");
  const projectDir = join(dir, "project");
  const env = {
    ...process.env,
    GIP_APP_DATA_DIR: appDataParent,
    GIP_GLOBAL_GITCONFIG: globalGitConfigPath,
  };

  try {
    await mkdir(projectDir);
    await execGip(
      ["profile:add", "work", "--user-name", "Work Name", "--user-email", "work@example.com"],
      { cwd: dir, env },
    );

    const { stdout } = await spawnGip(["rule:add"], {
      cwd: dir,
      env,
      input: "\n" + projectDir + "\n",
    });

    assert.match(stdout, /Choose profile \[1\]: /);
    assert.match(stdout, /Directory: /);
    assert.match(stdout, /Saved rule rule_[a-z0-9]+: work -> /);

    const profiles = JSON.parse(
      await readFile(join(appDataParent, "git-profile-switcher", "profiles.json"), "utf8"),
    ) as {
      rules: Array<{ profileName: string; directory: string }>;
    };
    const resolvedProjectDir = await realpath(projectDir);
    assert.equal(profiles.rules[0]!.profileName, "work");
    assert.equal(profiles.rules[0]!.directory, `${resolvedProjectDir}/`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("command --help prints command help without running the command", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-command-help-"));
  const env = {
    ...process.env,
    GIP_APP_DATA_DIR: join(dir, "config"),
    GIP_GLOBAL_GITCONFIG: join(dir, ".gitconfig"),
  };

  try {
    const { stdout } = await execGip(["profile:add", "--help"], { cwd: dir, env });

    assert.match(stdout, /profile:add - Create or update a Git identity profile/);
    assert.match(stdout, /Usage: gip profile:add/);
    assert.doesNotMatch(stdout, /Profile name:/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("__complete suggests saved profile names", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-complete-profiles-"));
  const env = {
    ...process.env,
    GIP_APP_DATA_DIR: join(dir, "config"),
    GIP_GLOBAL_GITCONFIG: join(dir, ".gitconfig"),
  };

  try {
    await execGip(
      ["profile:add", "work", "--user-name", "Work Name", "--user-email", "work@example.com"],
      { cwd: dir, env },
    );
    await execGip(
      ["profile:add", "personal", "--user-name", "Personal Name", "--user-email", "me@example.com"],
      { cwd: dir, env },
    );

    const { stdout } = await execGip(["__complete", "--shell", "zsh", "--", "use", ""], {
      cwd: dir,
      env,
    });

    assert.deepEqual(stdout.trim().split("\n"), ["personal", "work"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("install all installs completion and prompt blocks without global package install", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-install-all-"));
  const configPath = join(dir, ".zshrc");
  const env = {
    ...process.env,
    GIP_APP_DATA_DIR: join(dir, "config"),
    GIP_GLOBAL_GITCONFIG: join(dir, ".gitconfig"),
  };

  try {
    const { stdout } = await execGip(
      ["install", "all", "zsh", "--config", configPath, "--format", "profile"],
      { cwd: dir, env },
    );
    const shellConfig = await readFile(configPath, "utf8");

    assert.match(stdout, /Installed all shell integration for zsh/);
    assert.match(shellConfig, /# >>> gip completion >>>/);
    assert.match(shellConfig, /# >>> gip shell >>>/);
    assert.match(shellConfig, /# >>> gip prompt >>>/);
    assert.match(shellConfig, /gip prompt --format profile/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("export and import transfer profiles and rules", async () => {
  const sourceDir = await mkdtemp(join(tmpdir(), "gip-export-source-"));
  const targetDir = await mkdtemp(join(tmpdir(), "gip-import-target-"));
  const transferHome = join(sourceDir, "home");
  const exportPath = join(transferHome, "gip-profiles.json");
  const projectDir = join(sourceDir, "project");
  const sourceEnv = {
    ...process.env,
    HOME: transferHome,
    GIP_APP_DATA_DIR: join(sourceDir, "config"),
    GIP_GLOBAL_GITCONFIG: join(sourceDir, ".gitconfig"),
  };
  const targetEnv = {
    ...process.env,
    HOME: transferHome,
    GIP_APP_DATA_DIR: join(targetDir, "config"),
    GIP_GLOBAL_GITCONFIG: join(targetDir, ".gitconfig"),
  };

  try {
    await mkdir(transferHome);
    await mkdir(projectDir);
    await execGip(
      ["profile:add", "work", "--user-name", "Work Name", "--user-email", "work@example.com"],
      { cwd: sourceDir, env: sourceEnv },
    );
    await execGip(["profile:color", "work", "cyan"], { cwd: sourceDir, env: sourceEnv });
    await execGip(["use", "work", projectDir], { cwd: sourceDir, env: sourceEnv });

    const exported = await execGip(["export"], {
      cwd: sourceDir,
      env: sourceEnv,
    });
    const imported = await execGip(["import"], {
      cwd: targetDir,
      env: targetEnv,
    });
    const list = await execGip(["profile:list"], { cwd: targetDir, env: targetEnv });

    assert.match(exported.stdout, /Exported 1 profile\(s\) and 1 rule\(s\)/);
    assert.match(exported.stdout, new RegExp(escapeRegExp(exportPath)));
    assert.match(imported.stdout, /Imported 1 profile\(s\) and 1 rule\(s\)/);
    assert.match(imported.stdout, new RegExp(escapeRegExp(exportPath)));
    assert.match(imported.stdout, /Generated 1 profile config file/);
    assert.match(list.stdout, /work\s+Work Name <work@example\.com>/);
    assert.match(list.stdout, /prompt: cyan/);
    const prompt = await execGip(["prompt", "--format", "profile"], {
      cwd: projectDir,
      env: { ...targetEnv, GIP_PROMPT_SHELL: "zsh" },
    });
    assert.equal(prompt.stdout.trim(), "[gip %{\x1b[36m%}work%{\x1b[0m%}]");
    assert.match(await readFile(join(targetDir, ".gitconfig"), "utf8"), /gitdir:/);
  } finally {
    await rm(sourceDir, { recursive: true, force: true });
    await rm(targetDir, { recursive: true, force: true });
  }
});

test("import --profiles-only skips directory rules", async () => {
  const sourceDir = await mkdtemp(join(tmpdir(), "gip-export-profiles-only-source-"));
  const targetDir = await mkdtemp(join(tmpdir(), "gip-import-profiles-only-target-"));
  const exportPath = join(sourceDir, "profiles.json");
  const projectDir = join(sourceDir, "project");
  const sourceEnv = {
    ...process.env,
    GIP_APP_DATA_DIR: join(sourceDir, "config"),
    GIP_GLOBAL_GITCONFIG: join(sourceDir, ".gitconfig"),
  };
  const targetEnv = {
    ...process.env,
    GIP_APP_DATA_DIR: join(targetDir, "config"),
    GIP_GLOBAL_GITCONFIG: join(targetDir, ".gitconfig"),
  };

  try {
    await mkdir(projectDir);
    await execGip(
      ["profile:add", "work", "--user-name", "Work Name", "--user-email", "work@example.com"],
      { cwd: sourceDir, env: sourceEnv },
    );
    await execGip(["use", "work", projectDir], { cwd: sourceDir, env: sourceEnv });
    await execGip(["export", "--output", exportPath], { cwd: sourceDir, env: sourceEnv });

    const imported = await execGip(["import", "--input", exportPath, "--profiles-only"], {
      cwd: targetDir,
      env: targetEnv,
    });
    const data = JSON.parse(
      await readFile(join(targetDir, "config", "git-profile-switcher", "profiles.json"), "utf8"),
    ) as {
      profiles: Array<{ name: string }>;
      rules: Array<unknown>;
    };

    assert.match(imported.stdout, /Imported 1 profile\(s\) and 0 rule\(s\)/);
    assert.deepEqual(
      data.profiles.map((profile) => profile.name),
      ["work"],
    );
    assert.equal(data.rules.length, 0);
  } finally {
    await rm(sourceDir, { recursive: true, force: true });
    await rm(targetDir, { recursive: true, force: true });
  }
});

test("export --profiles-only writes profiles without directory rules", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-export-profiles-only-"));
  const exportPath = join(dir, "profiles-only.json");
  const projectDir = join(dir, "project");
  const env = {
    ...process.env,
    GIP_APP_DATA_DIR: join(dir, "config"),
    GIP_GLOBAL_GITCONFIG: join(dir, ".gitconfig"),
  };

  try {
    await mkdir(projectDir);
    await execGip(
      ["profile:add", "work", "--user-name", "Work Name", "--user-email", "work@example.com"],
      { cwd: dir, env },
    );
    await execGip(["use", "work", projectDir], { cwd: dir, env });

    const exported = await execGip(["export", "--profiles-only", "--output", exportPath], {
      cwd: dir,
      env,
    });
    const bundle = JSON.parse(await readFile(exportPath, "utf8")) as {
      data: {
        profiles: Array<{ name: string }>;
        rules: Array<unknown>;
      };
    };

    assert.match(exported.stdout, /Exported 1 profile\(s\) and 0 rule\(s\)/);
    assert.deepEqual(
      bundle.data.profiles.map((profile) => profile.name),
      ["work"],
    );
    assert.equal(bundle.data.rules.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function execGip(
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
  },
) {
  return await execFileAsync(
    process.execPath,
    ["--conditions=gip-source", "--experimental-strip-types", runtimeApp, ...args],
    options,
  );
}

function spawnGip(
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    input: string;
  },
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--conditions=gip-source", "--experimental-strip-types", runtimeApp, ...args],
      {
        cwd: options.cwd,
        env: options.env,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      if (status === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`gip exited with ${status}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
    child.stdin.end(options.input);
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function profileOptionPattern(
  index: number,
  profileName: string,
  userName: string,
  userEmail: string,
) {
  return new RegExp(
    `${index}\\. \\x1b\\[36m■\\x1b\\[0m ${escapeRegExp(profileName)}\\s+${escapeRegExp(
      userName,
    )} <${escapeRegExp(userEmail)}>`,
  );
}
