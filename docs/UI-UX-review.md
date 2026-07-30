# UI and UX review

Reviewed against the running app with a real republic loaded (Volldampf voraus!
027 — 12,777 citizens, 1,648 buildings), at 1440×900, every page captured full
height. 22 pages across the four sections. Zero console errors on the sweep.

Method: screenshots of every page, plus targeted audits of the source for the
classes of problem screenshots cannot show (glyph coverage, table overflow,
number precision). Each finding below says what is wrong, where, and what it
costs the reader. Severity is about the reader, not the code.

---

## 1. Blocking — the reader sees a broken box

### 1.1 Emoji icons render as tofu

**Severity: high. Affects every user without an emoji font, which on Linux is
most of them.**

The start page shows three cards whose icons are `▯`, `▯` and a hollow pencil.
The header toolbar shows `⬇ ⬆ ▯ ▯ ▯ ▯`. This is not a rendering accident in the
test browser — it is what any machine without a colour emoji font shows, and the
app ships no font and no fallback.

Audit of glyphs used as UI furniture (excluding vendored code):

| glyph | code point | uses | role |
| --- | --- | --- | --- |
| `📂` | U+1F4C2 | 3 | open a save |
| `🔗` | U+1F517 | 2 | share link |
| `🏛` | U+1F3DB | 1 | current republic |
| `✏` | U+270F | 1 | plan without a save |
| `💾` | U+1F4BE | 1 | save snapshot |
| `🗑` | U+1F5D1 | 1 | delete data |
| `📄` `📁` `🧩` `⚙` `⬆` `⬇` `🌗` `🌙` `☀` | — | 1 each | toolbar and pickers |

All 16 live in `js/app.js`. The geometric glyphs the app also uses — `→ ← ↑ ↓ ↔
✕ ✓ ⇄` — are in every font and are fine.

**Fix:** replace the pictographic emoji with either a text label or a geometric
glyph, exactly as `js/ui/access_graph.js` already does after the same problem
appeared there (`● ◆ ▬ ⇄ ■`). Icon-only buttons should additionally carry a
`title`, which most do not.

### 1.2 Icon-only buttons have no accessible name

The header's six toolbar buttons are glyph-only. When the glyph fails to render,
the button becomes an unlabelled box with no tooltip and no `aria-label` — it is
not merely ugly, it is unusable and unreadable to a screen reader.

---

## 2. Serious — the reader is misled or blocked

### 2.1 Numbers claim precision the data does not have

`Productivity of the republic: 76.6058 %` on the overview. Four decimal places on
a figure derived from `stats.ini` invites the reader to treat noise as signal.
Ten sites format to 3–4 decimals:

```
js/app.js:2340  fmt(info.latestProductivity * 100, 4)
js/app.js:5333  fmt(state.saveImport.latestProductivity * 100, 4)
js/app.js:1377  fmt(throughput.previousQuantity, 4)
js/app.js:4586  fmt(scope.residentWeightedAir, 4)
```

**Fix:** one decimal for percentages, two for rates. Keep full precision in the
title attribute if the exact value matters.

### 2.2 Ten of thirty tables can overflow horizontally

`el('table')` appears 30 times; `class: 'tablewrap'` — the scroll container — 20
times. The area table at the foot of the overview is cut off mid-header
("Available workers aft…") at 1440 px wide, which is not a narrow screen.

**Fix:** wrap every data table, or move the rule into CSS so it cannot be
forgotten.

### 2.3 Raw mod identifiers leak into reader-facing text

The overview alert reads *"3564803239/shed — Fewer adults can reach this
building…"*. `3564803239/shed` is a Workshop package id and a file name. The app
already has `mapBuildingDisplayName`, which the map and graph use.

**Fix:** route alert labels through the same display-name resolution.

### 2.4 Only some alerts can be silenced

The overview mixes two alert families in one list. The access alerts I added
carry **Locate on map** and **Silence**; the workforce alerts above them
("The plan needs more workers than are available") carry only **Locate on map**.
Same list, same visual weight, different affordances, no explanation.

**Fix:** either give every alert a silence action or visually separate the two
families so the difference reads as intentional.

---

## 3. Moderate — friction and noise

### 3.1 The republic's name appears three times on one screen

