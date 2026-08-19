import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  ZettelIdError,
  compareZettelIds,
  formatZettelId,
  generateFiledId,
  generateNextSectionId,
  incrementAlphaToken,
  isValidZettelId,
  parseZettelId,
} from "../src/index.js";
import type { ParsedZettelId } from "../src/index.js";

const sign = (value: number): number => Math.sign(value);

describe("parseZettelId and formatZettelId", () => {
  test("parses the simplest canonical address into explicit tokens", () => {
    assert.deepEqual(parseZettelId("1/1"), {
      section: 1,
      path: [{ type: "number", value: 1 }],
    });
  });

  test("parses multi-digit and deeply alternating components", () => {
    assert.deepEqual(parseZettelId("21/30b12aa7"), {
      section: 21,
      path: [
        { type: "number", value: 30 },
        { type: "alpha", value: "b" },
        { type: "number", value: 12 },
        { type: "alpha", value: "aa" },
        { type: "number", value: 7 },
      ],
    });
  });

  test("formats a typed parsed address independently", () => {
    const parsed: ParsedZettelId = {
      section: 21,
      path: [
        { type: "number", value: 3 },
        { type: "alpha", value: "b" },
        { type: "number", value: 2 },
        { type: "alpha", value: "a" },
        { type: "number", value: 1 },
      ],
    };

    assert.equal(formatZettelId(parsed), "21/3b2a1");
  });

  test("round-trips canonical addresses", () => {
    const validIds = [
      "1/1",
      "1/10",
      "21/3",
      "21/3b2a1",
      "1/1z",
      "1/1aa",
      "1/1aa1",
      "812/345ab67cd89",
    ];

    for (const id of validIds) {
      assert.equal(formatZettelId(parseZettelId(id)), id);
      assert.equal(isValidZettelId(id), true);
    }
  });

  test("rejects malformed, noncanonical, and non-alternating forms", () => {
    const invalidIds = [
      "",
      "foo",
      "0/1",
      "1/0",
      "01/1",
      "1/01",
      "1/",
      "1/a",
      "1/1A",
      "1/1-a",
      "1/1.1",
      "1//1",
      "1/1a0",
      "1/1a01",
      "1/1a-1",
      "1/1/a",
      " 1/1",
      "1/1 ",
      "1 /1",
    ];

    for (const id of invalidIds) {
      assert.equal(isValidZettelId(id), false, id);
      assert.throws(() => parseZettelId(id), ZettelIdError, id);
    }
  });

  test("rejects integers that JavaScript cannot represent exactly", () => {
    const unsafe = String(BigInt(Number.MAX_SAFE_INTEGER) + 1n);
    assert.throws(() => parseZettelId(`${unsafe}/1`), ZettelIdError);
    assert.throws(() => parseZettelId(`1/${unsafe}`), ZettelIdError);
  });

  test("formatting validates runtime token shape and alternation", () => {
    const malformedParsedIds = [
      { section: 1, path: [{ type: "alpha", value: "a" }] },
      {
        section: 1,
        path: [
          { type: "number", value: 1 },
          { type: "number", value: 2 },
        ],
      },
      {
        section: 1,
        path: [
          { type: "number", value: 1 },
          { type: "alpha", value: "A" },
        ],
      },
      { section: 0, path: [{ type: "number", value: 1 }] },
      { section: 1, path: [{ type: "number", value: 0 }] },
      { section: 1, path: [] },
    ];

    for (const malformed of malformedParsedIds) {
      assert.throws(
        () => formatZettelId(malformed as unknown as ParsedZettelId),
        ZettelIdError,
      );
    }
  });

  test("returns immutable parser output", () => {
    const parsed = parseZettelId("1/1a1");
    assert.equal(Object.isFrozen(parsed), true);
    assert.equal(Object.isFrozen(parsed.path), true);
    assert.equal(parsed.path.every(Object.isFrozen), true);
  });
});

describe("incrementAlphaToken", () => {
  test("increments in unbounded Excel-column order", () => {
    const examples = [
      ["a", "b"],
      ["b", "c"],
      ["y", "z"],
      ["z", "aa"],
      ["aa", "ab"],
      ["az", "ba"],
      ["zz", "aaa"],
      ["zzzz", "aaaaa"],
    ] as const;

    for (const [input, expected] of examples) {
      assert.equal(incrementAlphaToken(input), expected);
    }
  });

  test("rejects non-alphabetic or noncanonical tokens", () => {
    for (const token of ["", "A", "a1", "a-a", "ä"]) {
      assert.throws(() => incrementAlphaToken(token), ZettelIdError);
    }
  });
});

