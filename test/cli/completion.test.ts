import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { buildCompletionSuggestions, generateCompletionScript } from "#cli/completion";
import { createProfileRepository } from "#profiles/repository";

test("generateCompletionScript renders shell-specific wrappers", () => {
  assert.match(generateCompletionScript("bash"), /complete -F _gip_completion gip/);
  assert.match(generateCompletionScript("fish"), /complete -c gip -f/);
  assert.match(generateCompletionScript("zsh"), /compdef _gip gip git-profile-switcher/);
});

test("buildCompletionSuggestions suggests commands and flags", async () => {
  const runtime = await createCompletionRuntime();
  try {
    assert.deepEqual(await buildCompletionSuggestions(runtime, []), [
      "--help",
      "apply",
      "clear",
      "completion",
      "doctor",
      "export",
      "import",
      "install",
      "install:all",
      "install:completion",
      "install:prompt",
      "install:shell",
      "now",
      "paths",
      "profile:add",
      "profile:color",
      "profile:list",
      "profile:remove",
      "prompt",
      "rule:add",
      "rule:list",
      "rule:remove",
      "tui",
      "uninstall:all",
      "uninstall:completion",
      "uninstall:prompt",
      "uninstall:shell",
      "update",
      "use",
    ]);

    assert.deepEqual(await buildCompletionSuggestions(runtime, ["prompt"]), [
      "--format",
      "--help",
      "--json",
      "--profile",
    ]);
    assert.deepEqual(await buildCompletionSuggestions(runtime, ["prompt", "--format", ""]), [
      "auto",
      "identity",
      "profile",
    ]);
    assert.deepEqual(await buildCompletionSuggestions(runtime, ["install", ""]), [
      "all",
      "bash",
      "completion",
      "fish",
      "prompt",
      "shell",
      "zsh",
    ]);
    assert.deepEqual(await buildCompletionSuggestions(runtime, ["install", "all", ""]), [
      "bash",
      "fish",
      "zsh",
    ]);
    assert.deepEqual(await buildCompletionSuggestions(runtime, ["update", "--shell", ""]), [
      "bash",
      "fish",
      "zsh",
    ]);
  } finally {
    await runtime.cleanup();
  }
});

test("buildCompletionSuggestions suggests saved profiles and rules", async () => {
  const runtime = await createCompletionRuntime();
  try {
    const work = await runtime.repository.upsertProfile({
      name: "work",
      userName: "Work Name",
      userEmail: "work@example.com",
    });
    await runtime.repository.upsertProfile({
      name: "personal",
      userName: "Personal Name",
      userEmail: "me@example.com",
    });
    const rule = await runtime.repository.addRule({
      profileName: work.name,
      directory: runtime.dir,
    });

    assert.deepEqual(await buildCompletionSuggestions(runtime, ["use", ""]), ["personal", "work"]);
    assert.deepEqual(await buildCompletionSuggestions(runtime, ["now", ""]), ["personal", "work"]);
    assert.deepEqual(await buildCompletionSuggestions(runtime, ["profile:remove", ""]), [
      "personal",
      "work",
    ]);
    assert.deepEqual(await buildCompletionSuggestions(runtime, ["profile:color", ""]), [
      "personal",
      "work",
    ]);
    assert.deepEqual(await buildCompletionSuggestions(runtime, ["profile:color", "work", ""]), [
      "blue",
      "bright-blue",
      "bright-cyan",
      "bright-green",
      "bright-magenta",
      "bright-red",
      "bright-yellow",
      "cyan",
      "default",
      "gray",
      "green",
      "magenta",
      "no-color",
      "none",
      "red",
      "yellow",
    ]);
    assert.deepEqual(await buildCompletionSuggestions(runtime, ["rule:remove", ""]), [rule.id]);
  } finally {
    await runtime.cleanup();
  }
});

async function createCompletionRuntime() {
  const dir = await mkdtemp(join(tmpdir(), "gip-completion-"));
  const repository = createProfileRepository(join(dir, "profiles.json"));
  return {
    dir,
    repository,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
