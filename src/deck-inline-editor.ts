import { Notice, TFile } from "obsidian";
import type { DeckBookmark } from "./bookmarks.js";
import type { CardIndex } from "./card-index.js";
import type { CardService } from "./card-service.js";
import { setCardTooltip } from "./card-tooltip.js";
import type { DeskState } from "./desk-state.js";
import {
  inlineEditPresentationFingerprint,
  matchesInlineEditRefreshGuard,
  shouldFinishInlineEditFromPointerDown,
} from "./inline-edit-interactions.js";
import type {
  DetachedInlineEditDraft,
  InlineEditOwner,
  InlineEditRegistry,
} from "./inline-edit-registry.js";
import { InlineEditFinalizationCoordinator, InlineEditSessionController, type InlineEditFailure } from "./inline-edit-session.js";
import { attachPaperWorkflowTextarea } from "./paper-workflow-dom.js";
import {
  pathIsAtOrBelow,
  renamePathReference,
} from "./path-reference.js";
import {
  type SlipboxSettings,
} from "./settings.js";
import { errorMessage } from "./value-utils.js";
import type { ViewedCardSnapshot } from "./viewed-card.js";
import {
  type ViewedCardReturnTarget,
} from "./viewed-card.js";

interface InlineEditorEnvironment {
  readonly index: CardIndex;
  readonly cards: Pick<CardService, "title">;
  readonly registry: Pick<InlineEditRegistry<InlineEditOwner>, "prepare" | "commit" | "flushOpenViews" | "takeDetached" | "returnDetached" | "retainDetached">;
  settings(): SlipboxSettings;
  desk(): DeskState;
  bookmarks(): readonly DeckBookmark[];
  viewed(): ViewedCardSnapshot | null;
  isActive(): boolean;
  filingActive(): boolean;
  acquire(path: string): boolean;
  release(path: string): void;
  rename(oldPath: string, newPath: string): boolean;
  renamed(oldPath: string, newPath: string): void;
  suspendShortcuts(suspended: boolean): void;
  unloadMarkdown(): void;
  refresh(): Promise<void>;
  rerenderEdited(file: TFile, body: HTMLElement, scrollTop: number): Promise<void>;
  rerenderDesk(file: TFile): Promise<void>;
  refreshLinkMetadata(): void;
  focusAfterFinish(path: string): void;
  restoreSurface(draft: DetachedInlineEditDraft): Promise<HTMLElement | null>;
}

let inlineEditStatusSequence = 0;
interface MountedInlineEdit {
  readonly controller: InlineEditSessionController;
  file: TFile;
  readonly returnTarget: ViewedCardReturnTarget;
  readonly textarea: HTMLTextAreaElement;
  readonly statusEl: HTMLElement;
  policyStatusTimer: number | null;
  readonly bodyEl: HTMLElement;
  readonly cardEl: HTMLElement;
  readonly renderedScrollTop: number;
  readonly presentationFingerprint: string;
}

/** Own one mounted edit and its refresh policy; registry ownership stays with the view. */
export class DeckInlineEditor {
  private inlineEdit: MountedInlineEdit | null = null;
  private readonly inlineEditFinalization = new InlineEditFinalizationCoordinator();
  private inlineEditStarting = false;
  private startingPath: string | null = null;
  private renderRefreshDeferred = false;
  private inlineIndexRefreshDeferred = false;
  private recentInlineEditRefresh: { path: string; modified: number; presentationFingerprint: string; expiresAt: number; } | null = null;
  private focusFrame: number | null = null;
  private generation = 0;
  private disposed = false;

  constructor(private readonly environment: InlineEditorEnvironment) { }

  get isEditing(): boolean { return this.inlineEdit !== null; }
  get isStarting(): boolean { return this.inlineEditStarting; }
  get path(): string | null { return this.inlineEdit?.controller.snapshot.path ?? null; }
  get textarea(): HTMLTextAreaElement | null { return this.inlineEdit?.textarea ?? null; }

