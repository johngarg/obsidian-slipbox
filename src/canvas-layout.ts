import { fnv1a } from "./hash.js";

export interface CanvasNode {
  readonly id: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly [key: string]: unknown;
}

export interface CanvasFileNode extends CanvasNode {
  readonly type: "file";
  readonly file: string;
  readonly subpath?: string;
}

export interface CanvasDocument {
  readonly nodes: readonly CanvasNode[];
  readonly edges: readonly Record<string, unknown>[];
  readonly [key: string]: unknown;
}

export interface CanvasLayoutOptions {
  readonly originX?: number;
  readonly originY?: number;
  readonly nodeWidth?: number;
  readonly nodeHeight?: number;
  readonly horizontalGap?: number;
  readonly verticalGap?: number;
  readonly columns?: number;
}

export interface CanvasLayoutResult {
  readonly data: CanvasDocument;
  readonly addedPaths: readonly string[];
  readonly skippedPaths: readonly string[];
}

const DEFAULT_NODE_WIDTH = 400;
const DEFAULT_NODE_HEIGHT = 280;
const DEFAULT_HORIZONTAL_GAP = 80;
const DEFAULT_VERTICAL_GAP = 80;
const DEFAULT_COLUMNS = 4;

export function parseCanvasDocument(source: string): CanvasDocument {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("The Canvas file does not contain valid JSON");
  }
  if (!isRecord(value) || Array.isArray(value)) {
    throw new Error("The Canvas file does not contain a JSON object");
  }
  if (value.nodes !== undefined && !Array.isArray(value.nodes)) {
    throw new Error("The Canvas file's nodes field is not an array");
  }
  if (value.edges !== undefined && !Array.isArray(value.edges)) {
    throw new Error("The Canvas file's edges field is not an array");
  }
  return {
    ...value,
    nodes: value.nodes ?? [],
    edges: value.edges ?? [],
  };
}

export function serializeCanvasDocument(data: CanvasDocument): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function normalizeCanvasPath(value: string): string | null {
  const segments = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((segment) => segment !== "");
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }
  const joined = segments.join("/");
  const path = joined.toLowerCase().endsWith(".canvas")
    ? joined
    : `${joined}.canvas`;
  return path === ".canvas" ? null : path;
}

export function layoutFilesOnCanvas(
  data: CanvasDocument,
  filePaths: readonly string[],
  options: CanvasLayoutOptions = {},
): CanvasLayoutResult {
  const existingPaths = new Set(
    data.nodes.flatMap((node) => isFileNode(node) ? [node.file] : []),
  );
  const requested = uniqueNonempty(filePaths);
  const skippedPaths = requested.filter((path) => existingPaths.has(path));
  const addedPaths = requested.filter((path) => !existingPaths.has(path));
  if (addedPaths.length === 0) {
    return { data, addedPaths, skippedPaths };
  }

  const width = positive(options.nodeWidth, DEFAULT_NODE_WIDTH);
  const height = positive(options.nodeHeight, DEFAULT_NODE_HEIGHT);
  const horizontalGap = nonnegative(options.horizontalGap, DEFAULT_HORIZONTAL_GAP);
  const verticalGap = nonnegative(options.verticalGap, DEFAULT_VERTICAL_GAP);
  const columns = Math.max(1, Math.trunc(positive(options.columns, DEFAULT_COLUMNS)));
  const originX = finite(options.originX, 0);
  const originY = finite(options.originY, 0);
  const usedIds = new Set(data.nodes.map((node) => node.id));
  const nodes = addedPaths.map((file, index): CanvasFileNode => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      id: uniqueCanvasNodeId(file, usedIds),
      type: "file",
      file,
      x: originX + column * (width + horizontalGap),
      y: originY + row * (height + verticalGap),
      width,
      height,
    };
  });
  return {
    data: { ...data, nodes: [...data.nodes, ...nodes] },
    addedPaths,
    skippedPaths,
  };
}

export function isFileNode(node: CanvasNode): node is CanvasFileNode {
  return node.type === "file" &&
    typeof (node as Partial<CanvasFileNode>).file === "string";
}

function uniqueCanvasNodeId(file: string, used: Set<string>): string {
  const base = `slipbox-${fnv1a(file).toString(16).padStart(8, "0")}`;
  let id = base;
  let sequence = 2;
  while (used.has(id)) {
    id = `${base}-${sequence}`;
    sequence += 1;
  }
  used.add(id);
  return id;
}

function uniqueNonempty(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (value === "" || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positive(value: number | undefined, fallback: number): number {
  const result = finite(value, fallback);
  return result > 0 ? result : fallback;
}

function nonnegative(value: number | undefined, fallback: number): number {
  const result = finite(value, fallback);
  return result >= 0 ? result : fallback;
}
