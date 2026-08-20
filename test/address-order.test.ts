import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  addressComparatorFor,
  candidateInsertionIndex,
  cardComparatorFor,
  compareAddressesLexicographic,
  compareAddressesNatural,
  normalizeAddressInput,
  validateAddress,
} from "../src/index.js";

const sign = (value: number): number => (value < 0 ? -1 : value > 0 ? 1 : 0);

function assertComparatorLaws(
  compare: (left: string, right: string) => number,
  values: readonly string[],
): void {
  for (const left of values) {
    assert.equal(compare(left, left), 0);
    for (const right of values) {
      assert.equal(sign(compare(left, right)), sign(-compare(right, left)));
      for (const third of values) {
        if (compare(left, right) <= 0 && compare(right, third) <= 0) {
          assert.ok(compare(left, third) <= 0, `${left} <= ${right} <= ${third}`);
        }
      }
    }
  }
}

describe("manual address validation", () => {
  test("accepts arbitrary single-line nonempty addresses", () => {
    for (const address of [
      "1/1a2",
      "A/1",
      "Project-17",
      "2026.08.20/3",
      "α/12",
      "punctuation !@#$%^&*()",
    ]) {
      assert.deepEqual(validateAddress(address), { valid: true, address });
    }
  });

  test("trims prompt input before validating and writing", () => {
    assert.deepEqual(normalizeAddressInput("  A/1  "), {
      valid: true,
      address: "A/1",
    });
    assert.equal(normalizeAddressInput(" \t ").valid, false);
  });

  test("diagnoses stored whitespace, blank input, lines, and controls", () => {
    assert.equal(validateAddress("").valid, false);
    assert.equal(validateAddress(" A/1").valid, false);
    assert.equal(validateAddress("A/1 ").valid, false);
    for (const address of ["A\n1", "A\r1", "A\t1", "A\u0000B", "A\u0085B", "A\u2028B", "A\u2029B"]) {
      assert.equal(validateAddress(address).valid, false, JSON.stringify(address));
    }
  });

  test("keeps case-different addresses distinct", () => {
    assert.notEqual(compareAddressesLexicographic("A/1", "a/1"), 0);
    assert.notEqual(compareAddressesNatural("A/1", "a/1"), 0);
  });
});

describe("Natural address ordering", () => {
  test("compares ASCII digit runs by unbounded magnitude", () => {
    assert.ok(compareAddressesNatural("A/2", "A/10") < 0);
    assert.ok(compareAddressesNatural("2", "10") < 0);
    assert.ok(compareAddressesNatural("Section 9", "Section 12") < 0);
    assert.ok(compareAddressesNatural(
      `A/${"9".repeat(200)}`,
      `A/1${"0".repeat(200)}`,
    ) < 0);
  });

  test("orders equal magnitudes by original run length", () => {
    assert.ok(compareAddressesNatural("2", "02") < 0);
    assert.ok(compareAddressesNatural("00", "000") < 0);
    assert.ok(compareAddressesNatural("A/0002", "A/00002") < 0);
  });

  test("uses deterministic code-unit order for other runs", () => {
    const input = ["a/2", "A/10", "A/2", "A-2", "α/2"];
    assert.deepEqual([...input].sort(compareAddressesNatural), [
      "A-2",
      "A/2",
      "A/10",
      "a/2",
      "α/2",
    ]);
    assert.deepEqual(input, ["a/2", "A/10", "A/2", "A-2", "α/2"]);
  });

  test("satisfies comparator laws", () => {
    assertComparatorLaws(compareAddressesNatural, [
      "A/2",
      "A/02",
      "A/10",
      "a/1",
      "α/12",
      "Project-17",
    ]);
  });
});

describe("Lexicographic address ordering", () => {
  test("compares complete exact strings by code unit", () => {
    assert.deepEqual(
      ["A/2", "A/10", "A/1"].sort(compareAddressesLexicographic),
      ["A/1", "A/10", "A/2"],
    );
    assert.ok(compareAddressesLexicographic("A-1", "A/1") < 0);
    assert.ok(compareAddressesLexicographic("A/1", "a/1") < 0);
  });

  test("satisfies comparator laws and dispatches exactly", () => {
    const values = ["A/1", "A/10", "A/2", "a/1", "α/1"];
    assertComparatorLaws(compareAddressesLexicographic, values);
    assert.equal(addressComparatorFor("natural"), compareAddressesNatural);
    assert.equal(
      addressComparatorFor("lexicographic"),
      compareAddressesLexicographic,
    );
  });
});

describe("card-level ordering and insertion", () => {
  const filed = [
    { address: "A/2", path: "one.md" },
    { address: "A/10", path: "a.md" },
    { address: "A/10", path: "z.md" },
  ];

  test("uses address first and exact path as the final tie-breaker", () => {
    const reversed = [...filed].reverse();
    assert.deepEqual(reversed.sort(cardComparatorFor("natural")), filed);
    assert.equal(
      candidateInsertionIndex(
        filed,
        { address: "A/10", path: "m.md" },
        "natural",
      ),
      2,
    );
  });

  test("does not mutate the filed collection during insertion", () => {
    const snapshot = structuredClone(filed);
    candidateInsertionIndex(
      filed,
      { address: "A/3", path: "candidate.md" },
      "natural",
    );
    assert.deepEqual(filed, snapshot);
  });
});
