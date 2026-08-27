import type { DeckOrdering } from "./address-order.js";
import type { DuplicateAddressPolicy } from "./card-metadata.js";
import type { SlipboxSettings } from "./settings.js";

export interface CardIndexConfig {
  readonly addressProperty: string;
  readonly ordering: DeckOrdering;
  readonly duplicatePolicy: DuplicateAddressPolicy;
  readonly explicitBranchLinks: boolean;
  readonly branchLinkMarker: string;
  readonly inferAddressBranches: boolean;
}

export type CardIndexConfigChange = "unchanged" | "index" | "ordering";

export function cardIndexConfig(settings: SlipboxSettings): CardIndexConfig {
  return {
    addressProperty: settings.addressProperty,
    ordering: settings.deckOrdering,
    duplicatePolicy: settings.duplicateAddresses,
    explicitBranchLinks: settings.explicitBranchLinks,
    branchLinkMarker: settings.branchLinkMarker,
    inferAddressBranches: settings.inferAddressBranches,
  };
}

export function cardIndexConfigChange(
  previous: CardIndexConfig,
  next: CardIndexConfig,
): CardIndexConfigChange {
  // Ordering refreshes reset Deck viewport offsets, so they take precedence.
  if (previous.ordering !== next.ordering) {
    return "ordering";
  }
  const keys = Object.keys(previous) as (keyof CardIndexConfig)[];
  return keys.some((key) => previous[key] !== next[key])
    ? "index"
    : "unchanged";
}
