export {
  addressComparatorFor,
  candidateInsertionIndex,
  cardComparatorFor,
  compareAddressesLexicographic,
  compareAddressesNatural,
  compareVaultPaths,
  normalizeAddressInput,
  validateAddress,
} from "./address-order.js";
export type {
  AddressedPath,
  AddressValidation,
  DeckOrdering,
} from "./address-order.js";
export {
  buildFiledCardLookups,
  cardMetadataRecord,
  indexCardMetadata,
} from "./card-metadata.js";
export {
  createFilingPreview,
  filingPlacementMatches,
  filingPreviewFocusPath,
  initialFilingAddress,
} from "./filing-preview.js";
export {
  attachUnfiledAddressFiling,
  renderInlineFilingEditor,
  updateInlineFilingEditor,
} from "./filing-editor.js";
export { generateFiledCardLink } from "./card-links.js";
export { pathIsAtOrBelow, renamePathReference } from "./path-reference.js";
export { resolveCardTitle } from "./card-title.js";
export { canRunDeckAction, trayToggleLabel } from "./deck-actions.js";
export {
  advancePendingDeckCommand,
  findAddressInitialIndex,
  firstUnicodeCharacter,
  installPendingDeckCommandKeyCapture,
  startAddressCommand,
  startPileCommand,
} from "./deck-commands.js";
export {
  DEFAULT_DECK_CHROME_VISIBILITY,
  applyDeckChromeVisibility,
  deckMapIsVisible,
  toolbarIsVisible,
  toggleDeckMapVisibility,
  toggleToolbarVisibility,
} from "./deck-chrome.js";
export {
  buildDeckMapModel,
  buildDeckMapSectionMarkers,
  deckMapCoordinate,
  deckMapIndexAtOffset,
  visibleDeckMapSectionMarkers,
} from "./deck-map.js";
export {
  DECK_ACTION_DEFINITIONS,
  DEFAULT_SETTINGS,
  formatKeyBinding,
  keyBindingFromKeyboardEvent,
  keyBindingConflict,
  normalizeDeckKeybindings,
  normalizeFolderPath,
  normalizeSettings,
  settingsForPersistence,
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
  CardIssue,
  CardMetadataIndex,
  CardMetadataRecord,
  DuplicateAddressIssue,
  FiledCardRecord,
  InvalidCardIssue,
} from "./card-metadata.js";
export type {
  FilingPreview,
} from "./filing-preview.js";
export type {
  InlineFilingEditorActions,
  InlineFilingEditorElements,
  InlineFilingEditorState,
} from "./filing-editor.js";

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
  placeFiledCardInPileOrdinal,
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
  AddressInitialMode,
  AddressedDeckCard,
  PendingDeckCommand,
  PendingDeckCommandStep,
} from "./deck-commands.js";
export type { DeckChromeVisibility } from "./deck-chrome.js";
export type {
  DeckMapMarker,
  DeckMapModel,
  DeckMapSectionCard,
  DeckMapSectionMarker,
} from "./deck-map.js";
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
