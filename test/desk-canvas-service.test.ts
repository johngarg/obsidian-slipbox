import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { TFile } from "obsidian";

import { DeskCanvasService } from "../src/desk-canvas-service.js";
import type { CanvasWriteResult } from "../src/canvas-bridge.js";

const CANVAS = { path: "Ideas.canvas", basename: "Ideas" } as TFile;
const RESULT = {
  file: CANVAS,
  data: { nodes: [], edges: [] },
  addedPaths: ["A.md"],
  skippedPaths: ["B.md"],
} as CanvasWriteResult;

function subject() {
  const notices: string[] = [];
  const writes: string[] = [];
  let entered: string | null = "Work";
  const service = new DeskCanvasService({
    pathsInPile: () => ["A.md", "B.md"],
    hasActiveCanvas: () => true,
    canvasFiles: () => [CANVAS],
    chooseCanvas: () => Promise.resolve(CANVAS),
    promptPath: () => Promise.resolve(entered),
    layoutActive: () => { writes.push("active"); return Promise.resolve(RESULT); },
    layout: () => { writes.push("existing"); return Promise.resolve(RESULT); },
    create: (path) => { writes.push(path); return Promise.resolve(RESULT); },
    notify: (message) => notices.push(message),
  });
  return { service, notices, writes, setEntered: (value: string | null) => { entered = value; } };
}

describe("DeskCanvasService", () => {
  test("runs each Canvas operation and summarizes added and skipped cards", async () => {
    const { service, notices, writes } = subject();
    await service.layoutPileOnActiveCanvas("pile");
    await service.layoutPileOnCanvas("pile");
    await service.createCanvasFromPile("pile");
    assert.deepEqual(writes, ["active", "existing", "Work.canvas"]);
    assert.equal(notices.length, 3);
    assert.match(notices[0] ?? "", /Added 1 card to Ideas.*Skipped 1 existing node/);
  });

  test("handles cancellation and invalid paths without writing", async () => {
    const { service, notices, writes, setEntered } = subject();
    setEntered(null);
    await service.createCanvasFromPile("pile");
    setEntered("../Outside");
    await service.createCanvasFromPile("pile");
    assert.deepEqual(writes, []);
    assert.deepEqual(notices, [
      "Enter a valid Canvas filename or vault-relative path.",
    ]);
  });
});
