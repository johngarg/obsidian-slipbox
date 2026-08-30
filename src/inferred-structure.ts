import {
  isInferredAddressAncestor,
  type AddressedPath,
  type DeckOrdering,
} from "./address-order.js";

export interface InferredAddressNode {
  readonly address: string;
  readonly paths: readonly string[];
  readonly parentAddress: string | null;
  readonly childAddresses: readonly string[];
  readonly depth: number;
  readonly orderIndex: number;
  readonly firstDeckIndex: number;
  readonly lastDeckIndex: number;
  readonly subtreeEndDeckIndexExclusive: number;
  readonly subtreeEndOrderIndexExclusive: number;
}

export interface InferredStructureIndex {
  readonly nodesByAddress: ReadonlyMap<string, InferredAddressNode>;
  readonly orderedAddresses: readonly string[];
  readonly rootAddresses: readonly string[];
  readonly addressesByDepth: ReadonlyMap<number, readonly string[]>;
}

interface MutableInferredAddressNode {
  readonly address: string;
  readonly paths: string[];
  parentAddress: string | null;
  readonly childAddresses: string[];
  depth: number;
  readonly orderIndex: number;
  readonly firstDeckIndex: number;
  lastDeckIndex: number;
  subtreeEndDeckIndexExclusive: number;
  subtreeEndOrderIndexExclusive: number;
}

export const EMPTY_INFERRED_STRUCTURE: InferredStructureIndex = {
  nodesByAddress: new Map(),
  orderedAddresses: [],
  rootAddresses: [],
  addressesByDepth: new Map(),
};

/** Build an inferred address forest in one pass over an already sorted Deck. */
export function buildInferredStructure(
  filed: readonly AddressedPath[],
  ordering: DeckOrdering,
): InferredStructureIndex {
  if (filed.length === 0) {
    return EMPTY_INFERRED_STRUCTURE;
  }
  const nodes = groupAddressNodes(filed);
  const stack: MutableInferredAddressNode[] = [];
  const roots: string[] = [];
  const byDepth = new Map<number, string[]>();

  for (const node of nodes) {
    while (
      stack.length > 0 &&
      !isInferredAddressAncestor(
        stack[stack.length - 1]?.address ?? "",
        node.address,
        ordering,
      )
    ) {
      const completed = stack.pop();
      if (completed !== undefined) {
        completeSubtree(completed, node.firstDeckIndex, node.orderIndex);
      }
    }
    const parent = stack[stack.length - 1];
    if (parent === undefined) {
      roots.push(node.address);
    } else {
      node.parentAddress = parent.address;
      node.depth = parent.depth + 1;
      parent.childAddresses.push(node.address);
    }
    const depthAddresses = byDepth.get(node.depth);
    if (depthAddresses === undefined) {
      byDepth.set(node.depth, [node.address]);
    } else {
      depthAddresses.push(node.address);
    }
    stack.push(node);
  }

  while (stack.length > 0) {
    const completed = stack.pop();
    if (completed !== undefined) {
      completeSubtree(completed, filed.length, nodes.length);
    }
  }

  return {
    nodesByAddress: new Map(nodes.map((node) => [node.address, node])),
    orderedAddresses: nodes.map((node) => node.address),
    rootAddresses: roots,
    addressesByDepth: byDepth,
  };
}

function groupAddressNodes(
  filed: readonly AddressedPath[],
): MutableInferredAddressNode[] {
  const nodes: MutableInferredAddressNode[] = [];
  filed.forEach((card, deckIndex) => {
    const previous = nodes[nodes.length - 1];
    if (previous?.address === card.address) {
      previous.paths.push(card.path);
      previous.lastDeckIndex = deckIndex;
      return;
    }
    nodes.push({
      address: card.address,
      paths: [card.path],
      parentAddress: null,
      childAddresses: [],
      depth: 0,
      orderIndex: nodes.length,
      firstDeckIndex: deckIndex,
      lastDeckIndex: deckIndex,
      subtreeEndDeckIndexExclusive: filed.length,
      subtreeEndOrderIndexExclusive: 0,
    });
  });
  return nodes;
}

function completeSubtree(
  node: MutableInferredAddressNode,
  deckEndExclusive: number,
  orderEndExclusive: number,
): void {
  node.subtreeEndDeckIndexExclusive = deckEndExclusive;
  node.subtreeEndOrderIndexExclusive = orderEndExclusive;
}
