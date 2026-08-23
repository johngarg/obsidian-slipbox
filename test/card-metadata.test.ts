import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildFiledCardLookups,
  cardMetadataRecord,
  indexCardMetadata,
} from "../src/index.js";

describe("indexCardMetadata", () => {
  test("switches participation with the configured address property", () => {
    const frontmatter = { "zettel-id": "A/1", signature: "Project-17" };
    assert.deepEqual(cardMetadataRecord("card.md", frontmatter, "zettel-id"), {
      path: "card.md",
      hasAddress: true,
      address: "A/1",
    });
    assert.deepEqual(cardMetadataRecord("card.md", frontmatter, "signature"), {
      path: "card.md",
      hasAddress: true,
      address: "Project-17",
    });
    assert.deepEqual(cardMetadataRecord("card.md", frontmatter, "address"), {
      path: "card.md",
      hasAddress: false,
      address: undefined,
    });
  });

  test("classifies ordinary, unfiled, filed, and invalid notes", () => {
    const result = indexCardMetadata([
      { path: "ordinary.md", hasAddress: false, address: undefined },
      { path: "blank.md", hasAddress: true, address: "" },
      { path: "null.md", hasAddress: true, address: null },
      { path: "undefined.md", hasAddress: true, address: undefined },
      { path: "arbitrary.md", hasAddress: true, address: "A/1" },
      { path: "unicode.md", hasAddress: true, address: "α/12" },
      { path: "number.md", hasAddress: true, address: 12 },
      { path: "whitespace.md", hasAddress: true, address: " A/2" },
      { path: "multiline.md", hasAddress: true, address: "A\n2" },
    ]);

    assert.deepEqual(result.unfiledPaths, [
      "blank.md",
      "null.md",
      "undefined.md",
    ]);
    assert.deepEqual(result.filed, [
      { path: "arbitrary.md", address: "A/1" },
      { path: "unicode.md", address: "α/12" },
    ]);
    assert.deepEqual(
      result.issues.map((issue) => issue.paths[0]),
      ["multiline.md", "number.md", "whitespace.md"],
    );
  });

  const duplicateRecords = [
    { path: "z.md", hasAddress: true, address: "A/12" },
    { path: "a.md", hasAddress: true, address: "A/12" },
    { path: "m.md", hasAddress: true, address: "A/12" },
    { path: "other.md", hasAddress: true, address: "A/2" },
  ];

  const duplicateFiled = [
    { path: "other.md", address: "A/2" },
    { path: "a.md", address: "A/12" },
    { path: "m.md", address: "A/12" },
    { path: "z.md", address: "A/12" },
  ];

  test("retains every duplicate and emits one path-complete warning", () => {
    const result = indexCardMetadata(
      duplicateRecords,
      "zettel-id",
      "natural",
      "problem",
    );
    assert.deepEqual(result.filed, duplicateFiled);
    assert.deepEqual(result.issues, [{
      kind: "duplicate",
      severity: "warning",
      address: "A/12",
      paths: ["a.md", "m.md", "z.md"],
      message: "Duplicate zettel-id A/12",
    }]);
  });

  test("keeps duplicates out of the issue list when they are allowed", () => {
    const result = indexCardMetadata(duplicateRecords);
    assert.deepEqual(result.filed, duplicateFiled);
    assert.deepEqual(result.issues, []);
  });

  test("reports invalid addresses under either duplicate policy", () => {
    const records = [
      { path: "bad.md", hasAddress: true, address: 42 },
      { path: "a.md", hasAddress: true, address: "A/1" },
      { path: "b.md", hasAddress: true, address: "A/1" },
    ];
    for (const policy of ["allowed", "problem"] as const) {
      const result = indexCardMetadata(records, "zettel-id", "natural", policy);
      const invalid = result.issues.filter((issue) => issue.kind === "invalid");
      assert.equal(invalid.length, 1);
      assert.deepEqual(invalid[0]?.paths, ["bad.md"]);
      assert.equal(result.filed.length, 2);
    }
  });

  test("switches ordering without changing membership or duplicate path order", () => {
    const records = [
      { path: "z.md", hasAddress: true, address: "A/2" },
      { path: "a.md", hasAddress: true, address: "A/2" },
      { path: "ten.md", hasAddress: true, address: "A/10" },
      { path: "one.md", hasAddress: true, address: "A/1" },
    ];
    const natural = indexCardMetadata(records, "zettel-id", "natural");
    const lexicographic = indexCardMetadata(
      [...records].reverse(),
      "zettel-id",
      "lexicographic",
    );
    assert.deepEqual(natural.filed.map((card) => card.path), [
      "one.md",
      "a.md",
      "z.md",
      "ten.md",
    ]);
    assert.deepEqual(lexicographic.filed.map((card) => card.path), [
      "one.md",
      "ten.md",
      "a.md",
      "z.md",
    ]);
    assert.deepEqual(
      new Set(natural.filed.map((card) => card.path)),
      new Set(lexicographic.filed.map((card) => card.path)),
    );
  });

  test("builds exact path, path-index, and complete address lookups", () => {
    const filed = indexCardMetadata([
      { path: "z.md", hasAddress: true, address: "A/2" },
      { path: "a.md", hasAddress: true, address: "A/2" },
      { path: "one.md", hasAddress: true, address: "A/1" },
    ]).filed;
    const lookups = buildFiledCardLookups(filed);
    assert.equal(lookups.byPath.get("z.md")?.path, "z.md");
    assert.equal(lookups.indexByPath.get("a.md"), 1);
    assert.deepEqual(
      lookups.byAddress.get("A/2")?.map((card) => card.path),
      ["a.md", "z.md"],
    );
  });

  test("ignores titles, timestamps, and input order", () => {
    const records = [
      { path: "z.md", hasAddress: true, address: "A/2", title: "A", mtime: 1 },
      { path: "a.md", hasAddress: true, address: "A/2", title: "Z", mtime: 9 },
    ];
    assert.deepEqual(
      indexCardMetadata(records).filed,
      indexCardMetadata([...records].reverse()).filed,
    );
  });

  test("a duplicate rename reorders only its exact address group", () => {
    const before = indexCardMetadata([
      { path: "first.md", hasAddress: true, address: "A/1" },
      { path: "b.md", hasAddress: true, address: "A/2" },
      { path: "z.md", hasAddress: true, address: "A/2" },
      { path: "last.md", hasAddress: true, address: "A/3" },
    ]).filed;
    const after = indexCardMetadata([
      { path: "first.md", hasAddress: true, address: "A/1" },
      { path: "b.md", hasAddress: true, address: "A/2" },
      { path: "a.md", hasAddress: true, address: "A/2" },
      { path: "last.md", hasAddress: true, address: "A/3" },
    ]).filed;
    assert.deepEqual(before.map((card) => card.path), [
      "first.md",
      "b.md",
      "z.md",
      "last.md",
    ]);
    assert.deepEqual(after.map((card) => card.path), [
      "first.md",
      "a.md",
      "b.md",
      "last.md",
    ]);
  });

  test("deleting one duplicate leaves the others filed", () => {
    const remaining = indexCardMetadata([
      { path: "a.md", hasAddress: true, address: "A/2" },
      { path: "z.md", hasAddress: true, address: "A/2" },
    ]).filed;
    assert.deepEqual(
      indexCardMetadata(remaining
        .filter((card) => card.path !== "a.md")
        .map((card) => ({ ...card, hasAddress: true }))).filed,
      [{ path: "z.md", address: "A/2" }],
    );
  });
});
