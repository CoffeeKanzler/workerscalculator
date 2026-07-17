# Snapshot Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make named snapshots reliable enough to be the isolation boundary for imported game saves.

**Architecture:** Give the application an explicit complete default state, then make snapshot/import/share loading replace every shared field from that schema instead of overlaying the current plan. Keep browser persistence local, but surface write failures and validate stored snapshot records before applying them.

**Tech Stack:** Browser ES modules, DOM APIs, `localStorage`, existing Node test runner, headless Chromium smoke verification.

---

### Task 1: Make shared state replacement deterministic

**Files:**
- Modify: `js/app.js`

- [x] **Step 1: Define all planner fields at startup**

Add `chains: [defaultChainPlan()]` and `activeChain: 0` to the initial state so visiting a tab cannot create a field that older snapshots did not capture.

- [x] **Step 2: Separate overlay and replacement semantics**

Retain a small overlay helper only for old-state migration, and add a replacement helper that walks `SHARE_KEYS`, deep-copies a supplied value when present, otherwise restores that key from a freshly-created default state. Normalize `cities`, `chains`, `activeCity`, and `activeChain` after replacement.

- [x] **Step 3: Route full-state entry points through replacement**

Use replacement for named snapshot load, JSON plan import, and shared-link load. These operations promise to switch plans, so no field from the previously open plan may survive merely because the incoming payload omitted it.

- [x] **Step 4: Verify the reproduced leak**

Run the app in headless Chromium, save a snapshot before creating a production chain, create a chain in the current plan, reload the earlier snapshot, and inspect `wr-planner-v1`. Expected: the loaded state contains only the snapshot/default chain and never the later current-plan chain.

### Task 2: Make snapshot persistence honest and usable

**Files:**
- Modify: `js/app.js`
- Modify: `js/i18n.js`

- [x] **Step 1: Validate the snapshot registry**

`loadSaves()` must accept only a plain object and ignore malformed entries rather than passing arbitrary parsed JSON to the renderer.

- [x] **Step 2: Stop swallowing storage failures**

Make `writeSaves()` return an explicit result carrying the browser error. Show a translated failure alert when quota/security restrictions prevent persistence; do not re-render as though saving succeeded.

- [x] **Step 3: Add visible success feedback**

Track a transient message after save/load/delete and render it beside the snapshot controls so icon-only actions have an observable result.

- [x] **Step 4: Preserve the selected slot after loading**

Because shared-state replacement intentionally excludes the transient slot name, keep the selected snapshot name and display it after switching plans.

- [x] **Step 5: Verify browser behavior**

Create English and German snapshots with different visible planner state, switch both directions, reload the page, and confirm both registry entries and the selected state persist.

### Task 3: Publish the checkpoint

**Files:**
- Modify: `ROADMAP.md`

- [x] **Step 1: Record snapshot status and save-import dependency**

Add a roadmap item explaining reliable named snapshots and that game-save import will create a new snapshot instead of overwriting the open plan.

- [x] **Step 2: Run repository verification**

Run `npm test` and the headless Chromium snapshot reproduction. Expected: all existing checks pass and the leak reproduction reports no current-plan fields after load.

- [ ] **Step 3: Commit and deploy**

Commit the snapshot foundation, integrate it into `main`, and push `main` so GitHub Pages deploys this stable prerequisite before the `/beta/` importer.
