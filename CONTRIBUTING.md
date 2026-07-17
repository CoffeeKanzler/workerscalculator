# Contributing

This project is a static web app – no build step, no framework. If you can edit
a text file, you can contribute. **Eine deutsche Zusammenfassung für den
Spreadsheet-Autor steht am Ende.**

## Running locally

```bash
git clone https://github.com/CoffeeKanzler/workerscalculator
cd workerscalculator
python3 -m http.server 8000     # any static server works
# open http://localhost:8000
```

Every push to `main` deploys automatically to GitHub Pages.

## How the app is organized

| File | What lives there |
|---|---|
| `index.html` | page shell only |
| `js/app.js` | all UI: tabs, tables, inputs, rendering, localStorage state |
| `js/calc.js` | **every game formula** (profit, build cost, city services, fields, LowTech) |
| `js/statsini.js` | parser for the game's stats.ini export |
| `js/i18n.js` | UI strings, German + English |
| `css/style.css` | styling |
| `data/*.json` | game data extracted from the spreadsheet (see below) |
| `tools/extract_from_xlsx.py` | regenerates `data/*.json` from the spreadsheet |
| `tools/rename_city_buildings_from_game.py` | backfills vanilla residential names + housing quality in `data/city_buildings.json` from game files |

Rule of thumb: **numbers and formulas belong in `js/calc.js` or `data/`, never
in `js/app.js`.** The UI only displays what the calc layer computes.

## The three data sources

**Rule: game files beat the spreadsheet wherever both exist.** The
spreadsheet was our only source before we had access to the game's own media
files; now that we do, treat it as a fallback for whatever the `.ini` files
don't expose (see below), not as the default.

| Source | Where | How to update |
|---|---|---|
| **Game files** (authoritative: production/consumption rates, workers, names in 20 languages, vehicles, housing quality) | `data/game/*.json` | run `tools/extract_from_gamefiles.py <path-to-media_soviet>` against the current game version |
| **Community constants** (measured/derived: service ratios, field yields, heat-exchanger sizes, …) | [`js/community_constants.js`](js/community_constants.js) | edit directly — every value is commented; small PRs welcome |
| **Spreadsheet** (mod buildings, vehicle lengths, measured per-building power/water/waste/construction, decade prices) | `data/*.json` | see below |

The app ships both production datasets — "Game files (current)" and
"Spreadsheet" — switchable in the header. The game dataset merges game rates
with the sheet's measured extras (power, water, construction bill) by building
name; buildings without a sheet match carry `"measured": false`, and where
even a same-group average could be computed (see below) also carry
`"estimated": [field, …]` naming which fields are a rough guess, not a
measurement.