  onRefresh(reason: "full" | "index" | "ordering"): "render" | "defer" | "metadata" {
    if (this.inlineEdit !== null || this.inlineEditStarting) {
      const editing = this.inlineEdit;
      if (
        reason === "index" &&
        editing !== null &&
        editing.presentationFingerprint ===
        this.currentInlineEditPresentationFingerprint(
          editing.controller.snapshot.path,
        )
      ) {
        this.inlineIndexRefreshDeferred = true;
      } else {
        this.renderRefreshDeferred = true;
      }
      return "defer";
    }
    const recent = this.recentInlineEditRefresh;
    if (
      reason === "index" &&
      recent !== null &&
      matchesInlineEditRefreshGuard(
        recent,
        this.environment.index.fileAtPath(recent.path)?.stat.mtime ?? null,
        this.currentInlineEditPresentationFingerprint(recent.path),
      )
    ) {
      return "metadata";
    }
    this.recentInlineEditRefresh = null;
    return "render";
  }

  deferRendering(): boolean {
    if (!this.isEditing && !this.isStarting) return false;
    this.renderRefreshDeferred = true;
    return true;
  }

  private cancelFocus(): void {
    if (this.focusFrame !== null) this.inlineEdit?.textarea.win.cancelAnimationFrame(this.focusFrame);
    this.focusFrame = null;
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.cancelFocus();
    if (this.startingPath !== null) this.environment.release(this.startingPath);
    this.startingPath = null;
    this.inlineEditStarting = false;
    const editing = this.inlineEdit;
    if (editing !== null) {
      editing.controller.cancelDebounce();
      this.environment.registry.retainDetached(editing.controller.snapshot, editing.file, {
        returnTarget: editing.returnTarget,
        selectionStart: editing.textarea.selectionStart,
        selectionEnd: editing.textarea.selectionEnd,
        textareaScrollTop: editing.textarea.scrollTop,
        renderedScrollTop: editing.renderedScrollTop,
      });
      this.environment.release(editing.controller.snapshot.path);
      this.clearInlineEditPolicyMessage();
      this.inlineEdit = null;
    }
    this.environment.suspendShortcuts(false);
  }

  finish(reason: string): Promise<boolean> {
    return this.inlineEditFinalization.finish(
      reason,
      (reasons) => this.finishInlineEditingOnce(reasons),
    );
  }

  private async finishInlineEditingOnce(
    reasons: ReadonlySet<string>,
  ): Promise<boolean> {
    const editing = this.inlineEdit;
    if (editing === null) {
      return true;
    }
    const saved = await editing.controller.finish();
    if (this.disposed || this.inlineEdit !== editing) return saved;
    if (!saved) {
      this.applyInlineEditFailure(editing.controller.snapshot.failure);
      if (this.environment.isActive()) {
        editing.textarea.focus({ preventScroll: true });
      }
      return false;
    }

    const path = editing.controller.snapshot.path;
    const shouldSkipRender = ["view-close", "plugin-unload", "quit"]
      .some((reason) => reasons.has(reason));
    const presentationUnchanged = editing.presentationFingerprint ===
      this.currentInlineEditPresentationFingerprint(path);
    const requiresFullRefresh = this.renderRefreshDeferred ||
      (this.inlineIndexRefreshDeferred && !presentationUnchanged);
    const refreshBacklinks = this.inlineIndexRefreshDeferred &&
      presentationUnchanged;
    this.renderRefreshDeferred = false;
    this.inlineIndexRefreshDeferred = false;
    this.cancelFocus();
    this.clearInlineEditPolicyMessage();
    this.inlineEdit = null;
    this.environment.release(path);
    this.environment.suspendShortcuts(false);
    editing.cardEl.removeClass("is-inline-editing");
    editing.bodyEl.removeClasses([
      "is-inline-editing",
      "has-inline-edit-error",
    ]);

    if (!shouldSkipRender) {
      if (requiresFullRefresh) {
        this.recentInlineEditRefresh = null;
        await this.environment.refresh();
      } else {
        const modified = this.environment.index.fileAtPath(path)?.stat.mtime ??
          editing.file.stat.mtime;
        this.recentInlineEditRefresh = {
          path,
          modified,
          presentationFingerprint:
            this.currentInlineEditPresentationFingerprint(path),
          expiresAt: Date.now() + 2_000,
        };
        await this.environment.rerenderEdited(editing.file, editing.bodyEl, editing.renderedScrollTop);
        if (this.disposed) return true;
        await this.environment.rerenderDesk(editing.file);
        if (refreshBacklinks && !this.disposed) {
          this.environment.refreshLinkMetadata();
        }
      }
    }
    if (!this.disposed && reasons.has("escape")) this.environment.focusAfterFinish(path);
    return true;
  }

