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


function control() {
  return { value: undefined, disabled: undefined, change: undefined,
    setValue(value) { this.value=value;return this; }, setDisabled(value) { this.disabled=value;return this; },
    addOption() { return this; }, onChange(callback) { this.change=callback;return this; } };
}

test('simple toggles save explicit false without refreshing the settings page', async () => {
  const {tab,host}=subject();let refreshes=0;tab.updatePreservingScroll=()=>refreshes++;
  for(const key of ['showTitleInDeck','showTooltips','showDeckMap','restrictViewedCardPaste','previewLinksOnHover','followLinksFromCards','protectFiledCardText','showAutomaticBacklinks','allowCardScrolling','fanHeadersAtBottom']) {
    const toggle=control(),before=structuredClone(host.settings);
    tab.renderToggle({addToggle:callback=>callback(toggle)},key);assert.equal(toggle.value,before[key]);
    toggle.change(false);await Promise.resolve();assert.deepEqual(host.settings,{...before,[key]:false});
  }
  assert.equal(refreshes,0);
});

test('card-size dropdowns use their own keys and keep invalid-value normalization', async () => {
  const {tab,host}=subject();
  for(const key of ['mainCardSize','deskCardSize']) {
    const dropdown=control();tab.renderCardSize({addDropdown:callback=>callback(dropdown)},key);
    for(const value of ['small','large','invalid']) {dropdown.change(value);await Promise.resolve();assert.equal(host.settings[key],value==='invalid'?'medium':value);}
  }
});

test('branch dependency controls retain disabled state and settings refresh behaviour', async () => {
  const {tab,host}=subject();let refreshes=0;tab.updatePreservingScroll=()=>refreshes++;
  for(const enabled of [false,true]) {
    host.settings={...host.settings,explicitBranchLinks:enabled};
    for(const method of ['renderShowBranchLabels','renderOutlineBranchLinks','renderHideBranchLinkMarkers']) {
      const toggle=control();let rowDisabled;
      tab[method]({setDisabled:value=>rowDisabled=value,addToggle:callback=>callback(toggle)});
      assert.equal(rowDisabled,!enabled);assert.equal(toggle.disabled,!enabled);
    }
  }
  const toggle=control();tab.renderExplicitBranchLinks({addToggle:callback=>callback(toggle)});toggle.change(false);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(refreshes,1);assert.equal(host.settings.explicitBranchLinks,false);
});
