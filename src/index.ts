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
  renderCardAddress,
  UNFILED_ADDRESS_LABEL,
} from "./card-address.js";
export type { CardAddressOptions } from "./card-address.js";
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
export {
  buildCardLinkSuggestions,
  matchCardLinkSuggestions,
} from "./card-link-suggestions.js";
export { modalChoice } from "./modal-choice.js";
export type { ModalChoice } from "./modal-choice.js";
export type {
  CardLinkCandidate,
  CardLinkSuggestion,
} from "./card-link-suggestions.js";
export { replaceNoteBody, splitNoteBody } from "./note-body.js";
export type { NoteBodyParts } from "./note-body.js";
export { pathIsAtOrBelow, renamePathReference } from "./path-reference.js";
export { resolveCardTitle } from "./card-title.js";
export { canRunDeckAction, trayToggleLabel } from "./deck-actions.js";
export {
  cyclePileFocusTarget,
  rememberPileFocus,
  swapPileFocusTarget,
  wrappedPileCardNeighbour,
} from "./pile-navigation.js";
export {
  CARD_BUTTON_DEFINITIONS,
  CARD_BUTTON_ORDER,
  applicableCardHeaderActions,
  cardHeaderActionPresentation,
  cardHeaderButtonDefinitionsForSurface,
  cardHeaderVisibleActionCount,
  enabledCardHeaderActions,
} from "./card-header-actions.js";
export {
  advancePendingDeckCommand,
  findAddressInitialIndex,
  firstUnicodeCharacter,
  installPendingDeckCommandKeyCapture,
  startAddressCommand,
  startPileCommand,
} from "./deck-commands.js";
export {
  DEFAULT_DECK_MAP_VISIBILITY,
  applyDeckMapVisibility,
  deckMapIsVisible,
  toggleDeckMapVisibility,
} from "./deck-chrome.js";
export {
  buildDeckMapModel,
  buildDeckMapSectionMarkers,
  deckMapCoordinate,
  deckMapIndexAtOffset,
  sampleDeckMapIndices,
  visibleDeckMapSectionMarkers,
} from "./deck-map.js";
export {
  DECK_ACTION_DEFINITIONS,
  SLIPBOX_ACTION_DEFINITIONS,
  CARD_HEADER_BUTTON_ACTIONS,
  DEFAULT_CARD_HEADER_BUTTONS,
  DEFAULT_CARD_SPREAD,
  MAX_CARD_SPREAD,
  MIN_CARD_SPREAD,
  DEFAULT_SETTINGS,
  formatKeyBinding,
  keyBindingFromKeyboardEvent,
  keyBindingConflict,
  normalizeDeckKeybindings,
  normalizeCardHeaderButtons,
  normalizeCardSpread,
  normalizeFolderPath,
  normalizeSettings,
  settingsForPersistence,
} from "./settings.js";
export {
  cardFocusDeleted,
  deckCardFocus,
  deskCardFocus,
  moveDeckFocusWithAnchor,
  redirectViewedCardGhostFocus,
  renameCardFocus,
  viewedCardFocus,
} from "./card-focus.js";
export {
  fitBacklinkPrefix,
  fitMeasuredBacklinkPrefix,
  indexFiledBacklinks,
} from "./backlinks.js";

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
  collapseAllPiles,
  clearFiledCardsFromPile,
  clearFiledCardsFromTray,
  createPile,
  cyclePileTopCard,
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
  NavigablePile,
  PileFocusLocation,
  PileNavigationDirection,
} from "./pile-navigation.js";
export type {
  AddressedDeckCard,
  PendingDeckCommand,
  PendingDeckCommandStep,
} from "./deck-commands.js";
export type { DeckMapVisibility } from "./deck-chrome.js";
export type {
  DeckMapMarker,
  DeckMapModel,
  DeckMapSectionCard,
  DeckMapSectionMarker,
} from "./deck-map.js";
export type {
  CardSize,
  CardButtonSurface,
  CardHeaderButtonAction,
  CardHeaderButtonSettings,
  DeckAction,
  DeckHeaderButton,
  DeckKeyBinding,
  KeyModifier,
  SlipboxAction,
  SlipboxActionDefinition,
  SlipboxActionScope,
  SlipboxActionTarget,
  SlipboxSettings,
  TitleSource,
} from "./settings.js";
export type {
  CardHeaderActionContext,
  CardHeaderActionPresentation,
  CardHeaderButtonDefinition,
} from "./card-header-actions.js";
export type { CardFocus, CardFocusSurface } from "./card-focus.js";
export type {
  BacklinkFit,
  ResolvedLinks,
} from "./backlinks.js";
