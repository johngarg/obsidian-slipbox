import type { ExplicitBranch } from "./branch-links.js";
import {
  buildLocalBranchNavigation,
  type LocalBranchExplicitContext,
} from "./local-branch-navigation.js";
import {
  buildLocalBranchStrandFamilyIndex,
  type LocalBranchAddressStrand,
  type LocalBranchStrandFamilyIndex,
} from "./local-branch-strands.js";
import type {
  LocalBranchCard,
  LocalBranchDeparture,
  LocalBranchModel,
  LocalBranchModelInput,
  LocalBranchNode,
  LocalBranchProjectionInput,
  LocalBranchRelationship,
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
  LocalBranchProjectionInput,
  LocalBranchRelationship,
  LocalBranchStrand,
  LocalBranchTarget,
} from "./local-branch-types.js";
export { localBranchTargets } from "./local-branch-navigation.js";

interface PreparedLocalBranchModelInput extends LocalBranchModelInput {
  readonly strandFamilies: LocalBranchStrandFamilyIndex;
}

/** Build the complete local semantic projection before responsive omission. */
export function buildLocalBranchModel(
  input: LocalBranchModelInput,
): LocalBranchModel | null {
  const projector = new LocalBranchProjector({
    cards: input.cards,
    inferred: input.inferred,
    explicit: input.explicit,
  });
  return projector.modelForPath(
    input.activePath,
    input.expandedDepartureId ?? null,
  );
}

/** Reuses structural lookups and the most recent unexpanded local model. */
export class LocalBranchProjector {
  private readonly cardsByPath: ReadonlyMap<string, LocalBranchCard>;
  private readonly cardsByAddress: ReadonlyMap<
    string,
    readonly LocalBranchCard[]
  >;
  private readonly strandFamilies: LocalBranchStrandFamilyIndex;
  private cachedBasePath: string | null = null;
  private cachedBaseModel: LocalBranchModel | null = null;

  constructor(private readonly input: LocalBranchProjectionInput) {
    this.cardsByPath = new Map(
      input.cards.map((card) => [card.path, card]),
    );
    this.cardsByAddress = groupCardsByAddress(input.cards);
    this.strandFamilies = buildLocalBranchStrandFamilyIndex(input.inferred);
  }

  modelForPath(
    activePath: string,
    expandedDepartureId: string | null = null,
  ): LocalBranchModel | null {
    const base = this.baseModelForPath(activePath);
    if (base === null || expandedDepartureId === null) {
      return base;
    }
    return expandDeparture(
      this.input,
      this.cardsByPath,
      this.cardsByAddress,
      this.strandFamilies,
      base,
      expandedDepartureId,
    );
  }

  private baseModelForPath(activePath: string): LocalBranchModel | null {
    if (activePath === this.cachedBasePath) {
      return this.cachedBaseModel;
    }
    this.cachedBasePath = activePath;
    this.cachedBaseModel = buildBaseModel(
      this.input,
      this.cardsByPath,
      this.cardsByAddress,
      this.strandFamilies,
      activePath,
    );
    return this.cachedBaseModel;
  }
}

export interface LocalBranchProjectorCacheInput {
  readonly snapshot: object;
  readonly titleSource: string;
  readonly titleProperty: string;
  readonly create: () => LocalBranchProjector;
}

/** Invalidates prepared card/title data only when its semantic source changes. */
export class LocalBranchProjectorCache {
  private snapshot: object | null = null;
  private titleSource = "";
  private titleProperty = "";
  private projector: LocalBranchProjector | null = null;

  projectorFor(input: LocalBranchProjectorCacheInput): LocalBranchProjector {
    if (
      this.projector === null ||
      this.snapshot !== input.snapshot ||
      this.titleSource !== input.titleSource ||
      this.titleProperty !== input.titleProperty
    ) {
      this.snapshot = input.snapshot;
      this.titleSource = input.titleSource;
      this.titleProperty = input.titleProperty;
      this.projector = input.create();
    }
    return this.projector;
  }
}

