import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  explicitBranchLabel,
  indexExplicitBranches,
  type BranchLinkReference,
} from "../src/branch-links.js";

const reference = (
  original: string,
  link: string,
  displayText?: string,
): BranchLinkReference => ({
  original,
  link,
  ...(displayText === undefined ? {} : { displayText }),
});

describe("explicit branch links", () => {
  test("recognises only explicit Wiki and Markdown display aliases", () => {
    assert.equal(
      explicitBranchLabel(reference("[[Card|+a]]", "Card", "+a"), true, "+"),
      "a",
    );
    assert.equal(
      explicitBranchLabel(reference("[+β](Card.md)", "Card.md", "+β"), true, "+"),
      "β",
    );
    assert.equal(
      explicitBranchLabel(reference("[[Card|§§ branch ]]", "Card"), true, "§§"),
      "branch",
    );
    for (const candidate of [
      reference("[[+a]]", "+a", "+a"),
      reference("[[Card|a]]", "Card", "a"),
      reference("[[Card|+ ]]", "Card", "+ "),
      reference("[[Card]]", "Card", "+a"),
      reference("![[Card|+a]]", "Card", "+a"),
      reference("bare-cache-token", "Card", "+a"),
    ]) {
      assert.equal(explicitBranchLabel(candidate, true, "+"), null);
    }
  });

  test("supports marker changes, Unicode labels, and disabled parsing", () => {
    const candidate = reference("[[Card| →  α/β  ]]", "Card", " →  α/β  ");
    assert.equal(explicitBranchLabel(candidate, true, "→"), null);
    assert.equal(
      explicitBranchLabel(reference("[[Card|→  α/β  ]]", "Card"), true, "→"),
      "α/β",
    );
    assert.equal(explicitBranchLabel(candidate, true, "+"), null);
    assert.equal(explicitBranchLabel(candidate, false, "→"), null);
  });

  test("indexes filed non-self relations with stable deduplication and ordering", () => {
    const targets = new Map([
      ["A.md::Target", "T.md"],
      ["B.md::Target", "T.md"],
      ["A.md::Unfiled", "U.md"],
      ["A.md::A", "A.md"],
    ]);
    const indexed = indexExplicitBranches([
      {
        path: "B.md",
        deckIndex: 1,
        links: [reference("[[Target|+z]]", "Target", "+z")],
      },
      {
        path: "A.md",
        deckIndex: 0,
        links: [
          reference("[[Target|+b]]", "Target", "+b"),
          reference("[[Target|+a]]", "Target", "+a"),
          reference("[[Target|+b]]", "Target", "+b"),
          reference("[[A|+self]]", "A", "+self"),
          reference("[[Unfiled|+outside]]", "Unfiled", "+outside"),
        ],
      },
      { path: "T.md", deckIndex: 2, links: [] },
    ], {
      enabled: true,
      marker: "+",
      resolveTargetPath: (link, sourcePath) => targets.get(`${sourcePath}::${link}`),
    });

    assert.deepEqual(indexed.outgoingBySourcePath.get("A.md"), [
      { sourcePath: "A.md", targetPath: "T.md", label: "b", sourceOrder: 0 },
      { sourcePath: "A.md", targetPath: "T.md", label: "a", sourceOrder: 1 },
    ]);
    assert.deepEqual(indexed.incomingByTargetPath.get("T.md"), [
      { sourcePath: "A.md", targetPath: "T.md", label: "b", sourceOrder: 0 },
      { sourcePath: "A.md", targetPath: "T.md", label: "a", sourceOrder: 1 },
      { sourcePath: "B.md", targetPath: "T.md", label: "z", sourceOrder: 0 },
    ]);
    assert.equal(indexed.incomingByTargetPath.has("U.md"), false);
  });

  test("returns the stable empty index without resolving links when disabled", () => {
    let resolutions = 0;
    const indexed = indexExplicitBranches([{
      path: "A.md",
      deckIndex: 0,
      links: [reference("[[B|+a]]", "B", "+a")],
    }], {
      enabled: false,
      marker: "+",
      resolveTargetPath: () => {
        resolutions += 1;
        return "B.md";
      },
    });
    assert.equal(resolutions, 0);
    assert.equal(indexed.incomingByTargetPath.size, 0);
    assert.equal(indexed.outgoingBySourcePath.size, 0);
  });
});
