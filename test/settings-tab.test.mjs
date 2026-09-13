import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInThisContext } from 'node:vm';
import { build } from 'esbuild';

const output = await build({
  stdin: {
    contents: `
      export { SlipboxSettingTab } from './src/settings-tab.ts';
      export { DEFAULT_SETTINGS } from './src/settings.ts';
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['obsidian'],
});
const module = { exports: {} };
runInThisContext('(function(require, module, exports) {' + output.outputFiles[0].text + '\n})')(
  () => ({ PluginSettingTab: class {} }), module, module.exports,
);
const { SlipboxSettingTab, DEFAULT_SETTINGS } = module.exports;

function subject() {
  const host = {
    settings: structuredClone(DEFAULT_SETTINGS),
    async updateSettings(settings) { this.settings = settings; },
  };
  const tab = new SlipboxSettingTab({}, {}, host);
  return { tab, host };
}

function rows(items) {
  return items.flatMap(item => item.items ? rows(item.items) : [item]);
}

test('settings rows have distinct reconciliation names, including header buttons and shortcuts', () => {
  const { tab } = subject();
  const definitions = rows(tab.getSettingDefinitions());
  const names = definitions.map(definition => definition.name);
  assert.deepEqual(names.filter((name, index) => names.indexOf(name) !== index), []);
  assert.deepEqual(rows(tab.getSettingDefinitions()).map(row => row.name), names);
});

test('header section renderers never return a Setting object as a cleanup callback', () => {
  const { tab } = subject();
  for (const heading of ['Deck cards', 'Desk cards', 'Viewed cards']) {
    const definition = rows(tab.getSettingDefinitions()).find(row => row.name === heading);
    let rendered = 0;
    const setting = { setHeading() { rendered += 1; return this; } };
    // Obsidian calls any returned value before replacing or closing the row.
    for (let cycle = 0; cycle < 2; cycle += 1) {
      const cleanup = definition.render(setting);
      assert.equal(cleanup, undefined, heading);
    }
    assert.equal(rendered, 2);
  }
});

test('header toggles with contextual names still update only their own card surface', async () => {
  const { tab, host } = subject();
  const before = structuredClone(host.settings.cardHeaderButtons);
  for (const [surface, heading] of [['deck', 'Deck cards'], ['desk', 'Desk cards'], ['viewed', 'Viewed cards']]) {
    const definition = rows(tab.getSettingDefinitions()).find(row => row.name === `Open Markdown note (${heading})`);
    let onChange;
    let initialValue;
    const toggle = {
      setValue(value) { initialValue = value; return this; },
      onChange(callback) { onChange = callback; return this; },
    };
    assert.equal(definition.render({ addToggle(callback) { callback(toggle); return this; } }), undefined);
    assert.equal(initialValue, before[surface]['open-note']);
    onChange(!initialValue);
    await Promise.resolve();
    before[surface]['open-note'] = !initialValue;
    assert.deepEqual(host.settings.cardHeaderButtons, before);
  }
});
