import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { App, TFile } from "obsidian";

import {
  generateFiledCardLink,
  renderedLinkAction,
  resolveFiledCardLink,
  type FiledCardLinkLookup,
} from "../src/card-links.js";

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
  test("uses the address as Obsidian's link alias", () => {
    const calls: unknown[][] = [];
    const file = { path: "Cards/Systems.md" } as TFile;
    const link = generateFiledCardLink(
      mockApp("[[Systems|A/1]]", calls),
      file,
      "Notes/Source.md",
      "A/1",
    );

    assert.equal(link, "[[Systems|A/1]]");
    assert.deepEqual(calls, [[file, "Notes/Source.md", undefined, "A/1"]]);
  });

  test("returns Obsidian's preferred Markdown-link form unchanged", () => {
    const calls: unknown[][] = [];
    const file = { path: "Cards/Systems.md" } as TFile;
    const link = generateFiledCardLink(
      mockApp("[A/1](../Cards/Systems.md)", calls),
      file,
      "Notes/Source.md",
      "A/1",
    );

    assert.equal(link, "[A/1](../Cards/Systems.md)");
  });
});

describe("rendered card links", () => {
  const filedFile = { path: "Cards/Filed.md" } as TFile;
  const ordinaryFile = { path: "Notes/Ordinary.md" } as TFile;
  const lookup: FiledCardLinkLookup = {
    resolveFile: (linkPath) => {
      if (linkPath === "Filed") {
        return filedFile;
      }
      if (linkPath === "Ordinary") {
        return ordinaryFile;
      }
      return null;
    },
    filedPathForFile: (file) =>
      file === filedFile ? filedFile.path : undefined,
    firstFiledPathAtAddress: (address) =>
      address === "A/1" ? filedFile.path : undefined,
  };

  test("resolves filed files and exact address-only links", () => {
    assert.equal(
      resolveFiledCardLink("Filed", "Source.md", lookup)?.path,
      filedFile.path,
    );
    assert.deepEqual(
      resolveFiledCardLink("A/1", "Source.md", lookup),
      { path: filedFile.path, resolvedBy: "address" },
    );
  });

  test("does not replace a resolved ordinary file with an address match", () => {
    const shadowedLookup: FiledCardLinkLookup = {
      ...lookup,
      firstFiledPathAtAddress: () => filedFile.path,
    };
    assert.equal(
      resolveFiledCardLink("Ordinary", "Source.md", shadowedLookup),
      undefined,
    );
  });

  test("keeps plain filed links in Slipbox across Deck and Tray decisions", () => {
    assert.deepEqual(
      renderedLinkAction(
        true,
        false,
        "Filed#Section",
        { path: filedFile.path, resolvedBy: "file" },
      ),
      { kind: "card", path: filedFile.path },
    );
    assert.deepEqual(
      renderedLinkAction(
        true,
        true,
        "Filed#Section",
        { path: filedFile.path, resolvedBy: "file" },
      ),
      { kind: "note", linktext: "Filed#Section" },
    );
    assert.deepEqual(
      renderedLinkAction(true, false, "Ordinary", undefined),
      { kind: "note", linktext: "Ordinary" },
    );
    assert.deepEqual(
      renderedLinkAction(false, false, "https://example.com", undefined),
      { kind: "external" },
    );
  });

  test("opens address-only filed links at their actual file on modified click", () => {
    assert.deepEqual(
      renderedLinkAction(
        true,
        true,
        "A/1",
        { path: filedFile.path, resolvedBy: "address" },
      ),
      { kind: "note", linktext: filedFile.path },
    );
  });
});
