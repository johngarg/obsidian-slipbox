import type { ExplicitBranch } from "./branch-links.js";
import type {
  LocalBranchCard,
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
  } = input;
  const currentIndex = currentAddresses.indexOf(active.address);
  const root = modelInput.inferred.nodesByAddress.get(active.address)
    ?.parentAddress === null;
  const groupForAddress = (
    movement: LocalBranchMovement,
    address: string | undefined,
    label: string,
  ): readonly LocalBranchNavigationGroup[] => {
    if (address === undefined) {
      return EMPTY_GROUPS;
    }
    const targets = targetCards(cardsByAddress.get(address) ?? []);
    return targets.length === 0 ? EMPTY_GROUPS : [{
      id: `${movement}:${address}`,
      movement,
      label,
      targets,
    }];
  };

  const inferredChildren = modelInput.inferred.nodesByAddress.get(active.address)
    ?.childAddresses ?? [];
  const inferred = groupForAddress(
    "inferred",
    inferredChildren[0],
    "Enter inserted strand",
  );
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
  const inferredHigher = groupForAddress(
    "higher",
    inferredParentAddress,
    "Move to higher inferred strand",
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

  const firstAddress = currentAddresses[0];
  const explicitBeginning = explicitContext === null
    ? undefined
    : cardsByPath.get(explicitContext.targetPath);
  const beginning = currentIndex <= 0 || (root && explicitContext === null)
    ? EMPTY_GROUPS
    : explicitContext === null
      ? groupForAddress("beginning", firstAddress, "Move to strand beginning")
      : explicitBeginning === undefined
        ? EMPTY_GROUPS
        : [{
          id: `beginning:explicit:${explicitBeginning.path}`,
          movement: "beginning" as const,
          label: "Move to supplementary strand beginning",
          targets: targetCards([explicitBeginning]),
        }];

  return {
    backward: groupForAddress(
      "backward",
      currentIndex > 0 ? currentAddresses[currentIndex - 1] : undefined,
      "Move backward on current strand",
    ),
    forward: groupForAddress(
      "forward",
      currentIndex >= 0 ? currentAddresses[currentIndex + 1] : undefined,
      "Move forward on current strand",
    ),
    beginning,
    inferred,
    explicit,
    higher,
  };
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
