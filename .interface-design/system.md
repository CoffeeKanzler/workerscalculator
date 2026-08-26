# WorkersCalculator Interface System

## Direction and feel

WorkersCalculator should feel like a dense technical operating desk for *Workers & Resources* players: precise, compact, and grounded in production recipes, resource flows, cost bases, and visible evidence.

- Preserve the existing palette and token system: blueprint blue for navigation and context, amber for caution and provenance, and green/red only for semantic values.
- Prefer paper and graphite surfaces over generic dashboard cards.
- Keep the interface domain-specific. A useful signature pattern is the **resource lens**: a produced-resource selector placed directly beside the ledger or comparison table it narrows.
- Do not introduce decorative colors or ornamental UI that competes with operational data.

## Depth and surfaces

- Use border-only depth for core UI with quiet, token-based dividers.
- Inputs use the existing inset or `--panel2` surface; menus and popovers may float above surrounding content.
- Avoid shadows except where the existing system already uses them for floating menus or popovers.
- Reuse existing tokens such as `--bg`, `--panel`, `--panel2`, `--border`, `--blueprint`, `--accent`, `--accent2`, and semantic color tokens.
- Retain the application's sharp technical radii, including the established 2 px final override.

## Spacing and typography

- Use a 4 px base unit, with most gaps and padding at 4, 8, 12, or 16 px.
- Keep data views compact without making controls ambiguous.
- Use the existing Inter/system font stack and tabular numerals for values.
- Keep labels visible; place short explanations and provenance in muted supporting text.
- Preserve information on smaller screens by wrapping controls instead of removing them.

## Data-table filter toolbar

For dense comparison tables, place filters and search directly above the table in a lightweight, wrapping toolbar rather than in a separate dashboard card.

- Show a visible label above every control.
- Use a single-select when users are expected to filter on one dimension. Its first option resets the view to all values.
- Make search and filters conjunctive: each active control further narrows the same eligible row set.
- Derive filter options from currently eligible rows, then localize and sort them for display.
- Reset a selected option to **All** if a dataset or context change makes it unavailable.
- Use existing control tokens and interaction states. As a starting point, give a resource selector about 230 px minimum width and let search flex between roughly 260 and 420 px.
- Wrap the toolbar on narrow screens while keeping both controls accessible.
- Represent no matches through the table's established empty state or zero-row presentation.
- Express domain exclusions in the eligibility model rather than hiding rows with presentation-only styles.
- Add a real-browser regression for click/select/search behavior, combined filtering, and every relevant dataset and language.
