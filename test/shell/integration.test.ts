import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  installShellAll,
  installShellSession,
  removeShellCompletionBlock,
  removeShellSessionBlock,
  renderCompletionBlock,
  renderPromptBlock,
  renderShellSessionBlock,
} from "#shell/integration";

test("renderPromptBlock defaults to auto prompt format", () => {
  const block = renderPromptBlock("zsh");

  assert.match(block, /GIP_PROMPT_SHELL=zsh gip prompt 2>\/dev\/null/);
  assert.match(block, /setopt prompt_subst/);
  assert.match(block, /GIP_ORIGINAL_PROMPT="\$PROMPT"/);
  assert.match(block, /printf '%s\\n%%\{%%\}' "\$gip_segment"/);
});

test("renderPromptBlock embeds profile prompt format", () => {
  const block = renderPromptBlock("zsh", "profile");

  assert.match(block, /gip prompt --format profile/);
  assert.match(block, /printf '%s ' "\$gip_segment"/);
});

test("renderPromptBlock omits prompt format for identity output", () => {
  const block = renderPromptBlock("bash", "identity");

  assert.match(block, /GIP_PROMPT_SHELL=bash gip prompt --format identity 2>\/dev\/null/);
  assert.match(block, /GIP_ORIGINAL_PS1="\$PS1"/);
  assert.match(block, /printf '%s\\n\\001\\002' "\$gip_segment"/);
});

test("renderPromptBlock wraps fish original prompt", () => {
  const block = renderPromptBlock("fish");

  assert.match(block, /functions -c fish_prompt __gip_original_fish_prompt/);
  assert.match(block, /set -lx GIP_PROMPT_SHELL fish/);
  assert.match(block, /__gip_original_fish_prompt \| string collect/);
  assert.match(block, /printf "%s\\n" "\$gip_segment"/);
});

test("renderCompletionBlock wraps generated completion script", () => {
  const block = renderCompletionBlock("zsh");

  assert.match(block, /# >>> gip completion >>>/);
  assert.match(block, /gip __complete --shell zsh/);
  assert.match(block, /compdef _gip gip git-profile-switcher/);
  assert.match(block, /# <<< gip completion <<</);
});

test("renderShellSessionBlock wraps now session command", () => {
  const block = renderShellSessionBlock("zsh");

  assert.match(block, /# >>> gip shell >>>/);
  assert.match(block, /gip_session="\$\(command gip "\$@" --exports --shell zsh\)"/);
  assert.match(block, /eval "\$gip_session"/);
  assert.match(block, /# <<< gip shell <<</);
});

test("removeShellCompletionBlock removes only the managed completion block", () => {
  const text = `before

${renderCompletionBlock("bash")}
after
`;

  const next = removeShellCompletionBlock(text);

  assert.match(next, /^before/);
  assert.match(next, /after$/);
  assert.doesNotMatch(next, /gip __complete/);
});

test("installShellSession installs only the session wrapper block", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-shell-session-"));
  const configPath = join(dir, ".zshrc");

  try {
    await writeFile(configPath, "# existing config\n");
    const result = await installShellSession({ shell: "zsh", configPath });
    const text = await readFile(configPath, "utf8");

    assert.equal(result.changed, true);
    assert.match(text, /# >>> gip shell >>>/);
    assert.doesNotMatch(text, /# >>> gip completion >>>/);
    assert.doesNotMatch(text, /# >>> gip prompt >>>/);
    assert.doesNotMatch(removeShellSessionBlock(text), /# >>> gip shell >>>/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("installShellAll installs completion and prompt blocks together", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-shell-all-"));
  const configPath = join(dir, ".zshrc");

  try {
    await writeFile(configPath, "# existing config\n");
    const result = await installShellAll({
      shell: "zsh",
      configPath,
      promptFormat: "profile",
    });
    const secondResult = await installShellAll({
      shell: "zsh",
      configPath,
      promptFormat: "profile",
    });
    const text = await readFile(configPath, "utf8");

    assert.equal(result.changed, true);
    assert.equal(secondResult.changed, false);
    assert.match(text, /# >>> gip completion >>>/);
    assert.match(text, /gip __complete --shell zsh/);
    assert.match(text, /# >>> gip shell >>>/);
    assert.match(text, /gip_session="\$\(command gip "\$@" --exports --shell zsh\)"/);
    assert.match(text, /# >>> gip prompt >>>/);
    assert.match(text, /gip prompt --format profile/);
    assert.deepEqual(
      (await readdir(dir)).filter((entry) => entry.includes(".gip-backup-")),
      [],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
