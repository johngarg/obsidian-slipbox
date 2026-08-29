import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  EXPLICIT_BRANCH_MARKER,
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
  test("uses + as the canonical marker", () => {
    assert.equal(EXPLICIT_BRANCH_MARKER, "+");
  });

  test("recognises only explicit Wiki and Markdown display aliases", () => {
    assert.equal(
      explicitBranchLabel(reference("[[Card|+a]]", "Card", "+a"), true),
      "a",
    );
    assert.equal(
      explicitBranchLabel(reference("[+β](Card.md)", "Card.md", "+β"), true),
      "β",
    );
    for (const candidate of [
      reference("[[+a]]", "+a", "+a"),
      reference("[[Card|a]]", "Card", "a"),
      reference("[[Card|+ ]]", "Card", "+ "),
      reference("[[Card|§§ branch ]]", "Card", "§§ branch "),
      reference("[[Card]]", "Card", "+a"),
      reference("![[Card|+a]]", "Card", "+a"),
      reference("bare-cache-token", "Card", "+a"),
    ]) {
      assert.equal(explicitBranchLabel(candidate, true), null);
    }
  });

  test("supports Unicode labels and disabled parsing", () => {
    assert.equal(
      explicitBranchLabel(reference("[[Card|+  α/β  ]]", "Card"), true),
      "α/β",
    );
    assert.equal(
      explicitBranchLabel(reference("[[Card|→  α/β]]", "Card"), true),
      null,
    );
    assert.equal(
      explicitBranchLabel(reference("[[Card|+α/β]]", "Card"), false),
      null,
    );
  });

  test("reserves a target's + address as its ordinary alias", () => {
    assert.equal(
      explicitBranchLabel(
        reference("[[Plus|+12]]", "Plus", "+12"),
        true,
        "+12",
      ),
      null,
    );
    assert.equal(
      explicitBranchLabel(
        reference("[[Plus|++12]]", "Plus", "++12"),
        true,
        "+12",
      ),
      "+12",
    );
  });

  test("indexes filed non-self relations with stable deduplication and ordering", () => {
    const targets = new Map([
      ["A.md::Target", "T.md"],
      ["B.md::Target", "V.md"],
      ["A.md::Unfiled", "U.md"],
      ["A.md::A", "A.md"],
    ]);
    const indexed = indexExplicitBranches([
      {
        path: "B.md",
        address: "2",
        deckIndex: 1,
        links: [reference("[[Target|+z]]", "Target", "+z")],
      },
      {
        path: "A.md",
        address: "1",
        deckIndex: 0,
        links: [
          reference("[[Target|+b]]", "Target", "+b"),
          reference("[[Target|+a]]", "Target", "+a"),
          reference("[[Target|+b]]", "Target", "+b"),
          reference("[[A|+self]]", "A", "+self"),
          reference("[[Unfiled|+outside]]", "Unfiled", "+outside"),
        ],
      },
      { path: "T.md", address: "3", deckIndex: 2, links: [] },
      { path: "V.md", address: "4", deckIndex: 3, links: [] },
    ], {
      enabled: true,
      resolveTargetPath: (link, sourcePath) => targets.get(`${sourcePath}::${link}`),
    });

    assert.deepEqual(indexed.outgoingBySourcePath.get("A.md"), [
      { sourcePath: "A.md", targetPath: "T.md", label: "b", sourceOrder: 0 },
    ]);
    assert.deepEqual(indexed.incomingByTargetPath.get("T.md"), [
      { sourcePath: "A.md", targetPath: "T.md", label: "b", sourceOrder: 0 },
    ]);
    assert.equal(indexed.parentByTargetPath.get("T.md")?.sourcePath, "A.md");
    assert.equal(indexed.incomingByTargetPath.has("U.md"), false);
  });

  test("retains several parents while selecting one stable Branch View context", () => {
    const indexed = indexExplicitBranches([
      {
        path: "A.md",
        address: "1",
        deckIndex: 0,
        links: [reference("[[Target|+a]]", "Target", "+a")],
      },
      {
        path: "B.md",
        address: "2",
        deckIndex: 1,
        links: [reference("[[Target|+b]]", "Target", "+b")],
      },
      { path: "Target.md", address: "3", deckIndex: 2, links: [] },
    ], {
      enabled: true,
      resolveTargetPath: () => "Target.md",
    });

    assert.equal(indexed.parentByTargetPath.get("Target.md")?.sourcePath, "A.md");
    assert.deepEqual(
      indexed.incomingByTargetPath.get("Target.md")?.map((branch) =>
        branch.sourcePath
      ),
      ["A.md", "B.md"],
    );
    assert.equal(indexed.outgoingBySourcePath.get("A.md")?.length, 1);
    assert.equal(indexed.outgoingBySourcePath.get("B.md")?.length, 1);
  });

  test("indexes ++address but not an ordinary +address card link", () => {
    const indexed = indexExplicitBranches([
      {
        path: "A.md",
        address: "1",
        deckIndex: 0,
        links: [
          reference("[[Plus|+12]]", "Plus", "+12"),
          reference("[[Plus|++12]]", "Plus", "++12"),
        ],
      },
      { path: "Plus.md", address: "+12", deckIndex: 1, links: [] },
    ], {
      enabled: true,
      resolveTargetPath: () => "Plus.md",
    });

    assert.deepEqual(indexed.outgoingBySourcePath.get("A.md"), [{
      sourcePath: "A.md",
      targetPath: "Plus.md",
      label: "+12",
      sourceOrder: 1,
    }]);
  });

  test("returns the stable empty index without resolving links when disabled", () => {
    let resolutions = 0;
    const indexed = indexExplicitBranches([{
      path: "A.md",
      address: "1",
      deckIndex: 0,
      links: [reference("[[B|+a]]", "B", "+a")],
    }], {
      enabled: false,
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
