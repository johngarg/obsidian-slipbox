import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { filterLocalBranchTargets } from "../src/local-branch-target-search.js";
import type { LocalBranchTarget } from "../src/local-branch-types.js";

const targets: readonly LocalBranchTarget[] = [
  {
    path: "Cards/Alpha.md",
    address: "17,1",
    title: "Alpha card",
    alias: "supplement",
  },
  {
    path: "Cards/Beta.md",
    address: "17,2",
    title: "Beta card",
    alias: "Research trail",
  },
  {
    path: "Cards/Gamma.md",
    address: "17,3",
    title: "Gamma card",
  },
];

function paths(matches: readonly LocalBranchTarget[]): string[] {
  return matches.map((target) => target.path);
}

describe("filterLocalBranchTargets", () => {
  test("returns every target in its original order for a blank query", () => {
    assert.deepEqual(paths(filterLocalBranchTargets(targets, "  ")), [
      "Cards/Alpha.md",
      "Cards/Beta.md",
      "Cards/Gamma.md",
    ]);
  });

  test("matches supplementary aliases case-insensitively", () => {
    assert.deepEqual(
      paths(filterLocalBranchTargets(targets, "RESEARCH")),
      ["Cards/Beta.md"],
    );
  });

  test("continues to match address, title, and path", () => {
    assert.deepEqual(paths(filterLocalBranchTargets(targets, "17,1")), [
      "Cards/Alpha.md",
    ]);
    assert.deepEqual(paths(filterLocalBranchTargets(targets, "gamma card")), [
      "Cards/Gamma.md",
    ]);
    assert.deepEqual(paths(filterLocalBranchTargets(targets, "beta.md")), [
      "Cards/Beta.md",
    ]);
  });
});