  async runAfter(
    reason: string,
    action: () => void | Promise<void>,
  ): Promise<boolean> {
    if (this.disposed || !(await this.finish(reason)) || this.disposed) return false;
    await action();
    return true;
  }

  async begin(
    file: TFile,
    bodySurface: HTMLElement | null,
    restored?: {
      readonly baseBody: string;
      readonly protectedBody: string | null;
      readonly draft: string;
      readonly conflictMessage: string | null;
      readonly conflictRetryable: boolean;
      readonly selectionStart: number;
      readonly selectionEnd: number;
      readonly textareaScrollTop: number;
      readonly renderedScrollTop: number;
    },
  ): Promise<void> {
    if (this.environment.filingActive()) {
      new Notice("Finish filing before editing a card body.");
      return;
    }
    if (this.disposed || this.inlineEditStarting) {
      return;
    }
    if (this.inlineEdit !== null) {
      if (this.inlineEdit.controller.snapshot.path === file.path) {
        this.inlineEdit.textarea.focus({ preventScroll: true });
        return;
      }
      if (!(await this.finish("start-another-editor"))) {
        return;
      }
    }
    if (this.disposed || this.inlineEditStarting || !this.environment.acquire(file.path)) {
      return;
    }

    this.inlineEditStarting = true;
    this.startingPath = file.path;
    const generation = this.generation;
    try {
      const prepared = restored === undefined
        ? await this.environment.registry.prepare(file)
        : { file, body: restored.baseBody };
      if (generation !== this.generation) return;
      const protectedBody = restored === undefined
        ? this.environment.settings().protectFiledCardText &&
          this.environment.index.filedByFile(prepared.file) !== undefined
          ? prepared.body
          : null
        : restored.protectedBody;
      const mounted = this.mountInlineEditing(
        prepared.file,
        prepared.body,
        protectedBody,
        bodySurface,
        restored?.renderedScrollTop,
      );
      this.inlineEdit = mounted;
      if (restored !== undefined && restored.draft !== restored.baseBody) {
        mounted.textarea.value = restored.draft;
        mounted.controller.updateDraft(restored.draft);
      }
      if (restored !== undefined) {
        mounted.textarea.scrollTop = restored.textareaScrollTop;
      }
      if (restored?.conflictMessage !== null && restored?.conflictMessage !== undefined) {
        mounted.controller.markConflict(
          restored.conflictMessage,
          restored.conflictRetryable,
        );
        this.applyInlineEditFailure(mounted.controller.snapshot.failure);
      }
      this.environment.suspendShortcuts(true);
      this.focusFrame = mounted.textarea.win.requestAnimationFrame(() => {
        this.focusFrame = null;
        if (this.inlineEdit === mounted) {
          mounted.textarea.focus({ preventScroll: true });
          mounted.textarea.setSelectionRange(
            restored?.selectionStart ?? mounted.textarea.value.length,
            restored?.selectionEnd ?? mounted.textarea.value.length,
          );
          if (restored !== undefined) {
            mounted.textarea.scrollTop = restored.textareaScrollTop;
          }
        }
      });
    } catch (error) {
      if (generation !== this.generation) return;
      this.environment.release(file.path);
      new Notice(`Could not start inline editing: ${errorMessage(error)}`);
    } finally {
      if (generation === this.generation) {
        this.inlineEditStarting = false;
        this.startingPath = null;
      }
    }
  }

