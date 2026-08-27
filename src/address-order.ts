export type DeckOrdering = "natural" | "lexicographic";

export interface AddressedPath {
  readonly address: string;
  readonly path: string;
}

export interface ValidAddress {
  readonly valid: true;
  readonly address: string;
}

export interface InvalidAddress {
  readonly valid: false;
  readonly message: string;
}

export type AddressValidation = ValidAddress | InvalidAddress;

const NATURAL_RUN_PATTERN = /[0-9]+|[^0-9]+/gu;

function containsControlOrLineSeparator(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (
      codeUnit <= 0x1f ||
      (codeUnit >= 0x7f && codeUnit <= 0x9f) ||
      codeUnit === 0x2028 ||
      codeUnit === 0x2029
    ) {
      return true;
    }
  }
  return false;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function numericMagnitude(run: string): string {
  const significant = run.replace(/^0+/u, "");
  return significant === "" ? "0" : significant;
}

function compareNumericRuns(left: string, right: string): number {
  const leftMagnitude = numericMagnitude(left);
  const rightMagnitude = numericMagnitude(right);
  if (leftMagnitude.length !== rightMagnitude.length) {
    return leftMagnitude.length < rightMagnitude.length ? -1 : 1;
  }
  const magnitudeComparison = compareCodeUnits(leftMagnitude, rightMagnitude);
  if (magnitudeComparison !== 0) {
    return magnitudeComparison;
  }
  return left.length < right.length ? -1 : left.length > right.length ? 1 : 0;
}

/** Compare exact strings by deterministic JavaScript/Unicode code-unit order. */
export function compareAddressesLexicographic(
  left: string,
  right: string,
): number {
  return compareCodeUnits(left, right);
}

/** Compare alternating ASCII digit and non-digit runs without bounded numbers. */
export function compareAddressesNatural(left: string, right: string): number {
  const leftRuns = left.match(NATURAL_RUN_PATTERN) ?? [];
  const rightRuns = right.match(NATURAL_RUN_PATTERN) ?? [];
  const sharedLength = Math.min(leftRuns.length, rightRuns.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const leftRun = leftRuns[index];
    const rightRun = rightRuns[index];
    if (leftRun === undefined || rightRun === undefined) {
      continue;
    }
    const comparison = /^[0-9]/u.test(leftRun) && /^[0-9]/u.test(rightRun)
      ? compareNumericRuns(leftRun, rightRun)
      : compareCodeUnits(leftRun, rightRun);
    if (comparison !== 0) {
      return comparison;
    }
  }

  if (leftRuns.length !== rightRuns.length) {
    return leftRuns.length < rightRuns.length ? -1 : 1;
  }
  return compareCodeUnits(left, right);
}

export function addressComparatorFor(
  ordering: DeckOrdering,
): (left: string, right: string) => number {
  return ordering === "lexicographic"
    ? compareAddressesLexicographic
    : compareAddressesNatural;
}

/** Interpret a proper address prefix according to the selected Deck ordering. */
export function isInferredAddressAncestor(
  parent: string,
  candidate: string,
  ordering: DeckOrdering,
): boolean {
  if (
    parent === "" ||
    candidate.length <= parent.length ||
    !candidate.startsWith(parent)
  ) {
    return false;
  }
  if (ordering === "lexicographic") {
    return true;
  }
  const finalParentCharacter = parent[parent.length - 1] ?? "";
  const firstAppendedCharacter = candidate[parent.length] ?? "";
  return !(
    /^[0-9]$/u.test(finalParentCharacter) &&
    /^[0-9]$/u.test(firstAppendedCharacter)
  );
}

/** Deterministic vault-path comparison, independent of the host locale. */
export function compareVaultPaths(left: string, right: string): number {
  return compareCodeUnits(left, right);
}

export function cardComparatorFor<T extends AddressedPath>(
  ordering: DeckOrdering,
): (left: T, right: T) => number {
  const compareAddress = addressComparatorFor(ordering);
  return (left, right) => {
    const addressComparison = compareAddress(left.address, right.address);
    return addressComparison !== 0
      ? addressComparison
      : compareVaultPaths(left.path, right.path);
  };
}

/** Find the candidate's lower-bound position in an already ordered Deck. */
export function candidateInsertionIndex<T extends AddressedPath>(
  filed: readonly T[],
  candidate: AddressedPath,
  ordering: DeckOrdering,
): number {
  const compare = cardComparatorFor<AddressedPath>(ordering);
  let low = 0;
  let high = filed.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const card = filed[middle];
    if (card !== undefined && compare(card, candidate) < 0) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

export function validateAddress(address: string): AddressValidation {
  if (address === "") {
    return { valid: false, message: "Enter an address." };
  }
  if (address.trim() !== address) {
    return {
      valid: false,
      message: "Address has leading or trailing whitespace.",
    };
  }
  if (containsControlOrLineSeparator(address)) {
    return {
      valid: false,
      message: "Address must be one line without control characters.",
    };
  }
  return { valid: true, address };
}

export function normalizeAddressInput(input: string): AddressValidation {
  return validateAddress(input.trim());
}
