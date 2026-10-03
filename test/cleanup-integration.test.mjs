import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { bundleFixture, installDomShims } from './helpers/view-fixture.mjs';

const load = await bundleFixture(
  "export { CardIndex } from './src/card-index.ts';" +
  "export { cardIndexConfig } from './src/card-index-config.ts';" +
  "export { DEFAULT_SETTINGS } from './src/settings.ts';" +
  "export { DeckView } from './src/deck-view.ts';" +
  "export { BookmarkService } from './src/bookmark-service.ts';" +
  "export { CardLinkPresenter } from './src/card-link-presenter.ts';" +
  "export * from './src/dom.ts';"
);
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));

test('snapshot builds preserve published queries and their independent lookup bundles', () => {
  const { CardIndex, cardIndexConfig, DEFAULT_SETTINGS } = load({ getLinkpath: value => value.split('#')[0] });
  let files = ['B.md', 'A.md', 'C.md'].map(path => ({ path, basename: path, stat: { mtime: 1 } }));
  let address = '1';
  const index = new CardIndex({
    vault: { getMarkdownFiles: () => files },
    metadataCache: {
      resolvedLinks: {},
      getFileCache: () => ({ frontmatter: { "slipbox-id": address }, links: [] }),
      getFirstLinkpathDest: path => files.find(file => file.path === path),
    }
  }, cardIndexConfig({ ...DEFAULT_SETTINGS, explicitBranchLinks: false, inferAddressBranches: false }));
  assert.equal(index.snapshot.lookups.byPath.size, 0);
  const first = index.buildSnapshot();
  assert.equal(index.filedByPath('A.md'), undefined);
  index.publish(first);
  assert.equal(index.filedByPath('A.md'), first.lookups.byPath.get('A.md'));
  assert.deepEqual(plain(index.filedAtAddress('1').map(card => card.path)), plain(first.filed.map(card => card.path)));
  address = '2';
  files = [files[0]];
  const second = index.buildSnapshot();
  assert.equal(index.filedByPath('A.md'), first.lookups.byPath.get('A.md'));
  assert.equal(index.firstFiledAtAddress('2'), undefined);
  assert.equal(first.lookups.byPath.size, 3);
  assert.equal(first.lookups.byAddress.get('1').length, 3);
  index.publish(second);
  assert.equal(index.filedByPath('A.md'), undefined);
  assert.equal(index.firstFiledAtAddress('1'), undefined);
  assert.equal(index.firstFiledAtAddress('2').path, 'B.md');
  assert.equal(index.filedIndexForPath('B.md'), 0);
  files = [];
  index.publish(index.buildSnapshot());
  assert.equal(index.snapshot.lookups.byPath.size, 0);
  assert.equal(index.filedIndexForPath('B.md'), -1);
  assert.equal(second.lookups.byPath.size, 1);
});

test('bookmark service alone repaints each view, including rejection and persistence failure', async () => {
  const notices = [];
  const { DeckView, BookmarkService } = load({ Notice: class { constructor(message) { notices.push(message); } } });
  let available = false, persistence = 'saved';
  const paints = [[], []], displayed = [new Set(), new Set()];
  const views = paints.map((log, i) => Object.assign(Object.create(DeckView.prototype), {
    cardFocus: { surface: 'deck', path: 'A.md' },
    updateBookmarkState(paths) {
      log.push([...paths]);
      displayed[i] = paths;
    },
  }));
  const service = new BookmarkService([], {
    isAvailable: () => available,
    label: path => path,
    changed(items) { for (const view of views) view.updateBookmarkState(new Set(items.map(item => item.path))); },
    persist: async () => persistence,
    notify: message => notices.push(message)
  });
  for (const view of views) view.plugin = { bookmarks: service };
  await views[0].addBookmarkToCurrent();
  assert.deepEqual(paints, [[], []]);
  assert.equal(displayed[0].has('A.md'), false);
  available = true;
  await views[0].addBookmarkToCurrent();
  assert.deepEqual(paints, [[['A.md']], [['A.md']]]);
  await views[1].addBookmarkToCurrent();
  assert.equal(paints[0].length, 1);
  await views[1].removeBookmark('A.md');
  assert.deepEqual(paints[0].at(-1), []);
  persistence = 'failed';
  const count = notices.length;
  await views[0].toggleCardBookmark('A.md');
  assert.equal(displayed[1].has('A.md'), true);
  assert.equal(paints[0].length, 3);
  assert.equal(notices.length, count);
  await views[1].toggleCardBookmark('A.md');
  assert.equal(displayed[0].size, 0);
});

