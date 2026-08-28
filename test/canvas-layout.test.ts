import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  layoutFilesOnCanvas,
  normalizeCanvasPath,
  parseCanvasDocument,
  serializeCanvasDocument,
  type CanvasDocument,
} from "../src/canvas-layout.js";

const BASE: CanvasDocument = {
  nodes: [{
    id: "text",
    type: "text",
    text: "Keep me",
    x: -100,
    y: -50,
    width: 200,
    height: 100,
  }],
  edges: [{ id: "edge", fromNode: "a", toNode: "b" }],
  custom: "preserved",
};

describe("Canvas file-node layout", () => {
  test("lays files left-to-right and wraps in row-major order", () => {
    const result = layoutFilesOnCanvas(BASE, [
      "A.md", "B.md", "C.md", "D.md", "E.md",
    ], {
      originX: 100,
      originY: 200,
      nodeWidth: 300,
      nodeHeight: 180,
      horizontalGap: 50,
      verticalGap: 60,
      columns: 3,
    });
    const added = result.data.nodes.slice(1);
    assert.deepEqual(added.map((node) => [node.x, node.y]), [
      [100, 200], [450, 200], [800, 200],
      [100, 440], [450, 440],
    ]);
    assert.deepEqual(result.addedPaths, ["A.md", "B.md", "C.md", "D.md", "E.md"]);
  });

  test("preserves unrelated nodes, edges, and forward-compatible fields", () => {
    const result = layoutFilesOnCanvas(BASE, ["Card.md"]);
    assert.equal(result.data.nodes[0], BASE.nodes[0]);
    assert.equal(result.data.edges, BASE.edges);
    assert.equal(result.data.custom, "preserved");
  });

  test("skips existing file nodes and duplicate requested paths", () => {
    const data: CanvasDocument = {
      nodes: [{
        id: "existing",
        type: "file",
        file: "A.md",
        x: 15,
        y: 25,
        width: 400,
        height: 280,
      }],
      edges: [],
    };
    const result = layoutFilesOnCanvas(data, ["A.md", "B.md", "B.md"]);
    assert.deepEqual(result.addedPaths, ["B.md"]);
    assert.deepEqual(result.skippedPaths, ["A.md"]);
    assert.deepEqual(result.data.nodes[0], data.nodes[0]);
  });

  test("handles empty and single-card piles", () => {
    assert.equal(layoutFilesOnCanvas(BASE, []).data, BASE);
    const single = layoutFilesOnCanvas(BASE, ["One.md"], { originX: -40, originY: 75 });
    assert.deepEqual(single.data.nodes[1] && [
      single.data.nodes[1].x,
      single.data.nodes[1].y,
    ], [-40, 75]);
  });

  test("generates deterministic collision-safe node identifiers", () => {
    const first = layoutFilesOnCanvas({ nodes: [], edges: [] }, ["A.md"]);
    const id = first.data.nodes[0]?.id;
    assert.ok(id?.startsWith("slipbox-"));
    const second = layoutFilesOnCanvas({
      nodes: [{
        id: id ?? "",
        type: "text",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      }],
      edges: [],
    }, ["A.md"]);
    assert.equal(second.data.nodes[1]?.id, `${id}-2`);
  });

  test("parses and serializes Canvas JSON with clear failures", () => {
    const parsed = parseCanvasDocument('{"nodes":[],"edges":[],"future":1}');
    assert.equal(parsed.future, 1);
    assert.equal(parseCanvasDocument(serializeCanvasDocument(parsed)).future, 1);
    assert.deepEqual(parseCanvasDocument("{}"), { nodes: [], edges: [] });
    assert.deepEqual(parseCanvasDocument('{"nodes":[]}'), {
      nodes: [],
      edges: [],
    });
    assert.deepEqual(parseCanvasDocument('{"edges":[]}'), {
      edges: [],
      nodes: [],
    });
    assert.throws(() => parseCanvasDocument("not json"), /valid JSON/);
    assert.throws(() => parseCanvasDocument("[]"), /JSON object/);
    assert.throws(() => parseCanvasDocument('{"nodes":null}'), /nodes field/);
    assert.throws(() => parseCanvasDocument('{"edges":{}}'), /edges field/);
  });

  test("normalizes safe Canvas filenames and paths", () => {
    assert.equal(normalizeCanvasPath(" Ideas/Working "), "Ideas/Working.canvas");
    assert.equal(normalizeCanvasPath("Existing.canvas"), "Existing.canvas");
    assert.equal(normalizeCanvasPath("../Outside"), null);
    assert.equal(normalizeCanvasPath("  "), null);
  });
});
