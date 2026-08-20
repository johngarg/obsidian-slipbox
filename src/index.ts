export {
  ZettelIdError,
  compareZettelIds,
  formatZettelId,
  generateFiledId,
  generateNextSectionId,
  incrementAlphaToken,
  isValidZettelId,
  parseZettelId,
} from "./zettel-id.js";

export type {
  AlphaToken,
  NumericToken,
  ParsedZettelId,
  PathToken,
} from "./zettel-id.js";

export {
  indexZettelMetadata,
  zettelMetadataRecord,
} from "./zettel-metadata.js";
export { generateFiledCardLink } from "./zettel-links.js";
export { resolveCardTitle } from "./card-title.js";
export { canRunDeckAction } from "./deck-actions.js";
export {
  DECK_ACTION_DEFINITIONS,
  DEFAULT_SETTINGS,
  formatKeyBinding,
  keyBindingConflict,
  normalizeDeckKeybindings,
  normalizeFolderPath,
  normalizeSettings,
} from "./settings.js";
export {
  fitBacklinkPrefix,
  indexFiledBacklinks,
} from "./backlinks.js";

export { NavigationHistory } from "./navigation-history.js";
export {
  createBookmark,
  deleteBookmark,
  normalizeBookmarks,
} from "./bookmarks.js";
export {
  addDeskCard,
  bringDeskCardToFront,
  moveDeskCard,
  normalizeDeskCards,
  removeDeskCard,
  removeDeskPath,
  renameDeskCard,
} from "./desk-state.js";

export type {
  DuplicateZettelIssue,
  FiledZettelRecord,
  InvalidZettelIssue,
  ZettelIssue,
  ZettelMetadataIndex,
  ZettelMetadataRecord,
} from "./zettel-metadata.js";

export type { DeckBookmark } from "./bookmarks.js";
export {
  EMPTY_TRAY,
  addUniqueCardToPile,
  cardPosition,
  clearFiledCardsFromPile,
  clearFiledCardsFromTray,
  createPile,
  initialTrayFromUnfiled,
  insertionIndexForPoint,
  mergePiles,
  moveCardBetweenPiles,
  moveCardWithinPile,
  pruneTrayCards,
  reconcileTray,
  removeCard,
  removeEmptyPiles,
  removeTrayPath,
  renameTrayPath,
  reorderPiles,
  setExpandedPile,
  splitCardIntoNewPile,
  toggleFiledCard,
  trayContains,
} from "./tray-state.js";
export type {
  TrayCard,
  TrayCardCandidate,
  TrayCardKind,
  TrayPile,
  TrayState,
} from "./tray-state.js";
export type { DeskCardState } from "./desk-state.js";
export type { DeckActionContext } from "./deck-actions.js";
export type {
  DeckAction,
  DeckHeaderButton,
  DeckKeyBinding,
  DeskHeaderButton,
  KeyModifier,
  SlipboxSettings,
  TitleSource,
} from "./settings.js";
export type {
  BacklinkFit,
  ResolvedLinks,
} from "./backlinks.js";
