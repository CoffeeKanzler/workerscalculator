# Credit Center and Electronics Forecast Design

## Objective

Add a dedicated **Credits** tab to the Observe section. It must answer only
decisions the loaded save can support:

- what each active credit will still cost;
- whether its real cost is favorable under normal RUB or USD inflation;
- whether an identified investment can repay its financing;
- when a financed electronics inventory first becomes profitable within a
  30-year future horizon;
- what the save can and cannot establish about historical credits.

The tab is decision-first. It does not show a negative electronics candidate
merely because the calculator was able to evaluate it.

## Product intent

The person using this is running a republic and wants to decide whether debt is
useful, not browse a generic finance dashboard. The interface should feel like
a compact planning desk: dense, auditable, and cautious about uncertainty.

Domain vocabulary: principal, remaining debt, debt service, real interest,
amortization, liquidation border, break-even year, financed cargo, scenario
corridor, and evidence coverage.

The existing Command Center palette remains authoritative. Natural semantic
colors are ledger ink, paper/graphite surfaces, RUB red, USD green, amber risk,
and the existing blue chart line. Color communicates currency, status, or
evidence only.

The signature element is an **amortization corridor**: future financed-position
value plotted against time, with an explicit zero line and the first positive
sale date marked. It replaces three common defaults:

- generic KPI cards become a single action summary followed by exact contract
  facts;
- a red/green opportunity list becomes a future profit corridor;
- a full table of losing candidates becomes one honest empty-state sentence.

Depth remains border-based with the existing surface hierarchy, typography,
and spacing. This feature does not introduce a second visual system.

## Navigation and ownership

Add `credits` as an Observe context tab next to History and Prices. The direct
route is `#/credits`.

Move these existing surfaces out of History and into Credits:

- active-credit table and real-rate assessment;
- electronics recipe cards;
- used-ship electronics financing analysis.

History retains republic history charts, including aggregate saved credit
balance and interest charts. It does not retain decision controls or duplicate
the moved surfaces.

## Information architecture

The Credits tab renders these sections in order when their evidence exists:

1. **Action summary** — at most one sentence per currency, such as “RUB credit
   is cheaper than normal RUB inflation” or “No evidence-backed new-credit
   recommendation.”
2. **Active contracts** — principal, penalty balance, remaining days, nominal
   APR, effective APR, real rate, remaining nominal payment, and maximum daily
   payment from the exact daily simulation.
3. **New-credit test** — currency, amount, APR, and term. Existing contract
   terms can populate the fields, but the values remain explicitly
   hypothetical and editable. No default is presented as a bank offer.
4. **Relevant financed investments** — only opportunities satisfying the
   relevance policy below.
5. **Historical evidence** — aggregate saved debt/interest history when
   present, with a clear statement that completed individual contracts cannot
   be reconstructed when the save contains no contract-level history.

If no credits and no evaluable investment exist, render one useful empty state
instead of empty tables.

## Credit calculations

The daily simulation continues to use the reverse-engineered order already in
`simulateLoan`:

1. decrement remaining duration;
2. apply daily interest to current and penalty balances;
3. calculate scheduled principal from the post-interest balance and remaining
   duration;
4. pay penalty before principal;
5. move unpaid scheduled principal into the penalty balance.

For an active contract, the tab shows the saved balances. For a hypothetical
investment, it creates a fresh loan with:

```text
currentAmount  = ship purchase price + full cargo purchase price
penaltyAmount  = 0
annualRate     = selected hypothetical APR
remainingDays  = selected hypothetical term
```

Normal base-price inflation remains the only real-rate denominator. Import,
export, electronics, and recipe movements do not redefine the currency's real
interest rate.

The interface may recommend “economically favorable to keep” when the base
real rate is negative, but it must not claim the daily payment is affordable
unless a proven save-derived free-cash-flow measure is available.

## Exact component-price research gate

The executable's `ResourcePrice` path is recursive and component-weighted.
Before the 30-year electronics forecast can be labelled as reproducing the game
model, implementation must establish for both `eletronics` and `ecomponents`:

- which `ResourcePrice` branch each resource takes;
- which producer input/output vectors that branch reads;
- whether those vectors already contain the year-adjusted rates or whether the
  `$CONSUMPTION_INCREASE_ACCORDING_YEAR` and
  `$PRODUCTION_DECREASE_ACCORDING_YEAR` factors are applied elsewhere;
- the RUB and USD root-resource price inputs;
- where the resource's `+0x78/+0x7c` import/export accumulator enters;
- parity against at least three real saved dates in both currencies.

The research result belongs under `private/`. The public app receives only the
minimum stable formula facts and test fixtures. An unresolved branch must be
shown as “save-derived forecast,” never “exact game formula.”

## Year-dependent component model

For each producer recipe at future game year `y`, use the INI-defined curves:

```text
consumptionFactor(y) = clamp(
  (y - consumptionStartYear) / consumptionYearSpan,
  0,
  maximumConsumptionFactor
)

productionFactor(y) = clamp(
  1 - (y - productionStartYear) / productionYearSpan,
  minimumProductionFactor,
  1
)
```

