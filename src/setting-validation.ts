let settingErrorSequence = 0;
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

const directErrorChild = (control: HTMLElement): HTMLElement | null => {
  for (let index = 0; index < control.children.length; index += 1) {
    const child = control.children.item(index);
    if (child?.classList.contains("slipbox-setting-error")) {
      return child as HTMLElement;
    }
  }
  return null;
};

/** Keep a text-setting error below its control and associated with its input. */
export function setTextSettingValidity(
  setting: HTMLElement,
  control: HTMLElement,
  valid: boolean,
  message: string,
): void {
  setting.classList.toggle("slipbox-text-setting-with-error", !valid);
  setting.classList.toggle("is-invalid", !valid);
  let error = directErrorChild(control);
  if (!valid && error === null) {
    error = control.ownerDocument.createElementNS(HTML_NAMESPACE, "div");
    error.className = "slipbox-setting-error";
    error.id = `slipbox-setting-error-${++settingErrorSequence}`;
    error.setAttribute("aria-live", "polite");
    control.append(error);
  }
  error?.replaceChildren(valid ? "" : message);

  const input = control.querySelector<HTMLElement>("input, textarea");
  if (input === null) {
    return;
  }
  if (!valid && error !== null) {
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-errormessage", error.id);
  } else {
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-errormessage");
  }
}
