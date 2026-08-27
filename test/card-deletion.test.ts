import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { deleteCardWithConfirmation } from "../src/index.js";

interface TestFile {
  readonly path: string;
  deleted: boolean;
}

describe("card deletion", () => {
  test("delegates the complete confirmed deletion to Obsidian exactly once", async () => {
    const file: TestFile = { path: "Unfiled.md", deleted: false };
    let promptCalls = 0;
    let trashCalls = 0;
    const fileManager = {
      promptForDeletion: async (target: TestFile) => {
        promptCalls += 1;
        target.deleted = true;
        return true;
      },
      trashFile: async () => {
        trashCalls += 1;
        throw new Error("The source path was already moved to trash");
      },
    };

    assert.equal(
      await deleteCardWithConfirmation(fileManager, file),
      true,
    );
    assert.equal(file.deleted, true);
    assert.equal(promptCalls, 1);
    assert.equal(trashCalls, 0);
  });

  test("leaves a cancelled deletion untouched", async () => {
    const file: TestFile = { path: "Unfiled.md", deleted: false };
    const result = await deleteCardWithConfirmation(
      { promptForDeletion: async () => false },
      file,
    );

    assert.equal(result, false);
    assert.equal(file.deleted, false);
  });
});
