import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { TFile } from "obsidian";

import {
  InlineEditRegistry,
  type InlineEditOwner,
  type InlineEditRegistryEnvironment,
} from "../src/inline-edit-registry.js";
import type { InlineEditSessionSnapshot } from "../src/inline-edit-session.js";

const FILE = { path: "Cards/A.md" } as TFile;

function subject() {
  let source = "---\nx: 1\n---\nbody";
  const notices: string[] = [];
  const revealed: InlineEditOwner[] = [];
  const files = new Map([[FILE.path, FILE]]);
  const environment: InlineEditRegistryEnvironment<InlineEditOwner> = {
    fileAtPath: (path) => files.get(path) ?? null,
    read: () => Promise.resolve(source),
    process: async (_file, update) => { source = update(source); },
    contentStart: () => 13,
    body: (value, start) => value.slice(start),
    flushOpenViews: () => Promise.resolve(),
    revealOwner: (owner) => { revealed.push(owner); return Promise.resolve(); },
    notify: (message) => notices.push(message),
  };
  const registry = new InlineEditRegistry(environment);
  return { registry, notices, revealed, files, source: () => source };
}

function owner(): InlineEditOwner {
  return { finishInlineEditing: () => Promise.resolve(true) };
}

function snapshot(path: string): InlineEditSessionSnapshot {
  return {
    path,
    baseBody: "body",
    protectedBody: null,
    draft: "draft",
    version: 1,
    committedVersion: 0,
    phase: "editing",
    failure: null,
    conflictRetryable: false,
  };
}

describe("InlineEditRegistry", () => {
  test("owns exact paths and reveals the existing owner", async () => {
    const { registry, notices, revealed } = subject();
    const first = owner();
    const second = owner();
    assert.equal(registry.acquire(FILE.path, first), true);
    assert.equal(registry.acquire(FILE.path, second), false);
    await Promise.resolve();
    assert.deepEqual(revealed, [first]);
    assert.match(notices[0] ?? "", /already being edited/);
    registry.release(FILE.path, first);
    assert.equal(registry.acquire(FILE.path, second), true);
  });

  test("prepares and commits an unchanged body", async () => {
    const { registry, source } = subject();
    assert.deepEqual(await registry.prepare(FILE), { file: FILE, body: "body" });
    assert.deepEqual(await registry.commit({
      path: FILE.path,
      baseBody: "body",
      protectedBody: null,
      draft: "changed",
      version: 1,
      final: true,
    }), { status: "saved" });
    assert.equal(source(), "---\nx: 1\n---\nchanged");
  });

  test("retains detached drafts through rename and deletion conflicts", () => {
    const { registry } = subject();
    registry.retainDetached(snapshot("Cards/A.md"), FILE, {
      returnTarget: { surface: "deck" },
      selectionStart: 0,
      selectionEnd: 0,
      textareaScrollTop: 0,
      renderedScrollTop: 0,
    });
    registry.handlePathRename("Cards", "Archive");
    registry.handlePathDeletion("Archive/A.md");
    const draft = registry.takeDetached();
    assert.equal(draft?.path, "Archive/A.md");
    assert.equal(draft?.conflictRetryable, true);
    assert.match(draft?.conflictMessage ?? "", /deleted/);
  });

  test("finishes each distinct owner exactly once", async () => {
    const { registry } = subject();
    let finishes = 0;
    const shared = {
      finishInlineEditing: async () => { finishes += 1; return true; },
    };
    registry.acquire("A.md", shared);
    registry.acquire("B.md", shared);
    await registry.finishAll("quit");
    assert.equal(finishes, 1);
  });
});
