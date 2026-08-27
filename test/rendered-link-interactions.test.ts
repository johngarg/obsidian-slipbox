import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Window } from "happy-dom";

import {
  applyRenderedLinkAccessibility,
  attachRenderedLinkInteractions,
  renderedLinkPolicy,
} from "../src/rendered-link-interactions.js";

function cardBody() {
  const window = new Window();
  const body = window.document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  );
  const internal = window.document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "a",
  );
  internal.className = "internal-link";
  internal.dataset.href = "Card path";
  internal.href = "Card path";
  body.append(internal);
  const external = window.document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "a",
  );
  external.href = "https://example.org";
  body.append(external);
  window.document.body.append(body);
  return { window, body, internal, external };
}

describe("rendered card-link interaction policy", () => {
  test("makes links inert while preserving their context menus", () => {
    const { window, body, internal, external } = cardBody();
    let previews = 0;
    let follows = 0;
    let contexts = 0;
    internal.addEventListener("contextmenu", () => {
      contexts += 1;
    });
    attachRenderedLinkInteractions(body as unknown as HTMLElement, {
      previewEnabled: false,
      followEnabled: false,
      showTooltips: false,
      preview: () => {
        previews += 1;
      },
      follow: () => {
        follows += 1;
      },
    });

    assert.equal(internal.getAttribute("aria-disabled"), "true");
    assert.equal(internal.tabIndex, -1);
    assert.equal(external.getAttribute("aria-disabled"), "true");

    internal.dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true }));
    const click = new window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    internal.dispatchEvent(click);
    const middle = new window.MouseEvent("auxclick", {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    external.dispatchEvent(middle);
    const auxiliary = new window.MouseEvent("auxclick", {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    external.dispatchEvent(auxiliary);
    const context = new window.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    internal.dispatchEvent(context);

    assert.equal(previews, 0);
    assert.equal(follows, 0);
    assert.equal(click.defaultPrevented, true);
    assert.equal(middle.defaultPrevented, true);
    assert.equal(auxiliary.defaultPrevented, true);
    assert.equal(context.defaultPrevented, false);
    assert.equal(contexts, 1);
  });

  test("previews internal links and follows ordinary and middle activation", () => {
    const { window, body, internal, external } = cardBody();
    const previews: string[] = [];
    const follows: Array<{ linktext: string; button: number }> = [];
    attachRenderedLinkInteractions(body as unknown as HTMLElement, {
      previewEnabled: true,
      followEnabled: true,
      showTooltips: true,
      preview: (_event, _link, linktext) => previews.push(linktext),
      follow: (event, _link, linktext) => {
        follows.push({ linktext, button: event.button });
      },
    });

    internal.dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true }));
    internal.dispatchEvent(new window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    }));
    external.dispatchEvent(new window.MouseEvent("auxclick", {
      bubbles: true,
      cancelable: true,
      button: 1,
    }));

    assert.deepEqual(previews, ["Card path"]);
    assert.deepEqual(follows, [
      { linktext: "Card path", button: 0 },
      { linktext: "https://example.org", button: 1 },
    ]);
    assert.equal(internal.hasAttribute("aria-disabled"), false);
    assert.equal(internal.tabIndex, 0);
  });

  test("can refresh accessibility after a Markdown rerender", () => {
    const { body, internal } = cardBody();
    applyRenderedLinkAccessibility(body as unknown as HTMLElement, false, true);
    assert.equal(internal.tabIndex, -1);
    applyRenderedLinkAccessibility(body as unknown as HTMLElement, true, true);
    assert.equal(internal.tabIndex, 0);
    assert.equal(internal.hasAttribute("aria-disabled"), false);
  });

  test("removes Markdown-rendered visual tooltips without losing link labels", () => {
    const { body, internal } = cardBody();
    internal.setAttribute("aria-label", "Resolved card title");
    internal.setAttribute("title", "Native card title");
    internal.setAttribute("data-tooltip-position", "top");

    applyRenderedLinkAccessibility(body as unknown as HTMLElement, true, false);

    assert.equal(internal.getAttribute("aria-label"), null);
    assert.equal(internal.getAttribute("title"), null);
    assert.equal(internal.getAttribute("data-tooltip-position"), null);
    const labelId = internal.getAttribute("aria-labelledby") ?? "";
    assert.equal(
      internal.ownerDocument.getElementById(labelId)?.textContent,
      "Resolved card title",
    );
  });

  test("keeps preview and following independent on bodies and backlinks", () => {
    assert.deepEqual(renderedLinkPolicy(true, false), {
      preview: true,
      follow: false,
    });
    assert.deepEqual(renderedLinkPolicy(false, true), {
      preview: false,
      follow: true,
    });
    assert.deepEqual(renderedLinkPolicy(true, true, false), {
      preview: false,
      follow: false,
    });

    for (const [previewEnabled, followEnabled] of [
      [true, false],
      [false, true],
    ] as const) {
      const { window, body, internal } = cardBody();
      let previews = 0;
      let follows = 0;
      attachRenderedLinkInteractions(body as unknown as HTMLElement, {
        previewEnabled,
        followEnabled,
        showTooltips: false,
        preview: () => {
          previews += 1;
        },
        follow: () => {
          follows += 1;
        },
      });
      internal.dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true }));
      internal.dispatchEvent(new window.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }));
      assert.equal(previews, previewEnabled ? 1 : 0);
      assert.equal(follows, followEnabled ? 1 : 0);
      assert.equal(internal.tabIndex, followEnabled ? 0 : -1);
    }
  });
});
