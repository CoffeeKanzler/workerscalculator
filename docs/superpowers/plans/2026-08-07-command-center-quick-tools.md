# Command Center Quick Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, browser-local quick-tools rail below the four command-center sections without removing the existing navigation or More Tools catalog.

**Architecture:** Keep the authoritative tab list in `js/app.js`, add pure validation/default/reordering helpers to `js/ui/command_center.js`, and let `renderTabs()` own the localStorage adapter plus DOM rendering. The quick rail uses existing tab IDs and `state.tab`, so no second navigation model is introduced.

**Tech Stack:** Vanilla ES modules, DOM builder helpers already used by `js/app.js`, CSS in `css/style.css`, German/English `STRINGS`, Node `node:test`.

## Global Constraints

- Preserve the existing Observe/Diagnose/Plan/Compare navigation and More Tools menu.
- Store only validated quick-tool tab IDs under `wr-command-quick-tools-v1` in browser-local storage.
- Allow every available tool in the personal list, deduplicate it, and keep a deliberately empty saved list empty.
- Keep the editor in normal document flow so it cannot open outside the viewport.
- Do not stage or alter unrelated untracked reports, images, or workspace files.

---

### Task 1: Add failing pure quick-tools tests

**Files:**
- Modify: `tests/command_center_ui.test.mjs`

**Interfaces:**
- Consumes: planned helpers `normalizeQuickTools`, `defaultQuickTools`, and `reorderQuickTools`
- Produces: executable contracts for filtering, defaults, limit, deduplication, empty lists, and ordering

- [ ] **Step 1: Write the failing tests**

Extend the import and add:

```js
test('quick tools normalize saved ids without inventing or duplicating links', () => {
  assert.deepEqual(normalizeQuickTools(
    ['map', 'stale', 'map', 'research', 'prices'],
    ['map', 'research', 'prices'],
  ), ['map', 'research', 'prices']);
  assert.deepEqual(normalizeQuickTools([], ['map', 'research']), []);
  assert.equal(normalizeQuickTools(Array.from({ length: 10 }, (_, i) => `tool-${i}`),
    Array.from({ length: 10 }, (_, i) => `tool-${i}`)).length, 8);
});

test('quick tools provide only available defaults and reorder immutably', () => {
  assert.deepEqual(defaultQuickTools(['map', 'chain']), ['map', 'chain']);
  const original = ['map', 'chain', 'research'];
  assert.deepEqual(reorderQuickTools(original, 'research', -1), ['map', 'research', 'chain']);
  assert.deepEqual(original, ['map', 'chain', 'research']);
  assert.deepEqual(reorderQuickTools(original, 'map', -1), original);
  assert.deepEqual(reorderQuickTools(original, 'research', 1), original);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/command_center_ui.test.mjs`

Expected: the test file fails at module import because the new helper exports do not exist yet.

### Task 2: Implement pure quick-tools helpers

**Files:**
- Modify: `js/ui/command_center.js`

**Interfaces:**
- Produces: `QUICK_TOOLS_STORAGE_KEY`, `QUICK_TOOLS_DEFAULTS`, `normalizeQuickTools(ids, allowedTabs)`, `defaultQuickTools(allowedTabs)`, and `reorderQuickTools(ids, tab, direction)`

- [ ] **Step 1: Write the minimal helper implementation**

Use these contracts:

```js
export const QUICK_TOOLS_STORAGE_KEY = 'wr-command-quick-tools-v1';
export const QUICK_TOOLS_DEFAULTS = Object.freeze(['map', 'cities', 'chain', 'research']);

export function normalizeQuickTools(ids, allowedTabs = []) {
  const allowed = new Set(allowedTabs);
  return [...new Set(Array.isArray(ids) ? ids : [])]
    .filter(id => allowed.has(id));
}

export function defaultQuickTools(allowedTabs = []) {
  return normalizeQuickTools(QUICK_TOOLS_DEFAULTS, allowedTabs);
}

export function reorderQuickTools(ids, tab, direction) {
  const result = [...ids];
  const index = result.indexOf(tab);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= result.length) return result;
  [result[index], result[next]] = [result[next], result[index]];
  return result;
}
```

- [ ] **Step 2: Run the focused helper tests**

Run: `node --test tests/command_center_ui.test.mjs`

Expected: all command-center tests pass, including the new quick-tools cases.

### Task 3: Add the local storage adapter and quick-tools editor

**Files:**
- Modify: `js/app.js` in the navigation constants and `renderTabs()` area
- Modify: `tests/release_ui_contract.test.mjs`

**Interfaces:**
- Consumes: `TABS`, the quick-tools helpers, `state.tab`, and existing `update()`
- Produces: a `quick-tools-bar` with active links, a management editor, and safe browser-local persistence

