import type { TFile } from "obsidian";

import {
  InlineEditPathLock,
  type InlineEditCommitRequest,
  type InlineEditCommitResult,
  type InlineEditSessionSnapshot,
} from "./inline-edit-session.js";
import { NoteBodyConflictError, replaceNoteBodyIfUnchanged } from "./note-body.js";
import { preservesProtectedText } from "./paper-workflow.js";
import { pathIsAtOrBelow, renamePathReference } from "./path-reference.js";

export interface InlineEditStartData {
  readonly file: TFile;
  readonly body: string;
}

export interface DetachedInlineEditDraft {
  readonly path: string;
  readonly file: TFile;
  readonly returnTarget: import("./viewed-card.js").ViewedCardReturnTarget;
  readonly baseBody: string;
  readonly protectedBody: string | null;
  readonly draft: string;
  readonly conflictMessage: string | null;
  readonly conflictRetryable: boolean;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly textareaScrollTop: number;
  readonly renderedScrollTop: number;
}

export interface DetachedInlineEditPresentation {
  readonly returnTarget: import("./viewed-card.js").ViewedCardReturnTarget;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly textareaScrollTop: number;
  readonly renderedScrollTop: number;
}

export interface InlineEditOwner {
  finishInlineEditing(reason: string): Promise<boolean>;
}

export interface InlineEditRegistryEnvironment<Owner> {
  fileAtPath(path: string): TFile | null;
  read(file: TFile): Promise<string>;
  process(file: TFile, update: (source: string) => string): Promise<void>;
  contentStart(source: string): number;
  body(source: string, contentStart: number): string;
  flushOpenViews(path: string): Promise<void>;
  revealOwner(owner: Owner): Promise<void>;
  notify(message: string): void;
}

/** Coordinate exact-path edit ownership and drafts shared by every Deck view. */
export class InlineEditRegistry<Owner extends InlineEditOwner> {
  private readonly owners = new InlineEditPathLock<Owner>();
  private readonly detachedDrafts = new Map<string, DetachedInlineEditDraft>();

  constructor(
    private readonly environment: InlineEditRegistryEnvironment<Owner>,
  ) {}

  acquire(path: string, owner: Owner): boolean {
    const existing = this.owners.ownerAt(path);
    if (existing === owner) {
      return true;
    }
    if (existing !== undefined) {
      this.environment.notify(
        "This card is already being edited in another Slipbox Desk view.",
      );
      void this.environment.revealOwner(existing);
      return false;
    }
    if (this.detachedDrafts.has(path)) {
      this.environment.notify(
        "This card has an inline draft waiting to be restored in Slipbox Desk.",
      );
      return false;
    }
    return this.owners.acquire(path, owner);
  }

  release(path: string, owner: Owner): void {
    this.owners.release(path, owner);
  }

  rename(oldPath: string, newPath: string, owner: Owner): boolean {
    return this.owners.rename(oldPath, newPath, owner);
  }

  async prepare(file: TFile): Promise<InlineEditStartData> {
    await this.flushOpenViews(file.path);
    const latest = this.environment.fileAtPath(file.path);
    if (latest === null) {
      throw new Error("The card no longer exists.");
    }
    const source = await this.environment.read(latest);
    return {
      file: latest,
      body: this.environment.body(
        source,
        this.environment.contentStart(source),
      ),
    };
  }

  async commit(
    request: InlineEditCommitRequest,
  ): Promise<InlineEditCommitResult> {
    const file = this.environment.fileAtPath(request.path);
    if (file === null) {
      return {
        status: "conflict",
        message: "The card was deleted while it was being edited.",
      };
    }
    if (!preservesProtectedText(request.protectedBody, request.draft)) {
      return {
        status: "policy-violation",
        message: "Text present when editing began is protected.",
      };
    }
    try {
      await this.environment.process(file, (latest) =>
        replaceNoteBodyIfUnchanged(
          latest,
          this.environment.contentStart(latest),
          request.baseBody,
          request.draft,
        ));
    } catch (error) {
      if (error instanceof NoteBodyConflictError) {
        return {
          status: "conflict",
          message: "The note body changed elsewhere. Your inline draft was kept.",
        };
      }
      throw error;
    }
    return { status: "saved" };
  }

  flushOpenViews(path: string): Promise<void> {
    return this.environment.flushOpenViews(path);
  }

  retainDetached(
    snapshot: InlineEditSessionSnapshot,
    file: TFile,
    presentation: DetachedInlineEditPresentation,
  ): void {
    this.detachedDrafts.set(snapshot.path, {
      path: snapshot.path,
      file,
      baseBody: snapshot.baseBody,
      protectedBody: snapshot.protectedBody,
      draft: snapshot.draft,
      conflictMessage: snapshot.failure?.kind === "conflict"
        ? snapshot.failure.message
        : null,
      conflictRetryable: snapshot.conflictRetryable,
      ...presentation,
    });
  }

  takeDetached(): DetachedInlineEditDraft | null {
    for (const [path, draft] of this.detachedDrafts) {
      if (this.owners.ownerAt(path) !== undefined) {
        continue;
      }
      this.detachedDrafts.delete(path);
      return draft;
    }
    return null;
  }

  returnDetached(draft: DetachedInlineEditDraft): void {
    this.detachedDrafts.set(draft.path, draft);
  }

  async finishAll(reason: string): Promise<void> {
    await Promise.all(
      [...this.owners.ownerSet()].map((owner) =>
        owner.finishInlineEditing(reason)),
    );
  }

  handlePathDeletion(path: string): void {
    for (const [draftPath, draft] of this.detachedDrafts) {
      if (pathIsAtOrBelow(draftPath, path)) {
        this.detachedDrafts.set(draftPath, {
          ...draft,
          conflictMessage:
            "The card was deleted while it was being edited. Your draft was kept.",
          conflictRetryable: true,
        });
      }
    }
  }

  handlePathRename(oldPath: string, newPath: string): void {
    for (const [path, draft] of [...this.detachedDrafts]) {
      const renamedPath = renamePathReference(path, oldPath, newPath);
      if (renamedPath === path) {
        continue;
      }
      this.detachedDrafts.delete(path);
      const collision = this.detachedDrafts.has(renamedPath) ||
        this.owners.ownerAt(renamedPath) !== undefined;
      this.detachedDrafts.set(renamedPath, {
        ...draft,
        path: renamedPath,
        conflictMessage: collision
          ? "The renamed path is already held by another inline-edit session."
          : draft.conflictMessage,
        conflictRetryable: collision ? false : draft.conflictRetryable,
      });
    }
  }
}
