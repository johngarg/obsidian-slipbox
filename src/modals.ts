import { App, Modal, Notice, TFile, setIcon } from "obsidian";

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

export interface DeskModalActions {
  open(file: TFile): void;
  file(file: TFile): void;
}

export class DeskModal extends Modal {
  constructor(
    app: App,
    private readonly unfiled: readonly TFile[],
    private readonly actions: DeskModalActions,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("zk-modal");
    contentEl.createEl("h2", { text: "Desk · unfiled cards" });

    const list = contentEl.createDiv({ cls: "zk-modal-list" });
    if (this.unfiled.length === 0) {
      list.createEl("p", {
        cls: "zk-empty-copy",
        text: "The Desk has no unfiled cards.",
      });
    }

    for (const file of this.unfiled) {
      const row = list.createDiv({ cls: "zk-list-row" });
      const open = row.createEl("button", {
        cls: "zk-file-visit",
        attr: { type: "button" },
      });
      open.createSpan({ cls: "zk-entry-name", text: file.basename });
      open.createSpan({ cls: "zk-file-path", text: file.path });
      open.addEventListener("click", () => {
        this.actions.open(file);
        this.close();
      });

      const fileButton = row.createEl("button", {
        text: "File…",
        cls: "mod-cta",
        attr: { type: "button" },
      });
      fileButton.addEventListener("click", () => {
        this.actions.file(file);
        this.close();
      });
    }
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

export function filedLabel(zettel: FiledZettel): string {
  return `${zettel.id} · ${zettel.file.basename}`;
}
