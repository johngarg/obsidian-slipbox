import type { DeckOrdering } from "./address-order.js";
import type { DuplicateAddressPolicy } from "./card-metadata.js";
import {
  CARD_HEADER_BUTTON_ACTIONS,
  SLIPBOX_ACTION_DEFINITIONS,
  type CardButtonSurface,
  type DeckKeyBinding,
  type SlipboxSettings,
} from "./settings.js";

export interface CardIndexConfig {
  readonly addressProperty: string;
  readonly ordering: DeckOrdering;
  readonly duplicatePolicy: DuplicateAddressPolicy;
  readonly explicitBranchLinks: boolean;
  readonly inferAddressBranches: boolean;
}

export type CardIndexConfigChange = "unchanged" | "index" | "ordering";

export type SettingsRefreshImpact =
  | "none"
  | "branch-presentation"
  | "index"
  | "ordering"
  | "full";

export function cardIndexConfig(settings: SlipboxSettings): CardIndexConfig {
  return {
    addressProperty: settings.addressProperty,
    ordering: settings.deckOrdering,
    duplicatePolicy: settings.duplicateAddresses,
    explicitBranchLinks: settings.explicitBranchLinks,
    inferAddressBranches: settings.inferAddressBranches,
  };
}

const CARD_BUTTON_SURFACES: readonly CardButtonSurface[] = [
  "deck",
  "desk",
  "viewed",
];

function bindingsEqual(
  left: readonly DeckKeyBinding[],
  right: readonly DeckKeyBinding[],
): boolean {
  return left.length === right.length && left.every((binding, index) => {
    const other = right[index];
    return other !== undefined &&
      binding.key === other.key &&
      binding.modifiers.length === other.modifiers.length &&
      binding.modifiers.every((modifier, modifierIndex) =>
        modifier === other.modifiers[modifierIndex]);
  });
}

function nonPresentationSettingsEqual(
  left: SlipboxSettings,
  right: SlipboxSettings,
): boolean {
  return left.titleSource === right.titleSource &&
    left.titleProperty === right.titleProperty &&
    left.mainCardSize === right.mainCardSize &&
    left.deskCardSize === right.deskCardSize &&
    left.newCardFolder === right.newCardFolder &&
    left.newNoteTimestampFormat === right.newNoteTimestampFormat &&
    left.showTitleInDeck === right.showTitleInDeck &&
    left.showTooltips === right.showTooltips &&
    left.showDeckMap === right.showDeckMap &&
    left.restrictViewedCardPaste === right.restrictViewedCardPaste &&
    left.previewLinksOnHover === right.previewLinksOnHover &&
    left.followLinksFromCards === right.followLinksFromCards &&
    left.protectFiledCardText === right.protectFiledCardText &&
    left.showAutomaticBacklinks === right.showAutomaticBacklinks &&
    left.allowCardScrolling === right.allowCardScrolling &&
    left.cardSpread === right.cardSpread &&
    CARD_BUTTON_SURFACES.every((surface) =>
      CARD_HEADER_BUTTON_ACTIONS.every((action) =>
        left.cardHeaderButtons[surface][action] ===
          right.cardHeaderButtons[surface][action])) &&
    SLIPBOX_ACTION_DEFINITIONS.every((definition) => bindingsEqual(
      left.deckKeybindings[definition.id],
      right.deckKeybindings[definition.id],
    ));
}

export function settingsRefreshImpact(
  previous: SlipboxSettings,
  next: SlipboxSettings,
): SettingsRefreshImpact {
  const indexChange = cardIndexConfigChange(
    cardIndexConfig(previous),
    cardIndexConfig(next),
  );
  if (indexChange !== "unchanged") {
    return indexChange;
  }
  const branchPresentationChanged =
    previous.emphasiseBranchLinks !== next.emphasiseBranchLinks ||
    previous.hideBranchLinkMarkers !== next.hideBranchLinkMarkers ||
    previous.showBranchLabels !== next.showBranchLabels ||
    previous.showInferredBranchNavigation !== next.showInferredBranchNavigation;
  if (branchPresentationChanged && nonPresentationSettingsEqual(previous, next)) {
    return "branch-presentation";
  }
  return branchPresentationChanged || !nonPresentationSettingsEqual(previous, next)
    ? "full"
    : "none";
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
