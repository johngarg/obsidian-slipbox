import {
  LocalBranchProjector,
  type LocalBranchModel,
  type LocalBranchModelInput,
} from "../../src/local-branch-model.js";

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
