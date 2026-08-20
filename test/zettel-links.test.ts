import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { App, TFile } from "obsidian";

import { generateFiledCardLink } from "../src/zettel-links.js";

function mockApp(
  result: string,
  calls: unknown[][],
): Pick<App, "fileManager"> {
  return {
    fileManager: {
      generateMarkdownLink(...args: unknown[]): string {
        calls.push(args);
        return result;
      },
    },
  } as unknown as Pick<App, "fileManager">;
}

describe("generateFiledCardLink", () => {
  test("uses the zettel-id as Obsidian's link alias", () => {
    const calls: unknown[][] = [];
    const file = { path: "Cards/Systems.md" } as TFile;
    const link = generateFiledCardLink(
      mockApp("[[Systems|1/1]]", calls),
      file,
      "Notes/Source.md",
      "1/1",
    );

    assert.equal(link, "[[Systems|1/1]]");
    assert.deepEqual(calls, [[file, "Notes/Source.md", undefined, "1/1"]]);
  });

  test("returns Obsidian's preferred Markdown-link form unchanged", () => {
    const calls: unknown[][] = [];
    const file = { path: "Cards/Systems.md" } as TFile;
    const link = generateFiledCardLink(
      mockApp("[1/1](../Cards/Systems.md)", calls),
      file,
      "Notes/Source.md",
      "1/1",
    );

    assert.equal(link, "[1/1](../Cards/Systems.md)");
  });
});
