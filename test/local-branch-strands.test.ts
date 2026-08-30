import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildInferredStructure } from "../src/inferred-structure.js";
import {
  buildLocalBranchStrandFamilyIndex,
  localBranchFamilyKey,
} from "../src/local-branch-strands.js";

const cards = (addresses: readonly string[]) => addresses.map(
  (address, index) => ({ address, path: `${index}-${address}.md` }),
);

describe("local Branch View strand families", () => {
  test("groups generic extensions by delimiter and first token kind", () => {
    const commaNumber = localBranchFamilyKey("17,1", "17,1,1");
    assert.equal(
      commaNumber,
      localBranchFamilyKey("17,1", "17,1,3"),
    );
    assert.notEqual(
      commaNumber,
      localBranchFamilyKey("17,1", "17,1,A"),
    );
    assert.notEqual(
      commaNumber,
      localBranchFamilyKey("17,1", "17,1A"),
    );
    assert.equal(
      localBranchFamilyKey("17,1", "17,1A"),
      localBranchFamilyKey("17,1", "17,1a"),
    );
    assert.equal(
      localBranchFamilyKey("P", "P/1"),
      localBranchFamilyKey("P", "P/10"),
    );
    assert.equal(
      localBranchFamilyKey("Project", "Project-draft"),
      localBranchFamilyKey("Project", "Project-final"),
    );
    assert.equal(
      localBranchFamilyKey("P", "Pα"),
      localBranchFamilyKey("P", "Pβ"),
    );
    assert.notEqual(
      localBranchFamilyKey("P", "P☀"),
      localBranchFamilyKey("P", "P☁"),
    );
    assert.notEqual(
      localBranchFamilyKey("P", "P/"),
      localBranchFamilyKey("P", "P-"),
    );
    assert.equal(localBranchFamilyKey("P", "P"), null);
    assert.equal(localBranchFamilyKey("P", "Q1"), null);
  });

  test("prepares ordered child families and retains one root strand", () => {
    const inferred = buildInferredStructure(cards([
      "17,1",
      "17,1,1",
      "17,1,3",
      "17,1A",
      "17,1a",
      "17,1b",
      "18",
    ]), "natural");
    const families = buildLocalBranchStrandFamilyIndex(inferred);

    assert.deepEqual(
      families.childStrandsByParentAddress.get("17,1")?.map((strand) =>
        strand.addresses
      ),
      [
        ["17,1,1", "17,1,3"],
        ["17,1A", "17,1a", "17,1b"],
      ],
    );
    assert.equal(
      families.strandsByAddress.get("17,1,1"),
      families.strandsByAddress.get("17,1,3"),
    );
    assert.notEqual(
      families.strandsByAddress.get("17,1,1"),
      families.strandsByAddress.get("17,1A"),
    );
    assert.deepEqual(
      families.strandsByAddress.get("17,1")?.addresses,
      ["17,1", "18"],
    );
  });
});
