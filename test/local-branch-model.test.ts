import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type {
  ExplicitBranch,
  ExplicitBranchIndex,
} from "../src/branch-links.js";
import {
  buildLocalBranchModel,
  LocalBranchProjector,
  LocalBranchProjectorCache,
  localBranchTargets,
  type LocalBranchCard,
} from "../src/local-branch-model.js";
import { buildInferredStructure } from "../src/inferred-structure.js";

const cards = (addresses: readonly string[]): LocalBranchCard[] =>
  addresses.map((address, index) => ({
    address,
    path: `${String(index).padStart(2, "0")}-${address}.md`,
    title: `Card ${address}`,
  }));

function explicitIndex(
  branches: readonly ExplicitBranch[] = [],
): ExplicitBranchIndex {
  const outgoing = group(branches, (branch) => branch.sourcePath);
  const incoming = group(branches, (branch) => branch.targetPath);
  return {
    outgoingBySourcePath: outgoing,
    incomingByTargetPath: incoming,
    parentByTargetPath: new Map(
      [...incoming].flatMap(([path, values]) =>
        values[0] === undefined ? [] : [[path, values[0]] as const]
      ),
    ),
  };
}

function group(
  branches: readonly ExplicitBranch[],
  key: (branch: ExplicitBranch) => string,
): ReadonlyMap<string, readonly ExplicitBranch[]> {
  const result = new Map<string, ExplicitBranch[]>();
  for (const branch of branches) {
    const path = key(branch);
    result.set(path, [...result.get(path) ?? [], branch]);
  }
  return result;
}

function model(
  allCards: readonly LocalBranchCard[],
  activePath: string,
  explicit = explicitIndex(),
) {
  return buildLocalBranchModel({
    activePath,
    cards: allCards,
    inferred: buildInferredStructure(allCards, "natural"),
    explicit,
  });
}

