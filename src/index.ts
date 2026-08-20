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
  buildFiledZettelLookups,
  compareFiledZettels,
  compareVaultPaths,
  indexZettelMetadata,
  zettelMetadataRecord,
} from "./zettel-metadata.js";
export { generateFiledCardLink } from "./zettel-links.js";
export { pathIsAtOrBelow, renamePathReference } from "./path-reference.js";
export { resolveCardTitle } from "./card-title.js";
export { canRunDeckAction, trayToggleLabel } from "./deck-actions.js";
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
  isPathBookmark,
  migrateAddressBookmarks,
  normalizeBookmarks,
  removeBookmarkPaths,
  renameBookmarkPaths,
} from "./bookmarks.js";
export {
  normalizeDeskCards,
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

export type {
  DeckBookmark,
  LegacyAddressBookmark,
  StoredBookmark,
} from "./bookmarks.js";
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
  setPilePosition,
  setPileExpanded,
  splitCardIntoNewPile,
  toggleFiledCard,
  trayContains,
  trayHasFiledCards,
  trayStackJitter,
} from "./tray-state.js";
export {
  isFileNode,
  layoutFilesOnCanvas,
  layoutLegacyDeskOnCanvas,
  normalizeCanvasPath,
  parseCanvasDocument,
  serializeCanvasDocument,
} from "./canvas-layout.js";
export type {
  CanvasDocument,
  CanvasFileNode,
  CanvasLayoutOptions,
  CanvasLayoutResult,
  CanvasNode,
  LegacyDeskCanvasCard,
} from "./canvas-layout.js";
export type {
  TrayCard,
  TrayCardCandidate,
  TrayCardKind,
  TrayPile,
  TrayPilePosition,
  TrayStackJitter,
  TrayState,
} from "./tray-state.js";
export type { DeskCardState } from "./desk-state.js";
export type { DeckActionContext } from "./deck-actions.js";
export type {
  CardSize,
  DeckAction,
  DeckHeaderButton,
  DeckKeyBinding,
  KeyModifier,
  SlipboxSettings,
  TitleSource,
} from "./settings.js";
export type {
  BacklinkFit,
  ResolvedLinks,
} from "./backlinks.js";
