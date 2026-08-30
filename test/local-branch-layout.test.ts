import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { layoutLocalBranchModel } from "../src/local-branch-layout.js";
import type {
  LocalBranchModel,
  LocalBranchNode,
} from "../src/local-branch-model.js";

const node = (index: number): LocalBranchNode => ({
  path: `${index}.md`,
  address: String(index),
  title: `Card ${index}`,
  duplicateIndex: 0,
  duplicateCount: 1,
  departures: index === 5 ? [{
    id: "departure:inferred:5",
    kind: "inferred",
    label: "Address-inferred inserted strand",
    target: { path: "5a.md", address: "5a", title: "Card 5a" },
  }] : [],
});

const model: LocalBranchModel = {
  activePath: "5.md",
  activeAddress: "5",
  expandedDepartureId: null,
  strands: [{
    id: "current",
    role: "current",
    nodes: Array.from({ length: 12 }, (_, index) => node(index)),
    selectedPath: "5.md",
    knownBeginning: true,
    knownEnd: true,
  }],
  navigation: {
    backward: [],
    forward: [],
    beginning: [],
    inferred: [],
    explicit: [],
    higher: [],
  },
};

describe("local branch layout", () => {
  test("leaves a 40-percent narrower gap between adjacent nodes", () => {
    const result = layoutLocalBranchModel(model, { width: 840 });
    const first = result.strands[0]?.items[0];
    const second = result.strands[0]?.items[1];
    const centreDistance = (second?.x ?? 0) - (first?.x ?? 0);
    const visibleGap = centreDistance - result.nodeRadius * 2;

    assert.equal(Math.abs(visibleGap - 19.2) < 1e-9, true);
  });

  test("places a departure beneath the next slot after its source", () => {
    const currentNodes = Array.from({ length: 9 }, (_, index) => node(index));
    const source = currentNodes[2];
    assert.notEqual(source, undefined);
    if (source === undefined) {
      return;
    }
    const target = node(20);
    const result = layoutLocalBranchModel({
      ...model,
      activePath: source.path,
      activeAddress: source.address,
      strands: [
        {
          ...model.strands[0]!,
          nodes: currentNodes,
          selectedPath: source.path,
        },
        {
          id: "departure:explicit:2:20",
          role: "departure",
          nodes: [target],
          selectedPath: target.path,
          knownBeginning: true,
          knownEnd: true,
          connection: {
            fromPath: source.path,
            toPath: target.path,
            kind: "explicit",
          },
        },
      ],
    }, { width: 840 });
    const current = result.strands[0]?.items;
    const departure = result.strands[1]?.items;
    const nextNode = current?.find((item) =>
      item.kind === "node" && item.node.path === currentNodes[3]?.path
    );
    const targetNode = departure?.find((item) =>
      item.kind === "node" && item.node.path === target.path
    );

    assert.equal(targetNode?.x, nextNode?.x);
    assert.equal((targetNode?.y ?? 0) - (nextNode?.y ?? 0), 50);
    assert.equal(result.nodeRadius, 19);
  });

  test("keeps a promoted current strand aligned with its higher source", () => {
    const higherNodes = Array.from({ length: 9 }, (_, index) => node(index));
    const source = higherNodes[2];
    const next = higherNodes[3];
    const currentNodes = [node(20), node(21), node(22)];
    const beginning = currentNodes[0];
    const active = currentNodes[1];
    assert.notEqual(source, undefined);
    assert.notEqual(next, undefined);
    assert.notEqual(beginning, undefined);
    assert.notEqual(active, undefined);
    if (
      source === undefined || next === undefined ||
      beginning === undefined || active === undefined
    ) {
      return;
    }
    const result = layoutLocalBranchModel({
      ...model,
      activePath: active.path,
      activeAddress: active.address,
      strands: [
        {
          id: "higher:inferred:2",
          role: "higher",
          nodes: higherNodes,
          selectedPath: source.path,
          knownBeginning: true,
          knownEnd: true,
          connection: {
            fromPath: source.path,
            toPath: beginning.path,
            kind: "inferred",
          },
        },
        {
          id: "current",
          role: "current",
          nodes: currentNodes,
          selectedPath: active.path,
          knownBeginning: true,
          knownEnd: true,
        },
      ],
    }, { width: 840 });
    const higherNext = result.strands[0]?.items.find((item) =>
      item.kind === "node" && item.node.path === next.path
    );
    const currentBeginning = result.strands[1]?.items.find((item) =>
      item.kind === "node" && item.node.path === beginning.path
    );

    assert.equal(currentBeginning?.x, higherNext?.x);
  });

  test("preserves active and known boundaries while creating omission runs", () => {
    const result = layoutLocalBranchModel(model, { width: 310 });
    const items = result.strands[0]?.items ?? [];
    const visiblePaths = items.flatMap((item) =>
      item.kind === "node" ? [item.node.path] : []
    );
    assert.equal(visiblePaths.includes("0.md"), true);
    assert.equal(visiblePaths.includes("5.md"), true);
    assert.equal(visiblePaths.includes("11.md"), true);
    assert.equal(items.some((item) => item.kind === "gap"), true);
  });

  test("expands exactly the activated omitted run into horizontal overflow", () => {
    const compact = layoutLocalBranchModel(model, { width: 310 });
    const gap = compact.strands[0]?.items.find((item) => item.kind === "gap");
    assert.notEqual(gap, undefined);
    if (gap === undefined) {
      return;
    }
    const expanded = layoutLocalBranchModel(model, {
      width: 310,
      expandedGapIds: new Set([gap.id]),
    });
    assert.equal(expanded.contentWidth > expanded.viewportWidth, true);
    assert.equal(
      expanded.strands[0]?.items.some((item) => item.id === gap.id),
      false,
    );
  });

  test("returns identical geometry for identical inputs", () => {
    assert.deepEqual(
      layoutLocalBranchModel(model, { width: 640 }),
      layoutLocalBranchModel(model, { width: 640 }),
    );
  });
});
