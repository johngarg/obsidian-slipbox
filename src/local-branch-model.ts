import {
  buildLocalBranchNavigation,
  type LocalBranchExplicitContext,
} from "./local-branch-navigation.js";
import type { InferredStructureIndex } from "./inferred-structure.js";
import type {
  LocalBranchCard,
  LocalBranchDeparture,
  LocalBranchModel,
  LocalBranchModelInput,
  LocalBranchNode,
  LocalBranchStrand,
  LocalBranchStrandRole,
} from "./local-branch-types.js";

export type {
  LocalBranchCard,
  LocalBranchDeparture,
  LocalBranchModel,
  LocalBranchModelInput,
  LocalBranchMovement,
  LocalBranchNavigationGroup,
  LocalBranchNode,
  LocalBranchStrand,
  LocalBranchTarget,
} from "./local-branch-types.js";
export { localBranchTargets } from "./local-branch-navigation.js";

/** Build the complete local semantic projection before responsive omission. */
export function buildLocalBranchModel(
  input: LocalBranchModelInput,
): LocalBranchModel | null {
  const cardsByPath = new Map(input.cards.map((card) => [card.path, card]));
  const cardsByAddress = groupCardsByAddress(input.cards);
  const active = cardsByPath.get(input.activePath);
  if (active === undefined) {
    return null;
  }

  const inferredNode = input.inferred.nodesByAddress.get(active.address);
  const siblingAddresses = inferredNode === undefined
    ? [active.address]
    : siblingsForAddress(input.inferred, active.address);
  const activeAddressIndex = Math.max(0, siblingAddresses.indexOf(active.address));
  const explicitContext = findExplicitContext(
    input,
    cardsByPath,
    cardsByAddress,
    siblingAddresses,
    activeAddressIndex,
  );
  const contextStartIndex = explicitContext === null
    ? 0
    : Math.max(0, siblingAddresses.indexOf(explicitContext.targetAddress));
  const currentAddresses = explicitContext === null
    ? siblingAddresses
    : siblingAddresses.slice(contextStartIndex);
  const rootContext = inferredNode?.parentAddress === null;
  const current = strand(
    "current",
    "current",
    currentAddresses,
    input.activePath,
    cardsByAddress,
    cardsByPath,
    input,
    explicitContext !== null || !rootContext,
    !rootContext,
  );

  const higher = buildHigherStrand(
    input,
    cardsByPath,
    cardsByAddress,
    active,
    explicitContext,
  );
  const departures = buildDepartures(
    input,
    cardsByPath,
    cardsByAddress,
    active,
  );
  const visiblePaths = new Set([
    ...current.nodes.map((node) => node.path),
    ...(higher?.nodes.map((node) => node.path) ?? []),
  ]);
  const expandedDepartures = [...input.expandedDepartureIds ?? []]
    .flatMap((departureId) => {
      for (const path of visiblePaths) {
        if (path === active.path) {
          continue;
        }
        const owner = cardsByPath.get(path);
        if (owner === undefined) {
          continue;
        }
        const departure = buildDepartures(
          input,
          cardsByPath,
          cardsByAddress,
          owner,
        ).find((strand) => strand.id === departureId);
        if (departure !== undefined) {
          return [departure];
        }
      }
      return [];
    });
  const strands = [
    ...(higher === null ? [] : [higher]),
    current,
    ...departures,
    ...expandedDepartures,
  ];

  return {
    activePath: active.path,
    activeAddress: active.address,
    strands,
    navigation: buildLocalBranchNavigation({
      modelInput: input,
      cardsByPath,
      cardsByAddress,
      active,
      currentAddresses,
      explicitContext,
    }),
  };
}

