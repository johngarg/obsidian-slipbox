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

export { indexZettelMetadata } from "./zettel-metadata.js";

export { NavigationHistory } from "./navigation-history.js";
export {
  BOOKMARK_COLORS,
  createBookmark,
  deleteBookmark,
  normalizeBookmarks,
  updateBookmark,
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

export type { BookmarkColor, DeckBookmark } from "./bookmarks.js";
export type { DeskCardState } from "./desk-state.js";
