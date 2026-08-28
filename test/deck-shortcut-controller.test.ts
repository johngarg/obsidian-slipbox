import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { Window as HappyWindow } from "happy-dom";

import {
  DeckShortcutController,
  type DeckShortcutEnvironment,
  type PendingDeckCommandCompletionResult,
} from "../src/deck-shortcut-controller.js";
import type { PendingDeckCommandCompletion } from "../src/deck-commands.js";
import {
  DEFAULT_DECK_KEYBINDINGS,
  type SlipboxAction,
  type SlipboxSettings,
} from "../src/settings.js";

interface ShortcutSubject {
  readonly window: HappyWindow;
  readonly root: HTMLElement;
  readonly outside: HTMLElement;
  readonly controller: DeckShortcutController;
  readonly runs: SlipboxAction[];
  readonly notices: string[];
  readonly completions: PendingDeckCommandCompletion[];
  setActive(active: boolean): void;
  setAvailable(available: boolean): void;
  setSuspended(suspended: boolean): void;
  setLastEvent(event: Event | null): void;
  setBindings(bindings: SlipboxSettings["deckKeybindings"]): void;
  setCompletionResult(result: PendingDeckCommandCompletionResult): void;
}

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

function createHtmlElement(
  window: HappyWindow,
  tag: string,
) {
  return window.document.createElementNS(HTML_NAMESPACE, tag);
}

function createSubject(
  registerObsidianListener?: (
    document: Document,
    controller: () => DeckShortcutController,
    setLastEvent: (event: Event | null) => void,
  ) => void,
): ShortcutSubject {
  const window = new HappyWindow();
  const rootNode = createHtmlElement(window, "div");
  const outsideNode = createHtmlElement(window, "div");
  window.document.body.append(rootNode, outsideNode);
  const root = rootNode as unknown as HTMLElement;
  const outside = outsideNode as unknown as HTMLElement;
  let active = true;
  let available = true;
  let filingInputFocused = false;
  let lastEvent: Event | null = null;
  let bindings = DEFAULT_DECK_KEYBINDINGS;
  let completionResult: PendingDeckCommandCompletionResult = { kind: "complete" };
  const runs: SlipboxAction[] = [];
  const notices: string[] = [];
  const completions: PendingDeckCommandCompletion[] = [];
  let controller: DeckShortcutController;

  registerObsidianListener?.(
    window.document as unknown as Document,
    () => controller,
    (event) => { lastEvent = event; },
  );

  const environment: DeckShortcutEnvironment = {
    root,
    isMacOS: true,
    isActive: () => active,
    isFilingInputFocused: () => filingInputFocused,
    bindings: () => bindings,
    lastEvent: () => lastEvent,
    canRun: () => available,
    run: (action) => {
      runs.push(action);
      if (action === "find-address-first") {
        controller.beginAddressCommand();
      } else if (action === "pull-into-pile") {
        controller.beginPileCommand();
      }
      return true;
    },
    completePending: (completion) => {
      completions.push(completion);
      return completionResult;
    },
    showNotice: (message) => { notices.push(message); },
  };
  controller = new DeckShortcutController(environment);
  cleanups.push(controller.connect());

  return {
    window,
    root,
    outside,
    controller,
    runs,
    notices,
    completions,
    setActive: (value) => { active = value; },
    setAvailable: (value) => { available = value; },
    setSuspended: (value) => {
      filingInputFocused = value;
      controller.setSuspended(value);
    },
    setLastEvent: (value) => { lastEvent = value; },
    setBindings: (value) => { bindings = value; },
    setCompletionResult: (value) => { completionResult = value; },
  };
}

function dispatchKey(
  subject: ShortcutSubject,
  key: string,
  options: KeyboardEventInit = {},
  target: HTMLElement = subject.root,
): KeyboardEvent {
  const event = new subject.window.KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  } as never) as unknown as KeyboardEvent;
  target.dispatchEvent(event);
  return event;
}

async function flushShortcut(): Promise<void> {
  await Promise.resolve();
}

