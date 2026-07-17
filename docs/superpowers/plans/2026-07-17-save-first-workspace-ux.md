# Save-first Workspace UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the beta into a save-first command center with focused, area-scoped City and Production workspaces and progressively disclosed secondary controls.

**Architecture:** Preserve the existing state and calculation modules. Restructure the DOM emitted by `js/app.js`, add only presentation state booleans where native `details` is insufficient, place all new copy in `js/i18n.js`, and implement the responsive hierarchy in `css/style.css`.

**Tech Stack:** Browser-native ES modules, DOM construction helpers in `js/app.js`, CSS Grid/Flexbox, Node test runner, Playwright browser smoke checks.

---

### Task 1: Simplify the Start experience

**Files:**
- Modify: `js/app.js` (`renderHome`, `renderLocalWorkshopPicker`)
- Modify: `js/i18n.js` (start and snapshot labels)
- Modify: `css/style.css` (start page hierarchy)

- [ ] **Step 1: Record the current browser assertions**

Run a Playwright check which asserts that `#/home` contains the current republic, open-save action, manual-plan action, Workshop setup, and snapshot list. Expected: all exist and the snapshot list is permanently expanded.

- [ ] **Step 2: Collapse secondary start-page content**

Wrap Workshop setup and saved snapshots in native details sections while leaving the current republic and open-save action visible:

```js
const saved = namedSnapshotNames.length ? el('details', { class: 'secondary-section recent-republics' },
  el('summary', {}, `${t('savedSnapshots')} (${namedSnapshotNames.length})`),
  el('div', { class: 'snapshot-grid' }, ...snapshotButtons)) : null;
```

- [ ] **Step 3: Make current/open-save the dominant path**

Keep the current republic full width and give the open-save card the primary action style. Move manual planning below or beside it with lower visual weight.

- [ ] **Step 4: Verify desktop and mobile Start**

At 1365 px and 390 px, confirm only the three primary choices are visible initially and both details sections expand with keyboard and pointer input.

### Task 2: Replace City tabs with an area workspace bar

**Files:**
- Modify: `js/app.js` (`renderCity`)
- Modify: `js/i18n.js` (workspace and assumptions labels)
- Modify: `css/style.css` (`.workspace-bar`, `.workspace-actions`, city responsive rules)

- [ ] **Step 1: Preserve selection behavior in a selector**

Replace `cityTabs` with a labelled select whose value is `state.activeCity`:

```js
selectInput(state.cities.map((city, index) => [String(index), city.name || `${t('city')} ${index + 1}`]),
  String(state.activeCity), value => { state.activeCity = Number(value); })
```

- [ ] **Step 2: Keep create/delete contextual**

Place add and delete buttons beside the selector. Show delete only with more than one city; keep Return to Republic at the start of the bar for imported saves.

- [ ] **Step 3: Collapse planning assumptions**

Move name, productivity, cable, exchanger, water divisor, and Vanilla-only inputs into a `details.planner-assumptions` section. Keep the utility-detail toggle in that section.

- [ ] **Step 4: Add a useful empty state**

When `city.rows` is empty, display `t('emptyCityPlan')` immediately above the Add building action while retaining the service summary.

- [ ] **Step 5: Verify imported drill-down**

From the Mühlheim command-center row, click Open city and assert the selector value is Mühlheim, the 48/updated unresolved warning is visible, and no horizontal city-button strip exists.

### Task 3: Turn Production into a scope-focused workspace

**Files:**
- Modify: `js/app.js` (`renderProduction`)
- Modify: `js/i18n.js` (scope/assumption/empty labels)
- Modify: `css/style.css` (workspace and planner-summary layout)

- [ ] **Step 1: Promote scope and period**

Create a workspace bar containing Return to Republic, the area selector, and day/month/year selector. Remove these controls from the general settings block.

- [ ] **Step 2: Collapse economic and agricultural assumptions**

Place productivity, seasons, calendar flow, fertilizer, input price mode, delivery cost, and field counts into one `details.planner-assumptions` block.

- [ ] **Step 3: Keep plan consequences near the rows**

Render totals next to the building table on wide screens and stack them below on narrow screens. Keep the resource balance below the rows. Do not alter `evaluatePlan` inputs.

- [ ] **Step 4: Add an area-specific empty state**

When `visibleRows.length === 0`, show `t('emptyProductionArea')` and make Add row use the currently selected numeric scope.

- [ ] **Step 5: Verify exact imported settings**

Open an imported industrial scope and confirm current/configured staffing, mine quality, productivity, and profit still match the imported state after switching scopes.

### Task 4: Tighten Republic Overview around decisions

**Files:**
- Modify: `js/app.js` (`renderRepublic`)
- Modify: `js/i18n.js` (operational/history section labels)
- Modify: `css/style.css` (command-center sections)

- [ ] **Step 1: Reduce top-level metric noise**

Keep population, current staffing, productivity, configured workers, and net workers in the first metric grid. Move building count, occupied-area count, and research completion into a compact source-summary line.

- [ ] **Step 2: Keep alerts and areas above analysis**

Render alerts and the area table immediately after the metrics. Preserve inline unresolved counts and both drill-down actions.

- [ ] **Step 3: Collapse history and planning internals**

Wrap charts in `details.secondary-section` titled with record count and wrap city/chain planning internals in the existing Planning details section. Research remains independently collapsible.

- [ ] **Step 4: Verify view switching**

Assert Actual, Plan, and Difference preserve their existing values and area rows after the hierarchy change.

### Task 5: Responsive polish and release verification

**Files:**
- Modify: `css/style.css`
- Modify: `index.html`, `beta/index.html` (cache versions)
- Modify: `ROADMAP.md` (mark workspace UX checkpoint)

- [ ] **Step 1: Implement reusable responsive workspace styles**

Add `.workspace-bar`, `.workspace-context`, `.workspace-actions`, `.secondary-section`, `.planner-assumptions`, and mobile rules. Ensure labels wrap and selects can shrink below 700 px.

- [ ] **Step 2: Run automated verification**

Run `rtk npm test`, `rtk node --check js/app.js`, and `rtk git diff --check`. Expected: all tests pass, syntax check exits zero, no whitespace errors.

- [ ] **Step 3: Run save-backed browser verification**

Import `/home/nexx/bigsavegame`, visit all four primary screens, exercise area drill-down and details toggles, and assert no `pageerror` or failed local response.

- [ ] **Step 4: Inspect desktop and mobile screenshots**

Capture full-page screenshots at 1365×768 and 390×844. Confirm primary actions and current area are visible without horizontal scrolling and secondary sections are initially collapsed.

- [ ] **Step 5: Commit and deploy**

Commit the UX files and push `HEAD:main`. Verify GitHub Pages serves the new app version under `/beta/`.