Note on that gap: buildings' `.ini` files *do* declare real per-worker
electricity factors (`$ELETRIC_CONSUMPTION_LIGHTING_WORKER_FACTOR` etc. —
captured in `buildings_raw.json` as `electricWorkerFactors`), but the base
kWh-per-worker rate they multiply is hardcoded in the game engine, not in
any file. A regression against sheet-measured buildings to back out that
constant didn't hold up (lighting/living factors are too collinear in the
available sample, single-predictor fits are off by 20–60%) — so this data
is captured but *not* used to compute power; don't be tempted to wire it up
without a much larger, less collinear calibration set. Water and per-worker
waste output have no per-building token anywhere (checked base game, every
DLC, and the CWC workshop content — only incinerators declare
`$WASTE_CONSUMPTION`, and that's an input mix ratio, a different mechanic).
For buildings with no sheet match at all, `build_dataset()` now fills these
extras from the average per-worker rate of sheet-measured buildings in the
same group, flagged via `"estimated"` — better than silently showing 0, but
still a rough estimate, not a measurement.

`data/city_buildings.json` (city planning tab) is spreadsheet-sourced end to
end — the same per-building power/water/waste/workdays gap applies, so the
sheet stays the only
source for those fields. But identity — building name and housing quality
(`QUALITY_OF_LIVING`) — *is* in the game files, and the sheet's vanilla
residential rows only ever had generic placeholder names ("Einwohner A -").
`tools/rename_city_buildings_from_game.py` backfills both from
`data/game/buildings_raw.json`, matched by nearest capacity
(`inhabitants` ↔ `livingSpace`) within each residential type; re-run it after
regenerating `buildings_raw.json` from a newer game version. Mod buildings
(`"kind": "Mod"`) have no game-file counterpart and keep their spreadsheet
name and quality as-is.

### Lessons learned the hard way (data pipeline)

These are mistakes made and caught during this project's game-files
migration — read before repeating them:

1. **"Not in the game files" is a claim, not an assumption — verify it by
   grepping every `.ini`, not one example.** An early pass concluded
   power/water/waste weren't in building files at all, checked only a
   residential building. A later, more thorough grep (base game + every DLC +
   CWC content) found real per-worker electricity factors that had been
   missed — the water/waste conclusion held up on re-check, but the
   electricity one didn't. Both times the fix was the same: search
   exhaustively before writing "the game doesn't expose this" anywhere.
2. **A same-named building at a different capacity tier is not the same
   measurement.** Matching game buildings to sheet rows by name alone let a
   100-worker DLC variant silently inherit a 220-worker variant's full
   construction cost — construction cost didn't change when switching
   producers in the Production Chain tab. Fix order that held up: (a) prefer
   an exact worker-count match under the sheet's own tier-naming convention
   ("X Early") over the base row; (b) only when no exact match exists at all,
   scale by worker ratio instead of copying verbatim.
3. **A "fix" that changes matching logic can zero out data elsewhere —
   check the diff size, not just the one case you're fixing.** Tightening
   the matcher to reject any non-exact worker-count match (instead of
   scaling) silently zeroed construction data for ~20 other buildings that
   had relied on the old fallback. Caught by noticing the regenerated
   dataset's diff was unexpectedly large, not by the original bug report.
   Always regenerate and diff-check after a matcher change, independent of
   whether the one reported case looks fixed.
4. **A regression with too few, collinear data points produces a
   plausible-looking but wrong constant.** Fitting per-worker electricity
   consumption factors (lighting/living/heating) against ~14 sheet-measured
   buildings gave a *negative* coefficient for one factor — a physically
   impossible result revealing the sample was too collinear to identify the
   parameters. Don't ship a calibrated constant without checking the fit is
   physically sane and the error against held-out points is small; "it kind
   of correlates" isn't calibrated.
5. **Test in the actual browser, not just the unit suite, before claiming a
   UI fix works.** The count-input live-update fix passed `node --test`
   immediately but was actually broken in two different ways only visible by
   driving the real page (cursor loss on re-render; corrupted decimal entry
   from tearing down the DOM mid-keystroke). Both needed a real browser
   session to catch.

### Updating from the game files

```bash
python3 tools/extract_from_gamefiles.py /path/to/SovietRepublic/media_soviet
npm test
```

Regenerates `data/game/`: `buildings_raw.json`, `vehicles_raw.json`,
`names.json` (all localized names, 20 languages from the `soviet<Language>.btf`
string tables) and `production_buildings.json` (the merged app dataset).
Unit rule verified against the sheet: ini values are t per worker per day,
so t/day = value × workers (factories and mines; heating plants are special-cased).

Then refresh the city dataset's game-sourced fields (names, housing quality)
against the new `buildings_raw.json`:

```bash
python3 tools/rename_city_buildings_from_game.py
npm test
```

## Updating the spreadsheet-derived data (when the sheet changes)

1. Open the [Google Sheet](https://docs.google.com/spreadsheets/d/1rq76hTLnW1C5QbiQynHSbIJwOgg-wfOgSfZmsfm9kh0/edit)
   → **File → Download → Microsoft Excel (.xlsx)**, save as `workers.xlsx`
   next to `tools/extract_from_xlsx.py`.
2. Run the extractor:
   ```bash
   pip install openpyxl
   cd tools && python3 extract_from_xlsx.py
   ```
3. It prints row counts (currently: 57 resources, 93 production buildings,
   352 city buildings, 504 vehicles). Big unexpected drops = something moved in
   the sheet, see "If the sheet layout changes" below.
4. Copy the generated `data/*.json` over the repo's `data/`, look at `git diff`
   (values should change, structure shouldn't), commit, push.

### What the extractor reads from which tab

| Sheet tab | Extracted into | Notes |
|---|---|---|
| `Importdata Preise` | `resources.json` | resource key ↔ translation-id mapping (rows 3–58) + default prices + workday/delivery/immigrant costs (rows 361–366) |
| `Datenblatt Produktion` | `production_buildings.json` | one row per building; columns D–Q = production/consumption pairs, R–AG = power/water/waste/construction |
| `Daten StadtData City` | `city_buildings.json` | city buildings incl. capacities (`visitors`/`special`), construction bill, `recommendedFor` |
| `Datenblatt Fahrzeuge` | `vehicles.json` | all vehicles; column A = category, header row 2 = attribute names |
| `Preisanstiege` | `decade_prices.json` | reference prices per decade 1920–1980 |
| `Übersetzung` | `translations.json` | id → German/English (columns B/C) |

Building/resource names are resolved from the sheet's formula (`VLOOKUP(<id>, 'Übersetzung'!…)`)
so we get both German **and** English even though the sheet displays one language.
Cells with literal text are taken as-is for both languages.

### If the sheet layout changes

The extractor addresses tabs by name and columns by position. If the sheet
author renames a tab or inserts columns, adjust the ranges at the top of the
matching section in `tools/extract_from_xlsx.py` (each section is ~30 lines and
commented). The JSON **output shape must stay the same** – the app depends on it.

## Updating formulas

All formulas live in `js/calc.js`, each with a comment naming its origin in the
sheet. The current set, for review:

| Formula | Implementation | Sheet origin |
|---|---|---|
| Profit | Σ production×sell − Σ consumption×**inputPrice**, ×count ×timeFactor ×productivity. The sheet values consumption at the *sell* price (opportunity cost) — the app defaults to that and offers a buy-price/import mode plus optional per-ton delivery cost | `ProduktionProductions` J/K columns (VLOOKUP col 2 = sell) |
| Mine output | rate × count × **quality** (richness) for the 8 mine types | `ProduktionProductions` M column IF |
| Profit per worker | profit / (workers per shift / 2) | H column |
| Amortization | build cost / profit per day | I column |
| Field yield | ha × 0.1708767 (seasons) or 0.2255655 (no seasons) × fertilizer, t plants/day | D5 + B12/B14 |
| Field sizes | small 0.39 / medium 1.57 / large 4.81 ha | P5 |
| Build cost | workdays × workday cost + Σ material × buy price | `Datenblatt Produktion` AH – **deviation:** the sheet priced bricks/asphalt/panels at workday cost (copy-paste bug), we price every material correctly |
| Worker surplus | (population − 3 × workers) / 4 | `StädteCitys Neu` C10 |
| Service coverage | capacity × productivity × ratio; ratios: shopping 19, kindergarten 15, school 18, university 64, court 600, police 150, attraction 140, hospital 100 | row 5 constants |
| Secret police | 1 vehicle per 7 residential buildings | M5 + J15/J17 |
| City heating | special value × 5 = m³ hot water | J16 |
| Transformers | max kW / 1000 / cable MW (0.65–2.35) | C13/D13 |
| Heat exchangers | hot water / 100 (small) or / 300 (large) | C15/D15 |
| LowTech points | ⌊pop/2500⌋ + settlements + decade bonus − researched | `LowTech Forschung` F2 |

To change a formula: edit `js/calc.js`, note the sheet cell you derived it from
in the comment, add or adjust a test in `tests/`, and run:

```bash
npm test          # node --test, no dependencies
```

The tests pin sheet-exact reference values (e.g. distillery profit 7506.114 ₽/day
at sample prices) — if your change breaks one intentionally, update the test
with the new reference and say why in the commit message.

## stats.ini compatibility

`js/statsini.js` parses all `$STAT_RECORD` blocks. Known version quirks, both handled:

- Older saves lack some resources (e.g. no `eletric` price row) → app falls back
  to sample defaults and marks those prices dashed.
- Some snapshots contain `0.000000` for workday/delivery/immigrant costs → app
  uses the nearest non-zero record.

If a new game version adds resources: add them to the sheet's `Importdata Preise`
(or directly to `data/resources.json`) with a translation id, and they'll appear
everywhere automatically.

## Pull requests

- Keep PRs focused (one feature/fix).
- No dependencies, no build step – it must keep running as plain static files.
- Test in the browser with the sample `stats.ini` from the repo root before pushing.

---

## Zusammenfassung für den Spreadsheet-Autor (project7_2020)

Diese Web-App ist aus deinem Spreadsheet gebaut – Formeln und Spieldaten wurden
extrahiert und laufen jetzt komplett im Browser (nichts wird hochgeladen):
**https://coffeekanzler.github.io/workerscalculator/**

**Update Juli 2026:** Produktions-/Verbrauchsraten und Gebäudenamen kommen
inzwischen direkt aus den Spieldateien (`tools/extract_from_gamefiles.py`) –
dein Sheet bleibt die Quelle für alles Gemessene: Stromverbrauch, Wasser, Müll,
Baukosten pro Gebäude, die komplette Stadtplanungs-Daten und die
Planungs-Konstanten (jetzt einzeln editierbar in `js/community_constants.js`).
Die App kann zwischen beiden Datensätzen umschalten.

Wenn du dein Sheet aktualisierst, kommen die Änderungen so in die App:

1. Sheet als **.xlsx herunterladen** (Datei → Herunterladen → Microsoft Excel).
2. `python3 tools/extract_from_xlsx.py` ausführen (braucht `pip install openpyxl`) –
   erzeugt die `data/*.json` neu.
3. Änderungen committen/pushen (oder als Pull Request einreichen, oder einfach
   die neue .xlsx in einem GitHub-Issue anhängen – dann macht das jemand anders).

Wichtig dabei:

- **Neue Zeilen** (Gebäude, Fahrzeuge, Waren) werden automatisch übernommen,
  solange die Tab-Namen und Spaltenpositionen gleich bleiben.
- **Verschobene Spalten / umbenannte Tabs** brauchen eine kleine Anpassung im
  Extraktor (`tools/extract_from_xlsx.py`, pro Tab ein kommentierter Abschnitt).
- **Formeländerungen** (z. B. neue Service-Verhältnisse, andere Feld-Erträge)
  werden nicht automatisch erkannt – die stehen in `js/calc.js` mit
  Zell-Referenzen zu deinem Sheet (Tabelle oben). Kurz Bescheid geben oder ein
  Issue aufmachen reicht: https://github.com/CoffeeKanzler/workerscalculator/issues
- Ein Hinweis: In deiner Baukosten-Formel (`Datenblatt Produktion`, Spalte AH)
  werden Ziegel, Asphalt und Plattenbauteile versehentlich mit den
  Arbeitstagskosten (E$55) statt ihren eigenen Preisen multipliziert –
  in der App ist das korrigiert.
- Ebenfalls gefunden: In `Fahrzeuge` gibt es zwei Zeilen namens
  "ER1 (Triebzug)" – die zweite (Von 1962, Bis 1984, 120 km/h) sind eigentlich
  die Werte des ER2, nicht eines zweiten ER1 (Baujahre/Geschwindigkeit passen
  exakt zu `russian_set_er2` in den Spieldateien, ER2 fehlte komplett). In der
  App als "ER2 (Triebzug)" umbenannt – im Sheet selbst wäre das auch noch zu
  korrigieren, sonst kommt beim nächsten Re-Export wieder die falsche Zeile.