describe("compareZettelIds", () => {
  test("compares section and path numbers numerically", () => {
    assert.ok(compareZettelIds("1/2", "1/10") < 0);
    assert.ok(compareZettelIds("2/1", "10/1") < 0);
  });

  test("compares alphabetic tokens in Excel-column order", () => {
    const orderedPairs = [
      ["1/1a", "1/1b"],
      ["1/1y", "1/1z"],
      ["1/1z", "1/1aa"],
      ["1/1aa", "1/1ab"],
      ["1/1az", "1/1ba"],
      ["1/1zz", "1/1aaa"],
    ] as const;

    for (const [earlier, later] of orderedPairs) {
      assert.ok(compareZettelIds(earlier, later) < 0, `${earlier} < ${later}`);
    }
  });

  test("files an exact prefix before its descendants", () => {
    const ordered = ["1/1", "1/1a", "1/1a1", "1/1a1a"];
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const earlier = ordered[index];
      const later = ordered[index + 1];
      assert.ok(
        earlier !== undefined &&
          later !== undefined &&
          compareZettelIds(earlier, later) < 0,
      );
    }
  });

  test("sorts the required complex fixture into canonical Deck order", () => {
    const shuffled = [
      "2/1",
      "1/2",
      "1/1b",
      "1/1a2",
      "1/1a1b",
      "1/10",
      "1/1",
      "1/1a1",
      "1/1a",
      "1/1a1a",
      "1/1aa",
      "1/1z",
      "3/1",
    ];
    const expected = [
      "1/1",
      "1/1a",
      "1/1a1",
      "1/1a1a",
      "1/1a1b",
      "1/1a2",
      "1/1b",
      "1/1z",
      "1/1aa",
      "1/2",
      "1/10",
      "2/1",
      "3/1",
    ];

    assert.deepEqual([...shuffled].sort(compareZettelIds), expected);
    assert.deepEqual([...shuffled].reverse().sort(compareZettelIds), expected);
  });

  test("satisfies equality, antisymmetry, and transitivity", () => {
    const ids = [
      "1/1",
      "1/1a",
      "1/1a1",
      "1/1a1a",
      "1/1a1b",
      "1/1a2",
      "1/1b",
      "1/1z",
      "1/1aa",
      "1/2",
      "1/10",
      "2/1",
      "3/1",
    ];

    for (const a of ids) {
      assert.equal(compareZettelIds(a, a), 0);
      for (const b of ids) {
        assert.equal(
          sign(compareZettelIds(a, b)) + sign(compareZettelIds(b, a)),
          0,
        );
        for (const c of ids) {
          if (compareZettelIds(a, b) <= 0 && compareZettelIds(b, c) <= 0) {
            assert.ok(compareZettelIds(a, c) <= 0, `${a} <= ${b} <= ${c}`);
          }
        }
      }
    }
  });

  test("fails clearly for malformed comparator input", () => {
    assert.throws(() => compareZettelIds("garbage", "1/1"), ZettelIdError);
    assert.throws(() => compareZettelIds("1/1", "garbage"), ZettelIdError);
  });
});