describe("local branch model", () => {
  test("builds inferred strand movement without wrapping", () => {
    const allCards = cards(["1", "1a", "1b", "1b1", "1c", "2"]);
    const result = model(allCards, allCards[2]?.path ?? "");

    assert.notEqual(result, null);
    assert.deepEqual(
      result?.strands.find((strand) => strand.role === "current")?.nodes
        .map((node) => node.address),
      ["1a", "1b", "1c"],
    );
    assert.deepEqual(
      localBranchTargets(result, "backward").map((target) => target.address),
      ["1a"],
    );
    assert.deepEqual(
      localBranchTargets(result, "forward").map((target) => target.address),
      ["1c"],
    );
    assert.deepEqual(
      localBranchTargets(result, "beginning").map((target) => target.address),
      ["1a"],
    );
    assert.deepEqual(
      localBranchTargets(result, "inferred").map((target) => target.address),
      ["1b1"],
    );
    assert.deepEqual(
      localBranchTargets(result, "higher").map((target) => target.address),
      ["1"],
    );
    assert.equal(
      result?.strands.find((strand) => strand.role === "higher")?.connection
        ?.toPath,
      allCards[1]?.path,
    );
  });

  test("inherits explicit context while retaining the inferred higher target", () => {
    const allCards = cards(["1", "1a", "1b", "1c", "9"]);
    const branch: ExplicitBranch = {
      sourcePath: allCards[4]?.path ?? "",
      targetPath: allCards[1]?.path ?? "",
      label: "a",
      sourceOrder: 0,
    };
    const result = model(
      allCards,
      allCards[2]?.path ?? "",
      explicitIndex([branch]),
    );

    assert.deepEqual(
      result?.strands.find((strand) => strand.role === "current")?.nodes
        .map((node) => node.address),
      ["1a", "1b", "1c"],
    );
    assert.deepEqual(
      localBranchTargets(result, "higher").map((target) => target.address),
      ["1", "9"],
    );
    assert.deepEqual(
      localBranchTargets(result, "beginning").map((target) => target.address),
      ["1a"],
    );
    assert.equal(
      result?.strands.find((strand) => strand.role === "higher")?.connection
        ?.kind,
      "explicit",
    );
  });

  test("shows every outgoing explicit branch and keeps its label", () => {
    const allCards = cards(["1", "1a", "2", "2a", "3"]);
    const active = allCards[0];
    const first = allCards[2];
    const second = allCards[4];
    assert.notEqual(active, undefined);
    assert.notEqual(first, undefined);
    assert.notEqual(second, undefined);
    if (active === undefined || first === undefined || second === undefined) {
      return;
    }
    const branches: ExplicitBranch[] = [
      {
        sourcePath: active.path,
        targetPath: first.path,
        label: "supplement",
        sourceOrder: 0,
      },
      {
        sourcePath: active.path,
        targetPath: second.path,
        label: "β",
        sourceOrder: 1,
      },
    ];
    const result = model(allCards, active.path, explicitIndex(branches));
    const explicit = result?.strands.filter((strand) =>
      strand.connection?.kind === "explicit" && strand.role === "departure"
    ) ?? [];

    assert.deepEqual(explicit.map((strand) => strand.connection?.label), [
      "supplement",
      "β",
    ]);
    assert.deepEqual(
      result?.strands.find((strand) => strand.role === "current")?.nodes
        .find((node) => node.path === active.path)?.departures
        .filter((departure) => departure.kind === "explicit")
        .map((departure) => departure.target.alias),
      ["supplement", "β"],
    );
    assert.deepEqual(
      result?.navigation.explicit.map((group) => ({
        path: group.targets[0]?.path,
        alias: group.targets[0]?.alias,
      })),
      [
        { path: first.path, alias: "supplement" },
        { path: second.path, alias: "β" },
      ],
    );
  });

  test("partitions sibling continuations at every explicit branch start", () => {
    const allCards = cards([
      "57,2,25",
      "57,2,25a",
      "57,2,25b",
      "57,2,25c",
      "57,2,25d",
      "57,2,25e",
      "57,2,25f",
    ]);
    const active = allCards[0];
    assert.notEqual(active, undefined);
    if (active === undefined) {
      return;
    }
    const branches = [1, 2, 4, 6].flatMap((index, sourceOrder) => {
      const target = allCards[index];
      return target === undefined ? [] : [{
        sourcePath: active.path,
        targetPath: target.path,
        label: String(sourceOrder + 1),
        sourceOrder,
      }];
    });
    const result = model(allCards, active.path, explicitIndex(branches));
    const departures = result?.strands.filter((strand) =>
      strand.role === "departure"
    ) ?? [];

    assert.deepEqual(
      departures.map((strand) => strand.nodes.map((node) => node.address)),
      [
        ["57,2,25a"],
        ["57,2,25b", "57,2,25c"],
        ["57,2,25d", "57,2,25e"],
        ["57,2,25f"],
      ],
    );
    assert.deepEqual(
      departures.map((strand) => strand.connection?.kind),
      ["explicit", "explicit", "explicit", "explicit"],
    );
    assert.deepEqual(
      result?.strands.find((strand) => strand.role === "current")?.nodes
        .find((node) => node.path === active.path)?.departures
        .map((departure) => departure.kind),
      ["explicit", "explicit", "explicit", "explicit"],
    );
    const paths = departures.flatMap((strand) =>
      strand.nodes.map((node) => node.path)
    );
    assert.equal(new Set(paths).size, paths.length);
  });

  test("keeps explicit continuations inside their inferred family", () => {
    const allCards = cards([
      "17,1",
      "17,1,1",
      "17,1,2",
      "17,1,3",
      "17,1A",
      "17,1a",
      "17,1b",
      "18",
    ]);
    const source = allCards[0];
    const explicitTarget = allCards[1];
    assert.notEqual(source, undefined);
    assert.notEqual(explicitTarget, undefined);
    if (source === undefined || explicitTarget === undefined) {
      return;
    }
    const explicit = explicitIndex([{
      sourcePath: source.path,
      targetPath: explicitTarget.path,
      label: "1",
      sourceOrder: 0,
    }]);
    const atSource = model(allCards, source.path, explicit);
    const departures = atSource?.strands.filter((strand) =>
      strand.role === "departure"
    ) ?? [];

    assert.deepEqual(
      departures.map((strand) => ({
        kind: strand.connection?.kind,
        addresses: strand.nodes.map((node) => node.address),
      })),
      [
        {
          kind: "inferred",
          addresses: ["17,1A", "17,1a", "17,1b"],
        },
        {
          kind: "explicit",
          addresses: ["17,1,1", "17,1,2", "17,1,3"],
        },
      ],
    );
    assert.deepEqual(
      localBranchTargets(atSource, "inferred").map((target) => target.address),
      ["17,1A"],
    );

    const atExplicitContinuation = model(
      allCards,
      allCards[2]?.path ?? "",
      explicit,
    );
    assert.deepEqual(
      atExplicitContinuation?.strands.find((strand) =>
        strand.role === "current"
      )?.nodes.map((node) => node.address),
      ["17,1,1", "17,1,2", "17,1,3"],
    );
    assert.deepEqual(
      localBranchTargets(atExplicitContinuation, "backward").map((target) =>
        target.address
      ),
      ["17,1,1"],
    );
    assert.deepEqual(
      localBranchTargets(atExplicitContinuation, "forward").map((target) =>
        target.address
      ),
      ["17,1,3"],
    );
    assert.deepEqual(
      localBranchTargets(atExplicitContinuation, "beginning").map((target) =>
        target.address
      ),
      ["17,1,1"],
    );
    assert.equal(
      atExplicitContinuation?.strands.find((strand) =>
        strand.role === "higher"
      )?.connection?.kind,
      "explicit",
    );

    const atInferredFamily = model(
      allCards,
      allCards[4]?.path ?? "",
      explicit,
    );
    assert.deepEqual(
      atInferredFamily?.strands.find((strand) => strand.role === "current")
        ?.nodes.map((node) => node.address),
      ["17,1A", "17,1a", "17,1b"],
    );
    assert.deepEqual(localBranchTargets(atInferredFamily, "backward"), []);
    assert.deepEqual(
      localBranchTargets(atInferredFamily, "forward").map((target) =>
        target.address
      ),
      ["17,1a"],
    );
    assert.equal(
      atInferredFamily?.strands.find((strand) => strand.role === "higher")
        ?.connection?.kind,
      "inferred",
    );
  });

  test("uses a singleton explicit row without a same-family successor", () => {
    const allCards = cards(["17,1", "17,1,1", "17,1A", "17,1a"]);
    const source = allCards[0];
    const explicitTarget = allCards[1];
    assert.notEqual(source, undefined);
    assert.notEqual(explicitTarget, undefined);
    if (source === undefined || explicitTarget === undefined) {
      return;
    }
    const result = model(allCards, source.path, explicitIndex([{
      sourcePath: source.path,
      targetPath: explicitTarget.path,
      label: "1",
      sourceOrder: 0,
    }]));

    assert.deepEqual(
      result?.strands.filter((strand) => strand.role === "departure")
        .map((strand) => ({
          kind: strand.connection?.kind,
          addresses: strand.nodes.map((node) => node.address),
        })),
      [
        { kind: "inferred", addresses: ["17,1A", "17,1a"] },
        { kind: "explicit", addresses: ["17,1,1"] },
      ],
    );
  });

  test("offers every unclaimed inferred family as a command target", () => {
    const allCards = cards([
      "17,1",
      "17,1,1",
      "17,1,2",
      "17,1A",
      "17,1a",
    ]);
    const result = model(allCards, allCards[0]?.path ?? "");

    assert.deepEqual(
      result?.strands.filter((strand) =>
        strand.role === "departure" && strand.connection?.kind === "inferred"
      ).map((strand) => strand.nodes.map((node) => node.address)),
      [
        ["17,1,1", "17,1,2"],
        ["17,1A", "17,1a"],
      ],
    );
    assert.deepEqual(
      localBranchTargets(result, "inferred").map((target) => target.address),
      ["17,1,1", "17,1A"],
    );
  });

  test("partitions explicit starts independently in multiple families", () => {
    const allCards = cards(["P", "P,1", "P,2", "PA", "Pa", "Pb"]);
    const source = allCards[0];
    const numericTarget = allCards[1];
    const letterTarget = allCards[4];
    assert.notEqual(source, undefined);
    assert.notEqual(numericTarget, undefined);
    assert.notEqual(letterTarget, undefined);
    if (
      source === undefined || numericTarget === undefined ||
      letterTarget === undefined
    ) {
      return;
    }
    const result = model(allCards, source.path, explicitIndex([
      {
        sourcePath: source.path,
        targetPath: letterTarget.path,
        label: "letter",
        sourceOrder: 0,
      },
      {
        sourcePath: source.path,
        targetPath: numericTarget.path,
        label: "number",
        sourceOrder: 1,
      },
    ]));

    assert.deepEqual(
      result?.strands.filter((strand) => strand.role === "departure")
        .map((strand) => ({
          kind: strand.connection?.kind,
          label: strand.connection?.label,
          addresses: strand.nodes.map((node) => node.address),
        })),
      [
        { kind: "inferred", label: undefined, addresses: ["PA"] },
        {
          kind: "explicit",
          label: "letter",
          addresses: ["Pa", "Pb"],
        },
        {
          kind: "explicit",
          label: "number",
          addresses: ["P,1", "P,2"],
        },
      ],
    );
  });

  test("bounds promoted explicit strands at the next explicit start", () => {
    const allCards = cards([
      "57,2,25",
      "57,2,25a",
      "57,2,25b",
      "57,2,25c",
      "57,2,25d",
      "57,2,25e",
      "57,2,25f",
    ]);
    const source = allCards[0];
    assert.notEqual(source, undefined);
    if (source === undefined) {
      return;
    }
    const branches = [1, 2, 4, 6].flatMap((index, sourceOrder) => {
      const target = allCards[index];
      return target === undefined ? [] : [{
        sourcePath: source.path,
        targetPath: target.path,
        label: String(sourceOrder + 1),
        sourceOrder,
      }];
    });
    const explicit = explicitIndex(branches);
    const cases = [
      { activeIndex: 1, addresses: ["57,2,25a"] },
      { activeIndex: 2, addresses: ["57,2,25b", "57,2,25c"] },
      { activeIndex: 3, addresses: ["57,2,25b", "57,2,25c"] },
      { activeIndex: 4, addresses: ["57,2,25d", "57,2,25e"] },
      { activeIndex: 5, addresses: ["57,2,25d", "57,2,25e"] },
      { activeIndex: 6, addresses: ["57,2,25f"] },
    ];

    for (const subject of cases) {
      const active = allCards[subject.activeIndex];
      assert.notEqual(active, undefined);
      if (active === undefined) {
        continue;
      }
      const result = model(allCards, active.path, explicit);
      const current = result?.strands.find((strand) =>
        strand.role === "current"
      );
      assert.deepEqual(
        current?.nodes.map((node) => node.address),
        subject.addresses,
      );
      assert.equal(
        current?.knownEnd,
        true,
      );
      const currentIndex = subject.addresses.indexOf(active.address);
      assert.deepEqual(
        localBranchTargets(result, "backward").map((target) => target.address),
        currentIndex > 0 ? [subject.addresses[currentIndex - 1]] : [],
      );
      assert.deepEqual(
        localBranchTargets(result, "forward").map((target) => target.address),
        currentIndex < subject.addresses.length - 1
          ? [subject.addresses[currentIndex + 1]]
          : [],
      );
      assert.deepEqual(
        localBranchTargets(result, "beginning").map((target) => target.address),
        currentIndex > 0 ? [subject.addresses[0]] : [],
      );
    }
  });

  test("keeps only the inferred prefix before the first explicit branch", () => {
    const allCards = cards(["1", "1a", "1b", "1c", "1d", "1e", "1f"]);
    const active = allCards[0];
    const firstExplicit = allCards[2];
    const secondExplicit = allCards[4];
    assert.notEqual(active, undefined);
    assert.notEqual(firstExplicit, undefined);
    assert.notEqual(secondExplicit, undefined);
    if (
      active === undefined || firstExplicit === undefined ||
      secondExplicit === undefined
    ) {
      return;
    }
    const result = model(allCards, active.path, explicitIndex([
      {
        sourcePath: active.path,
        targetPath: firstExplicit.path,
        label: "first",
        sourceOrder: 0,
      },
      {
        sourcePath: active.path,
        targetPath: secondExplicit.path,
        label: "second",
        sourceOrder: 1,
      },
    ]));
    const departures = result?.strands.filter((strand) =>
      strand.role === "departure"
    ) ?? [];

    assert.deepEqual(
      departures.map((strand) => ({
        kind: strand.connection?.kind,
        addresses: strand.nodes.map((node) => node.address),
      })),
      [
        { kind: "inferred", addresses: ["1a"] },
        { kind: "explicit", addresses: ["1b", "1c"] },
        { kind: "explicit", addresses: ["1d", "1e", "1f"] },
      ],
    );
    assert.deepEqual(
      result?.strands.find((strand) => strand.role === "current")?.nodes
        .find((node) => node.path === active.path)?.departures
        .map((departure) => departure.kind),
      ["inferred", "explicit", "explicit"],
    );
  });

  test("renders duplicate addresses in Deck order and navigates them exactly", () => {
    const allCards: LocalBranchCard[] = [
      { path: "1.md", address: "1", title: "Parent" },
      { path: "a.md", address: "1a", title: "First" },
      { path: "b.md", address: "1a", title: "Second" },
      { path: "c.md", address: "1b", title: "Next" },
    ];
    const atNext = model(allCards, "c.md");
    const duplicates = atNext?.strands
      .find((strand) => strand.role === "current")?.nodes
      .filter((node) => node.address === "1a") ?? [];

    assert.deepEqual(duplicates.map((node) => node.path), ["a.md", "b.md"]);
    assert.deepEqual(duplicates.map((node) => node.duplicateIndex), [0, 1]);
    assert.deepEqual(
      localBranchTargets(atNext, "backward").map((target) => target.path),
      ["b.md"],
    );

    const atSecond = model(allCards, "b.md");
    assert.deepEqual(
      localBranchTargets(atSecond, "backward").map((target) => target.path),
      ["a.md"],
    );
    assert.deepEqual(
      localBranchTargets(atSecond, "forward").map((target) => target.path),
      ["c.md"],
    );
    assert.deepEqual(
      localBranchTargets(atSecond, "beginning").map((target) => target.path),
      ["a.md"],
    );

    const atFirst = model(allCards, "a.md");
    assert.deepEqual(
      localBranchTargets(atFirst, "forward").map((target) => target.path),
      ["b.md"],
    );
    assert.deepEqual(localBranchTargets(atFirst, "backward"), []);
    assert.deepEqual(localBranchTargets(atFirst, "beginning"), []);
  });

  test("enters a duplicate-address higher strand at its first Deck card", () => {
    const allCards: LocalBranchCard[] = [
      { path: "parent-a.md", address: "1", title: "First parent" },
      { path: "parent-b.md", address: "1", title: "Second parent" },
      { path: "child.md", address: "1a", title: "Child" },
    ];
    const result = model(
      allCards,
      "child.md",
      explicitIndex([{
        sourcePath: "parent-b.md",
        targetPath: "child.md",
        label: "child",
        sourceOrder: 0,
      }]),
    );

    assert.deepEqual(
      localBranchTargets(result, "higher").map((target) => target.path),
      ["parent-a.md"],
    );
  });

  test("enters duplicate-address supplementary targets in Deck order", () => {
    const source: LocalBranchCard = {
      path: "source.md",
      address: "1",
      title: "Source",
    };
    const first: LocalBranchCard = {
      path: "target-a.md",
      address: "9",
      title: "First target",
    };
    const second: LocalBranchCard = {
      path: "target-b.md",
      address: "9",
      title: "Second target",
    };
    const branches: ExplicitBranch[] = [
      {
        sourcePath: source.path,
        targetPath: second.path,
        label: "second",
        sourceOrder: 0,
      },
      {
        sourcePath: source.path,
        targetPath: first.path,
        label: "first",
        sourceOrder: 1,
      },
    ];
    const result = model(
      [source, first, second],
      source.path,
      explicitIndex(branches),
    );

    assert.deepEqual(
      localBranchTargets(result, "explicit").map((target) => ({
        path: target.path,
        alias: target.alias,
      })),
      [{ path: first.path, alias: "first" }],
    );
  });

  test("uses only the stable first explicit parent as local context", () => {
    const allCards = cards(["1", "1a", "8", "9"]);
    const target = allCards[1];
    const firstParent = allCards[2];
    const secondParent = allCards[3];
    assert.notEqual(target, undefined);
    assert.notEqual(firstParent, undefined);
    assert.notEqual(secondParent, undefined);
    if (
      target === undefined || firstParent === undefined ||
      secondParent === undefined
    ) {
      return;
    }
    const result = model(allCards, target.path, explicitIndex([
      {
        sourcePath: firstParent.path,
        targetPath: target.path,
        label: "first",
        sourceOrder: 0,
      },
      {
        sourcePath: secondParent.path,
        targetPath: target.path,
        label: "second",
        sourceOrder: 0,
      },
    ]));

    assert.deepEqual(
      localBranchTargets(result, "higher").map((candidate) => candidate.path),
      [allCards[0]?.path, firstParent.path],
    );
    assert.equal(
      result?.strands.find((strand) => strand.role === "higher")?.selectedPath,
      firstParent.path,
    );
  });

  test("expands only the selected hidden departure", () => {
    const allCards = cards(["1", "1a", "1a1", "1b", "9"]);
    const owner = allCards[1];
    const active = allCards[3];
    const explicitTarget = allCards[4];
    assert.notEqual(owner, undefined);
    assert.notEqual(active, undefined);
    assert.notEqual(explicitTarget, undefined);
    if (owner === undefined || active === undefined || explicitTarget === undefined) {
      return;
    }
    const branch: ExplicitBranch = {
      sourcePath: owner.path,
      targetPath: explicitTarget.path,
      label: "supplement",
      sourceOrder: 0,
    };
    const result = buildLocalBranchModel({
      activePath: active.path,
      cards: allCards,
      inferred: buildInferredStructure(allCards, "natural"),
      explicit: explicitIndex([branch]),
      expandedDepartureId:
        `departure:explicit:${owner.path}:${explicitTarget.path}`,
    });
    const expanded = result?.strands.filter((strand) =>
      strand.role === "departure"
    ) ?? [];

    assert.equal(expanded.length, 1);
    assert.equal(expanded[0]?.connection?.kind, "explicit");
    assert.equal(expanded[0]?.connection?.toPath, explicitTarget.path);
  });

  test("expands a stub from a base departure row without recursive stubs", () => {
    const allCards = cards(["1", "1a", "9", "9a", "9a1"]);
    const active = allCards[0];
    const explicitTarget = allCards[2];
    assert.notEqual(active, undefined);
    assert.notEqual(explicitTarget, undefined);
    if (active === undefined || explicitTarget === undefined) {
      return;
    }
    const projector = new LocalBranchProjector({
      cards: allCards,
      inferred: buildInferredStructure(allCards, "natural"),
      explicit: explicitIndex([{
        sourcePath: active.path,
        targetPath: explicitTarget.path,
        label: "supplement",
        sourceOrder: 0,
      }]),
    });
    const base = projector.modelForPath(active.path);
    const departureId = base?.strands.flatMap((strand) => strand.nodes)
      .find((node) => node.path === explicitTarget.path)?.departures
      .find((departure) => departure.kind === "inferred")?.id;
    assert.notEqual(departureId, undefined);
    if (departureId === undefined) {
      return;
    }
    const expanded = projector.modelForPath(active.path, departureId);
    const auxiliary = expanded?.strands.at(-1);

    assert.equal(expanded?.expandedDepartureId, departureId);
    assert.equal(auxiliary?.id, departureId);
    assert.deepEqual(
      auxiliary?.nodes.map((node) => node.address),
      ["9a"],
    );
    assert.deepEqual(auxiliary?.nodes[0]?.departures, []);
    assert.equal(projector.modelForPath(active.path, "stale"), base);
    assert.equal(
      projector.modelForPath(
        active.path,
        `departure:explicit:${active.path}:${explicitTarget.path}`,
      ),
      base,
    );
  });

  test("expands a hidden departure owned by the higher row", () => {
    const allCards = cards(["1", "1a", "1b", "2", "2a"]);
    const active = allCards[2];
    const higherOwner = allCards[3];
    assert.notEqual(active, undefined);
    assert.notEqual(higherOwner, undefined);
    if (active === undefined || higherOwner === undefined) {
      return;
    }
    const projector = new LocalBranchProjector({
      cards: allCards,
      inferred: buildInferredStructure(allCards, "natural"),
      explicit: explicitIndex(),
    });
    const base = projector.modelForPath(active.path);
    const departureId = base?.strands.flatMap((strand) => strand.nodes)
      .find((node) => node.path === higherOwner.path)?.departures
      .find((departure) => departure.kind === "inferred")?.id;
    assert.notEqual(departureId, undefined);
    if (departureId === undefined) {
      return;
    }
    const result = projector.modelForPath(active.path, departureId);

    assert.equal(result?.expandedDepartureId, departureId);
    assert.deepEqual(
      result?.strands.at(-1)?.nodes.map((node) => node.address),
      ["2a"],
    );
  });

  test("reuses prepared projectors until snapshot or title settings change", () => {
    const cache = new LocalBranchProjectorCache();
    const firstSnapshot = {};
    const secondSnapshot = {};
    let creations = 0;
    const create = () => {
      creations += 1;
      return new LocalBranchProjector({
        cards: cards(["1", "1a"]),
        inferred: buildInferredStructure(cards(["1", "1a"]), "natural"),
        explicit: explicitIndex(),
      });
    };
    const first = cache.projectorFor({
      snapshot: firstSnapshot,
      titleSource: "basename",
      titleProperty: "title",
      create,
    });
    const repeated = cache.projectorFor({
      snapshot: firstSnapshot,
      titleSource: "basename",
      titleProperty: "title",
      create,
    });
    const titleChanged = cache.projectorFor({
      snapshot: firstSnapshot,
      titleSource: "frontmatter",
      titleProperty: "title",
      create,
    });
    const titlePropertyChanged = cache.projectorFor({
      snapshot: firstSnapshot,
      titleSource: "frontmatter",
      titleProperty: "heading",
      create,
    });
    const snapshotChanged = cache.projectorFor({
      snapshot: secondSnapshot,
      titleSource: "frontmatter",
      titleProperty: "heading",
      create,
    });

    assert.equal(first, repeated);
    assert.notEqual(titleChanged, first);
    assert.notEqual(titlePropertyChanged, titleChanged);
    assert.notEqual(snapshotChanged, titlePropertyChanged);
    assert.equal(creations, 4);
    assert.equal(
      snapshotChanged.modelForPath("00-1.md"),
      snapshotChanged.modelForPath("00-1.md"),
    );
  });

  test("prepares strand families once for repeated projector models", () => {
    const allCards = cards([
      "17,1",
      "17,1,1",
      "17,1,2",
      "17,1A",
      "17,1a",
    ]);
    const baseInferred = buildInferredStructure(allCards, "natural");
    let orderedAddressReads = 0;
    const inferred = {
      nodesByAddress: baseInferred.nodesByAddress,
      rootAddresses: baseInferred.rootAddresses,
      addressesByDepth: baseInferred.addressesByDepth,
      get orderedAddresses() {
        orderedAddressReads += 1;
        return baseInferred.orderedAddresses;
      },
    };
    const projector = new LocalBranchProjector({
      cards: allCards,
      inferred,
      explicit: explicitIndex(),
    });

    assert.equal(orderedAddressReads, 1);
    projector.modelForPath(allCards[0]?.path ?? "");
    projector.modelForPath(allCards[2]?.path ?? "");
    projector.modelForPath(allCards[2]?.path ?? "");
    assert.equal(orderedAddressReads, 1);
  });

  test("bounds explicit cycles and drops stale relations on rebuild", () => {
    const allCards = cards(["1", "2"]);
    const first = allCards[0];
    const second = allCards[1];
    assert.notEqual(first, undefined);
    assert.notEqual(second, undefined);
    if (first === undefined || second === undefined) {
      return;
    }
    const cyclic = explicitIndex([
      {
        sourcePath: first.path,
        targetPath: second.path,
        label: "next",
        sourceOrder: 0,
      },
      {
        sourcePath: second.path,
        targetPath: first.path,
        label: "return",
        sourceOrder: 0,
      },
    ]);
    const withCycle = model(allCards, first.path, cyclic);
    const rebuilt = model(allCards, first.path);

    assert.equal(withCycle?.strands.length, 3);
    assert.equal(withCycle?.navigation.explicit.length, 1);
    assert.equal(
      rebuilt?.strands.some((strand) => strand.connection?.kind === "explicit"),
      false,
    );
    assert.deepEqual(rebuilt?.navigation.explicit, []);
  });

  test("does not claim a beginning or end for the root window", () => {
    const allCards = cards(["1", "2", "3"]);
    const result = model(allCards, allCards[1]?.path ?? "");
    const current = result?.strands.find((strand) => strand.role === "current");
    assert.equal(current?.knownBeginning, false);
    assert.equal(current?.knownEnd, false);
    assert.deepEqual(localBranchTargets(result, "beginning"), []);
  });
});
