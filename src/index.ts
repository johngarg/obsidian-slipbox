export {
  addressComparatorFor,
  candidateInsertionIndex,
  cardComparatorFor,
  compareAddressesLexicographic,
  compareAddressesNatural,
  compareVaultPaths,
  isInferredAddressAncestor,
  normalizeAddressInput,
  validateAddress,
} from "./address-order.js";
export {
  EMPTY_EXPLICIT_BRANCH_INDEX,
  explicitBranchLabel,
  indexExplicitBranches,
} from "./branch-links.js";
export type {
  BranchLinkReference,
  ExplicitBranch,
  ExplicitBranchIndex,
  ExplicitBranchSource,
} from "./branch-links.js";
export {
  EMPTY_INFERRED_STRUCTURE,
  inferredChildAddresses,
  inferredNextSiblingAddresses,
  inferredParentAddress,
  inferredPreviousSiblingAddresses,
  buildInferredStructure,
  cycleBackwardInferredSiblingAddress,
  cycleForwardInferredSiblingAddress,
} from "./inferred-structure.js";
export type {
  InferredAddressNode,
  InferredStructureIndex,
} from "./inferred-structure.js";
export type {
  InferredNavigationRelations,
  InferredNavigationTarget,
} from "./card-index.js";
export { InferredNavigationManager } from "./inferred-navigation.js";
export type {
  InferredNavigationEnvironment,
  InferredNavigationRenderOptions,
} from "./inferred-navigation.js";
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
export { CardSignatureManager } from "./card-signature.js";
export type {
  CardSignatureBranch,
  CardSignatureEnvironment,
  CardSignatureOverflowItem,
  CardSignatureRenderOptions,
} from "./card-signature.js";
export { deleteCardWithConfirmation } from "./card-deletion.js";
export type { CardDeletionFileManager } from "./card-deletion.js";
export {
  buildFiledCardLookups,
  cardMetadataRecord,
  indexCardMetadata,
  issueListDescription,
  issueStatusSummary,
} from "./card-metadata.js";
export type {
  DuplicateAddressPolicy,
  IssueStatusSummary,
} from "./card-metadata.js";
export {
  createFilingPreview,
  duplicateFilingMessage,
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
export { canRunDeckAction, deskToggleLabel } from "./deck-actions.js";
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
  branchLinkMarkerError,
  formatKeyBinding,
  keyBindingFromKeyboardEvent,
  keyBindingConflict,
  normalizeDeckKeybindings,
  normalizeCardHeaderButtons,
  normalizeCardSpread,
  normalizeBranchLinkMarker,
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
  normalizeLegacyDeskCards,
  removeLegacyDeskPath,
  renameLegacyDeskCard,
} from "./legacy-desk-state.js";

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
  EMPTY_DESK,
  addUniqueCardToPile,
  cardPosition,
  collapseAllPiles,
  clearFiledCardsFromPile,
  clearFiledCardsFromDesk,
  createPile,
  cyclePileTopCard,
  initialDeskFromUnfiled,
  insertionIndexForPoint,
  mergePiles,
  moveCardBetweenPiles,
  moveCardWithinPile,
  movePileToOrdinalBoundary,
  placeFiledCardInPileOrdinal,
  pruneDeskCards,
  reconcileDesk,
  removeCard,
  removeEmptyPiles,
  removeDeskPath,
  renameDeskPath,
  reorderPiles,
  setPilePosition,
  setPileExpanded,
  splitCardIntoNewPile,
  toggleFiledCard,
  deskContains,
  deskHasFiledCards,
  deskStackJitter,
} from "./desk-state.js";

/** @deprecated Use the Desk-named exports from desk-state instead. */
export {
  EMPTY_DESK as EMPTY_TRAY,
  clearFiledCardsFromDesk as clearFiledCardsFromTray,
  initialDeskFromUnfiled as initialTrayFromUnfiled,
  pruneDeskCards as pruneTrayCards,
  reconcileDesk as reconcileTray,
  removeDeskPath as removeTrayPath,
  renameDeskPath as renameTrayPath,
  deskContains as trayContains,
  deskHasFiledCards as trayHasFiledCards,
  deskStackJitter as trayStackJitter,
} from "./desk-state.js";
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
  DeskCard,
  DeskCardCandidate,
  DeskCardKind,
  DeskPile,
  DeskPilePosition,
  DeskStackJitter,
  DeskState,
} from "./desk-state.js";
/** @deprecated Use the Desk-named types from desk-state instead. */
export type {
  DeskCard as TrayCard,
  DeskCardCandidate as TrayCardCandidate,
  DeskCardKind as TrayCardKind,
  DeskPile as TrayPile,
  DeskPilePosition as TrayPilePosition,
  DeskStackJitter as TrayStackJitter,
  DeskState as TrayState,
} from "./desk-state.js";
export type { LegacyDeskCardState } from "./legacy-desk-state.js";
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
