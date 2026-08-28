import {
  createBookmark,
  deleteBookmark,
  removeBookmarkPaths,
  renameBookmarkPaths,
  type DeckBookmark,
} from "./bookmarks.js";
import type { PluginDataWriteResult } from "./plugin-data-writer.js";

export interface BookmarkServiceEnvironment {
  isAvailable(path: string): boolean;
  label(path: string): string;
  changed(bookmarks: readonly DeckBookmark[]): void;
  persist(): Promise<PluginDataWriteResult>;
  notify(message: string): void;
}

/** Own path-based bookmarks and their persistence feedback. */
export class BookmarkService {
  private current: readonly DeckBookmark[];

  constructor(
    bookmarks: readonly DeckBookmark[],
    private readonly environment: BookmarkServiceEnvironment,
  ) {
    this.current = bookmarks;
  }

  get items(): readonly DeckBookmark[] {
    return this.current;
  }

  at(path: string): DeckBookmark | undefined {
    return this.current.find((bookmark) => bookmark.path === path);
  }

  async add(path: string): Promise<void> {
    if (!this.environment.isAvailable(path)) {
      this.environment.notify("Only an available filed card can be bookmarked.");
      return;
    }
    const label = this.environment.label(path);
    if (this.at(path) !== undefined) {
      this.environment.notify(`${label} already has a bookmark.`);
      return;
    }
    this.replace(createBookmark(this.current, path));
    if (await this.environment.persist() === "saved") {
      this.environment.notify(`Bookmarked ${label}.`);
    }
  }

  async remove(path: string): Promise<void> {
    if (this.at(path) === undefined) {
      return;
    }
    const label = this.environment.label(path);
    this.replace(deleteBookmark(this.current, path));
    if (await this.environment.persist() === "saved") {
      this.environment.notify(`Deleted bookmark at ${label}.`);
    }
  }

  async toggle(path: string): Promise<void> {
    if (this.at(path) === undefined) {
      await this.add(path);
    } else {
      await this.remove(path);
    }
  }

  async handlePathDeletion(path: string): Promise<void> {
    const next = removeBookmarkPaths(this.current, path);
    if (next.length !== this.current.length) {
      this.replace(next);
      await this.environment.persist();
    }
  }

  async handlePathRename(oldPath: string, newPath: string): Promise<void> {
    const next = renameBookmarkPaths(this.current, oldPath, newPath);
    if (next.some((bookmark, index) => bookmark.path !== this.current[index]?.path)) {
      this.replace(next);
      await this.environment.persist();
    }
  }

  private replace(bookmarks: readonly DeckBookmark[]): void {
    this.current = bookmarks;
    this.environment.changed(bookmarks);
  }
}
