import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildInferredStructure } from "../src/inferred-structure.js";
import { isInferredAddressAncestor } from "../src/address-order.js";

const cards = (addresses: readonly string[]) => addresses.map((address, index) => ({
  address,
  path: `${String(index).padStart(2, "0")}-${address}.md`,
}));

describe("inferred address structure", () => {
  test("models parents and ordered sibling lists", () => {
    const index = buildInferredStructure(cards(["1", "2", "2a", "2b", "3"]), "natural");
    assert.deepEqual(index.rootAddresses, ["1", "2", "3"]);
    assert.deepEqual(index.nodesByAddress.get("2")?.childAddresses, ["2a", "2b"]);
    assert.equal(index.nodesByAddress.get("2a")?.parentAddress, "2");
    assert.equal(index.nodesByAddress.get("2b")?.parentAddress, "2");
  });

  test("never crosses between equal-depth nodes with different parents", () => {
    const index = buildInferredStructure(
      cards(["1", "1a", "1a1", "1a1a", "1b", "1b1", "2"]),
      "natural",
    );
    assert.equal(index.nodesByAddress.get("1a1a")?.parentAddress, "1a1");
    assert.deepEqual(index.nodesByAddress.get("1")?.childAddresses, ["1a", "1b"]);
    assert.deepEqual(index.nodesByAddress.get("1a")?.childAddresses, ["1a1"]);
    assert.deepEqual(index.nodesByAddress.get("1b")?.childAddresses, ["1b1"]);
  });

  test("handles Luhmann-style and arbitrary prefix grammars", () => {
    const index = buildInferredStructure(
      cards(["57/12", "57/12a", "57/12a1", "57/12b", "57/13", "Project-1", "Project-1-final", "Project-2"]),
      "natural",
    );
    assert.deepEqual(index.nodesByAddress.get("57/12")?.childAddresses, [
      "57/12a",
      "57/12b",
    ]);
    assert.equal(index.nodesByAddress.get("57/12a1")?.parentAddress, "57/12a");
    assert.equal(index.nodesByAddress.get("57/13")?.parentAddress, null);
    assert.equal(
      index.nodesByAddress.get("Project-1-final")?.parentAddress,
      "Project-1",
    );
  });

  test("keeps roots and descendants on their local axes", () => {
    const index = buildInferredStructure(
      cards(["7", "8", "8a", "8a1", "8a2", "8b", "17", "17a"]),
      "natural",
    );
    assert.deepEqual(index.rootAddresses, ["7", "8", "17"]);
    assert.deepEqual(index.nodesByAddress.get("8")?.childAddresses, ["8a", "8b"]);
    assert.deepEqual(index.nodesByAddress.get("8a")?.childAddresses, [
      "8a1",
      "8a2",
    ]);
    assert.deepEqual(index.nodesByAddress.get("17")?.childAddresses, ["17a"]);
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
    assert.equal(lexical.nodesByAddress.get("10")?.parentAddress, "1");
    assert.equal(lexical.nodesByAddress.get("100")?.parentAddress, "10");
  });

  test("groups duplicates into one structural node and retains all paths", () => {
    const index = buildInferredStructure(cards(["2", "2", "2a", "3"]), "natural");
    assert.deepEqual(index.orderedAddresses, ["2", "2a", "3"]);
    assert.equal(index.nodesByAddress.get("2")?.paths.length, 2);
    assert.equal(index.nodesByAddress.get("2")?.paths[0], "00-2.md");
    assert.equal(index.nodesByAddress.get("2")?.firstDeckIndex, 0);
    assert.equal(index.nodesByAddress.get("2")?.lastDeckIndex, 1);
    assert.equal(index.nodesByAddress.get("2")?.subtreeEndDeckIndexExclusive, 3);
    assert.equal(index.nodesByAddress.get("2a")?.parentAddress, "2");
  });
});
