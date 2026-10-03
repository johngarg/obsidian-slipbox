import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { bundleFixture, installDomShims } from './helpers/view-fixture.mjs';

const load = await bundleFixture(
  "export { DeckInlineEditor } from './src/deck-inline-editor.ts';" +
  "export { InlineEditRegistry } from './src/inline-edit-registry.ts';" +
  "export { DEFAULT_SETTINGS } from './src/settings.ts';"
);
const tick = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => resolve = done);
  return { promise, resolve };
};

function subject(t) {
  const window = new Window();
  installDomShims(window);
  const frames = new Map(), timers = new Map(), notices = [], calls = [];
  let sequence = 0;
  window.requestAnimationFrame = fn => {
    frames.set(++sequence, fn);
    return sequence;
  };
  window.cancelAnimationFrame = id => frames.delete(id);
  window.setTimeout = (fn, delay) => {
    timers.set(++sequence, { fn, delay });
    return sequence;
  };
  window.clearTimeout = id => timers.delete(id);
  const { DeckInlineEditor, InlineEditRegistry, DEFAULT_SETTINGS } = load({ Notice: class { constructor(message) { notices.push(message); } } });
  const settings = { ...DEFAULT_SETTINGS, showTooltips: false, protectFiledCardText: false, restrictViewedCardPaste: false };
  const file = { path: 'A.md', stat: { mtime: 1 } }, other = { path: 'B.md', stat: { mtime: 1 } };
  const files = new Map([[file.path, file], [other.path, other]]), sources = new Map([[file.path, 'Original'], [other.path, 'Other']]);
  const snapshot = { filed: [{ path: file.path, address: '1', file }, { path: other.path, address: '2', file: other }], unfiled: [], issues: [] };
  const index = { snapshot, fileAtPath: path => files.get(path), filedByFile: f => snapshot.filed.find(card => card.file === f) };
  const store = {
    fileAtPath: path => files.get(path) ?? null,
    read: async f => sources.get(f.path),
    process: async (f, update) => {
      sources.set(f.path, update(sources.get(f.path)));
      f.stat.mtime++;
      calls.push('write');
    },
    contentStart: () => 0,
    body: source => source,
    flushOpenViews: async () => { },
    revealOwner: async owner => calls.push(owner),
    notify: message => notices.push(message)
  };
  const registry = new InlineEditRegistry(store), editors = [];
  const create = () => {
    const card = window.document.body.createDiv({ cls: 'slipbox-card' }), body = card.createDiv({ cls: 'markdown-rendered' });
    body.textContent = 'Original';
    body.scrollTop = 19;
    let editor;
    const owner = { finishInlineEditing: reason => editor.finish(reason) };
    const environment = {
      index,
      cards: { title: f => f.path },
      registry,
      settings: () => settings,
      desk: () => ({ piles: [], expandedPileIds: [], unfiledPileId: null }),
      bookmarks: () => [],
      viewed: () => ({ path: file.path, returnTarget: { surface: 'desk', pileId: 'p1' } }),
      isActive: () => true,
      filingActive: () => false,
      acquire: path => registry.acquire(path, owner),
      release: path => registry.release(path, owner),
      rename: (a, b) => registry.rename(a, b, owner),
      renamed: (a, b) => calls.push(['rename', a, b]),
      suspendShortcuts: on => calls.push(['suspend', on]),
      unloadMarkdown: () => calls.push('unload'),
      refresh: async () => calls.push('refresh'),
      rerenderEdited: async (f, target, scroll) => {
        calls.push('edited');
        target.textContent = sources.get(f.path);
        target.scrollTop = scroll;
      },
      rerenderDesk: async () => calls.push('desk'),
      refreshLinkMetadata: () => calls.push('metadata'),
      focusAfterFinish: () => calls.push('focus'),
      restoreSurface: async () => body
    };
    editor = new DeckInlineEditor(environment);
    editors.push(editor);
    return {
      editor,
      body,
      card,
      owner,
      environment,
      begin: () => editor.begin(file, body),
      type(text) {
        editor.textarea.value = text;
        editor.textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
      }
    };
  };
  t.after(() => {
    editors.forEach(editor => editor.dispose());
    window.happyDOM.abort();
  });
  return {
    ...create(),
    create,
    window,
    frames,
    timers,
    notices,
    calls,
    file,
    other,
    files,
    sources,
    index,
    settings,
    registry,
    store,
    frame() {
      const jobs = [...frames.values()];
      frames.clear();
      jobs.forEach(fn => fn());
    },
    async autosave() {
      for (const [id, { fn, delay }] of timers) if (delay === 500) {
        timers.delete(id);
        fn();
      }
      await tick();
    }
  };
}

test('constructor owns autosave, concurrent finalisation and recent index refresh decisions', async t => {
  const s = subject(t);
  await s.begin();
  s.frame();
  s.type('Original appended');
  await s.autosave();
  assert.equal(s.sources.get('A.md'), 'Original appended');
  assert.equal(s.calls.filter(c => c === 'desk').length, 1);
  s.type('Original appended twice');
  assert.equal(s.editor.onRefresh('index'), 'defer');
  const a = s.editor.finish('escape'), b = s.editor.finish('outside-pointer');
  assert.equal(a, b);
  assert.equal(await a, true);
  assert.equal(s.calls.filter(c => c === 'edited').length, 1);
  assert.ok(s.calls.includes('metadata'));
  assert.ok(s.calls.includes('focus'));
  assert.equal(s.editor.isEditing, false);
  assert.equal(s.body.scrollTop, 19);
  assert.equal(s.frames.size, 0);
  assert.equal(s.timers.size, 0);
  assert.equal(s.editor.onRefresh('index'), 'metadata');
  s.other.stat.mtime++;
  assert.equal(s.editor.onRefresh('index'), 'render');
});

