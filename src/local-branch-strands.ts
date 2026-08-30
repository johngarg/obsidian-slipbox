import type { InferredStructureIndex } from "./inferred-structure.js";

export interface LocalBranchAddressStrand {
  readonly id: string;
  readonly parentAddress: string | null;
  readonly addresses: readonly string[];
}

export interface LocalBranchStrandFamilyIndex {
  readonly strandsByAddress: ReadonlyMap<string, LocalBranchAddressStrand>;
  readonly childStrandsByParentAddress: ReadonlyMap<
    string,
    readonly LocalBranchAddressStrand[]
  >;
}

const LETTER_CHARACTER = /^\p{L}$/u;
const NUMBER_CHARACTER = /^\p{N}$/u;
const DELIMITER_CHARACTER = /^[\p{P}\p{Z}]$/u;

/**
 * Group one parent's extensions by their leading delimiter and first token
 * kind. Exact token values do not split numeric or letter continuations.
 */
export function localBranchFamilyKey(
  parentAddress: string,
  childAddress: string,
): string | null {
  if (
    parentAddress === "" ||
    childAddress.length <= parentAddress.length ||
    !childAddress.startsWith(parentAddress)
  ) {
    return null;
  }

  const suffix = childAddress.slice(parentAddress.length);
  let delimiter = "";
  let firstToken = "";
  for (const character of suffix) {
    if (firstToken === "" && DELIMITER_CHARACTER.test(character)) {
      delimiter += character;
      continue;
    }
    firstToken = character;
    break;
  }

  if (firstToken === "") {
    return JSON.stringify(["terminal", suffix]);
  }
  if (NUMBER_CHARACTER.test(firstToken)) {
    return JSON.stringify([delimiter, "number"]);
  }
  if (LETTER_CHARACTER.test(firstToken)) {
    return JSON.stringify([delimiter, "letter"]);
  }
  return JSON.stringify([delimiter, "other", firstToken]);
}

/** Prepare Branch View continuation families without changing the global tree. */
export function buildLocalBranchStrandFamilyIndex(
  inferred: InferredStructureIndex,
): LocalBranchStrandFamilyIndex {
  const strandsByAddress = new Map<string, LocalBranchAddressStrand>();
  const childStrandsByParentAddress = new Map<
    string,
    readonly LocalBranchAddressStrand[]
  >();

  if (inferred.rootAddresses.length > 0) {
    const root: LocalBranchAddressStrand = {
      id: "root",
      parentAddress: null,
      addresses: inferred.rootAddresses,
    };
    for (const address of root.addresses) {
      strandsByAddress.set(address, root);
    }
  }

  for (const parentAddress of inferred.orderedAddresses) {
    const children = inferred.nodesByAddress.get(parentAddress)
      ?.childAddresses ?? [];
    if (children.length === 0) {
      continue;
    }
    const grouped = new Map<string, string[]>();
    for (const childAddress of children) {
      const key = localBranchFamilyKey(parentAddress, childAddress) ??
        JSON.stringify(["singleton", childAddress]);
      const addresses = grouped.get(key);
      if (addresses === undefined) {
        grouped.set(key, [childAddress]);
      } else {
        addresses.push(childAddress);
      }
    }
    const strands = [...grouped.values()].map(
      (addresses, familyIndex): LocalBranchAddressStrand => ({
        id: `parent:${parentAddress}:family:${familyIndex}`,
        parentAddress,
        addresses,
      }),
    );
    childStrandsByParentAddress.set(parentAddress, strands);
    for (const strand of strands) {
      for (const address of strand.addresses) {
        strandsByAddress.set(address, strand);
      }
    }
  }

  return { strandsByAddress, childStrandsByParentAddress };
}