Apply these curves to both the electronic-components factory and electronics
assembly hall, including Vanilla and DLC3 variants. Recompute the recursive
component tree for each projected year. Do not calculate today's recipe cost
and multiply it by a second recipe-pressure percentage; that would double
count the same change.

Root resource and workday prices advance using their currency's normal
inflation scenario. Derived resources advance through their recursively
recalculated component value.

## Future market scenarios

Every point after year zero is a forecast. There is no artificial boundary at
the length of the historical sample.

Build three internally consistent paths from save evidence:

- **Base:** latest stable normal-inflation estimate plus the median residual
  import/export pressure after removing the component-model movement.
- **Favorable:** 75th-percentile normal inflation and electronics residual.
- **Adverse:** 25th-percentile normal inflation and electronics residual.

The scenario band widens naturally through compounding. The UI labels the
whole 1–30 year area “forecast”; it does not imply the early years are known.

Citizen radio/TV/computer ownership may be shown as supporting demand evidence.
It must not become a numeric price multiplier until an exact demand-to-price
relationship is proven. Its historical effect remains inside the observed
market residual.

## RUB and USD exit paths

Calculate electronics liquidation in both currencies. Same-currency paths use
the projected RUB or USD electronics export price directly.

For a cross-currency exit, convert the future proceeds into the financing
currency using a derived future exchange path:

```text
RUB_per_USD(t) = RUB_per_USD(today)
  * normalRUBIndex(t) / normalUSDIndex(t)
```

This is a purchasing-power projection, not a guaranteed exchange rate, and is
labelled accordingly. The chart and recommendation identify the financing
currency and exit border explicitly.

## Amortization corridor

Evaluate monthly points from today through 30 years. At a sale month `t`, the
net financed position in the loan currency is:

```text
net(t) = converted electronics liquidation proceeds(t)
       - cumulative payments through t
       - remaining current balance at t
       - remaining penalty balance at t
```

The used ship's later resale value is conservatively zero. Its full purchase
price is included in the financed principal. Current recycling value may be
shown as a separate reference but never included in the conservative curve.

After the loan is fully paid, remaining balances stay zero while electronics
continues to follow the future price path.

For each scenario and exit currency, return:

- monthly net-position points;
- first month with `net >= 0`;
- value at 5, 10, 20, and 30 years;
- whether the path never reaches break-even.

## Relevance policy

An electronics opportunity is rendered only when all of these hold:

- a fully resolved used-market ship is category `ship`;
- transport subtype is covered or general;
- capacity and exact used purchase quote are positive and available;
- current cargo purchase prices and projected exit prices are available;
- a selected active or hypothetical credit supplies currency, APR, and term;
- the Base scenario reaches break-even within 30 years.

Rank visible opportunities by earliest Base break-even, then by 30-year Base
value. Limit the initial display to the best route per ship; alternate exit
currencies remain inspectable within that opportunity.

Replace “Robust” and “Speculative” with direct German/English statements:

- **Auch im schlechten Verlauf profitabel / Profitable even in the adverse path**
  when the adverse path crosses zero within 30 years;
- **Nur im Basisszenario profitabel / Profitable only in the base path** when
  Base crosses but adverse does not.

If no opportunity passes the policy, render only:

> Keine relevante kreditfinanzierte Elektronikstrategie innerhalb von 30
> Jahren gefunden.

Do not render rejected ships, negative result rows, or an electronics card that
looks like a recommendation.

## Historical-credit boundary

`stats.ini` exposes aggregate debt and interest history plus the current
`$LoanStart` contracts. The tab may chart and summarize the aggregate history.
It must not invent individual completed contracts, their start dates, their
uses, or their realized profit.

If future evidence exposes completed contract records, that is a separate data
model and migration. It is not inferred from changes in aggregate debt.

## Interaction and states

- Currency controls use explicit RUB and USD labels.
- Changing hypothetical amount, APR, or term updates the corridor without
  mutating saved contracts or planning state.
- A visible evidence label distinguishes exact saved facts, game-derived
  formulas, and forecasts.
- Missing price history, unresolved vehicle data, missing recipe coverage, and
  absent credits each have a specific empty state.
- The graph exposes values through hover, keyboard focus, a zero line, scenario
  legend, and textual break-even summary.
- Light and dark themes use the existing chart and semantic tokens.

## Persistence and privacy

The selected credit currency, hypothetical amount, APR, term, and expanded
opportunity may be ordinary local UI state. They do not alter the imported save,
shared planning snapshot, or game files. Per-vehicle save details remain
excluded from shared plans under the existing privacy contract.

## Verification

Implementation is complete only after all of the following pass:

- parser/formula unit tests for year-adjusted recursive component prices;
- parity fixtures covering at least three saved dates and both currencies;
- loan-path tests before, on, and after the payoff date;
- relevance tests proving a never-profitable electronics route is absent;
- navigation tests proving `#/credits` owns the moved surfaces and History no
  longer duplicates them;
- a real-save browser run with `stats.ini`, `usedveh.bin`, resolved vehicle
  models, active or controlled hypothetical credit terms, RUB/USD switching,
  hover inspection, and both themes;
- full `npm test`, JavaScript syntax checks, cache-version checks, and remote
  `main` hash verification before completion is claimed.