for (const reason of ['full', 'ordering']) test(reason + ' refresh waits for the edit then renders once', async t => {
  const s = subject(t);
  await s.begin();
  s.type('Changed');
  assert.equal(s.editor.onRefresh(reason), 'defer');
  assert.equal(await s.editor.finish('outside-pointer'), true);
  assert.equal(s.calls.filter(c => c === 'refresh').length, 1);
  assert.equal(s.calls.includes('edited'), false);
});

test('changed presentation turns a deferred index refresh into a full render', async t => {
  const s = subject(t);
  await s.begin();
  assert.equal(s.editor.onRefresh('index'), 'defer');
  s.other.stat.mtime++;
  await s.editor.finish('outside-pointer');
  assert.ok(s.calls.includes('refresh'));
});

test('conflicting save retains selection, scroll, return target and registry ownership until disposal and restoration', async t => {
  const s = subject(t);
  await s.begin();
  s.frame();
  s.type('My draft');
  s.editor.textarea.setSelectionRange(1, 4);
  s.editor.textarea.scrollTop = 37;
  s.sources.set('A.md', 'External edit');
  assert.equal(await s.editor.finish('view-close'), false);
  assert.equal(s.editor.isEditing, true);
  const other = s.create();
  await other.begin();
  assert.equal(other.editor.isEditing, false);
  assert.ok(s.calls.includes(s.owner));
  s.editor.dispose();
  assert.equal(s.frames.size, 0);
  assert.equal(s.timers.size, 0);
  await other.editor.restoreDetached();
  s.frame();
  assert.equal(other.editor.textarea.value, 'My draft');
  assert.equal(other.editor.textarea.selectionStart, 1);
  assert.equal(other.editor.textarea.selectionEnd, 4);
  assert.equal(other.editor.textarea.scrollTop, 37);
  other.editor.dispose();
  const draft = s.registry.takeDetached();
  assert.deepEqual(plain(draft.returnTarget), { surface: 'desk', pileId: 'p1' });
  assert.equal(draft.renderedScrollTop, 19);
});

test('protected text rejects destructive input, rename updates ownership, deletion keeps a recoverable draft', async t => {
  const s = subject(t);
  s.settings.protectFiledCardText = true;
  await s.begin();
  s.type('replaced');
  assert.equal(s.editor.textarea.value, 'Original');
  assert.equal(s.body.querySelector('[role="status"]').hidden, false);
  s.file.path = 'renamed.md';
  s.files.set(s.file.path, s.file);
  s.files.delete('A.md');
  s.sources.set(s.file.path, 'Original');
  s.editor.handlePathRename('A.md', s.file.path);
  assert.equal(s.editor.path, s.file.path);
  assert.equal(s.card.dataset.path, s.file.path);
  s.type('Original more');
  s.files.delete(s.file.path);
  s.editor.handlePathDeletion(s.file.path);
  assert.equal(await s.editor.finish('plugin-unload'), false);
  s.editor.dispose();
  const draft = s.registry.takeDetached();
  assert.equal(draft.path, 'renamed.md');
  assert.equal(draft.draft, 'Original more');
});

for (const outcome of ['resolve', 'reject']) test('dispose during prepare (' + outcome + ') releases ownership without mounting stale UI', async t => {
  const s = subject(t), gate = deferred();
  s.store.read = async () => {
    await gate.promise;
    if (outcome === 'reject') throw Error('late read');
    return 'Original';
  };
  const start = s.begin();
  await tick();
  assert.equal(s.editor.isStarting, true);
  s.editor.dispose();
  gate.resolve();
  await start;
  assert.equal(s.editor.isEditing, false);
  assert.equal(s.body.querySelector('textarea'), null);
  assert.equal(s.notices.length, 0);
  assert.equal(s.registry.acquire('A.md', s.create().owner), true);
});

test('a concurrent close suppresses rerendering after the final save', async t => {
  const s = subject(t), gate = deferred(), process = s.store.process;
  s.store.process = async (...args) => {
    await gate.promise;
    await process(...args);
  };
  await s.begin();
  s.type('Changed');
  const finish = s.editor.finish('escape');
  const close = s.editor.finish('view-close');
  gate.resolve();
  assert.equal(await finish, true);
  assert.equal(await close, true);
  assert.equal(s.calls.includes('edited'), false);
  s.editor.dispose();
  assert.equal(s.registry.takeDetached(), null);
});


test('disposal during an editing gate prevents its pending navigation action', async t => {
  const s = subject(t), gate = deferred(), process = s.store.process;
  let navigations = 0;
  s.store.process = async (...args) => {
    await gate.promise;
    await process(...args);
  };
  await s.begin();
  s.type('Changed');
  const action = s.editor.runAfter('navigate', () => navigations++);
  await tick();
  s.editor.dispose();
  gate.resolve();
  assert.equal(await action, false);
  assert.equal(navigations, 0);
});