describe("generateFiledId", () => {
  const workedExamples = [
    {
      name: "A: continue a free numeric sequence",
      existing: ["1/1"],
      attachment: "1/1",
      expected: "1/2",
    },
    {
      name: "B: create the first alphabetic child",
      existing: ["1/1", "1/2"],
      attachment: "1/1",
      expected: "1/1a",
    },
    {
      name: "C: extend an alphabetic child sequence",
      existing: ["1/1", "1/1a", "1/2"],
      attachment: "1/1",
      expected: "1/1b",
    },
    {
      name: "D: create the first numeric child",
      existing: ["1/1", "1/1a", "1/1b", "1/2"],
      attachment: "1/1a",
      expected: "1/1a1",
    },
    {
      name: "E: extend a numeric child sequence",
      existing: ["1/1", "1/1a", "1/1a1", "1/1b", "1/2"],
      attachment: "1/1a",
      expected: "1/1a2",
    },
    {
      name: "F: alternate back to alphabetic children",
      existing: ["1/1", "1/1a", "1/1a1", "1/1a2", "1/1b", "1/2"],
      attachment: "1/1a1",
      expected: "1/1a1a",
    },
    {
      name: "G: extend a deep alphabetic child sequence",
      existing: [
        "1/1",
        "1/1a",
        "1/1a1",
        "1/1a1a",
        "1/1a2",
        "1/1b",
        "1/2",
      ],
      attachment: "1/1a1",
      expected: "1/1a1b",
    },
    {
      name: "H: roll a numeric sibling from 9 to 10",
      existing: ["1/9"],
      attachment: "1/9",
      expected: "1/10",
    },
    {
      name: "I: roll an alphabetic sibling from z to aa",
      existing: ["1/1z"],
      attachment: "1/1z",
      expected: "1/1aa",
    },
  ] as const;

  for (const example of workedExamples) {
    test(example.name, () => {
      assert.equal(
        generateFiledId(example.attachment, example.existing),
        example.expected,
      );
    });
  }

  test("uses normal child rules when an alphabetic rollover sibling exists", () => {
    assert.equal(
      generateFiledId("1/1z", ["1/1z", "1/1aa"]),
      "1/1z1",
    );
  });

  test("fills the first gap in an alphabetic direct-child sequence", () => {
    assert.equal(
      generateFiledId("1/1", ["1/1", "1/2", "1/1a", "1/1c"]),
      "1/1b",
    );
  });

  test("fills the first gap in a numeric direct-child sequence", () => {
    assert.equal(
      generateFiledId("1/1a", [
        "1/1a",
        "1/1b",
        "1/1a1",
        "1/1a3",
      ]),
      "1/1a2",
    );
  });

  test("handles deeply recursive addresses", () => {
    assert.equal(
      generateFiledId("4/12az9b7", [
        "4/12az9b7",
        "4/12az9b8",
        "4/12az9b7a",
      ]),
      "4/12az9b7b",
    );
  });

  test("keeps filing decisions local to the attachment section", () => {
    assert.equal(
      generateFiledId("2/1", ["1/1", "1/2", "2/1", "2/2", "3/1"]),
      "2/1a",
    );
  });

  test("is independent of input iteration order and duplicate IDs", () => {
    const ids = ["1/1", "1/2", "1/1a", "1/1c", "1/1a"];
    const asGenerator = function* (): Generator<string> {
      yield* [...ids].reverse();
    };

    assert.equal(generateFiledId("1/1", ids), "1/1b");
    assert.equal(generateFiledId("1/1", new Set(ids)), "1/1b");
    assert.equal(generateFiledId("1/1", asGenerator()), "1/1b");
  });

  test("preserves generation invariants across repeated filing", () => {
    const existing = ["1/1", "1/2"];
    const original = [...existing];
    const generated = new Set<string>();

    for (let index = 0; index < 30; index += 1) {
      const next = generateFiledId("1/1", existing);
      assert.equal(isValidZettelId(next), true);
      assert.equal(existing.includes(next), false);
      assert.equal(generated.has(next), false);
      generated.add(next);
      existing.push(next);
    }

    assert.deepEqual(original, ["1/1", "1/2"]);
    assert.ok(generated.has("1/1z"));
    assert.ok(generated.has("1/1aa"));
    assert.equal(new Set(existing).size, existing.length);

    const sorted = [...existing].sort(compareZettelIds);
    assert.deepEqual(
      [...existing].reverse().sort(compareZettelIds),
      sorted,
    );
  });

  test("does not mutate the supplied existing collection", () => {
    const existing = ["1/1", "1/2"];
    const snapshot = [...existing];
    generateFiledId("1/1", existing);
    assert.deepEqual(existing, snapshot);
  });

  test("fails for an invalid or absent attachment", () => {
    assert.throws(
      () => generateFiledId("garbage", ["1/1"]),
      ZettelIdError,
    );
    assert.throws(
      () => generateFiledId("1/2", ["1/1"]),
      /absent from existing IDs/,
    );
  });

  test("fails rather than ignoring malformed existing IDs", () => {
    assert.throws(
      () => generateFiledId("1/1", ["1/1", "garbage"]),
      ZettelIdError,
    );
    assert.throws(
      () => generateFiledId("1/1", ["1/1", ""]),
      ZettelIdError,
    );
  });
});

describe("generateNextSectionId", () => {
  test("starts the first section for an empty collection", () => {
    assert.equal(generateNextSectionId([]), "1/1");
  });

  test("uses one greater than the only existing section", () => {
    assert.equal(
      generateNextSectionId(["1/1", "1/2", "1/2a"]),
      "2/1",
    );
  });

  test("uses one greater than the maximum section without filling gaps", () => {
    assert.equal(generateNextSectionId(["1/1", "3/1", "7/4a"]), "8/1");
  });

  test("is deterministic across iteration orders and duplicates", () => {
    const ids = ["7/4a", "1/1", "3/1", "7/4a"];
    assert.equal(generateNextSectionId(ids), "8/1");
    assert.equal(generateNextSectionId([...ids].reverse()), "8/1");
    assert.equal(generateNextSectionId(new Set(ids)), "8/1");
  });

  test("fails rather than ignoring malformed existing IDs", () => {
    assert.throws(
      () => generateNextSectionId(["1/1", "garbage", "7/4a"]),
      ZettelIdError,
    );
  });
});