function buildBaseModel(
  input: LocalBranchProjectionInput,
  cardsByPath: ReadonlyMap<string, LocalBranchCard>,
  cardsByAddress: ReadonlyMap<string, readonly LocalBranchCard[]>,
  strandFamilies: LocalBranchStrandFamilyIndex,
  activePath: string,
): LocalBranchModel | null {
  const active = cardsByPath.get(activePath);
  if (active === undefined) {
    return null;
  }

  const inferredNode = input.inferred.nodesByAddress.get(active.address);
  const siblingAddresses = addressesForStrand(strandFamilies, active.address);
  const activeAddressIndex = Math.max(0, siblingAddresses.indexOf(active.address));
  const modelInput: PreparedLocalBranchModelInput = {
    ...input,
    activePath,
    strandFamilies,
  };
  const explicitContext = findExplicitContext(
    modelInput,
    cardsByPath,
    cardsByAddress,
    siblingAddresses,
    activeAddressIndex,
  );
  const explicitInterval = explicitContext === null
    ? null
    : explicitContextInterval(modelInput, cardsByPath, explicitContext);
  const contextStartIndex = explicitContext === null
    ? 0
    : Math.max(0, siblingAddresses.indexOf(explicitContext.targetAddress));
  const currentAddresses = explicitContext === null
    ? siblingAddresses
    : explicitInterval?.addresses ?? siblingAddresses.slice(contextStartIndex);
  const rootContext = inferredNode?.parentAddress === null;
  const current = strand(
    "current",
    "current",
    currentAddresses,
    activePath,
    cardsByAddress,
    cardsByPath,
    modelInput,
    explicitContext !== null || !rootContext,
    explicitInterval?.knownEnd ?? !rootContext,
  );

  const higher = buildHigherStrand(
    modelInput,
    cardsByPath,
    cardsByAddress,
    active,
    explicitContext,
  );
  const baseStrands = [
    ...(higher === null ? [] : [higher]),
    current,
  ];
  const departures = projectDepartures(
    modelInput,
    cardsByPath,
    cardsByAddress,
    active,
    current.id,
    baseStrands,
  );
  const inferredDepartures = departureDefinitions(
    modelInput,
    cardsByPath,
    cardsByAddress,
    active,
  ).filter((departure) => departure.kind === "inferred");
  const strands = [
    ...baseStrands,
    ...departures.strands,
  ];

  return {
    activePath: active.path,
    activeAddress: active.address,
    strands,
    relationships: departures.relationships,
    expandedDepartureId: null,
    navigation: buildLocalBranchNavigation({
      modelInput,
      cardsByPath,
      cardsByAddress,
      active,
      currentAddresses,
      explicitContext,
      inferredDepartures: inferredDepartures.map(departureForDefinition),
    }),
  };
}

function expandDeparture(
  input: LocalBranchProjectionInput,
  cardsByPath: ReadonlyMap<string, LocalBranchCard>,
  cardsByAddress: ReadonlyMap<string, readonly LocalBranchCard[]>,
  strandFamilies: LocalBranchStrandFamilyIndex,
  base: LocalBranchModel,
  departureId: string,
): LocalBranchModel {
  const visibleDepartureIds = new Set(
    [
      ...base.strands
        .filter((strand) => strand.role === "departure")
        .map((strand) => strand.id),
      ...base.relationships.map((relationship) => relationship.id),
    ],
  );
  if (visibleDepartureIds.has(departureId)) {
    return base;
  }
  const modelInput: PreparedLocalBranchModelInput = {
    ...input,
    activePath: base.activePath,
    strandFamilies,
  };
  for (const row of base.strands) {
    for (const node of row.nodes) {
      if (node.path === base.activePath) {
        continue;
      }
      const expandable = node.departures.some((departure) =>
        departure.id === departureId && !visibleDepartureIds.has(departure.id)
      );
      if (!expandable) {
        continue;
      }
      const owner = cardsByPath.get(node.path);
      if (owner === undefined) {
        return base;
      }
      const expanded = projectDepartures(
        modelInput,
        cardsByPath,
        cardsByAddress,
        owner,
        row.id,
        base.strands,
        false,
        departureId,
      );
      const expandedStrand = expanded.strands[0];
      const expandedRelationship = expanded.relationships[0];
      if (expandedStrand === undefined && expandedRelationship === undefined) {
        return base;
      }
      return {
        ...base,
        strands: expandedStrand === undefined
          ? base.strands
          : [...base.strands, expandedStrand],
        relationships: expandedRelationship === undefined
          ? base.relationships
          : [...base.relationships, expandedRelationship],
        expandedDepartureId: departureId,
      };
    }
  }
  return base;
}