  private mountInlineEditing(
    file: TFile,
    baseBody: string,
    protectedBody: string | null,
    requestedBodySurface: HTMLElement | null,
    restoredRenderedScrollTop?: number,
  ): MountedInlineEdit {
    const viewed = this.environment.viewed();
    const returnTarget = viewed?.path === file.path
      ? viewed.returnTarget
      : null;
    const bodyEl = requestedBodySurface;
    const cardEl = bodyEl?.closest<HTMLElement>(".slipbox-card") ?? null;
    if (returnTarget === null || bodyEl === null || cardEl === null) {
      throw new Error("The viewed card surface is unavailable");
    }

    const renderedScrollTop = restoredRenderedScrollTop ?? bodyEl.scrollTop;
    this.environment.unloadMarkdown();
    bodyEl.empty();
    bodyEl.removeClass("markdown-rendered");
    bodyEl.addClass("is-inline-editing");
    cardEl.addClass("is-inline-editing");
    const textarea = bodyEl.createEl("textarea", {
      cls: "slipbox-inline-editor",
      attr: {
        spellcheck: "true",
      },
    });
    setCardTooltip(
      textarea,
      `Edit raw Markdown for ${this.environment.cards.title(file)}`,
      this.environment.settings().showTooltips,
      { placement: "bottom", delay: 250 },
    );
    textarea.value = baseBody;
    const statusId = `slipbox-inline-edit-status-${++inlineEditStatusSequence}`;
    textarea.setAttr("aria-errormessage", statusId);
    const statusEl = bodyEl.createDiv({
      cls: "slipbox-inline-edit-status",
      attr: {
        id: statusId,
        role: "status",
        "aria-live": "assertive",
      },
    });
    statusEl.hidden = true;

    const controller = new InlineEditSessionController(
      file.path,
      baseBody,
      {
        commit: async (request) => {
          const result = await this.environment.registry.commit(request);
          if (!this.disposed && result.status === "saved" && !request.final) {
            const latestFile = this.environment.index.fileAtPath(request.path) ?? file;
            await this.environment.rerenderDesk(latestFile);
          }
          return result;
        },
        flushOpenViews: (path) => this.environment.registry.flushOpenViews(path),
        schedule: (callback, delayMs) => textarea.win.setTimeout(callback, delayMs),
        cancelScheduled: (handle) => textarea.win.clearTimeout(handle as number),
        reportFailure: (failure) => this.reportInlineEditFailure(failure),
      },
      protectedBody,
    );
    attachPaperWorkflowTextarea(textarea, {
      restrictPaste: this.environment.settings().restrictViewedCardPaste,
      acceptsDraft: (draft) => controller.acceptsDraft(draft),
      updateDraft: (draft) => controller.updateDraft(draft),
      currentDraft: () => controller.snapshot.draft,
      accepted: () => {
        if (controller.snapshot.phase !== "conflict") {
          this.clearInlineEditPolicyMessage();
          bodyEl.removeClass("has-inline-edit-error");
          textarea.removeAttribute("aria-invalid");
          statusEl.hidden = true;
          statusEl.setText("");
        }
      },
      message: (message) => this.showInlineEditPolicyMessage(message),
    });
    textarea.addEventListener("pointerdown", (event) => event.stopPropagation());
    textarea.addEventListener("click", (event) => event.stopPropagation());

    return {
      controller,
      file,
      returnTarget,
      textarea,
      statusEl,
      policyStatusTimer: null,
      bodyEl,
      cardEl,
      renderedScrollTop,
      presentationFingerprint:
        this.currentInlineEditPresentationFingerprint(file.path),
    };
  }

  handlePointerDown(event: PointerEvent): void {
    const editing = this.inlineEdit;
    if (editing === null) {
      return;
    }
    if (!shouldFinishInlineEditFromPointerDown(
      event.target,
      editing.textarea,
      editing.cardEl,
    )) {
      return;
    }
    void this.finish("outside-pointer");
  }

  private currentInlineEditPresentationFingerprint(path: string): string {
    const snapshot = this.environment.index.snapshot;
    return inlineEditPresentationFingerprint({
      editingPath: path,
      cards: [
        ...snapshot.filed.map((card) => ({
          path: card.path,
          modified: card.file.stat.mtime,
          presentation: [
            "filed",
            card.address,
            this.environment.cards.title(card.file),
          ],
        })),
        ...snapshot.unfiled.map((file) => ({
          path: file.path,
          modified: file.stat.mtime,
          presentation: ["unfiled", this.environment.cards.title(file)],
        })),
      ],
      context: {
        issues: snapshot.issues,
        desk: this.environment.desk(),
        settings: this.environment.settings(),
        bookmarks: this.environment.bookmarks(),
      },
    });
  }

  private reportInlineEditFailure(failure: InlineEditFailure): void {
    if (this.disposed) return;
    if (failure.kind === "policy") {
      this.showInlineEditPolicyMessage(failure.message);
      return;
    }
    this.applyInlineEditFailure(failure);
    const detail = failure.error === undefined
      ? failure.message
      : `${failure.message} ${errorMessage(failure.error)}`;
    new Notice(`${detail} Your draft remains in the card and can be copied.`);
  }

