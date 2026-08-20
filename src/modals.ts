import { App, Modal, Notice, setIcon } from "obsidian";

import {
  BOOKMARK_COLORS,
  type BookmarkColor,
  type DeckBookmark,
} from "./bookmarks.js";
import type { EntryPoint } from "./plugin-state.js";
import type { FiledZettel, VaultZettelIndex } from "./zettel-index.js";

export class TextPromptModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly heading: string,
    private readonly placeholder: string,
    private readonly initialValue: string,
    private readonly resolveValue: (value: string | null) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("zk-modal");
    contentEl.createEl("h2", { text: this.heading });

    const form = contentEl.createEl("form", { cls: "zk-prompt-form" });
    const input = form.createEl("input", {
      type: "text",
      placeholder: this.placeholder,
      value: this.initialValue,
    });
    input.required = true;

    const actions = form.createDiv({ cls: "zk-modal-actions" });
    const cancel = actions.createEl("button", { text: "Cancel", type: "button" });
    const submit = actions.createEl("button", {
      text: "Save",
      type: "submit",
      cls: "mod-cta",
    });

    cancel.addEventListener("click", () => this.finish(null));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (value === "") {
        new Notice("A name is required.");
        return;
      }
      this.finish(value);
    });

    window.setTimeout(() => {
      input.focus();
      input.select();
    });
    submit.focus({ preventScroll: true });
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveValue(null);
    }
  }

  private finish(value: string | null): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolveValue(value);
    this.close();
  }
}

export function promptForText(
  app: App,
  heading: string,
  placeholder: string,
  initialValue = "",
): Promise<string | null> {
  return new Promise((resolve) => {
    new TextPromptModal(
      app,
      heading,
      placeholder,
      initialValue,
      resolve,
    ).open();
  });
}

export interface BookmarkDetails {
  readonly label: string;
  readonly color: BookmarkColor;
}

export class BookmarkEditorModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly heading: string,
    private readonly initial: BookmarkDetails,
    private readonly resolveValue: (value: BookmarkDetails | null) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("zk-modal");
    contentEl.createEl("h2", { text: this.heading });

    const form = contentEl.createEl("form", { cls: "zk-prompt-form" });
    const labelRow = form.createEl("label", { cls: "zk-field" });
    labelRow.createSpan({ text: "Label (optional)" });
    const label = labelRow.createEl("input", {
      type: "text",
      value: this.initial.label,
      placeholder: "e.g. Theology",
      attr: { maxlength: "80" },
    });

    const palette = form.createDiv({ cls: "zk-bookmark-palette" });
    palette.createDiv({ cls: "zk-field-label", text: "Colour" });
    const choices = palette.createDiv({ cls: "zk-bookmark-colors" });
    for (const color of BOOKMARK_COLORS) {
      const choice = choices.createEl("label", {
        cls: `zk-bookmark-color-choice is-${color}`,
      });
      const radio = choice.createEl("input", {
        type: "radio",
        attr: { name: "bookmark-color", value: color },
      });
      radio.checked = color === this.initial.color;
      choice.createSpan({ cls: "zk-bookmark-color-swatch" });
      choice.createSpan({ text: capitalize(color) });
    }

    const actions = form.createDiv({ cls: "zk-modal-actions" });
    const cancel = actions.createEl("button", { text: "Cancel", type: "button" });
    actions.createEl("button", {
      text: "Save bookmark",
      type: "submit",
      cls: "mod-cta",
    });
    cancel.addEventListener("click", () => this.finish(null));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const selected = form.querySelector<HTMLInputElement>(
        'input[name="bookmark-color"]:checked',
      );
      const color = BOOKMARK_COLORS.find((candidate) => candidate === selected?.value);
      if (color === undefined) {
        new Notice("Choose a bookmark colour.");
        return;
      }
      this.finish({ label: label.value.trim(), color });
    });

    window.setTimeout(() => label.focus());
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveValue(null);
    }
  }

  private finish(value: BookmarkDetails | null): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolveValue(value);
    this.close();
  }
}

export function promptForBookmark(
  app: App,
  heading: string,
  initial: BookmarkDetails,
): Promise<BookmarkDetails | null> {
  return new Promise((resolve) => {
    new BookmarkEditorModal(app, heading, initial, resolve).open();
  });
}