function buildHigherStrand(
  input: PreparedLocalBranchModelInput,
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
      : addressesForStrand(input.strandFamilies, source.address);
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
  const currentAddresses = addressesForStrand(
    input.strandFamilies,
    active.address,
  );
  const currentBeginning = cardsByAddress.get(
    currentAddresses[0] ?? active.address,
  )?.[0] ?? active;
  const result = strand(
    `higher:inferred:${parentAddress}`,
    "higher",
    addressesForStrand(input.strandFamilies, parentAddress),
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

interface ProjectedDepartures {
  readonly strands: readonly LocalBranchStrand[];
  readonly relationships: readonly LocalBranchRelationship[];
}

function projectDepartures(
  input: PreparedLocalBranchModelInput,
  cardsByPath: ReadonlyMap<string, LocalBranchCard>,
  cardsByAddress: ReadonlyMap<string, readonly LocalBranchCard[]>,
  active: LocalBranchCard,
  sourceStrandId: string,
  visibleStrands: readonly LocalBranchStrand[],
  includeDepartures = true,
  departureId?: string,
): ProjectedDepartures {
  const strands: LocalBranchStrand[] = [];
  const relationships: LocalBranchRelationship[] = [];
  const strandIdByPath = new Map<string, string>();
  for (const visible of visibleStrands) {
    for (const node of visible.nodes) {
      if (!strandIdByPath.has(node.path)) {
        strandIdByPath.set(node.path, visible.id);
      }
    }
  }

  const definitions = departureDefinitions(
    input,
    cardsByPath,
    cardsByAddress,
    active,
  ).filter((departure) =>
    departureId === undefined || departure.id === departureId
  );
  for (const departure of definitions) {
    const targetStrandId = strandIdByPath.get(departure.target.path);
    if (targetStrandId !== undefined) {
      relationships.push({
        id: departure.id,
        fromStrandId: sourceStrandId,
        toStrandId: targetStrandId,
        fromPath: active.path,
        toPath: departure.target.path,
        kind: departure.kind,
        ...(departure.edgeLabel === undefined
          ? {}
          : { label: departure.edgeLabel }),
      });
      continue;
    }
    const projected = {
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
        includeDepartures,
      ),
      connection: {
        fromPath: active.path,
        toPath: departure.target.path,
        kind: departure.kind,
        ...(departure.edgeLabel === undefined
          ? {}
          : { label: departure.edgeLabel }),
      },
    };
    strands.push(projected);
    for (const node of projected.nodes) {
      if (!strandIdByPath.has(node.path)) {
        strandIdByPath.set(node.path, projected.id);
      }
    }
  }
  return { strands, relationships };
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
  input: PreparedLocalBranchModelInput,
  cardsByPath: ReadonlyMap<string, LocalBranchCard>,
  cardsByAddress: ReadonlyMap<string, readonly LocalBranchCard[]>,
  source: LocalBranchCard,
): readonly DepartureDefinition[] {
  const explicitStarts = explicitDepartureStarts(input, cardsByPath, source);
  const inferred = inferredDepartureDefinitions(
    input,
    cardsByAddress,
    source,
    explicitStarts,
  );
  const explicit = explicitStarts.map((start): DepartureDefinition => {
    const interval = explicitStrandInterval(start, explicitStarts);
    return {
      id: `departure:explicit:${source.path}:${start.target.path}`,
      kind: "explicit",
      description: `Supplementary branch ${start.branch.label}`,
      edgeLabel: start.branch.label,
      target: start.target,
      addresses: interval.addresses,
      knownEnd: interval.knownEnd,
    };
  });
  return [...inferred, ...explicit];
}

function inferredDepartureDefinitions(
  input: PreparedLocalBranchModelInput,
  cardsByAddress: ReadonlyMap<string, readonly LocalBranchCard[]>,
  source: LocalBranchCard,
  explicitStarts: readonly ExplicitDepartureStart[],
): readonly DepartureDefinition[] {
  const families = input.strandFamilies.childStrandsByParentAddress
    .get(source.address) ?? [];
  return families.flatMap((family) => {
    const addresses = inferredPrefixForFamily(family, explicitStarts);
    const firstAddress = addresses[0];
    const target = firstAddress === undefined
      ? undefined
      : cardsByAddress.get(firstAddress)?.[0];
    return target === undefined ? [] : [{
      id: `departure:inferred:${source.address}:${family.id}`,
      kind: "inferred" as const,
      description: "Inserted branch",
      target,
      addresses,
      knownEnd: true,
    }];
  });
}

function inferredPrefixForFamily(
  family: LocalBranchAddressStrand,
  explicitStarts: readonly ExplicitDepartureStart[],
): readonly string[] {
  const firstExplicitIndex = explicitStarts.reduce(
    (first, start) => start.axis === family.id
      ? Math.min(first, start.index)
      : first,
    family.addresses.length,
  );
  return family.addresses.slice(0, firstExplicitIndex);
}

function explicitDepartureStarts(
  input: PreparedLocalBranchModelInput,
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
      const family = input.strandFamilies.strandsByAddress.get(target.address);
      const siblings = family?.addresses ?? [target.address];
      return [{
        branch,
        target,
        siblings,
        index: Math.max(0, siblings.indexOf(target.address)),
        axis: family?.id ?? null,
        hasKnownEnd: targetNode !== undefined && targetNode.parentAddress !== null,
      }];
    });
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