  private applyInlineEditFailure(failure: InlineEditFailure | null): void {
    const editing = this.inlineEdit;
    if (editing === null || failure === null) {
      return;
    }
    if (failure.kind === "policy") {
      this.showInlineEditPolicyMessage(failure.message);
      return;
    }
    this.clearInlineEditPolicyMessage();
    editing.bodyEl.addClass("has-inline-edit-error");
    editing.textarea.setAttr("aria-invalid", "true");
    editing.statusEl.setText(failure.message);
    editing.statusEl.hidden = false;
  }

  private showInlineEditPolicyMessage(message: string): void {
    const editing = this.inlineEdit;
    if (editing === null) {
      return;
    }
    const failure = editing.controller.snapshot.failure;
    if (failure !== null && failure.kind !== "policy") {
      return;
    }
    if (editing.policyStatusTimer !== null) {
      editing.textarea.win.clearTimeout(editing.policyStatusTimer);
    }
    editing.statusEl.addClass("is-policy-message");
    editing.statusEl.setAttr("aria-live", "polite");
    editing.statusEl.setText(message);
    editing.statusEl.hidden = false;
    editing.policyStatusTimer = editing.textarea.win.setTimeout(() => {
      if (this.inlineEdit === editing) {
        this.clearInlineEditPolicyMessage();
      }
    }, 2_000);
  }

  private clearInlineEditPolicyMessage(): void {
    const editing = this.inlineEdit;
    if (editing === null) {
      return;
    }
    if (editing.policyStatusTimer !== null) {
      editing.textarea.win.clearTimeout(editing.policyStatusTimer);
      editing.policyStatusTimer = null;
    }
    if (!editing.statusEl.hasClass("is-policy-message")) {
      return;
    }
    editing.statusEl.removeClass("is-policy-message");
    editing.statusEl.setAttr("aria-live", "assertive");
    editing.statusEl.setText("");
    editing.statusEl.hidden = true;
  }

  async restoreDetached(): Promise<void> {
    if (this.disposed) return;
    const draft = this.environment.registry.takeDetached();
    if (draft === null) {
      return;
    }
    const file = this.environment.index.fileAtPath(draft.path) ?? draft.file;
    const surface = await this.environment.restoreSurface(draft);
    await this.begin(file, surface, {
      baseBody: draft.baseBody,
      protectedBody: draft.protectedBody,
      draft: draft.draft,
      conflictMessage: draft.conflictMessage,
      conflictRetryable: draft.conflictRetryable,
      selectionStart: draft.selectionStart,
      selectionEnd: draft.selectionEnd,
      textareaScrollTop: draft.textareaScrollTop,
      renderedScrollTop: draft.renderedScrollTop,
    });
    if (this.inlineEdit?.controller.snapshot.path !== draft.path) {
      this.environment.registry.returnDetached(draft);
    }
  }

  handlePathRename(oldPath: string, newPath: string): void {
    const editing = this.inlineEdit;
    const editingPath = editing?.controller.snapshot.path ?? null;
    const renamedEditingPath = editingPath === null
      ? null
      : renamePathReference(editingPath, oldPath, newPath);
    if (
      editing !== null &&
      editingPath !== null &&
      renamedEditingPath !== null &&
      renamedEditingPath !== editingPath
    ) {
      if (!this.environment.rename(editingPath, renamedEditingPath)) {
        editing.controller.markConflict(
          "The renamed path is already being edited in another Slipbox Desk view.",
        );
        this.applyInlineEditFailure(editing.controller.snapshot.failure);
      } else {
        editing.controller.renamePath(renamedEditingPath);
        const renamed = this.environment.index.fileAtPath(renamedEditingPath);
        if (renamed !== undefined) {
          editing.file = renamed;
        }
        editing.cardEl.dataset.path = renamedEditingPath;
        this.environment.renamed(editingPath, renamedEditingPath);
      }
    }
  }

  handlePathDeletion(deletedPath: string): void {
    const editingPath = this.inlineEdit?.controller.snapshot.path ?? null;
    if (editingPath !== null && pathIsAtOrBelow(editingPath, deletedPath)) {
      this.inlineEdit?.controller.markConflict(
        "The card was deleted while it was being edited. Your draft was kept.",
        true,
      );
      this.applyInlineEditFailure(this.inlineEdit?.controller.snapshot.failure ?? null);
    }
  }
}
