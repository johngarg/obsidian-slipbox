import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { bundleFixture, installDomShims } from './helpers/view-fixture.mjs';
const load = await bundleFixture("export { ViewedCardRenderer } from './src/viewed-card-renderer.ts';export { ViewedCardSession } from './src/viewed-card.ts';export { DEFAULT_SETTINGS } from './src/settings.ts';export { attachRenderedLinkInteractions } from './src/rendered-link-interactions.ts';");
const tick = () => new Promise(resolve => setImmediate(resolve));

function subject(t, renderMarkdown) {
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
        if (renderMarkdown !== undefined) return renderMarkdown(text, target);
        if (delayed) await new Promise(resolve => pending.push(resolve));
        target.textContent = text;
      }
    }
  };
  const { ViewedCardRenderer, ViewedCardSession, DEFAULT_SETTINGS, attachRenderedLinkInteractions } = load(host, { Element: window.Element });
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
    links: {
      outline: () => calls.push('outline'),
      attach(target) {
        calls.push('attach');
        attachRenderedLinkInteractions(target, {
          previewEnabled: false,
          followEnabled: settings.followLinksFromCards,
          showTooltips: false,
          preview() { },
          follow: () => calls.push('follow'),
        });
      },
    },
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

test('postprocessors keep their mounted container, delegated listeners and later updates', async t => {
  let rendered, connectedWhileRendering = false, clicks = 0;
  const s = subject(t, (text, target) => {
    connectedWhileRendering = target.isConnected;
    rendered = target;
    target.dataset.postprocessed = 'true';
    target.createEl('button', { text });
    target.addEventListener('click', () => clicks++);
  });
  await s.renderer.render(s.stage);
  assert.equal(connectedWhileRendering, true);
  assert.equal(rendered.isConnected, true);
  assert.equal(s.renderer.bodyEl.querySelector('[data-postprocessed="true"]'), rendered);
  s.renderer.bodyEl.querySelector('button').click();
  assert.equal(clicks, 1);
  await tick();
  rendered.createEl('p', { text: 'Later update' });
  assert.equal(s.renderer.bodyEl.textContent, 'OriginalLater update');
  s.renderer.unloadMarkdown();
  assert.equal(rendered.isConnected, false);
  rendered.createEl('p', { text: 'Stale update' });
  assert.equal(s.renderer.bodyEl.textContent, '');
});

for (const outcome of ['load', 'error']) test('text remains visible while an image waits for ' + outcome, async t => {
  let image, settled = false;
  const s = subject(t, (text, target) => {
    target.createEl('p', { text });
    image = target.createEl('img');
    // Obsidian's image postprocessor waits for load/error after inserting text.
    return new Promise(resolve => {
      image.addEventListener('load', resolve);
      image.addEventListener('error', resolve);
    });
  });
  const job = s.renderer.render(s.stage).then(() => settled = true);
  await tick();
  assert.equal(settled, false);
  assert.equal(image.isConnected, true);
  assert.equal(s.renderer.bodyEl.textContent, 'Original');
  image.dispatchEvent(new s.window.Event(outcome));
  await job;
  assert.equal(s.renderer.bodyEl.textContent, 'Original');
});

for (const scrollDuringRender of [false, true]) test(
  'delayed content preserves ' + (scrollDuringRender ? 'the user\'s new scroll position' : 'the saved scroll position'),
  async t => {
    let finish, maxScrollTop = 0;
    const s = subject(t, async (text, target) => {
      target.createEl('p', { text });
      maxScrollTop = 100;
      await new Promise(resolve => finish = resolve);
      maxScrollTop = 1000;
    });
    s.env.settings().allowCardScrolling = true;
    s.session.setScrollTop('A.md', 500);
    const job = s.renderer.render(s.stage);
    const body = s.renderer.bodyEl;
    let actualScrollTop = 0;
    // Happy DOM has no layout. Model browser clamping and asynchronous scroll
    // events so incomplete content cannot silently replace the saved position.
    Object.defineProperty(body, 'scrollTop', {
      configurable: true,
      get: () => actualScrollTop,
      set(value) {
        const next = Math.min(maxScrollTop, Math.max(0, value));
        if (next === actualScrollTop) return;
        actualScrollTop = next;
        setImmediate(() => body.dispatchEvent(new s.window.Event('scroll')));
      },
    });
    await tick();
    await tick();
    assert.equal(body.textContent, 'Original');
    assert.equal(s.session.snapshot.scrollTop, 500);

    if (scrollDuringRender) {
      body.scrollTop = 60;
      await tick();
      assert.equal(s.session.snapshot.scrollTop, 60);
    }
    finish();
    await job;
    await tick();
    const expected = scrollDuringRender ? 60 : 500;
    assert.equal(body.scrollTop, expected);
    assert.equal(s.session.snapshot.scrollTop, expected);
  },
);

test('visible links respect navigation policy while rendering and after asynchronous additions', async t => {
  let finish, initial, added;
  const s = subject(t, async (_text, target) => {
    initial = target.createEl('a', { text: 'Initial link', attr: { href: 'B.md' } });
    await new Promise(resolve => finish = resolve);
    added = target.createEl('a', { text: 'Later link', attr: { href: 'C.md' } });
  });
  s.env.settings().followLinksFromCards = false;
  const job = s.renderer.render(s.stage);
  await tick();
  assert.equal(initial.isConnected, true);
  initial.click();
  assert.equal(initial.getAttribute('aria-disabled'), 'true');
  assert.equal(s.calls.includes('follow'), false);
  finish();
  await job;
  added.click();
  assert.equal(added.getAttribute('aria-disabled'), 'true');
  assert.equal(added.tabIndex, -1);
  assert.equal(s.calls.includes('follow'), false);
  assert.equal(s.calls.filter(c => c === 'attach').length, 1);
});

test('overlapping renders in the same body detach stale postprocessor output', async t => {
  const roots = [], finishes = [];
  const s = subject(t, async (text, target) => {
    roots.push(target);
    target.createEl('p', { text });
    await new Promise(resolve => finishes.push(resolve));
    target.createEl('p', { text: ' Completed' });
  });
  const first = s.renderer.render(s.stage);
  await tick();
  const body = s.renderer.bodyEl;
  s.setBody('Second');
  const second = s.renderer.renderBody({ path: 'A.md' }, body);
  await tick();
  assert.equal(roots[0].isConnected, false);
  assert.equal(roots[1].isConnected, true);
  assert.equal(body.textContent, 'Second');
  finishes[1]();
  await second;
  finishes[0]();
  await first;
  assert.equal(s.renderer.bodyEl, body);
  assert.equal(body.textContent, 'Second Completed');
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
  assert.equal(s.calls.filter(c => c === 'outline').length, 1);
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
  assert.equal(s.calls.includes('outline'), false);
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