describe("DeckShortcutController", () => {
  test("runs an unclaimed local shortcut and follows live binding changes", async () => {
    const subject = createSubject();

    dispatchKey(subject, "j");
    await flushShortcut();
    assert.deepEqual(subject.runs, ["next-card"]);

    subject.setBindings({
      ...DEFAULT_DECK_KEYBINDINGS,
      "next-card": [],
    });
    dispatchKey(subject, "j");
    await flushShortcut();
    assert.deepEqual(subject.runs, ["next-card"]);
  });

  test("honours repeatability and ignores inactive or suspended views", async () => {
    const subject = createSubject();

    dispatchKey(subject, "j", { repeat: true });
    dispatchKey(subject, "b", { repeat: true });
    await flushShortcut();
    assert.deepEqual(subject.runs, ["next-card"]);

    subject.setActive(false);
    dispatchKey(subject, "j");
    subject.setActive(true);
    subject.setSuspended(true);
    dispatchKey(subject, "j");
    subject.setSuspended(false);
    subject.setAvailable(false);
    dispatchKey(subject, "j");
    await flushShortcut();
    assert.deepEqual(subject.runs, ["next-card"]);
    assert.equal(subject.controller.canRunCommand("next-card"), false);
  });

  test("does not rerun the matching Slipbox command", async () => {
    const subject = createSubject((document, getController, setLastEvent) => {
      document.addEventListener("keydown", (event) => {
        if (event.key !== "j") {
          return;
        }
        setLastEvent(event);
        getController().runCommand("next-card");
        event.preventDefault();
      }, { capture: true });
    });

    dispatchKey(subject, "j");
    await flushShortcut();

    assert.deepEqual(subject.runs, ["next-card"]);
    assert.deepEqual(subject.notices, []);
  });

  test("yields a configured key to a different Obsidian command", async () => {
    const subject = createSubject((document, getController, setLastEvent) => {
      document.addEventListener("keydown", (event) => {
        if (event.key !== "j") {
          return;
        }
        setLastEvent(event);
        getController().runCommand("centre-card");
        event.preventDefault();
      }, { capture: true });
    });
    const statusHost = createHtmlElement(
      subject.window,
      "div",
    ) as unknown as HTMLElement;
    subject.controller.renderStatus(statusHost);

    dispatchKey(subject, "j");
    await flushShortcut();

    assert.deepEqual(subject.runs, ["centre-card"]);
    assert.equal(subject.notices.length, 1);
    assert.match(statusHost.textContent ?? "", /already handled/);
  });

  test("yields to a prevented core Obsidian hotkey", async () => {
    const subject = createSubject((document) => {
      document.addEventListener("keydown", (event) => {
        if (event.key === "j") {
          event.preventDefault();
        }
      }, { capture: true });
    });

    dispatchKey(subject, "j");
    await flushShortcut();

    assert.deepEqual(subject.runs, []);
    assert.equal(subject.notices.length, 1);
  });

  test("reports a mismatched configured key on the keyup fallback", () => {
    const subject = createSubject();
    const keydown = dispatchKey(subject, "x");
    subject.setLastEvent(keydown);
    subject.controller.runCommand("centre-card");

    subject.root.dispatchEvent(new subject.window.KeyboardEvent("keyup", {
      key: "j",
      bubbles: true,
    }) as unknown as KeyboardEvent);

    assert.deepEqual(subject.runs, ["centre-card"]);
    assert.equal(subject.notices.length, 1);
  });

  test("keeps command-palette events outside the Deck out of arbitration", async () => {
    const subject = createSubject();
    const paletteInputNode = createHtmlElement(subject.window, "input");
    subject.window.document.body.append(paletteInputNode);
    const paletteInput = paletteInputNode as unknown as HTMLInputElement;
    const event = dispatchKey(
      subject,
      "Enter",
      {},
      paletteInput,
    );
    subject.setLastEvent(event);

    assert.equal(subject.controller.canRunCommand("show-card-in-deck"), true);
    subject.controller.runCommand("show-card-in-deck");
    await flushShortcut();

    assert.deepEqual(subject.runs, ["show-card-in-deck"]);
    assert.deepEqual(subject.notices, []);
  });

  test("suppresses registered commands from editable controls inside the Deck", () => {
    const subject = createSubject();
    const input = createHtmlElement(subject.window, "input");
    subject.root.append(input as unknown as Node);
    const eventValue = new subject.window.KeyboardEvent("keydown", {
      key: "j",
      bubbles: true,
    });
    input.dispatchEvent(eventValue);
    const event = eventValue as unknown as KeyboardEvent;
    subject.setLastEvent(event);

    assert.equal(subject.controller.canRunCommand("next-card"), false);
  });

  test("captures address continuations outside the Deck", () => {
    const subject = createSubject();
    const statusHost = createHtmlElement(
      subject.window,
      "div",
    ) as unknown as HTMLElement;
    subject.controller.renderStatus(statusHost);
    subject.controller.beginAddressCommand();

    const event = dispatchKey(subject, "😀", {}, subject.outside);

    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(subject.completions, [
      { kind: "address", initial: "😀" },
    ]);
    assert.equal(subject.controller.hasPendingCommand, false);
  });

  test("does not consume the command event that starts pending input", () => {
    const subject = createSubject((document, getController, setLastEvent) => {
      document.addEventListener("keydown", (event) => {
        if (event.key !== "g") {
          return;
        }
        setLastEvent(event);
        getController().runCommand("find-address-first");
      }, { capture: true });
    });

    dispatchKey(subject, "g");
    assert.equal(subject.controller.hasPendingCommand, true);
    assert.deepEqual(subject.completions, []);

    dispatchKey(subject, "a", {}, subject.outside);
    assert.deepEqual(subject.completions, [
      { kind: "address", initial: "a" },
    ]);
  });

  test("keeps invalid pile input pending and completes corrected input", () => {
    const subject = createSubject();
    const statusHost = createHtmlElement(
      subject.window,
      "div",
    ) as unknown as HTMLElement;
    subject.controller.renderStatus(statusHost);
    subject.controller.beginPileCommand();
    subject.setCompletionResult({
      kind: "continue",
      feedback: "Enter a pile number before confirming.",
    });

    dispatchKey(subject, "Enter", {}, subject.outside);
    assert.equal(subject.controller.hasPendingCommand, true);
    assert.match(statusHost.textContent ?? "", /Enter a pile number/);

    subject.setCompletionResult({
      kind: "complete",
      feedback: "Put the focused card into pile 12.",
    });
    dispatchKey(subject, "1", {}, subject.outside);
    dispatchKey(subject, "2", {}, subject.outside);
    dispatchKey(subject, "Enter", {}, subject.outside);

    assert.deepEqual(subject.completions.at(-1), {
      kind: "pile",
      digits: "12",
    });
    assert.equal(subject.controller.hasPendingCommand, false);
    assert.match(statusHost.textContent ?? "", /pile 12/);
  });

  test("cancels pending input with Escape and removes listeners on disconnect", async () => {
    const window = new HappyWindow();
    const rootNode = createHtmlElement(window, "div");
    window.document.body.append(rootNode);
    const root = rootNode as unknown as HTMLElement;
    const runs: SlipboxAction[] = [];
    const controller = new DeckShortcutController({
      root,
      isMacOS: true,
      isActive: () => true,
      isFilingInputFocused: () => false,
      bindings: () => DEFAULT_DECK_KEYBINDINGS,
      lastEvent: () => null,
      canRun: () => true,
      run: (action) => {
        runs.push(action);
        return true;
      },
      completePending: () => ({ kind: "complete" }),
      showNotice: () => undefined,
    });
    const disconnect = controller.connect();
    controller.beginAddressCommand();

    root.dispatchEvent(new window.KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }) as unknown as KeyboardEvent);
    assert.equal(controller.hasPendingCommand, false);

    disconnect();
    root.dispatchEvent(new window.KeyboardEvent("keydown", {
      key: "j",
      bubbles: true,
    }) as unknown as KeyboardEvent);
    await flushShortcut();
    assert.deepEqual(runs, []);
  });
});
