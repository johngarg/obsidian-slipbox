import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildFiledZettelLookups,
  compareFiledZettels,
  indexZettelMetadata,
  zettelMetadataRecord,
} from "../src/index.js";

describe("indexZettelMetadata", () => {
  test("switches card participation with the configured address property", () => {
    const frontmatter = { "zettel-id": "1/1", signature: "2/1" };
    assert.deepEqual(
      zettelMetadataRecord("card.md", frontmatter, "zettel-id"),
      { path: "card.md", hasZettelId: true, zettelId: "1/1" },
    );
    assert.deepEqual(
      zettelMetadataRecord("card.md", frontmatter, "signature"),
      { path: "card.md", hasZettelId: true, zettelId: "2/1" },
    );
    assert.deepEqual(
      zettelMetadataRecord("card.md", frontmatter, "address"),
      { path: "card.md", hasZettelId: false, zettelId: undefined },
    );
  });

  test("distinguishes ordinary, unfiled, and canonically ordered filed notes", () => {
    const result = indexZettelMetadata([
      { path: "ordinary.md", hasZettelId: false, zettelId: undefined },
      { path: "blank.md", hasZettelId: true, zettelId: "" },
      { path: "bare.md", hasZettelId: true, zettelId: null },
      { path: "two.md", hasZettelId: true, zettelId: "1/10" },
      { path: "one.md", hasZettelId: true, zettelId: "1/2" },
    ]);

    assert.deepEqual(result.unfiledPaths, ["bare.md", "blank.md"]);
    assert.deepEqual(result.filed, [
      { path: "one.md", id: "1/2" },
      { path: "two.md", id: "1/10" },
    ]);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.allValidIds, ["1/2", "1/10"]);
  });

  test("surfaces malformed values and every path in a duplicate group", () => {
    const result = indexZettelMetadata([
      { path: "wrong-type.md", hasZettelId: true, zettelId: 12 },
      { path: "malformed.md", hasZettelId: true, zettelId: "1/01" },
      { path: "b.md", hasZettelId: true, zettelId: "2/1" },
      { path: "a.md", hasZettelId: true, zettelId: "2/1" },
      { path: "c.md", hasZettelId: true, zettelId: "1/1" },
    ]);

    assert.deepEqual(result.filed, [
      { path: "c.md", id: "1/1" },
      { path: "a.md", id: "2/1" },
      { path: "b.md", id: "2/1" },
    ]);
    assert.deepEqual(result.allValidIds, ["1/1", "2/1"]);
    assert.deepEqual(result.issues, [
      {
        kind: "duplicate",
        severity: "warning",
        id: "2/1",
        paths: ["a.md", "b.md"],
        message: "Duplicate zettel-id 2/1",
      },
      {
        kind: "invalid",
        severity: "error",
        paths: ["malformed.md"],
        message: 'Unsupported zettel-id "1/01"',
      },
      {
        kind: "invalid",
        severity: "error",
        paths: ["wrong-type.md"],
        message: "Unsupported zettel-id 12",
      },
    ]);
  });

  test("orders duplicate groups by path independently of titles and input order", () => {
    const inputs = [
      { path: "z/second.md", id: "2/1", title: "Same" },
      { path: "later.md", id: "10/1", title: "Earlier title" },
      { path: "a/first.md", id: "2/1", title: "Same" },
      { path: "before.md", id: "1/9a", title: "Later title" },
    ];
    const expected = ["before.md", "a/first.md", "z/second.md", "later.md"];
    assert.deepEqual([...inputs].sort(compareFiledZettels).map((card) => card.path), expected);
    assert.deepEqual([...inputs].reverse().sort(compareFiledZettels).map((card) => card.path), expected);
  });

  test("builds exact path and ordered address-group lookups", () => {
    const filed = indexZettelMetadata([
      { path: "z.md", hasZettelId: true, zettelId: "2/1" },
      { path: "a.md", hasZettelId: true, zettelId: "2/1" },
      { path: "one.md", hasZettelId: true, zettelId: "1/1" },
    ]).filed;
    const lookups = buildFiledZettelLookups(filed);
    assert.equal(lookups.byPath.get("z.md")?.path, "z.md");
    assert.equal(lookups.indexByPath.get("a.md"), 1);
    assert.deepEqual(
      lookups.byAddress.get("2/1")?.map((card) => card.path),
      ["a.md", "z.md"],
    );
    assert.equal(lookups.byAddress.get("2/1")?.[0]?.path, "a.md");
  });

  test("uses the configured address property in diagnostics", () => {
    const result = indexZettelMetadata([
      { path: "bad.md", hasZettelId: true, zettelId: "1/01" },
      { path: "a.md", hasZettelId: true, zettelId: "2/1" },
      { path: "b.md", hasZettelId: true, zettelId: "2/1" },
    ], "signature");
    assert.deepEqual(result.issues.map((issue) => issue.message), [
      "Duplicate signature 2/1",
      'Unsupported signature "1/01"',
    ]);
  });
});