function explicitContextInterval(
  input: PreparedLocalBranchModelInput,
  cardsByPath: ReadonlyMap<string, LocalBranchCard>,
  context: LocalBranchExplicitContext,
): ExplicitStrandInterval | null {
  const source = cardsByPath.get(context.branch.sourcePath);
  if (source !== undefined) {
    const starts = explicitDepartureStarts(
      { ...input, activePath: context.targetPath },
      cardsByPath,
      source,
    );
    const start = starts.find((candidate) =>
      candidate.branch.sourcePath === context.branch.sourcePath &&
      candidate.branch.targetPath === context.targetPath &&
      candidate.branch.sourceOrder === context.branch.sourceOrder
    );
    if (start !== undefined) {
      return explicitStrandInterval(start, starts);
    }
  }
  return null;
}

interface ExplicitStrandInterval {
  readonly addresses: readonly string[];
  readonly knownEnd: boolean;
}

function explicitStrandInterval(
  start: ExplicitDepartureStart,
  starts: readonly ExplicitDepartureStart[],
): ExplicitStrandInterval {
  const end = explicitDepartureEnd(start, starts);
  return {
    addresses: start.siblings.slice(start.index, end),
    knownEnd: end < start.siblings.length || start.hasKnownEnd,
  };
}

function findExplicitContext(
  input: PreparedLocalBranchModelInput,
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

  // Exact duplicates share one structural position. After preferring a branch
  // that targets the active path directly, inherit from the first targeted
  // peer at the same address before looking at earlier strand positions.
  for (let index = activeAddressIndex; index >= 0; index -= 1) {
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
  input: PreparedLocalBranchModelInput,
  knownBeginning: boolean,
  knownEnd: boolean,
  includeDepartures = true,
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
        includeDepartures,
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
  input: PreparedLocalBranchModelInput,
  includeDepartures: boolean,
): readonly LocalBranchNode[] {
  return cards.map((card, duplicateIndex) => ({
    ...card,
    duplicateIndex,
    duplicateCount: cards.length,
    departures: includeDepartures
      ? departuresForCard(
        card,
        duplicateIndex,
        cardsByAddress,
        cardsByPath,
        input,
      )
      : [],
  }));
}

function departuresForCard(
  card: LocalBranchCard,
  duplicateIndex: number,
  cardsByAddress: ReadonlyMap<string, readonly LocalBranchCard[]>,
  cardsByPath: ReadonlyMap<string, LocalBranchCard>,
  input: PreparedLocalBranchModelInput,
): readonly LocalBranchDeparture[] {
  return departureDefinitions(input, cardsByPath, cardsByAddress, card)
    .filter((departure) =>
      departure.kind === "explicit" || duplicateIndex === 0
    )
    .map(departureForDefinition);
}

function departureForDefinition(
  departure: DepartureDefinition,
): LocalBranchDeparture {
  return {
    id: departure.id,
    kind: departure.kind,
    label: departure.description,
    target: targetForCard(departure.target, departure.edgeLabel),
  };
}

function targetForCard(
  card: LocalBranchCard,
  alias?: string,
): LocalBranchDeparture["target"] {
  return {
    path: card.path,
    address: card.address,
    title: card.title,
    ...(alias === undefined ? {} : { alias }),
  };
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

function addressesForStrand(
  strandFamilies: LocalBranchStrandFamilyIndex,
  address: string,
): readonly string[] {
  return strandFamilies.strandsByAddress.get(address)?.addresses ?? [address];
}
