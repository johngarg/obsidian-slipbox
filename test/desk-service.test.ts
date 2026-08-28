import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { TFile } from "obsidian";

import type { CardIndexRuntime } from "../src/card-index-runtime.js";
import type { VaultCardIndex } from "../src/card-index.js";
import { DeskService } from "../src/desk-service.js";
import { createPile, EMPTY_DESK } from "../src/desk-state.js";

const FILE = { path: "A.md" } as TFile;
const SNAPSHOT = { filed: [], unfiled: [] } as unknown as VaultCardIndex;

function subject(available = true) {
  const notices: string[] = [];
  let publications = 0;
  const runtime = {
    index: {
      filedByFile: () => available ? { path: FILE.path } : undefined,
    },
    refresh: async (request: { afterReconcile?: (value: VaultCardIndex) => void }) => {
      request.afterReconcile?.(SNAPSHOT);
      publications += 1;
    },
  } as unknown as CardIndexRuntime;
  const service = new DeskService({
    indexRuntime: runtime,
    refreshViews: () => { publications += 1; return Promise.resolve(); },
    notify: (message) => notices.push(message),
  });
  return { service, notices, publications: () => publications };
}

describe("DeskService", () => {
  test("coordinates a fresh index publication before pulling a card", async () => {
    const { service, publications } = subject();
    await service.toggleFile(FILE);
    assert.equal(service.contains(FILE.path), true);
    assert.equal(publications(), 1);
  });

  test("rejects unavailable cards after the coordinated refresh", async () => {
    const { service, notices } = subject(false);
    assert.equal(await service.putFile(FILE), false);
    assert.deepEqual(notices, ["Only an available filed card can be put on the Desk."]);
  });

  test("owns replacement, pile IDs, paths, rename, and deletion", async () => {
    const { service, publications } = subject();
    const id = service.createPileId();
    await service.replace(createPile(EMPTY_DESK, id, [
      { cardRef: "Folder/A.md", kind: "filed" },
    ]));
    assert.deepEqual(service.pathsInPile(id), ["Folder/A.md"]);
    service.renamePath("Folder", "Archive");
    assert.deepEqual(service.pathsInPile(id), ["Archive/A.md"]);
    service.removePath("Archive");
    assert.deepEqual(service.pathsInPile(id), []);
    assert.equal(publications(), 1);
  });
});
