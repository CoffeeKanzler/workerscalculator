import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

test('the shipped shell identifies the Command Center and opens on the overview', async () => {
  const [index, app, i18n] = await Promise.all([
    fs.readFile(path.join(ROOT, 'index.html'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/i18n.js'), 'utf8'),
  ]);
  assert.match(index, /<title>Republic Command Center/);
  assert.match(index, /Republic Command Center/);
  assert.match(app, /tab: HAS_SAVE_WORKSPACE \? 'home' : 'republic'/);
  assert.match(app, /HAS_SAVE_WORKSPACE \? \['home'\]/);
  assert.match(i18n, /appTitle: 'Republic Command Center'/);
});

// The save workspace now ships in the standard release, so the beta path has no
// features left of its own. It stays as a redirect because bookmarks and forum
// links still point at it, and it must not boot a second copy of the app.
test('the beta path redirects to the stable release instead of booting its own app', async () => {
  const beta = await fs.readFile(path.join(ROOT, 'beta/index.html'), 'utf8');

  assert.doesNotMatch(beta, /<script type="module" src="\.\.\/js\/app\.js/);
  assert.match(beta, /<meta http-equiv="refresh" content="0; url=\.\.\/">/);
  assert.match(beta, /<link rel="canonical" href="\.\.\/">/);
  assert.match(beta, /location\.replace/);
});

test('the standard release carries the save workspace so nothing stays beta-only', async () => {
  const [index, runtimeConfig] = await Promise.all([
    fs.readFile(path.join(ROOT, 'index.html'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/runtime/runtime_config.js'), 'utf8'),
  ]);
  assert.match(index, /data-runtime-variant="standard"/);
  assert.match(runtimeConfig, /mode === 'hosted'/);
});

test('the operations desk stays crisp and uses the ultrawide runway intentionally', async () => {
  const css = await fs.readFile(path.join(ROOT, 'css/style.css'), 'utf8');
  assert.match(css, /section \{ animation: none; \}/);
  assert.match(css, /@media \(min-width: 4000px\)[\s\S]*4200px/);
  assert.match(css, /body \{ font-size: 20px; \}/);
  assert.match(css, /\.more-nav \{[^}]*display: inline-block;/);
  assert.match(css, /\.more-nav \{[^}]*justify-self: start;/);
  assert.match(css, /\.command-center > \.area-table-panel[\s\S]*grid-column: span 5;/);
  assert.match(css, /\.area-table-panel \.area-health[\s\S]*table-layout: fixed;/);
});

test('the more-tools menu opens inside the viewport when navigation wraps', async () => {
  const [css, app] = await Promise.all([
    fs.readFile(path.join(ROOT, 'css/style.css'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8'),
  ]);
  const baseMenuRule = css.match(/\.more-nav-menu \{([^}]*)\}/)?.[1] ?? '';
  assert.match(baseMenuRule, /left:\s*0/);
  assert.match(baseMenuRule, /right:\s*auto/);
  assert.match(baseMenuRule, /max-width:\s*calc\(100vw - 32px\)/);
  assert.match(baseMenuRule, /max-height:\s*min\(35vh, 520px\)/);
  assert.match(baseMenuRule, /overflow-y:\s*auto/);
  assert.match(app, /function positionMoreToolsMenu\(details\)/);
  assert.match(app, /const availableAbove/);
  assert.match(app, /menu\.style\.maxHeight/);
});

test('the command center ships a personal quick-tools rail', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  assert.match(app, /QUICK_TOOLS_STORAGE_KEY/);
  assert.match(app, /class: 'quick-tools-bar'/);
  assert.match(app, /class: 'quick-tools-editor'/);
  assert.match(app, /reorderQuickTools\(/);
});

test('the quick-tools rail has bilingual copy and an in-flow visual layer', async () => {
  const [css, i18n] = await Promise.all([
    fs.readFile(path.join(ROOT, 'css/style.css'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/i18n.js'), 'utf8'),
  ]);
  for (const key of ['quickTools', 'quickToolsHint', 'quickToolsManage', 'quickToolsSelected', 'quickToolsAvailable', 'quickToolsEmpty', 'quickToolsMoveUp', 'quickToolsMoveDown', 'quickToolsRemove']) {
    assert.equal((i18n.match(new RegExp(`${key}:`, 'g')) ?? []).length, 2, `${key} needs both languages`);
  }
  assert.match(css, /\.quick-tools-bar/);
  assert.match(css, /\.quick-tools-editor/);
});

test('the evidence mode rail is hidden by default while its state logic remains available', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  assert.match(app, /const SHOW_EVIDENCE_RAIL = false/);
  assert.match(app, /\.\.\.\(SHOW_EVIDENCE_RAIL \? \[renderEvidenceRail\(\)\] : \[\]\)/);
});

// The IA rework: Observe reports, Plan edits. The shipped app has to carry the
// two new tabs the section table names, in both languages.
test('the shipped app registers the read-only Cities tab and the split price overrides', async () => {
  const [app, i18n] = await Promise.all([
    fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/i18n.js'), 'utf8'),
  ]);

  for (const tab of ['cities', 'priceedit']) {
    assert.match(app, new RegExp(`TABS = \\[[\\s\\S]*'${tab}'`), `TABS is missing ${tab}`);
    assert.match(app, new RegExp(`case '${tab}': return render`), `no renderer dispatched for ${tab}`);
  }
  assert.match(app, /cities: 'tabCities'/);
  assert.match(app, /priceedit: 'tabPriceEdit'/);

  // Both languages, or the nav renders an untranslated key.
  assert.equal((i18n.match(/tabCities:/g) ?? []).length, 2);
  assert.equal((i18n.match(/tabPriceEdit:/g) ?? []).length, 2);
  assert.equal((i18n.match(/citiesEmpty:/g) ?? []).length, 2);
  assert.equal((i18n.match(/planThisArea:/g) ?? []).length, 2);
});

test('the Observe price table carries no editable control', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  const renderPrices = app.slice(
    app.indexOf('function renderPrices()'),
    app.indexOf('function renderPriceEdit()'),
  );

  assert.ok(renderPrices.length > 0, 'renderPrices and renderPriceEdit must both exist');
  assert.match(renderPrices, /priceTable\(\{ editable: false \}\)/);
  // The scalars and the override reset belong to Plan.
  assert.doesNotMatch(renderPrices, /scalars/);
  assert.doesNotMatch(renderPrices, /state\.overrides\[/);
  assert.doesNotMatch(renderPrices, /el\('input'/);
});

test('the Cities tab reads the save and never writes to it', async () => {
  const app = await fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8');
  const renderCities = app.slice(
    app.indexOf('function renderCities()'),
    app.indexOf('function renderCity()'),
  );

  assert.match(renderCities, /state\.saveImport\?\.scopes/);
  assert.doesNotMatch(renderCities, /state\.saveImport[^;\n]*=/);
  // Search and sorting change only the report; navigation is the only planning action.
  assert.match(renderCities, /type: 'search'/);
  assert.match(renderCities, /state\.tab = 'city'/);
});

test('vehicle recommendations expose a bilingual decade filter contract', async () => {
  const [app, i18n] = await Promise.all([
    fs.readFile(path.join(ROOT, 'js/app.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'js/i18n.js'), 'utf8'),
  ]);
  assert.match(app, /vehicle-recommendation-decade/);
  assert.match(app, /recommendationDecade/);
  assert.match(app, /noVehicleRecommendations/);
  assert.equal((i18n.match(/recommendationDecade:/g) ?? []).length, 2);
  assert.equal((i18n.match(/allDecades:/g) ?? []).length, 2);
  assert.equal((i18n.match(/noVehicleRecommendations:/g) ?? []).length, 2);
});
