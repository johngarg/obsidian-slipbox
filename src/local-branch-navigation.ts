import type { ExplicitBranch } from "./branch-links.js";
import type {
  LocalBranchCard,
  LocalBranchDeparture,
  LocalBranchModel,
  LocalBranchModelInput,
  LocalBranchMovement,
  LocalBranchNavigationGroup,
  LocalBranchTarget,
} from "./local-branch-types.js";

export interface LocalBranchExplicitContext {
  readonly branch: ExplicitBranch;
  readonly targetPath: string;
  readonly targetAddress: string;
}

export interface LocalBranchNavigationInput {
  readonly modelInput: LocalBranchModelInput;
  readonly cardsByPath: ReadonlyMap<string, LocalBranchCard>;
  readonly cardsByAddress: ReadonlyMap<string, readonly LocalBranchCard[]>;
  readonly active: LocalBranchCard;
  readonly currentAddresses: readonly string[];
  readonly explicitContext: LocalBranchExplicitContext | null;
  readonly inferredDepartures: readonly LocalBranchDeparture[];
}

const EMPTY_GROUPS: readonly LocalBranchNavigationGroup[] = [];

export function buildLocalBranchNavigation(
  input: LocalBranchNavigationInput,
): Readonly<Record<LocalBranchMovement, readonly LocalBranchNavigationGroup[]>> {
  const {
    modelInput,
    cardsByPath,
    cardsByAddress,
    active,
    currentAddresses,
    explicitContext,
    inferredDepartures,
  } = input;
  const currentCards = currentAddresses.flatMap((address) =>
    cardsByAddress.get(address) ?? []
  );
  const currentIndex = currentCards.findIndex((card) => card.path === active.path);
  const root = modelInput.inferred.nodesByAddress.get(active.address)
    ?.parentAddress === null;
  const groupForCard = (
    movement: LocalBranchMovement,
    card: LocalBranchCard | undefined,
    label: string,
  ): readonly LocalBranchNavigationGroup[] => {
    if (card === undefined) {
      return EMPTY_GROUPS;
    }
    return [{
      id: `${movement}:${card.path}`,
      movement,
      label,
      targets: targetCards([card]),
    }];
  };

  const inferred = inferredDepartures.map((departure) => ({
    id: `inferred:${departure.id}`,
    movement: "inferred" as const,
    label: "Enter inserted strand",
    targets: [departure.target],
  }));
  const explicit = (
    modelInput.explicit.outgoingBySourcePath.get(active.path) ?? []
  ).flatMap((branch) => {
    const target = cardsByPath.get(branch.targetPath);
    return target === undefined ? [] : [{
      id: `explicit:${branch.sourcePath}:${branch.targetPath}`,
      movement: "explicit" as const,
      label: `Enter supplementary strand ${branch.label}`,
      targets: targetCards([target]),
    }];
  });

  const explicitHigher = explicitContext === null
    ? undefined
    : cardsByPath.get(explicitContext.branch.sourcePath);
  const inferredParentAddress = modelInput.inferred.nodesByAddress
    .get(active.address)?.parentAddress ?? undefined;
  const inferredHigher = groupForCard(
    "higher",
    inferredParentAddress === undefined
      ? undefined
      : cardsByAddress.get(inferredParentAddress)?.[0],
    "Move to higher inserted strand",
  );
  const explicitHigherGroups = explicitHigher === undefined
    ? EMPTY_GROUPS
    : [{
      id: `higher:explicit:${explicitHigher.path}`,
      movement: "higher" as const,
      label: "Move to higher supplementary strand",
      targets: targetCards([explicitHigher]),
    }];
  const higher = [
    ...inferredHigher,
    ...explicitHigherGroups.filter((group) =>
      !group.targets.some((target) =>
        inferredHigher.some((candidate) =>
          candidate.targets.some((other) => other.path === target.path)
        )
      )
    ),
  ];

  const beginning = currentIndex <= 0 || (root && explicitContext === null)
    ? EMPTY_GROUPS
    : groupForCard(
      "beginning",
      currentCards[0],
      explicitContext === null
        ? "Move to strand beginning"
        : "Move to supplementary strand beginning",
    );

  const backward = groupForCard(
    "backward",
    currentIndex > 0 ? currentCards[currentIndex - 1] : undefined,
    "Move backward on current strand",
  );
  const forward = groupForCard(
    "forward",
    currentIndex >= 0 ? currentCards[currentIndex + 1] : undefined,
    "Move forward on current strand",
  );
  const collapse = (groups: readonly LocalBranchNavigationGroup[]) =>
    collapseDuplicateAddressTargets(groups, cardsByAddress);
  return {
    backward: collapse(backward),
    forward: collapse(forward),
    beginning: collapse(beginning),
    inferred: collapse(inferred),
    explicit: collapse(explicit),
    higher: collapse(higher),
  };
}

function collapseDuplicateAddressTargets(
  groups: readonly LocalBranchNavigationGroup[],
  cardsByAddress: ReadonlyMap<string, readonly LocalBranchCard[]>,
): readonly LocalBranchNavigationGroup[] {
  const candidatePathsByAddress = new Map<string, Set<string>>();
  for (const target of groups.flatMap((group) => group.targets)) {
    const paths = candidatePathsByAddress.get(target.address) ?? new Set<string>();
    paths.add(target.path);
    candidatePathsByAddress.set(target.address, paths);
  }
  const preferredByAddress = new Map<string, LocalBranchTarget>();
  for (const [address, candidatePaths] of candidatePathsByAddress) {
    const preferred = (cardsByAddress.get(address) ?? [])
      .find((card) => candidatePaths.has(card.path));
    if (preferred !== undefined) {
      const target = targetCards([preferred])[0];
      if (target !== undefined) {
        preferredByAddress.set(address, target);
      }
    }
  }

  const emittedAddresses = new Set<string>();
  return groups.flatMap((group) => {
    const targets = group.targets.flatMap((target) => {
      if (emittedAddresses.has(target.address)) {
        return [];
      }
      emittedAddresses.add(target.address);
      return [preferredByAddress.get(target.address) ?? target];
    });
    return targets.length === 0 ? [] : [{ ...group, targets }];
  });
}

export function localBranchTargets(
  model: LocalBranchModel | null,
  movement: LocalBranchMovement,
): readonly LocalBranchTarget[] {
  if (model === null) {
    return [];
  }
  return model.navigation[movement].flatMap((group) => group.targets);
}

function targetCards(
  cards: readonly LocalBranchCard[],
): readonly LocalBranchTarget[] {
  return cards.map(({ path, address, title }) => ({ path, address, title }));
}