export interface BookmarksModalActions {
  readonly currentId: string | null;
  isAvailable(zettelId: string): boolean;
  visit(zettelId: string): void;
  addCurrent(): Promise<void>;
  edit(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export class BookmarksModal extends Modal {
  constructor(
    app: App,
    private readonly bookmarks: readonly DeckBookmark[],
    private readonly actions: BookmarksModalActions,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("zk-modal");
    contentEl.createEl("h2", { text: "Bookmarks" });
    contentEl.createEl("p", {
      cls: "zk-empty-copy",
      text: "One persistent physical bookmark may be attached to each filed card.",
    });

    const list = contentEl.createDiv({ cls: "zk-modal-list" });
    if (this.bookmarks.length === 0) {
      list.createEl("p", { cls: "zk-empty-copy", text: "No bookmarks yet." });
    }
    for (const bookmark of this.bookmarks) {
      const available = this.actions.isAvailable(bookmark.zettelId);
      const row = list.createDiv({
        cls: `zk-list-row zk-bookmark-row is-${bookmark.color}`,
      });
      row.createSpan({ cls: "zk-bookmark-color-swatch" });
      const visit = row.createEl("button", {
        cls: "zk-entry-visit",
        attr: { type: "button" },
      });
      visit.createSpan({
        cls: "zk-entry-name",
        text: bookmark.label === "" ? bookmark.zettelId : bookmark.label,
      });
      visit.createSpan({
        cls: available ? "zk-entry-id" : "zk-entry-id is-missing",
        text: available ? bookmark.zettelId : `${bookmark.zettelId} · missing`,
      });
      visit.disabled = !available;
      visit.addEventListener("click", () => {
        this.actions.visit(bookmark.zettelId);
        this.close();
      });

      const edit = iconButton(row, "pencil", `Edit bookmark at ${bookmark.zettelId}`);
      edit.addEventListener("click", () => {
        void this.actions.edit(bookmark.id).then(() => this.close());
      });
      const remove = iconButton(row, "trash-2", `Delete bookmark at ${bookmark.zettelId}`);
      remove.addEventListener("click", () => {
        void this.actions.remove(bookmark.id).then(() => this.close());
      });
    }

    const footer = contentEl.createDiv({ cls: "zk-modal-actions" });
    const add = footer.createEl("button", {
      text: "+ Bookmark current card",
      cls: "mod-cta",
      attr: { type: "button" },
    });
    add.disabled = this.actions.currentId === null;
    add.addEventListener("click", () => {
      void this.actions.addCurrent().then(() => this.close());
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export interface EntryPointModalActions {
  readonly currentId: string | null;
  isAvailable(id: string): boolean;
  visit(id: string): void;
  addCurrent(): Promise<void>;
  rename(index: number): Promise<void>;
  remove(index: number): Promise<void>;
}

export class EntryPointsModal extends Modal {
  constructor(
    app: App,
    private readonly entryPoints: readonly EntryPoint[],
    private readonly actions: EntryPointModalActions,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("zk-modal");
    contentEl.createEl("h2", { text: "Entry points" });

    const list = contentEl.createDiv({ cls: "zk-modal-list" });
    if (this.entryPoints.length === 0) {
      list.createEl("p", {
        cls: "zk-empty-copy",
        text: "No entry points yet.",
      });
    }

    this.entryPoints.forEach((entry, index) => {
      const row = list.createDiv({ cls: "zk-list-row" });
      const available = this.actions.isAvailable(entry.id);
      const visit = row.createEl("button", {
        cls: "zk-entry-visit",
        attr: { type: "button" },
      });
      visit.createSpan({ cls: "zk-entry-name", text: entry.name });
      visit.createSpan({ cls: "zk-entry-id", text: entry.id });
      if (!available) {
        visit.disabled = true;
        visit.setAttr("aria-label", "The filed card is missing or invalid");
      }
      visit.addEventListener("click", () => {
        this.actions.visit(entry.id);
        this.close();
      });

      const rename = iconButton(row, "pencil", `Rename ${entry.name}`);
      rename.addEventListener("click", () => {
        void this.actions.rename(index).then(() => this.close());
      });
      const remove = iconButton(row, "trash-2", `Delete ${entry.name}`);
      remove.addEventListener("click", () => {
        void this.actions.remove(index).then(() => this.close());
      });
    });

    const footer = contentEl.createDiv({ cls: "zk-modal-actions" });
    const add = footer.createEl("button", {
      text: "+ Add current card as entry point",
      cls: "mod-cta",
      attr: { type: "button" },
    });
    add.disabled = this.actions.currentId === null;
    add.addEventListener("click", () => {
      void this.actions.addCurrent().then(() => this.close());
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export interface IssuesModalActions {
  open(path: string): void;
}

export class IssuesModal extends Modal {
  constructor(
    app: App,
    private readonly index: VaultZettelIndex,
    private readonly actions: IssuesModalActions,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("zk-modal");
    contentEl.createEl("h2", { text: "Zettel address problems" });
    contentEl.createEl("p", {
      text: "Deck never rewrites invalid or duplicate addresses. Correct the YAML in the affected notes.",
    });

    const list = contentEl.createDiv({ cls: "zk-modal-list" });
    for (const issue of this.index.issues) {
      const group = list.createDiv({ cls: "zk-issue-group" });
      group.createDiv({ cls: "zk-issue-message", text: issue.message });
      for (const path of issue.paths) {
        const button = group.createEl("button", {
          cls: "zk-issue-file",
          text: path,
          attr: { type: "button" },
        });
        button.addEventListener("click", () => {
          this.actions.open(path);
          this.close();
        });
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function iconButton(
  parent: HTMLElement,
  icon: Parameters<typeof setIcon>[1],
  label: string,
): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "clickable-icon zk-icon-button",
    attr: { type: "button", "aria-label": label },
  });
  setIcon(button, icon);
  return button;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function filedLabel(zettel: FiledZettel): string {
  return `${zettel.id} · ${zettel.file.basename}`;
}
