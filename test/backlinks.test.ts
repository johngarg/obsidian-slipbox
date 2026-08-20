import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fitBacklinkPrefix,
  indexFiledBacklinks,
} from "../src/backlinks.js";
import {
  indexCardMetadata,
  type CardMetadataRecord,
} from "../src/card-metadata.js";

function backlinks(
  records: readonly CardMetadataRecord[],
  resolvedLinks: Readonly<Record<string, Readonly<Record<string, number>>>>,
): ReadonlyMap<string, readonly { readonly address: string; readonly path: string }[]> {
  return indexFiledBacklinks(indexCardMetadata(records).filed, resolvedLinks);
}

function filed(path: string, address: string): CardMetadataRecord {
  return { path, hasAddress: true, address };
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
      result.get("target.md")?.map((source) => source.address),
      ["4/7", "18/2a", "44/1c"],
    );
  });

  it("excludes non-filed links while retaining exact duplicate-address paths", () => {
    const result = backlinks(
      [
        filed("target.md", "21/3b"),
        filed("valid.md", "4/7"),
        { path: "ordinary.md", hasAddress: false, address: undefined },
        { path: "unfiled.md", hasAddress: true, address: "" },
        { path: "invalid.md", hasAddress: true, address: " broken" },
        filed("duplicate-a.md", "18/2a"),
        filed("duplicate-b.md", "18/2a"),
        filed("duplicate-target-a.md", "44/1c"),
        filed("duplicate-target-b.md", "44/1c"),
        { path: "unfiled-target.md", hasAddress: true, address: "" },
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
      { path: "valid.md", address: "4/7" },
      { path: "duplicate-a.md", address: "18/2a" },
      { path: "duplicate-b.md", address: "18/2a" },
    ]);
    assert.equal(result.has("unfiled-target.md"), false);
    assert.deepEqual(result.get("duplicate-target-a.md"), [
      { path: "valid.md", address: "4/7" },
    ]);
    assert.deepEqual(result.get("duplicate-target-b.md"), [
      { path: "valid.md", address: "4/7" },
    ]);
  });

  it("tracks link, filing, deletion, retargeting, and rename snapshots", () => {
    const initialRecords = [
      filed("source.md", "4/7"),
      filed("target.md", "21/3b"),
      filed("other.md", "44/1c"),
    ];
    assert.equal(
      backlinks(initialRecords, { "source.md": { "target.md": 1 } })
        .get("target.md")?.[0]?.address,
      "4/7",
    );
    assert.equal(backlinks(initialRecords, { "source.md": {} }).size, 0);
    assert.equal(
      backlinks(initialRecords, { "source.md": { "other.md": 1 } })
        .get("other.md")?.[0]?.address,
      "4/7",
    );
    assert.equal(
      backlinks(
        [
          { path: "source.md", hasAddress: true, address: "" },
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

  it("shows every address when the complete row fits", () => {
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

  it("shows only +N when no complete address fits", () => {
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

  it("partitions varied addresses into complete, unique ordered runs", () => {
    const addresses = ["4/7", "18/2a", "44/123456789abcdef", "91/4c"];
    const fit = fitBacklinkPrefix(45, [12, 20, 92, 22], 3, overflow);
    const shown = addresses.slice(0, fit.visibleCount);
    const omitted = addresses.slice(fit.visibleCount);

    assert.deepEqual(shown, ["4/7"]);
    assert.deepEqual(omitted, ["18/2a", "44/123456789abcdef", "91/4c"]);
    assert.deepEqual([...shown, ...omitted], addresses);
    assert.equal(new Set(omitted).size, omitted.length);
  });
});
