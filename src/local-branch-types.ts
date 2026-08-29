import type { ExplicitBranchIndex } from "./branch-links.js";
import type { InferredStructureIndex } from "./inferred-structure.js";

export type LocalBranchEdgeKind = "continuation" | "inferred" | "explicit";
export type LocalBranchStrandRole = "higher" | "current" | "departure";

export interface LocalBranchCard {
  readonly path: string;
  readonly address: string;
  readonly title: string;
}

export interface LocalBranchNode {
  readonly path: string;
  readonly address: string;
  readonly title: string;
  readonly duplicateIndex: number;
  readonly duplicateCount: number;
  readonly departures: readonly LocalBranchDeparture[];
}

export interface LocalBranchDeparture {
  readonly id: string;
  readonly kind: "inferred" | "explicit";
  readonly label: string;
  readonly target: LocalBranchTarget;
}

export interface LocalBranchConnection {
  readonly fromPath: string;
  readonly toPath: string;
  readonly kind: Exclude<LocalBranchEdgeKind, "continuation">;
  readonly label?: string;
}

export interface LocalBranchStrand {
  readonly id: string;
  readonly role: LocalBranchStrandRole;
  readonly nodes: readonly LocalBranchNode[];
  readonly selectedPath: string;
  readonly knownBeginning: boolean;
  readonly knownEnd: boolean;
  readonly connection?: LocalBranchConnection;
}

export type LocalBranchMovement =
  | "backward"
  | "forward"
  | "beginning"
  | "inferred"
  | "explicit"
  | "higher";

export interface LocalBranchTarget {
  readonly path: string;
  readonly address: string;
  readonly title: string;
}

export interface LocalBranchNavigationGroup {
  readonly id: string;
  readonly movement: LocalBranchMovement;
  readonly label: string;
  readonly targets: readonly LocalBranchTarget[];
}

export interface LocalBranchModel {
  readonly activePath: string;
  readonly activeAddress: string;
  readonly strands: readonly LocalBranchStrand[];
  readonly navigation: Readonly<Record<
    LocalBranchMovement,
    readonly LocalBranchNavigationGroup[]
  >>;
}

export interface LocalBranchModelInput {
  readonly activePath: string;
  readonly cards: readonly LocalBranchCard[];
  readonly inferred: InferredStructureIndex;
  readonly explicit: ExplicitBranchIndex;
  readonly expandedDepartureIds?: ReadonlySet<string>;
}
