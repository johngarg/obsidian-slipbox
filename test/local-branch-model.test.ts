import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type {
  ExplicitBranch,
  ExplicitBranchIndex,
} from "../src/branch-links.js";
import {
  buildLocalBranchModel,
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
      result?.navigation.explicit.map((group) => group.targets[0]?.path),
      [first.path, second.path],
    );
  });

  test("renders duplicate addresses as distinct exact nodes and chooser targets", () => {
    const allCards: LocalBranchCard[] = [
      { path: "1.md", address: "1", title: "Parent" },
      { path: "a.md", address: "1a", title: "First" },
      { path: "b.md", address: "1a", title: "Second" },
      { path: "c.md", address: "1b", title: "Next" },
    ];
    const result = model(allCards, "c.md");
    const duplicates = result?.strands
      .find((strand) => strand.role === "current")?.nodes
      .filter((node) => node.address === "1a") ?? [];

    assert.deepEqual(duplicates.map((node) => node.path), ["a.md", "b.md"]);
    assert.deepEqual(duplicates.map((node) => node.duplicateIndex), [0, 1]);
    assert.deepEqual(
      localBranchTargets(result, "backward").map((target) => target.path),
      ["a.md", "b.md"],
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
      expandedDepartureIds: new Set([
        `departure:explicit:${owner.path}:${explicitTarget.path}`,
      ]),
    });
    const expanded = result?.strands.filter((strand) =>
      strand.role === "departure"
    ) ?? [];

    assert.equal(expanded.length, 1);
    assert.equal(expanded[0]?.connection?.kind, "explicit");
    assert.equal(expanded[0]?.connection?.toPath, explicitTarget.path);
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
