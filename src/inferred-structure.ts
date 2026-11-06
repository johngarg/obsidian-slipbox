import {
  isInferredAddressAncestor,
  type AddressedPath,
  type DeckOrdering,
} from "./address-order.js";

export interface InferredAddressNode {
  readonly address: string;
  readonly parentAddress: string | null;
  readonly childAddresses: readonly string[];
}

export interface InferredStructureIndex {
  readonly nodesByAddress: ReadonlyMap<string, InferredAddressNode>;
  readonly orderedAddresses: readonly string[];
  readonly rootAddresses: readonly string[];
}

interface MutableInferredAddressNode {
  readonly address: string;
  parentAddress: string | null;
  readonly childAddresses: string[];
}

export const EMPTY_INFERRED_STRUCTURE: InferredStructureIndex = {
  nodesByAddress: new Map(),
  orderedAddresses: [],
  rootAddresses: [],
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

  for (const node of nodes) {
    while (
      stack.length > 0 &&
      !isInferredAddressAncestor(stack.at(-1)?.address ?? "", node.address, ordering)
    ) {
      stack.pop();
    }
    const parent = stack.at(-1);
    if (parent === undefined) {
      roots.push(node.address);
    } else {
      node.parentAddress = parent.address;
      parent.childAddresses.push(node.address);
    }
    stack.push(node);
  }

  return {
    nodesByAddress: new Map(nodes.map((node) => [node.address, node])),
    orderedAddresses: nodes.map((node) => node.address),
    rootAddresses: roots,
  };
}

/** One node per address; duplicate addresses are adjacent in Deck order. */
function groupAddressNodes(
  filed: readonly AddressedPath[],
): MutableInferredAddressNode[] {
  const nodes: MutableInferredAddressNode[] = [];
  for (const card of filed) {
    if (nodes.at(-1)?.address !== card.address) {
      nodes.push({ address: card.address, parentAddress: null, childAddresses: [] });
    }
  }
  return nodes;
}