for (const reason of ['rendered-link', 'desk-rendered-link']) test(reason + ': link resolution, hover and editing gates remain surface independent', async t => {
  const window = new Window();
  installDomShims(window);
  t.after(() => window.happyDOM.abort());
  const { CardLinkPresenter, DEFAULT_SETTINGS } = load({ getLinkpath: text => text.split('#')[0] });
  const filed = { path: 'A.md', address: '1', file: { path: 'A.md' } }, unfiled = { path: 'U.md' };
  const events = [];
  let allowed = true;
  const app = {
    metadataCache: {
      getFirstLinkpathDest: path => path === 'A' ? filed.file : path === 'U' ? unfiled : null,
      getFileCache: () => ({ links: [] }),
      fileToLinktext: file => file.path
    },
    workspace: { openLinkText: async (...args) => events.push(['note', ...args]) }
  };
  const index = {
    filedByFile: file => file === filed.file ? filed : undefined,
    filedByPath: path => path === filed.path ? filed : undefined,
    firstFiledAtAddress: address => address === '1' ? filed : undefined,
    incomingBranchesForPath: () => [{ sourcePath: 'A.md', label: 'Branch' }, { sourcePath: 'gone.md', label: 'Gone' }]
  };
  const presenter = new CardLinkPresenter({
    app,
    index,
    cards: { title: () => 'Title' },
    settings: () => ({ ...DEFAULT_SETTINGS, previewLinksOnHover: true, followLinksFromCards: true, showTooltips: false }),
    preview: (_event, _target, ...args) => events.push(['preview', ...args]),
    activate: async path => events.push(['card', path]),
    runAfterEditing: async (actual, action) => {
      assert.equal(actual, reason);
      if (allowed) await action();
      return allowed;
    }
  });
  const body = window.document.body.createDiv();
  const link = body.createEl('a', { cls: 'internal-link', attr: { href: 'A' } });
  presenter.attach(body, 'source.md', reason);
  presenter.outline(body, { path: 'source.md' });
  presenter.outline(body, { path: 'source.md' });
  const click = async (href, options = {}) => {
    link.setAttribute('href', href);
    link.dispatchEvent(new window.MouseEvent(options.button === 1 ? 'auxclick' : 'click', { bubbles: true, cancelable: true, ...options }));
    await tick();
  };
  await click('A');
  assert.deepEqual(events.splice(0), [['card', 'A.md']]);
  await click('1');
  assert.deepEqual(events.splice(0), [['card', 'A.md']]);
  await click('U');
  assert.deepEqual(events.splice(0), [['note', 'U', 'source.md', false]]);
  for (const options of [{ metaKey: true }, { ctrlKey: true }, { button: 1 }]) {
    await click('A', options);
    assert.deepEqual(events.splice(0), [['note', 'A', 'source.md', true]]);
  }
  allowed = false;
  await click('A');
  assert.equal(events.length, 0);
  link.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
  assert.deepEqual(events.splice(0), [['preview', 'A', 'source.md']]);
  allowed = true;
  link.className = '';
  window.open = (...args) => events.push(['external', ...args]);
  await click('https://example.org/');
  assert.deepEqual(events.splice(0), [['external', 'https://example.org/', '_blank', 'noopener']]);
  assert.deepEqual(plain(presenter.branchesForPath('target.md')), [{ label: 'Branch', sourcePath: 'A.md', sourceAddress: '1', sourceTitle: 'Title', linktext: 'A.md' }]);
});

test('DOM helpers retain detached-document ownership and escape Desk paths', t => {
  const window = new Window();
  installDomShims(window);
  t.after(() => window.happyDOM.abort());
  const { createHtmlElement, createSvgElement, getResizeObserver, findDeskCard } = load();
  const root = createHtmlElement(window.document, 'div'), card = root.createDiv({ cls: 'slipbox-desk-card' });
  card.dataset.cardRef = 'folder/a[b].md';
  assert.equal(findDeskCard(root, card.dataset.cardRef), card);
  assert.equal(findDeskCard(root, 'missing.md'), null);
  assert.equal(root.ownerDocument, window.document);
  assert.equal(createSvgElement(window.document, 'svg').namespaceURI, 'http://www.w3.org/2000/svg');
  // Happy DOM cannot parse an escaped quote in an attribute selector; check that boundary directly.
  root.querySelector = selector => {
    assert.ok(selector.includes(window.CSS.escape('a"b.md')));
    return card;
  };
  assert.equal(findDeskCard(root, 'a"b.md'), card);
  window.ResizeObserver = undefined;
  assert.equal(getResizeObserver(window), null);
});
