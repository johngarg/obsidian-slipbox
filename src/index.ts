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
export type { DeskCardState } from "./desk-state.js";
export type {
  BacklinkFit,
  ResolvedLinks,
} from "./backlinks.js";