function buildHigherStrand(
  input: LocalBranchModelInput,
  cardsByPath: ReadonlyMap<string, LocalBranchCard>,
  cardsByAddress: ReadonlyMap<string, readonly LocalBranchCard[]>,
  active: LocalBranchCard,
  explicitContext: LocalBranchExplicitContext | null,
): LocalBranchStrand | null {
  if (explicitContext !== null) {
    const source = cardsByPath.get(explicitContext.branch.sourcePath);
    if (source === undefined) {
      return null;
    }
    const sourceNode = input.inferred.nodesByAddress.get(source.address);
    const addresses = sourceNode === undefined
      ? [source.address]
      : siblingsForAddress(input.inferred, source.address);
    const root = sourceNode?.parentAddress === null;
    return {
      ...strand(
        `higher:explicit:${source.path}`,
        "higher",
        addresses,
        source.path,
        cardsByAddress,
        cardsByPath,
        input,
        !root,
        !root,
      ),
      connection: {
        fromPath: source.path,
        toPath: explicitContext.targetPath,
        kind: "explicit",
        label: explicitContext.branch.label,
      },
    };
  }

  const activeNode = input.inferred.nodesByAddress.get(active.address);
  const parentAddress = activeNode?.parentAddress;
  if (parentAddress === null || parentAddress === undefined) {
    return null;
  }
  const selected = cardsByAddress.get(parentAddress)?.[0];
  if (selected === undefined) {
    return null;
  }
  const parentNode = input.inferred.nodesByAddress.get(parentAddress);
  const root = parentNode?.parentAddress === null;
  const result = strand(
    `higher:inferred:${parentAddress}`,
    "higher",
    siblingsForAddress(input.inferred, parentAddress),
    selected.path,
    cardsByAddress,
    cardsByPath,
    input,
    !root,
    !root,
  );
  return {
    ...result,
    connection: {
      fromPath: selected.path,
      toPath: active.path,
      kind: "inferred",
    },
  };
}

function buildDepartures(
  input: LocalBranchModelInput,
  cardsByPath: ReadonlyMap<string, LocalBranchCard>,
  cardsByAddress: ReadonlyMap<string, readonly LocalBranchCard[]>,
  active: LocalBranchCard,
): readonly LocalBranchStrand[] {
  const departures: LocalBranchStrand[] = [];
  const inferredChildren = input.inferred.nodesByAddress.get(active.address)
    ?.childAddresses ?? [];
  const firstInferred = inferredChildren[0];
  const firstInferredCard = firstInferred === undefined
    ? undefined
    : cardsByAddress.get(firstInferred)?.[0];
  if (firstInferredCard !== undefined) {
    departures.push({
      ...strand(
        `departure:inferred:${active.address}`,
        "departure",
        inferredChildren,
        firstInferredCard.path,
        cardsByAddress,
        cardsByPath,
        input,
        true,
        true,
      ),
      connection: {
        fromPath: active.path,
        toPath: firstInferredCard.path,
        kind: "inferred",
      },
    });
  }

  for (const branch of input.explicit.outgoingBySourcePath.get(active.path) ?? []) {
    const target = cardsByPath.get(branch.targetPath);
    if (target === undefined) {
      continue;
    }
    const targetNode = input.inferred.nodesByAddress.get(target.address);
    const siblings = targetNode === undefined
      ? [target.address]
      : siblingsForAddress(input.inferred, target.address);
    const targetIndex = Math.max(0, siblings.indexOf(target.address));
    departures.push({
      ...strand(
        `departure:explicit:${active.path}:${target.path}`,
        "departure",
        siblings.slice(targetIndex),
        target.path,
        cardsByAddress,
        cardsByPath,
        input,
        true,
        targetNode !== undefined && targetNode.parentAddress !== null,
      ),
      connection: {
        fromPath: active.path,
        toPath: target.path,
        kind: "explicit",
        label: branch.label,
      },
    });
  }
  return departures;
}

