import type {
  LocalBranchModel,
  LocalBranchNode,
  LocalBranchStrand,
} from "./local-branch-model.js";

export interface LocalBranchLayoutNode {
  readonly kind: "node";
  readonly id: string;
  readonly node: LocalBranchNode;
  readonly x: number;
  readonly y: number;
}

export interface LocalBranchLayoutGap {
  readonly kind: "gap";
  readonly id: string;
  readonly count: number;
  readonly leading: boolean;
  readonly trailing: boolean;
  readonly x: number;
  readonly y: number;
}

export type LocalBranchLayoutItem = LocalBranchLayoutNode | LocalBranchLayoutGap;

export interface LocalBranchLayoutStrand {
  readonly strand: LocalBranchStrand;
  readonly items: readonly LocalBranchLayoutItem[];
  readonly y: number;
}

export interface LocalBranchLayout {
  readonly viewportWidth: number;
  readonly contentWidth: number;
  readonly height: number;
  readonly nodeRadius: number;
  readonly strands: readonly LocalBranchLayoutStrand[];
}

export interface LocalBranchLayoutOptions {
  readonly width: number;
  readonly expandedGapIds?: ReadonlySet<string>;
}

const NODE_RADIUS = 19;
const SLOT_WIDTH = 70;
const ROW_HEIGHT = 74;
const PADDING_X = 30;
const PADDING_Y = 26;

/** Deterministic strand layout with width-sensitive omission runs. */
export function layoutLocalBranchModel(
  model: LocalBranchModel,
  options: LocalBranchLayoutOptions,
): LocalBranchLayout {
  const viewportWidth = Math.max(240, Math.min(900, options.width));
  const budget = Math.max(
    3,
    Math.floor((viewportWidth - PADDING_X * 2) / SLOT_WIDTH),
  );
  const requiredPaths = connectionEndpoints(model);
  const projected = model.strands.map((strand) => projectStrand(
    strand,
    budget,
    requiredPaths,
    options.expandedGapIds ?? new Set(),
  ));
  const maxItems = Math.max(1, ...projected.map((items) => items.length));
  const expanded = projected.some((items) => items.length > budget);
  const baseContentWidth = expanded
    ? Math.max(viewportWidth, PADDING_X * 2 + maxItems * SLOT_WIDTH)
    : viewportWidth;
  const strands: LocalBranchLayoutStrand[] = [];
  projected.forEach((items, rowIndex) => {
    const strand = model.strands[rowIndex];
    if (strand === undefined) {
      throw new Error("Branch layout lost its source strand");
    }
    const y = PADDING_Y + NODE_RADIUS + rowIndex * ROW_HEIGHT;
    const rowWidth = Math.max(1, items.length) * SLOT_WIDTH;
    let startX = expanded
      ? PADDING_X + SLOT_WIDTH / 2
      : Math.max(
        PADDING_X + SLOT_WIDTH / 2,
        (baseContentWidth - rowWidth) / 2 + SLOT_WIDTH / 2,
      );
    const connection = strand.connection;
    if (strand.role === "departure" && connection !== undefined) {
      const source = findPositionedNode(strands, connection.fromPath);
      const targetIndex = items.findIndex((item) =>
        item.kind === "node" && item.node.path === connection.toPath
      );
      if (source !== null && targetIndex >= 0) {
        startX = source.x + SLOT_WIDTH - targetIndex * SLOT_WIDTH;
      }
    }
    strands.push({
      strand,
      y,
      items: items.map((item, itemIndex): LocalBranchLayoutItem => ({
        ...item,
        x: startX + itemIndex * SLOT_WIDTH,
        y,
      })),
    });
  });
  const rightmostItemX = Math.max(
    0,
    ...strands.flatMap((strand) => strand.items.map((item) => item.x)),
  );
  const contentWidth = Math.max(
    baseContentWidth,
    rightmostItemX + PADDING_X + SLOT_WIDTH / 2,
  );
  return {
    viewportWidth,
    contentWidth,
    height: PADDING_Y * 2 + NODE_RADIUS * 2 +
      Math.max(0, strands.length - 1) * ROW_HEIGHT,
    nodeRadius: NODE_RADIUS,
    strands,
  };
}

function findPositionedNode(
  strands: readonly LocalBranchLayoutStrand[],
  path: string,
): LocalBranchLayoutNode | null {
  for (const strand of strands) {
    const node = strand.items.find(
      (item): item is LocalBranchLayoutNode =>
        item.kind === "node" && item.node.path === path,
    );
    if (node !== undefined) {
      return node;
    }
  }
  return null;
}

type UnpositionedItem = Omit<LocalBranchLayoutNode, "x" | "y"> |
  Omit<LocalBranchLayoutGap, "x" | "y">;

function projectStrand(
  strand: LocalBranchStrand,
  budget: number,
  requiredPaths: ReadonlySet<string>,
  expandedGapIds: ReadonlySet<string>,
): readonly UnpositionedItem[] {
  if (strand.nodes.length <= budget) {
    return strand.nodes.map((node, index) => layoutNode(strand, node, index));
  }

  const required = new Set<number>();
  const selectedIndex = Math.max(
    0,
    strand.nodes.findIndex((node) => node.path === strand.selectedPath),
  );
  required.add(selectedIndex);
  strand.nodes.forEach((node, index) => {
    if (requiredPaths.has(node.path)) {
      required.add(index);
    }
  });
  if (strand.knownBeginning) {
    required.add(0);
  }
  if (strand.knownEnd) {
    required.add(strand.nodes.length - 1);
  }

  const visible = new Set(required);
  for (let distance = 1; visible.size < budget; distance += 1) {
    const left = selectedIndex - distance;
    const right = selectedIndex + distance;
    if (left >= 0) {
      visible.add(left);
    }
    if (visible.size < budget && right < strand.nodes.length) {
      visible.add(right);
    }
    if (left < 0 && right >= strand.nodes.length) {
      break;
    }
  }

  const result: UnpositionedItem[] = [];
  let index = 0;
  while (index < strand.nodes.length) {
    if (visible.has(index)) {
      const node = strand.nodes[index];
      if (node !== undefined) {
        result.push(layoutNode(strand, node, index));
      }
      index += 1;
      continue;
    }
    const start = index;
    while (index < strand.nodes.length && !visible.has(index)) {
      index += 1;
    }
    const end = index;
    const id = `${strand.id}:gap:${start}:${end}`;
    if (expandedGapIds.has(id)) {
      for (let omittedIndex = start; omittedIndex < end; omittedIndex += 1) {
        const node = strand.nodes[omittedIndex];
        if (node !== undefined) {
          result.push(layoutNode(strand, node, omittedIndex));
        }
      }
    } else {
      result.push({
        kind: "gap",
        id,
        count: end - start,
        leading: start === 0,
        trailing: end === strand.nodes.length,
      });
    }
  }
  return result;
}

function layoutNode(
  strand: LocalBranchStrand,
  node: LocalBranchNode,
  index: number,
): Omit<LocalBranchLayoutNode, "x" | "y"> {
  return {
    kind: "node",
    id: `${strand.id}:node:${index}:${node.path}`,
    node,
  };
}

function connectionEndpoints(model: LocalBranchModel): ReadonlySet<string> {
  const result = new Set<string>([model.activePath]);
  for (const strand of model.strands) {
    if (strand.connection !== undefined) {
      result.add(strand.connection.fromPath);
      result.add(strand.connection.toPath);
    }
  }
  return result;
}
