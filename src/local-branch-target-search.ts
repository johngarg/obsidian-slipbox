import type { LocalBranchTarget } from "./local-branch-types.js";

export function filterLocalBranchTargets(
  targets: readonly LocalBranchTarget[],
  query: string,
): LocalBranchTarget[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized === "") {
    return [...targets];
  }
  return targets.filter((target) =>
    `${target.alias ?? ""}\n${target.address}\n${target.title}\n${target.path}`
      .toLocaleLowerCase()
      .includes(normalized)
  );
}
