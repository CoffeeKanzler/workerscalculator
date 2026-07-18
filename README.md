# W&R: Soviet Republic – Economy Planner

A fully client-side planner for **Workers & Resources: Soviet Republic**, rebuilt as a
GitHub Pages web app from the community planning spreadsheet
([original Google Sheet](https://docs.google.com/spreadsheets/d/1rq76hTLnW1C5QbiQynHSbIJwOgg-wfOgSfZmsfm9kh0/edit)).

**Everything runs locally in your browser – your stats.ini is never uploaded anywhere.**

## Features

- **stats.ini import** – drag & drop the `stats.ini` from your savegame folder
  (`Documents\SovietRepublic\media_soviet\save\<savename>\stats.ini`). All
  `$STAT_RECORD` snapshots are parsed; the newest is used by default and you can
  switch between records.
- **Prices** – buy/sell prices for all resources in ₽ and $, fully editable
  (play "what if"), with a price-history chart across all snapshots in your file.
  Decade presets (1920–1980) from the spreadsheet are included as a fallback.
- **Production chain solver** – state a goal ("20 t/day of steel") and the
  whole upstream chain is computed backwards: buildings, counts, workers,
  power, construction cost. Any intermediate can be switched to import
  (priced at current buy + delivery cost) and producers are swappable.
- **Two building datasets** – extracted from bundled game files
  (77 buildings, 20 languages, via `tools/extract_from_gamefiles.py`) or the
  spreadsheet snapshot, switchable in the header.
- **Production planner** – add production buildings, set count/quality,
  productivity of the republic, time unit (day/month/year), seasons,
  Slower-Calendar-Flow mod factor and fertilizer status. Calculates profit,
  profit per worker, days until amortization, construction cost, workers per
  shift and the full resource balance (production vs. consumption) of your
  republic. Includes the field/hectare calculator (0.39 / 1.57 / 4.81 ha).
- **Price analysis** – all 93 production buildings ranked by profitability at
  the current prices, sortable, in both currencies.
- **City planning** – plan multiple cities: population, worker surplus, service
  coverage with utilization (shopping, kindergarten, school, university, court,
  police, attractions, hospital, secret police, heating), transformer and heat
  exchanger sizing, water connections, waste, and total construction cost/materials.
  352 city buildings (vanilla + mods from the sheet), with a vanilla-only filter.
- **Train planner** – pick cargo, locomotive and desired train length; see wagon
  count and total capacity for every matching wagon type (504 vehicles).
- **LowTech research** – point calculator for the community rule by DasBreitschwert.
- German / English UI (game terms extracted from the sheet's translation table).

**Live: https://coffeekanzler.github.io/workerscalculator/**

Credit: all game data and planning formulas originate from the community
spreadsheet by **project7_2020**. See [CONTRIBUTING.md](CONTRIBUTING.md) for how
to update data/formulas (including a German guide for the sheet author) and
[ROADMAP.md](ROADMAP.md) for planned improvements.

## Development

Static site, no build step. Serve the folder with any web server:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

### Data pipeline

All game data in `data/*.json` was extracted from the spreadsheet with
[`tools/extract_from_xlsx.py`](tools/extract_from_xlsx.py):

```bash
pip install openpyxl
# download the sheet as .xlsx, then:
python3 tools/extract_from_xlsx.py
```

| File | Content |
|---|---|
| `data/resources.json` | resource keys ↔ names (de/en) + default prices (author's 1979 game) |
| `data/production_buildings.json` | 93 industry buildings: production/consumption rates, workers, power, water, construction bill |
| `data/city_buildings.json` | 352 city buildings: inhabitants, workers, capacities, utilities, construction bill |
| `data/vehicles.json` | 504 vehicles incl. wagons/locos with cargo capacities |
| `data/decade_prices.json` | reference prices per decade (1920–1980) |
| `data/translations.json` | the sheet's translation table (id → de/en) |

`stats.ini` in the repo root is a sample export for testing the importer.

### Deploying to GitHub Pages

Push to GitHub, then **Settings → Pages → Deploy from branch → `main` / root**.
A `.nojekyll` file is included.

## Notes on formulas

Formulas were reverse-engineered from the sheet (`ProduktionProductions`,
`StädteCitys Neu`, `Datenblatt Produktion`, `Daten StadtData City`,
`PreisePrices`, `Importdata Preise`, `Zug planer`, `LowTech Forschung`):

- Profit = Σ production × sell price − Σ consumption × buy price (per chosen time unit,
  scaled by productivity; mines scale with the quality/richness value).
- Profit per worker uses the sheet's convention `profit / (workers per shift / 2)`.
- Field yield: `hectares × 0.1708767 (seasons) or 0.2255655 (no seasons) × fertilizer` t plants/day.
- Worker surplus (city) = `(population − 3 × workers) / 4`.
- Service coverage: 1 provided place serves N inhabitants
  (shopping 19, kindergarten 15, school 18, university 64, court 600, police 150,
  attraction 140, hospital 100); secret police: 1 vehicle per 7 residential buildings;
  city heating plants: special value × 5 m³ hot water.
- Construction cost = workdays × workday cost + Σ material × buy price.
  (The original sheet accidentally priced bricks, asphalt and prefab panels at the
  workday cost – that copy-paste bug is fixed here, so construction costs can
  differ slightly from the sheet.)