function findExplicitContext(
  input: LocalBranchModelInput,
  cardsByPath: ReadonlyMap<string, LocalBranchCard>,
  cardsByAddress: ReadonlyMap<string, readonly LocalBranchCard[]>,
  siblingAddresses: readonly string[],
  activeAddressIndex: number,
): LocalBranchExplicitContext | null {
  const direct = input.explicit.parentByTargetPath.get(input.activePath);
  if (direct !== undefined) {
    return {
      branch: direct,
      targetPath: input.activePath,
      targetAddress: cardsByPath.get(input.activePath)?.address ?? "",
    };
  }

  for (let index = activeAddressIndex - 1; index >= 0; index -= 1) {
    const address = siblingAddresses[index];
    if (address === undefined) {
      continue;
    }
    for (const card of cardsByAddress.get(address) ?? []) {
      const branch = input.explicit.parentByTargetPath.get(card.path);
      if (branch !== undefined) {
        return { branch, targetPath: card.path, targetAddress: card.address };
      }
    }
  }
  return null;
}

function strand(
  id: string,
  role: LocalBranchStrandRole,
  addresses: readonly string[],
  selectedPath: string,
  cardsByAddress: ReadonlyMap<string, readonly LocalBranchCard[]>,
  cardsByPath: ReadonlyMap<string, LocalBranchCard>,
  input: LocalBranchModelInput,
  knownBeginning: boolean,
  knownEnd: boolean,
): LocalBranchStrand {
  return {
    id,
    role,
    nodes: addresses.flatMap((address) =>
      localNodes(cardsByAddress.get(address) ?? [], cardsByPath, input)
    ),
    selectedPath,
    knownBeginning,
    knownEnd,
  };
}

function localNodes(
  cards: readonly LocalBranchCard[],
  cardsByPath: ReadonlyMap<string, LocalBranchCard>,
  input: LocalBranchModelInput,
): readonly LocalBranchNode[] {
  return cards.map((card, duplicateIndex) => ({
    ...card,
    duplicateIndex,
    duplicateCount: cards.length,
    departures: departuresForCard(card, duplicateIndex, cardsByPath, input),
  }));
}

function departuresForCard(
  card: LocalBranchCard,
  duplicateIndex: number,
  cardsByPath: ReadonlyMap<string, LocalBranchCard>,
  input: LocalBranchModelInput,
): readonly LocalBranchDeparture[] {
  const inferredChild = input.inferred.nodesByAddress.get(card.address)
    ?.childAddresses[0];
  const inferredTargetPath = inferredChild === undefined
    ? undefined
    : input.inferred.nodesByAddress.get(inferredChild)?.paths[0];
  const inferredTarget = inferredTargetPath === undefined
    ? undefined
    : cardsByPath.get(inferredTargetPath);
  const inferred = duplicateIndex !== 0 || inferredChild === undefined ||
      inferredTarget === undefined
    ? []
    : [{
      id: `departure:inferred:${card.address}`,
      kind: "inferred" as const,
      label: "Address-inferred inserted strand",
      target: targetForCard(inferredTarget),
    }];
  const explicit = (
    input.explicit.outgoingBySourcePath.get(card.path) ?? []
  ).flatMap((branch) => {
    const target = cardsByPath.get(branch.targetPath);
    return target === undefined ? [] : [{
      id: `departure:explicit:${card.path}:${target.path}`,
      kind: "explicit" as const,
      label: `Supplementary strand ${branch.label}`,
      target: { path: target.path, address: target.address, title: target.title },
    }];
  });
  return [...inferred, ...explicit];
}

function targetForCard(
  card: LocalBranchCard,
): LocalBranchDeparture["target"] {
  return { path: card.path, address: card.address, title: card.title };
}

function groupCardsByAddress(
  cards: readonly LocalBranchCard[],
): ReadonlyMap<string, readonly LocalBranchCard[]> {
  const grouped = new Map<string, LocalBranchCard[]>();
  for (const card of cards) {
    const existing = grouped.get(card.address);
    if (existing === undefined) {
      grouped.set(card.address, [card]);
    } else {
      existing.push(card);
    }
  }
  return grouped;
}

function siblingsForAddress(
  inferred: InferredStructureIndex,
  address: string,
): readonly string[] {
  const node = inferred.nodesByAddress.get(address);
  if (node === undefined) {
    return [address];
  }
  return node.parentAddress === null
    ? inferred.rootAddresses
    : inferred.nodesByAddress.get(node.parentAddress)?.childAddresses ?? [address];
}
