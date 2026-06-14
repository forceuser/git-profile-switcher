import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  applyGitProfileConfig,
  clearGlobalGitIdentity,
  findMatchingRule,
  renderIncludeBlock,
  removeManagedIncludeBlock,
  setGlobalGitIdentity,
} from "#git/config";
import type { ProfileStoreData } from "#profiles/types";

const DATA = {
  version: 1,
  profiles: [
    {
      name: "work",
      userName: "Work Name",
      userEmail: "work@example.com",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  rules: [
    {
      id: "rule_work",
      profileName: "work",
      directory: "/Users/example/Developer/Work/",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
} satisfies ProfileStoreData;

test("renderIncludeBlock renders Git includeIf rules", () => {
  const rendered = renderIncludeBlock(DATA.rules, "/tmp/gip/gitconfigs");
  assert.match(rendered, /\[includeIf "gitdir:\/Users\/example\/Developer\/Work\/"\]/);
  assert.match(rendered, /path = \/tmp\/gip\/gitconfigs\/work\.gitconfig/);
});

test("removeManagedIncludeBlock preserves unmanaged gitconfig content", () => {
  const original = `[user]\n\tname = Default\n\n${renderIncludeBlock(
    DATA.rules,
    "/tmp/gip/gitconfigs",
  )}\n[core]\n\teditor = vim\n`;
  const next = removeManagedIncludeBlock(original);
  assert.equal(next, "[user]\n\tname = Default\n\n[core]\n\teditor = vim");
});

test("applyGitProfileConfig writes generated profile files and updates global gitconfig", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-git-"));
  try {
    const globalGitConfigPath = join(dir, ".gitconfig");
    await writeFile(globalGitConfigPath, "[core]\n\teditor = vim\n");
    const result = await applyGitProfileConfig({
      data: DATA,
      globalGitConfigPath,
      generatedGitConfigDir: join(dir, "gitconfigs"),
    });

    assert.equal(result.changed, true);
    assert.equal(result.generatedFiles.length, 1);
    assert.match(await readFile(result.generatedFiles[0]!, "utf8"), /email = work@example.com/);
    assert.match(await readFile(globalGitConfigPath, "utf8"), /# >>> gip includeIf >>>/);
    await assertNoGitConfigBackups(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("setGlobalGitIdentity writes user identity to global gitconfig", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-git-global-"));
  try {
    const globalGitConfigPath = join(dir, ".gitconfig");
    await writeFile(globalGitConfigPath, "[core]\n\teditor = vim\n");
    const result = await setGlobalGitIdentity({
      profile: DATA.profiles[0]!,
      globalGitConfigPath,
    });

    const config = await readFile(globalGitConfigPath, "utf8");
    assert.equal(result.changed, true);
    assert.match(config, /\[core\]\n\teditor = vim/);
    assert.match(config, /\[user\]/);
    assert.match(config, /name = Work Name/);
    assert.match(config, /email = work@example\.com/);
    await assertNoGitConfigBackups(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("clearGlobalGitIdentity removes only global user name and email", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gip-git-global-"));
  try {
    const globalGitConfigPath = join(dir, ".gitconfig");
    await writeFile(
      globalGitConfigPath,
      "[user]\n\tname = Work Name\n\temail = work@example.com\n\tsigningkey = ABC123\n",
    );
    const result = await clearGlobalGitIdentity(globalGitConfigPath);

    const config = await readFile(globalGitConfigPath, "utf8");
    assert.equal(result.changed, true);
    assert.doesNotMatch(config, /name = Work Name/);
    assert.doesNotMatch(config, /email = work@example\.com/);
    assert.match(config, /signingkey = ABC123/);
    await assertNoGitConfigBackups(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function assertNoGitConfigBackups(dir: string) {
  const entries = await readdir(dir);
  assert.deepEqual(
    entries.filter((entry) => entry.includes(".gip-backup-")),
    [],
  );
}

test("findMatchingRule prefers the most specific directory", () => {
  const data = {
    ...DATA,
    rules: [
      DATA.rules[0]!,
      {
        id: "rule_nested",
        profileName: "work",
        directory: "/Users/example/Developer/Work/client/",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  } satisfies ProfileStoreData;

  assert.equal(
    findMatchingRule(data, "/Users/example/Developer/Work/client/app")?.id,
    "rule_nested",
  );
});

test("findMatchingRule handles macOS /private/var temp path aliases", () => {
  assert.equal(findMatchingRule(DATA, "/private/var/folders/not-a-match")?.id ?? null, null);
  const data = {
    ...DATA,
    rules: [
      {
        id: "rule_tmp",
        profileName: "work",
        directory: "/var/folders/example/work/",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  } satisfies ProfileStoreData;

  assert.equal(findMatchingRule(data, "/private/var/folders/example/work/repo")?.id, "rule_tmp");
});