- [ ] **Step 1: Write the failing UI contract test**

Add a test that reads `app` and asserts:

```js
assert.match(app, /wr-command-quick-tools-v1/);
assert.match(app, /class: 'quick-tools-bar'/);
assert.match(app, /class: 'quick-tools-editor'/);
assert.match(app, /reorderQuickTools\(/);
```

Run: `node --test tests/release_ui_contract.test.mjs`

Expected: the new assertions fail because the app has no quick-tools storage or renderer yet.

- [ ] **Step 2: Implement safe local storage and state transitions**

After `TABS` is defined, initialize a mutable `quickToolTabs` from localStorage. Treat a parsed JSON array as intentional even when empty, normalize it against `TABS`, and fall back to `defaultQuickTools(TABS)` on missing/invalid storage. Wrap both reads and writes in `try/catch`.

Use small functions with these behaviors:

```js
function loadQuickTools() { /* safe read, parse, normalize, default */ }
function saveQuickTools() { /* safe JSON write */ }
function setQuickTools(next) { quickToolTabs = normalizeQuickTools(next, TABS); saveQuickTools(); update(); }
```

Render each quick link as an existing `state.tab` button with `aria-current="page"` when active. Add an editor button which toggles an in-flow panel. The panel shows selected rows with remove/up/down controls and an available-tool grid that toggles each valid tab ID. Use the existing `labels` map so all tools have their established translations; exclude `LEGACY_TAB_ALIASES` from the picker.

- [ ] **Step 3: Run the focused UI contract**

Run: `node --test tests/release_ui_contract.test.mjs`

Expected: the new source contract and all existing release contracts pass.

### Task 4: Apply the visual separation and localized copy

**Files:**
- Modify: `css/style.css`
- Modify: `js/i18n.js`
- Modify: `tests/release_ui_contract.test.mjs`

**Interfaces:**
- Consumes: `quick-tools-bar`, `quick-tools-links`, `quick-tools-editor`, and management button classes
- Produces: an accessible two-tier Blueprint/Amber navigation treatment in both languages

- [ ] **Step 1: Write the failing style and translation contract**

Assert that both language maps define each new key twice and that CSS contains the layout classes:

```js
for (const key of ['quickTools', 'quickToolsHint', 'quickToolsManage', 'quickToolsSelected', 'quickToolsAvailable', 'quickToolsEmpty', 'quickToolsMoveUp', 'quickToolsMoveDown', 'quickToolsRemove']) {
  assert.equal((i18n.match(new RegExp(`${key}:`, 'g')) ?? []).length, 2, `${key} needs both languages`);
}
assert.match(css, /\.quick-tools-bar/);
assert.match(css, /\.quick-tools-editor/);
```

Run: `node --test tests/release_ui_contract.test.mjs`

Expected: the new assertions fail until strings and styles are added.

- [ ] **Step 2: Implement the localized copy and CSS**

Add German and English strings for the rail title, hint, editor, selected/available sections, empty state, and move/remove control labels. Style the section rail with a quiet Blueprint border/ink surface, the quick rail with a restrained Amber left edge, and the editor as an in-flow grid with compact controls. Add a narrow-screen media rule that collapses the editor to one column and lets tool links wrap.

- [ ] **Step 3: Run the release UI contracts**

Run: `node --test tests/release_ui_contract.test.mjs tests/command_center_ui.test.mjs`

Expected: all UI contracts pass.

### Task 5: Refresh cache markers and verify the delivered navigation

**Files:**
- Modify: `index.html`, `data/VERSION.json`, and any transitive cache markers changed by the bump script

**Interfaces:**
- Consumes: the completed quick-tools renderer, CSS, and translations
- Produces: a cache-safe browser release with focused test evidence

- [ ] **Step 1: Bump the release markers**

Run: `node tools/bump_cache_versions.mjs js/ui/command_center.js js/app.js js/i18n.js css/style.css`

Expected: the shell and affected module markers move to the next app build without touching unrelated data.

- [ ] **Step 2: Run syntax and focused tests**

Run: `node --check js/app.js && node --check js/ui/command_center.js && node --test tests/command_center_ui.test.mjs tests/release_ui_contract.test.mjs`

Expected: both syntax checks and every focused UI test pass.

- [ ] **Step 3: Review the diff**

Run: `git diff --check && git diff --stat && git status --short`

Expected: only quick-tools source, tests, translations, styles, cache markers, and the related plan/spec are tracked; unrelated untracked files remain untouched.

- [ ] **Step 4: Commit the implementation**

```bash
git add js/ui/command_center.js js/app.js js/i18n.js css/style.css tests/command_center_ui.test.mjs tests/release_ui_contract.test.mjs index.html data/VERSION.json
git commit -m "feat: add personal command center quick tools"
```
