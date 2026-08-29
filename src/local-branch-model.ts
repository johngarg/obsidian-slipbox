import type { ExplicitBranch } from "./branch-links.js";
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
  const currentAddresses = siblingsForAddress(input.inferred, active.address);
  const currentBeginning = cardsByAddress.get(
    currentAddresses[0] ?? active.address,
  )?.[0] ?? active;
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
      toPath: currentBeginning.path,
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
  return departureDefinitions(input, cardsByPath, cardsByAddress, active)
    .map((departure) => ({
      ...strand(
        departure.id,
        "departure",
        departure.addresses,
        departure.target.path,
        cardsByAddress,
        cardsByPath,
        input,
        true,
        departure.knownEnd,
      ),
      connection: {
        fromPath: active.path,
        toPath: departure.target.path,
        kind: departure.kind,
        ...(departure.edgeLabel === undefined
          ? {}
          : { label: departure.edgeLabel }),
      },
    }));
}

interface DepartureDefinition {
  readonly id: string;
  readonly kind: "inferred" | "explicit";
  readonly description: string;
  readonly edgeLabel?: string;
  readonly target: LocalBranchCard;
  readonly addresses: readonly string[];
  readonly knownEnd: boolean;
}

interface ExplicitDepartureStart {
  readonly branch: ExplicitBranch;
  readonly target: LocalBranchCard;
  readonly siblings: readonly string[];
  readonly index: number;
  readonly axis: string | null;
  readonly hasKnownEnd: boolean;
}

function departureDefinitions(
  input: LocalBranchModelInput,
  cardsByPath: ReadonlyMap<string, LocalBranchCard>,
  cardsByAddress: ReadonlyMap<string, readonly LocalBranchCard[]>,
  source: LocalBranchCard,
): readonly DepartureDefinition[] {
  const explicitStarts = explicitDepartureStarts(input, cardsByPath, source);
  const inferredAddresses = inferredDepartureAddresses(
    input,
    source,
    explicitStarts,
  );
  const inferredTarget = inferredAddresses[0] === undefined
    ? undefined
    : cardsByAddress.get(inferredAddresses[0])?.[0];
  const inferred: readonly DepartureDefinition[] = inferredTarget === undefined
    ? []
    : [{
      id: `departure:inferred:${source.address}`,
      kind: "inferred",
      description: "Address-inferred inserted strand",
      target: inferredTarget,
      addresses: inferredAddresses,
      knownEnd: true,
    }];
  const explicit = explicitStarts.map((start): DepartureDefinition => {
    const end = explicitDepartureEnd(start, explicitStarts);
    return {
      id: `departure:explicit:${source.path}:${start.target.path}`,
      kind: "explicit",
      description: `Supplementary strand ${start.branch.label}`,
      edgeLabel: start.branch.label,
      target: start.target,
      addresses: start.siblings.slice(start.index, end),
      knownEnd: end < start.siblings.length || start.hasKnownEnd,
    };
  });
  return [...inferred, ...explicit];
}

function explicitDepartureStarts(
  input: LocalBranchModelInput,
  cardsByPath: ReadonlyMap<string, LocalBranchCard>,
  source: LocalBranchCard,
): readonly ExplicitDepartureStart[] {
  return (input.explicit.outgoingBySourcePath.get(source.path) ?? [])
    .flatMap((branch) => {
      const target = cardsByPath.get(branch.targetPath);
      if (target === undefined) {
        return [];
      }
      const targetNode = input.inferred.nodesByAddress.get(target.address);
      const siblings = targetNode === undefined
        ? [target.address]
        : siblingsForAddress(input.inferred, target.address);
      return [{
        branch,
        target,
        siblings,
        index: Math.max(0, siblings.indexOf(target.address)),
        axis: siblingAxis(input.inferred, target.address),
        hasKnownEnd: targetNode !== undefined && targetNode.parentAddress !== null,
      }];
    });
}

function inferredDepartureAddresses(
  input: LocalBranchModelInput,
  source: LocalBranchCard,
  explicitStarts: readonly ExplicitDepartureStart[],
): readonly string[] {
  const children = input.inferred.nodesByAddress.get(source.address)
    ?.childAddresses ?? [];
  const axis = `parent:${source.address}`;
  const firstExplicitIndex = explicitStarts.reduce(
    (first, start) => start.axis === axis
      ? Math.min(first, start.index)
      : first,
    children.length,
  );
  return children.slice(0, firstExplicitIndex);
}

function explicitDepartureEnd(
  current: ExplicitDepartureStart,
  starts: readonly ExplicitDepartureStart[],
): number {
  if (current.axis === null) {
    return current.siblings.length;
  }
  return starts.reduce(
    (end, candidate) =>
      candidate.axis === current.axis && candidate.index > current.index
        ? Math.min(end, candidate.index)
        : end,
    current.siblings.length,
  );
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
      localNodes(
        cardsByAddress.get(address) ?? [],
        cardsByAddress,
        cardsByPath,
        input,
      )
    ),
    selectedPath,
    knownBeginning,
    knownEnd,
  };
}

function localNodes(
  cards: readonly LocalBranchCard[],
  cardsByAddress: ReadonlyMap<string, readonly LocalBranchCard[]>,
  cardsByPath: ReadonlyMap<string, LocalBranchCard>,
  input: LocalBranchModelInput,
): readonly LocalBranchNode[] {
  return cards.map((card, duplicateIndex) => ({
    ...card,
    duplicateIndex,
    duplicateCount: cards.length,
    departures: departuresForCard(
      card,
      duplicateIndex,
      cardsByAddress,
      cardsByPath,
      input,
    ),
  }));
}

function departuresForCard(
  card: LocalBranchCard,
  duplicateIndex: number,
  cardsByAddress: ReadonlyMap<string, readonly LocalBranchCard[]>,
  cardsByPath: ReadonlyMap<string, LocalBranchCard>,
  input: LocalBranchModelInput,
): readonly LocalBranchDeparture[] {
  return departureDefinitions(input, cardsByPath, cardsByAddress, card)
    .filter((departure) =>
      departure.kind === "explicit" || duplicateIndex === 0
    )
    .map((departure) => ({
      id: departure.id,
      kind: departure.kind,
      label: departure.description,
      target: targetForCard(departure.target),
    }));
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

function siblingAxis(
  inferred: InferredStructureIndex,
  address: string,
): string | null {
  const node = inferred.nodesByAddress.get(address);
  if (node === undefined) {
    return null;
  }
  return node.parentAddress === null ? "root" : `parent:${node.parentAddress}`;
}