Title bar input, page heading, and the timestamp line all read "Volldampf
voraus! 027" within 250 px of each other. One of them is enough.

### 3.2 The alert list buries its own summary

"Needs attention (37)" with filter chips (All / Workforce / Production buffers /
Data coverage), then eight rows, then "Show 29 more findings". The counts are
good. What is missing is any sense of *which* of the 37 matters most — they are
sorted by severity then by area name, so a −257 worker deficit and a 1-place shed
sit in the same visual register.

### 3.3 Statistics pair values that do not belong together

Top 5 crime areas shows Hanpeterkleindorf at **0 % average criminality** and
**1,805 unprocessed cases**. Both are true — one is a current saved average, the
other cumulative game history — and the footnote says so. But the row invites
the false reading, and the ranking is by the first column while the eye goes to
the second.

### 3.4 The four-section navigation is two levels deep with no state

Observe / Diagnose / Plan / Compare, then up to eight context tabs, then a
"More tools ▾" overflow. Twenty-two destinations, no breadcrumb, and the section
row does not indicate which sections currently hold anything worth looking at.

---

## 4. Map and graph specifics

### 4.1 The reach overlay is invisible at high zoom

Clicking a building recolours the markers by walking reach — but at the zoom
where footprints are drawn, the footprints carry the reach colour and the
markers are sub-pixel. The overlay works; it just cannot be seen at the zoom a
reader naturally uses to inspect one building. (Verified: the footprint *does*
take the reach colour, so this is a legibility problem, not a wiring one.)

### 4.2 The graph's node cards are the app's best surface

Stated for contrast: full names, one fact, a `+N` badge, colour by kind, and one
action in the panel. The rest of the app would read better if it followed the
same rule — one claim per element, named in words, with the evidence badge
beside it.

### 4.3 Water level provenance is exemplary and should spread

The map hint now says *"Water level measured from the saved heights of 1,638
buildings (r = 0.999)"* or admits the terrain was too flat to measure. Every
derived figure in the app should be able to say where it came from that plainly.

---

## 5. What is already good, and should not be lost

- **The evidence badges.** `EXACT`, `DERIVED`, `STATS.INI`, `UNAVAILABLE` on
  every figure, with a legend fixed at the top of the page. This is the app's
  strongest idea and it is applied consistently.
- **Refusing to guess.** "Reachability not available yet" with a specific reason
  beats a plausible number, and the app does this throughout.
- **The alert wording.** "Fewer adults can reach this building than it has
  workplaces · 0 / 1 adults can reach it" — a claim, its evidence, and its scope
  in one line.
- **Bilingual parity.** Every string exists in both languages; a test enforces it.

---

## Fixed in this pass

Verified in the running app against the same save, same viewport.

| finding | before | after |
| --- | --- | --- |
| §1.1 emoji | start cards `▯ ▯ ▯`, toolbar `⬇ ⬆ ▯ ▯ ▯ ▯` | `■ ▷ ◱`, `↓ ↑ ● ▤ ▷ ✕` |
| §1.2 icon buttons | no name when the glyph fails | `title` and `aria-label` on each |
| §2.1 precision | `76.6058 %` | `76.6 %` |
| §2.2 table overflow | area table cut at "Available workers aft…" | every column plus its actions |
| §2.3 raw mod ids | `3564803239/shed` | `shed` |

The overflow fix moved into CSS (`table.data` scrolls on its own) rather than
being applied at the ten call sites, so a table added later cannot forget it.
`readableSaveType` strips the Workshop package id and the mirror marker from a
type the catalogue could not resolve; it has its own tests, extracted from source
so they cannot drift from it.

Still open from this review: §2.4 (silence inconsistency — a product decision),
and everything under §3 and §4.1.

## Recommended order

1. Replace the 16 emoji and give icon-only buttons accessible names (§1.1, §1.2).
2. Wrap the ten unwrapped tables (§2.2).
3. Cut percentage precision to one decimal (§2.1).
4. Route alert labels through the display-name resolver (§2.3).
5. Resolve the silence inconsistency (§2.4).
6. Then the moderate items, in the order the reader trips over them.

Items 1–4 are mechanical and low-risk. Item 5 is a product decision.
