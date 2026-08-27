import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { Window } from "happy-dom";

import { setTextSettingValidity } from "../src/setting-validation.js";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

const fixture = () => {
  const window = new Window();
  const document = window.document;
  const setting = document.createElementNS(HTML_NAMESPACE, "div");
  const control = document.createElementNS(HTML_NAMESPACE, "div");
  const input = document.createElementNS(HTML_NAMESPACE, "input");
  control.className = "setting-item-control";
  control.append(input);
  setting.append(control);
  document.body.append(setting);
  return {
    setting: setting as unknown as HTMLElement,
    control: control as unknown as HTMLElement,
    input: input as unknown as HTMLInputElement,
  };
};

describe("text setting validation", () => {
  test("places an accessible error below the input control", () => {
    const { setting, control, input } = fixture();
    setTextSettingValidity(setting, control, false, "A marker is required.");

    const error = control.querySelector<HTMLElement>(".slipbox-setting-error");
    assert.equal(setting.classList.contains("is-invalid"), true);
    assert.equal(
      setting.classList.contains("slipbox-text-setting-with-error"),
      true,
    );
    assert.equal(error?.parentElement, control);
    assert.equal(error?.textContent, "A marker is required.");
    assert.equal(error?.getAttribute("aria-live"), "polite");
    assert.equal(input.getAttribute("aria-invalid"), "true");
    assert.equal(input.getAttribute("aria-errormessage"), error?.id);
  });

  test("clears the existing error without accumulating rows", () => {
    const { setting, control, input } = fixture();
    setTextSettingValidity(setting, control, false, "First error");
    setTextSettingValidity(setting, control, false, "Second error");
    setTextSettingValidity(setting, control, true, "");

    assert.equal(control.querySelectorAll(".slipbox-setting-error").length, 1);
    assert.equal(control.querySelector(".slipbox-setting-error")?.textContent, "");
    assert.equal(setting.classList.contains("is-invalid"), false);
    assert.equal(
      setting.classList.contains("slipbox-text-setting-with-error"),
      false,
    );
    assert.equal(input.getAttribute("aria-invalid"), null);
    assert.equal(input.getAttribute("aria-errormessage"), null);
  });
});
