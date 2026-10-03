import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { bundleFixture, installDomShims } from './helpers/view-fixture.mjs';
const load = await bundleFixture("export { ViewedCardRenderer } from './src/viewed-card-renderer.ts';export { ViewedCardSession } from './src/viewed-card.ts';export { DEFAULT_SETTINGS } from './src/settings.ts';");
const tick = () => new Promise(resolve => setImmediate(resolve));

function subject(t) {
  const window = new Window();
  installDomShims(window);
  window.ResizeObserver = undefined;
  const frames = new Map(), components = [], calls = [], pending = [];
  let seq = 0, delayed = false;
  window.requestAnimationFrame = fn => {
    frames.set(++seq, fn);
    return seq;
  };
  window.cancelAnimationFrame = id => frames.delete(id);
  const host = {
    Component: class { constructor() { components.push(this); } load() { this.loaded = true; } unload() { this.loaded = false; } },
    setIcon() { },
    MarkdownRenderer: {
      async render(_app, text, target) {
        if (delayed) await new Promise(resolve => pending.push(resolve));
        target.textContent = text;
      }
    }
  };
  const { ViewedCardRenderer, ViewedCardSession, DEFAULT_SETTINGS } = load(host, { Element: window.Element });
  const stage = window.document.body.createDiv();
  Object.defineProperties(stage, { clientWidth: { value: 1000, configurable: true }, clientHeight: { value: 800, configurable: true } });
  const file = { path: 'A.md' }, session = new ViewedCardSession();
  let body = 'Original', filed = true, filing = null;
  const settings = { ...DEFAULT_SETTINGS, showTooltips: false, showAutomaticBacklinks: false, showBranchLabels: false };
  const env = {
    app: {},
    session,
    settings: () => settings,
    stage: () => stage,
    filing: () => filing,
    index: { fileAtPath: () => file, filedByFile: () => filed ? { path: file.path, address: '1' } : undefined, readBody: async () => body },
    cards: { color: () => null, displayTitle: () => 'Title', title: () => 'Title' },
    bookmarks: { at: () => undefined },
    links: { outline: () => calls.push('outline'), attach: () => calls.push('attach') },
    footer: {},
    signature: { showBranchLabels: () => false, showTooltips: () => false, branchesForPath: () => [] },
    deskPosition: () => null,
    isFocused: () => true,
    focus: path => calls.push(['focus', path]),
    filingFocusChanged: () => { },
    updateFilingInput: () => { },
    confirmFiling: async () => { },
    cancelFiling: async () => { },
    previewFilingPlacement: async () => { },
    applyFilingGuidance: () => { },
    runAction: action => calls.push(action),
    runCardAction: () => true,
    editCardOnDesk: async () => calls.push('edit'),
    jumpToPath: async () => { },
    showCardMenu: () => { }
  };
  const renderer = new ViewedCardRenderer(env);
  session.open(file.path, { surface: 'deck' });
  t.after(() => {
    renderer.clear();
    window.happyDOM.abort();
  });
  return {
    window,
    renderer,
    session,
    stage,
    calls,
    components,
    pending,
    frames,
    env,
    setBody: value => body = value,
    delay: value => delayed = value,
    unfiled: () => filed = false,
    setFiling: value => filing = value,
    pointer(target, type, x, y) {
      target.dispatchEvent(new window.PointerEvent(type, { pointerId: 1, button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    }
  };
}

test('renderer uses the shared session for scroll, focus, drag cancellation and resize constraints', async t => {
  const s = subject(t);
  s.session.setScrollTop('A.md', 27);
  await s.renderer.render(s.stage);
  assert.equal(s.renderer.bodyEl.scrollTop, 27);
  s.renderer.bodyEl.scrollTop = 46;
  s.renderer.rememberScroll();
  assert.equal(s.session.snapshot.scrollTop, 46);
  s.renderer.focus();
  assert.equal(s.window.document.activeElement, s.renderer.cardEl);
  const card = s.renderer.cardEl, handle = card.querySelector('.slipbox-viewed-card-drag-handle');
  Object.defineProperties(card, { offsetWidth: { value: 400 }, offsetHeight: { value: 300 } });
  s.pointer(handle, 'pointerdown', 0, 0);
  s.pointer(handle, 'pointermove', 100, 50);
  assert.equal(s.session.snapshot.x, 100);
  s.pointer(handle, 'pointercancel', 100, 50);
  assert.equal(s.session.snapshot.x, 0);
  assert.equal(handle.hasPointerCapture(1), false);
  s.pointer(handle, 'pointerdown', 0, 0);
  s.pointer(handle, 'pointermove', 900, 900);
  s.pointer(handle, 'pointerup', 900, 900);
  Object.defineProperty(s.stage, 'clientWidth', { value: 450 });
  s.renderer.constrain();
  assert.ok(s.session.snapshot.x <= 25);
  s.pointer(handle, 'pointerdown', 0, 0);
  s.pointer(handle, 'pointermove', 10, 20);
  s.renderer.clear();
  assert.equal(handle.hasPointerCapture(1), false);
  assert.equal(s.stage.childElementCount, 0);
  assert.equal(s.renderer.cardEl, null);
  assert.equal(s.frames.size, 0);
  assert.ok(s.components.every(c => !c.loaded));
});

test('stale Markdown renders cannot replace a newer body or append into an editor', async t => {
  const s = subject(t);
  s.delay(true);
  const first = s.renderer.render(s.stage);
  await tick();
  const old = s.renderer.bodyEl;
  s.setBody('Second');
  const second = s.renderer.render(s.stage);
  await tick();
  s.pending[1]();
  await second;
  s.pending[0]();
  await first;
  assert.equal(s.renderer.bodyEl.textContent, 'Second');
  assert.equal(old.isConnected, false);
  assert.equal(s.calls.filter(c => c === 'attach').length, 1);
  const render = s.renderer.renderBody({ path: 'A.md' }, s.renderer.bodyEl);
  await tick();
  s.renderer.unloadMarkdown();
  s.renderer.bodyEl.textContent = 'Editor';
  s.pending[2]();
  await render;
  assert.equal(s.renderer.bodyEl.textContent, 'Editor');
});

test('clearing a renderer while Markdown is pending cancels layout and unloads its component', async t => {
  const s = subject(t);
  s.delay(true);
  const render = s.renderer.render(s.stage);
  await tick();
  s.renderer.clear();
  s.pending[0]();
  await render;
  assert.equal(s.stage.childElementCount, 0);
  assert.equal(s.frames.size, 0);
  assert.equal(s.calls.includes('attach'), false);
  assert.ok(s.components.every(c => !c.loaded));
});

test('unfiled viewed cards mount the filing editor on the existing session', async t => {
  const s = subject(t);
  s.unfiled();
  s.setFiling({
    phase: 'editing',
    sourcePath: 'A.md',
    sourceSurface: 'viewed',
    value: '2a',
    address: '2a',
    preview: null,
    message: 'Enter an address.',
    invalid: false,
    duplicatePaths: [],
    guidance: ''
  });
  await s.renderer.render(s.stage);
  assert.equal(s.renderer.filingEditor.input.value, '2a');
  assert.equal(s.session.snapshot.path, 'A.md');
  s.renderer.clear();
  assert.equal(s.renderer.filingEditor, null);
});
