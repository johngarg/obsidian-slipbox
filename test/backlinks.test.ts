import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fitBacklinkPrefix,
  indexFiledBacklinks,
} from "../src/backlinks.js";
import {
  indexZettelMetadata,
  type ZettelMetadataRecord,
} from "../src/zettel-metadata.js";

function backlinks(
  records: readonly ZettelMetadataRecord[],
  resolvedLinks: Readonly<Record<string, Readonly<Record<string, number>>>>,
): ReadonlyMap<string, readonly { readonly id: string; readonly path: string }[]> {
  return indexFiledBacklinks(indexZettelMetadata(records).filed, resolvedLinks);
}

function filed(path: string, id: string): ZettelMetadataRecord {
  return { path, hasZettelId: true, zettelId: id };
}

describe("filed backlink index", () => {
  it("deduplicates occurrences and sorts unique sources in filing order", () => {
    const result = backlinks(
      [
        filed("target.md", "21/3b"),
        filed("late.md", "44/1c"),
        filed("first.md", "4/7"),
        filed("middle.md", "18/2a"),
      ],
      {
        "late.md": { "target.md": 1 },
        "first.md": { "target.md": 3 },
        "middle.md": { "target.md": 1 },
      },
    );

    assert.deepEqual(
      result.get("target.md")?.map((source) => source.id),
      ["4/7", "18/2a", "44/1c"],
    );
  });

  it("excludes self-links and every source or target outside the filed index", () => {
    const result = backlinks(
      [
        filed("target.md", "21/3b"),
        filed("valid.md", "4/7"),
        { path: "ordinary.md", hasZettelId: false, zettelId: undefined },
        { path: "unfiled.md", hasZettelId: true, zettelId: "" },
        { path: "invalid.md", hasZettelId: true, zettelId: "broken" },
        filed("duplicate-a.md", "18/2a"),
        filed("duplicate-b.md", "18/2a"),
        filed("duplicate-target-a.md", "44/1c"),
        filed("duplicate-target-b.md", "44/1c"),
        { path: "unfiled-target.md", hasZettelId: true, zettelId: "" },
      ],
      {
        "target.md": { "target.md": 1 },
        "valid.md": {
          "target.md": 1,
          "unfiled-target.md": 1,
          "duplicate-target-a.md": 1,
          "duplicate-target-b.md": 1,
        },
        "ordinary.md": { "target.md": 1 },
        "unfiled.md": { "target.md": 1 },
        "invalid.md": { "target.md": 1 },
        "duplicate-a.md": { "target.md": 1 },
        "duplicate-b.md": { "target.md": 1 },
      },
    );

    assert.deepEqual(result.get("target.md"), [
      { path: "valid.md", id: "4/7" },
    ]);
    assert.equal(result.has("unfiled-target.md"), false);
    assert.equal(result.has("duplicate-target-a.md"), false);
    assert.equal(result.has("duplicate-target-b.md"), false);
  });

  it("tracks link, filing, deletion, retargeting, and rename snapshots", () => {
    const initialRecords = [
      filed("source.md", "4/7"),
      filed("target.md", "21/3b"),
      filed("other.md", "44/1c"),
    ];
    assert.equal(
      backlinks(initialRecords, { "source.md": { "target.md": 1 } })
        .get("target.md")?.[0]?.id,
      "4/7",
    );
    assert.equal(backlinks(initialRecords, { "source.md": {} }).size, 0);
    assert.equal(
      backlinks(initialRecords, { "source.md": { "other.md": 1 } })
        .get("other.md")?.[0]?.id,
      "4/7",
    );
    assert.equal(
      backlinks(
        [
          { path: "source.md", hasZettelId: true, zettelId: "" },
          ...initialRecords.slice(1),
        ],
        { "source.md": { "target.md": 1 } },
      ).size,
      0,
    );
    assert.equal(
      backlinks(initialRecords.slice(1), {}).get("target.md"),
      undefined,
    );
    assert.equal(
      backlinks(
        [filed("moved/source.md", "4/7"), filed("moved/target.md", "21/3b")],
        { "moved/source.md": { "moved/target.md": 1 } },
      ).get("moved/target.md")?.[0]?.path,
      "moved/source.md",
    );
  });
});

describe("backlink footer fitting", () => {
  const overflow = (count: number): number => String(count).length * 6 + 8;

  it("shows every ID when the complete row fits", () => {
    assert.deepEqual(fitBacklinkPrefix(34, [10, 10, 10], 2, overflow), {
      visibleCount: 3,
      hiddenCount: 0,
    });
  });

  it("keeps the longest complete prefix with room for +N", () => {
    assert.deepEqual(fitBacklinkPrefix(26, [10, 10, 10], 2, overflow), {
      visibleCount: 1,
      hiddenCount: 2,
    });
  });

  it("shows only +N when no complete ID fits", () => {
    assert.deepEqual(fitBacklinkPrefix(14, [80, 90], 4, overflow), {
      visibleCount: 0,
      hiddenCount: 2,
    });
  });

  it("uses the measured width for multi-digit overflow counts", () => {
    assert.deepEqual(
      fitBacklinkPrefix(39, [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], 2, overflow),
      { visibleCount: 2, hiddenCount: 9 },
    );
    assert.deepEqual(
      fitBacklinkPrefix(39, [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], 2, overflow),
      { visibleCount: 1, hiddenCount: 11 },
    );
  });

  it("partitions varied canonical IDs into complete, unique ordered runs", () => {
    const ids = ["4/7", "18/2a", "44/123456789abcdef", "91/4c"];
    const fit = fitBacklinkPrefix(45, [12, 20, 92, 22], 3, overflow);
    const shown = ids.slice(0, fit.visibleCount);
    const omitted = ids.slice(fit.visibleCount);

    assert.deepEqual(shown, ["4/7"]);
    assert.deepEqual(omitted, ["18/2a", "44/123456789abcdef", "91/4c"]);
    assert.deepEqual([...shown, ...omitted], ids);
    assert.equal(new Set(omitted).size, omitted.length);
  });
});
