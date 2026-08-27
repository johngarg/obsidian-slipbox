import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  inferredChildAddresses,
  inferredNextSiblingAddresses,
  inferredParentAddress,
  inferredPreviousSiblingAddresses,
  buildInferredStructure,
  cycleBackwardInferredSiblingAddress,
  cycleForwardInferredSiblingAddress,
  isInferredAddressAncestor,
} from "../src/index.js";

const cards = (addresses: readonly string[]) => addresses.map((address, index) => ({
  address,
  path: `${String(index).padStart(2, "0")}-${address}.md`,
}));

describe("inferred address structure", () => {
  test("models parents, ordered sibling lists, and wrapped sibling cycles", () => {
    const index = buildInferredStructure(cards(["1", "2", "2a", "2b", "3"]), "natural");
    assert.deepEqual(index.rootAddresses, ["1", "2", "3"]);
    assert.deepEqual(inferredChildAddresses(index, "2"), ["2a", "2b"]);
    assert.equal(inferredParentAddress(index, "2a"), "2");
    assert.deepEqual(inferredPreviousSiblingAddresses(index, "2b"), ["2a"]);
    assert.deepEqual(inferredNextSiblingAddresses(index, "2a"), ["2b"]);
    assert.equal(cycleForwardInferredSiblingAddress(index, "2a"), "2b");
    assert.equal(cycleForwardInferredSiblingAddress(index, "2b"), "2a");
    assert.equal(cycleBackwardInferredSiblingAddress(index, "2a"), "2b");
    assert.equal(cycleForwardInferredSiblingAddress(index, "1"), "2");
    assert.equal(cycleBackwardInferredSiblingAddress(index, "1"), "3");
  });

  test("never crosses between equal-depth nodes with different parents", () => {
    const index = buildInferredStructure(
      cards(["1", "1a", "1a1", "1a1a", "1b", "1b1", "2"]),
      "natural",
    );
    assert.equal(inferredParentAddress(index, "1a1a"), "1a1");
    assert.deepEqual(inferredChildAddresses(index, "1"), ["1a", "1b"]);
    assert.deepEqual(inferredNextSiblingAddresses(index, "1a1"), []);
    assert.deepEqual(inferredPreviousSiblingAddresses(index, "1b1"), []);
    assert.equal(cycleForwardInferredSiblingAddress(index, "1a1"), null);
    assert.equal(cycleBackwardInferredSiblingAddress(index, "1b1"), null);
  });

  test("handles Luhmann-style and arbitrary prefix grammars", () => {
    const index = buildInferredStructure(
      cards(["57/12", "57/12a", "57/12a1", "57/12b", "57/13", "Project-1", "Project-1-final", "Project-2"]),
      "natural",
    );
    assert.deepEqual(inferredChildAddresses(index, "57/12"), ["57/12a", "57/12b"]);
    assert.equal(inferredParentAddress(index, "57/12a1"), "57/12a");
    assert.equal(inferredParentAddress(index, "57/13"), null);
    assert.equal(inferredParentAddress(index, "Project-1-final"), "Project-1");
  });

  test("cycles roots and descendants only within their local sibling axes", () => {
    const index = buildInferredStructure(
      cards(["7", "8", "8a", "8a1", "8a2", "8b", "17", "17a"]),
      "natural",
    );
    assert.deepEqual(inferredChildAddresses(index, "8"), ["8a", "8b"]);
    assert.deepEqual(inferredChildAddresses(index, "8a"), ["8a1", "8a2"]);
    assert.equal(cycleForwardInferredSiblingAddress(index, "8a"), "8b");
    assert.equal(cycleForwardInferredSiblingAddress(index, "8b"), "8a");
    assert.equal(cycleBackwardInferredSiblingAddress(index, "8a"), "8b");
    assert.equal(cycleForwardInferredSiblingAddress(index, "8a1"), "8a2");
    assert.equal(cycleForwardInferredSiblingAddress(index, "8a2"), "8a1");
    assert.equal(cycleForwardInferredSiblingAddress(index, "17a"), null);
    assert.equal(cycleForwardInferredSiblingAddress(index, "7"), "8");
    assert.equal(cycleForwardInferredSiblingAddress(index, "8"), "17");
    assert.equal(cycleForwardInferredSiblingAddress(index, "17"), "7");
  });

  test("protects numeric tokens in natural mode and permits literal prefixes in lexical mode", () => {
    for (const [parent, candidate] of [
      ["1", "10"],
      ["A/1", "A/10"],
      ["1a1/1a1", "1a1/1a10"],
    ] as const) {
      assert.equal(isInferredAddressAncestor(parent, candidate, "natural"), false);
      assert.equal(isInferredAddressAncestor(parent, candidate, "lexicographic"), true);
    }
    assert.equal(isInferredAddressAncestor("1", "1a", "natural"), true);
    assert.equal(isInferredAddressAncestor("", "a", "natural"), false);
    assert.equal(isInferredAddressAncestor("a", "a", "lexicographic"), false);

    const lexical = buildInferredStructure(cards(["1", "10", "100", "2"]), "lexicographic");
    assert.equal(inferredParentAddress(lexical, "10"), "1");
    assert.equal(inferredParentAddress(lexical, "100"), "10");
  });

  test("groups duplicates into one structural node and retains all paths", () => {
    const index = buildInferredStructure(cards(["2", "2", "2a", "3"]), "natural");
    assert.deepEqual(index.orderedAddresses, ["2", "2a", "3"]);
    assert.equal(index.nodesByAddress.get("2")?.paths.length, 2);
    assert.equal(index.nodesByAddress.get("2")?.paths[0], "00-2.md");
    assert.equal(index.nodesByAddress.get("2")?.firstDeckIndex, 0);
    assert.equal(index.nodesByAddress.get("2")?.lastDeckIndex, 1);
    assert.equal(index.nodesByAddress.get("2")?.subtreeEndDeckIndexExclusive, 3);
    assert.equal(inferredParentAddress(index, "2a"), "2");
    assert.equal(cycleForwardInferredSiblingAddress(index, "2"), "3");
    assert.equal(cycleForwardInferredSiblingAddress(index, "2a"), null);
  });
});
