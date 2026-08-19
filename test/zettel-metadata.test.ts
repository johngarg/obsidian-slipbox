import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { indexZettelMetadata } from "../src/index.js";

describe("indexZettelMetadata", () => {
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

    assert.deepEqual(result.filed, [{ path: "c.md", id: "1/1" }]);
    assert.deepEqual(result.allValidIds, ["1/1", "2/1"]);
    assert.deepEqual(result.issues, [
      {
        kind: "duplicate",
        id: "2/1",
        paths: ["a.md", "b.md"],
        message: "Duplicate zettel-id 2/1",
      },
      {
        kind: "invalid",
        paths: ["malformed.md"],
        message: 'Unsupported zettel-id "1/01"',
      },
      {
        kind: "invalid",
        paths: ["wrong-type.md"],
        message: "Unsupported zettel-id 12",
      },
    ]);
  });
});
