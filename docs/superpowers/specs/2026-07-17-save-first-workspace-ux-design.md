# Save-first workspace UX design

## Goal

Make the beta feel like one coherent republic-management product: open or continue a save, understand what needs attention, then drill into one area in City or Production without fighting global controls, long tab strips, or permanently expanded secondary data.

## Approaches considered

1. **Dashboard-first workspaces (selected).** Keep Republic Overview as the hub and turn City and Production into area-focused workspaces. This fits the imported-save data model and improves the existing app without rewriting its calculators.
2. **Mandatory import wizard.** Guide users through save, Workshop folder, import audit, then overview. This is clearer for first use but slows repeat imports and makes optional Workshop coverage feel mandatory.
3. **Cosmetic tab polish only.** Restyle the existing navigation and tables. This is cheap but leaves the real hierarchy problem intact.

## Information architecture

- **Start** answers only three questions: continue the current republic, open another save, or start a manual plan. Optional Workshop setup and older snapshots are collapsed secondary actions.
- **Republic Overview** is the command center. Its first screen contains identity/freshness, Actual–Plan–Difference, a small set of decision metrics, alerts, and the actionable area list. History and research remain available but are collapsed below the operational view.
- **City Planning** opens one city/area at a time. A compact workspace bar replaces the horizontal city-button strip. Imported assumptions and utility controls are collapsed; building rows and service consequences remain primary.
- **Production Planning** opens one production scope at a time. Scope selection and period sit in the workspace bar; agricultural and economic assumptions are collapsed. The building plan, totals, and material balance remain primary.
- **More tools** continues to contain specialist calculators. They do not compete with the three main republic workflows.

## Interaction rules

- Drilling down from an area in Republic Overview selects that same scope in the target planner.
- Imported areas use selectors rather than one button per city. Manual plans retain add/delete actions.
- A coverage warning stays visible whenever unresolved Workshop buildings make service results incomplete.
- Advanced controls use native `details` elements so their state and keyboard behavior are predictable.
- Saved snapshots display in a collapsed section with the current republic outside it. Automatic recovery is one rolling slot.
- Existing values, formulas, and state formats remain compatible; this redesign changes presentation and navigation, not planning mathematics.

## Visual hierarchy

- One page title and one contextual workspace bar per screen.
- Primary actions use the accent color; destructive actions remain visually quiet until relevant.
- Dense tables stay available on desktop, but control bars wrap cleanly and horizontal tab strips are removed.
- Evidence badges remain, but secondary badges and source IDs are visually subordinate to names and values.

## Error and incomplete-data behavior

- Missing save modules and unresolved Workshop packages remain explicit, never converted to zero-valued facts.
- Empty scopes remain omitted from the command center.
- A planner with no rows shows a short empty state and its add action rather than an unexplained blank table.
- Optional local Workshop selection remains local and is described only inside its collapsed setup section.

## Verification

- Run the complete Node test suite to protect calculations and imported state.
- Re-import `/home/nexx/bigsavegame` in a fresh beta session.
- Browser-check Start, Republic, City, and Production at 1365 px and 390 px widths.
- Confirm drill-down scope selection, advanced-detail toggles, snapshot loading, and no page errors.

