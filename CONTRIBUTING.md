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

Rule of thumb: **numbers and formulas belong in `js/calc.js` or `data/`, never
in `js/app.js`.** The UI only displays what the calc layer computes.

## The three data sources

| Source | Where | How to update |
|---|---|---|
| **Game files** (authoritative: production/consumption rates, workers, names in 20 languages, vehicles) | `data/game/*.json` | run `tools/extract_from_gamefiles.py <path-to-media_soviet>` against the current game version |
| **Community constants** (measured/derived: service ratios, field yields, heat-exchanger sizes, …) | [`js/community_constants.js`](js/community_constants.js) | edit directly — every value is commented; small PRs welcome |
| **Spreadsheet** (city buildings incl. mods, vehicle lengths, measured per-building power/water/waste/construction, decade prices) | `data/*.json` | see below |

The app ships both production datasets — "Game files (current)" and
"Spreadsheet" — switchable in the header. The game dataset merges game rates
with the sheet's measured extras (power, water, construction bill) by building
name; buildings without a sheet match carry `"measured": false`.

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
