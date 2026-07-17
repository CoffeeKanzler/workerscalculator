# Save Import Beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a local-only `/beta/` workflow that imports a W&R save into a new editable snapshot and integrates recognized buildings into City Planner, Production Planner, and Republic Overview by the game’s own named settlement scopes.

**Architecture:** A focused browser parser reads only `namepoints.bin` and `buildings_game.bin` from a selected directory. The importer uses the primary settlement ID stored in each building record, maps known game IDs onto existing planner data, stores unrecognized records in an explicit report, and writes the result through the repaired named-snapshot boundary. The root app remains stable; `/beta/index.html` enables the import tab while sharing the same versioned modules and data.

**Tech Stack:** Browser ES modules, `File`/`ArrayBuffer`/`DataView`, directory file input, existing planner state and calculation modules, GitHub Pages.

---

### Task 1: Productize the validated binary parsers

**Files:**
- Create: `js/savegame.js`

- [x] **Step 1: Parse `namepoints.bin` exactly**

Read the top-level count, each `0x130` fixed settlement record, `memberCount * 4` member IDs, and optional `0x80` UTF-16LE extra name. Reject truncated files, implausible counts, and trailing bytes. Return settlement IDs, names, type, XYZ, and member IDs.

- [x] **Step 2: Traverse `buildings_game.bin` exactly**

Port the validated writer-derived cursor algorithm from `private/walk_buildings.mjs` to `DataView`: consume the `0x548 + 0x190` fixed blocks, every count-sized array, and the seven nested writer formats. Return type key, primary settlement ID, display name, XYZ, and record boundaries. Require the parsed record count and final cursor to match the file exactly.

- [x] **Step 3: Reconcile bidirectional membership**

Use each building’s fixed `+0x100` primary settlement ID when valid. Fall back to the `namepoints.bin` member list only for invalid primary IDs, report duplicates/invalid references, and never spatially recluster areas.

- [x] **Step 4: Validate against the supplied save**

Parse `/home/nexx/bigsavegame`: expected 43 settlements, 1,812 buildings, first starts `0x4`, `0x6044`, `0xc07c`, and zero trailing bytes in both files.

### Task 2: Add the deployed `/beta/` surface

**Files:**
- Create: `beta/index.html`
- Modify: `js/app.js`
- Modify: `js/i18n.js`
- Modify: `css/style.css`
- Modify: `index.html`

- [x] **Step 1: Make data URLs module-relative**

Resolve JSON paths from `import.meta.url` so the same `js/app.js` can load data when the document is either `/` or `/beta/`.

- [x] **Step 2: Gate the import tab by pathname**

Expose `saveimport` only when `location.pathname` is under `/beta/`; keep all other planners shared. Add translated beta/import labels and a visible experimental banner.

- [x] **Step 3: Select a directory without uploading it**

Add a `webkitdirectory`/multiple file input, locate files by basename, read only `namepoints.bin` and `buildings_game.bin`, and display parsing progress/errors locally.

### Task 3: Convert parsed buildings into a new snapshot

**Files:**
- Modify: `js/app.js`

- [x] **Step 1: Normalize save IDs**

Match exact base IDs, strip `MIRRORZ_`, map `CWC_foo` to `cwc/foo`, and allow a unique basename match. Never guess between ambiguous candidates.

- [x] **Step 2: Map production buildings**

Match normalized IDs to `data/game/production_buildings.json`, aggregate rows by planner building and settlement, preserve the settlement ID on each row, and default unknown mine quality to 50% with an estimate marker.

- [x] **Step 3: Build imported city rows**

Match remaining known IDs to `data/game/buildings_raw.json`. Convert residential/service types to self-contained imported city-building objects using living capacity, worker slots, service capacity (`workers * citizenAbleServe`), and housing quality. Aggregate by building ID inside each settlement.

- [x] **Step 4: Preserve everything else in the report**

Classify `temp` records separately and retain every unmatched type/count/settlement in `saveImport.unmatched`; show mapped/unmatched/excluded totals.

- [x] **Step 5: Create two safe snapshots**

Before switching, save the open plan under a unique `Before import …` name. Create and select a second unique snapshot named from the save directory, containing imported cities, scoped production rows, and import metadata.

### Task 4: Integrate imported scopes into existing planners

**Files:**
- Modify: `js/app.js`
- Modify: `js/i18n.js`
- Modify: `css/style.css`

- [x] **Step 1: Render imported City Planner rows**

Resolve `row.importedBuilding` before dataset indices, render its localized name/type and source ID, and keep count editable. Existing manually selected rows remain unchanged.

- [x] **Step 2: Filter Production Planner by settlement**

Add an All/unassigned/named-area selector. Render an Area column, evaluate only the selected subset for the table/totals, and retain all rows for Republic Overview totals.

- [x] **Step 3: Combine each Republic Overview row**

Evaluate production rows tagged with each city’s `scopeId`, add industry workers and net available workers to the settlement row, and retain the current republic-wide production totals and manual chain assignments.

- [x] **Step 4: Render the import audit**

Show source name, import time, settlement/building totals, recognized City/Production counts, excluded temporary records, warnings, and unmatched types grouped by settlement.

### Task 5: Verify and deploy the beta

**Files:**
- Modify: `ROADMAP.md`
- Modify: `private/REVERSE_ENGINEERING.md` (ignored/private evidence only)

- [x] **Step 1: Record the completed traversal schema privately**

Document the nested record sequence, exact whole-file validation, and the primary-settlement reconciliation rule without committing private binary evidence.

- [x] **Step 2: Verify syntax, formulas, and both routes**

Run `node --check`, `npm test`, and headless Chromium against `/` and `/beta/`. Import the supplied save in `/beta/`; expected 43 scopes, 1,812 traversed buildings, a new named snapshot plus pre-import backup, and no console errors.

- [x] **Step 3: Update roadmap truthfully**

Mark exact building traversal and beta availability complete, and leave mod/workshop economic mapping or per-mine richness listed as explicit limitations if still unmatched.

- [x] **Step 4: Commit, integrate, and push**

Commit coherent parser/UI/integration checkpoints, fast-forward `main` after each verified checkpoint, and push `main` so GitHub Pages exposes `https://coffeekanzler.github.io/workerscalculator/beta/`.
