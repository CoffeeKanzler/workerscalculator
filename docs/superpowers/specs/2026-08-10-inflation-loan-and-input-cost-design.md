# Inflation, Loan Decisions, and Input Cost Design

## Goal

Turn save-backed price history and saved loan contracts into a decision aid for
RUB and USD, while correcting production analysis to answer the cash-purchase
question that players expect. Preserve the existing opportunity-cost analysis
as an explicit alternative instead of deleting it.

## Product intent

The reader has just imported a live republic and wants to decide whether to buy
inputs, build a production chain, or finance it. The interface should feel like
a compact economic instrument panel: dense, calm, traceable, and specific to
border trade rather than a generic KPI dashboard.

- **Domain:** border prices, import basket, export basket, purchasing power,
  amortization, daily repayment, penalty balance, RUB/USD.
- **Color world:** existing paper and graphite surfaces; RUB violet, USD green,
  warning ochre, loss red, and blueprint blue already present in the app.
- **Signature:** a shared purchasing-power versus debt-burden strip that makes
  the inflation assumption, effective loan cost, and recommendation readable
  together.
- **Rejected defaults:** isolated metric-card grid becomes a chronological
  decision strip; decorative icons become labelled evidence; a separate new
  dashboard becomes an extension of the existing Analysis and History paths.

Use the existing border-led depth system, typography, controls, chart renderer,
dark mode, and spacing. New colors must use semantic CSS variables or existing
chart colors. Data values use tabular numerals. Controls include hover, focus,
active, empty, and unavailable states.

## Workstream A: production input cost

`Economy.inputPrice` accepts a cost basis:

- `purchase` (default): non-worker inputs use the save's border purchase price;
- `opportunity`: legacy behavior uses the border sell price.

Workers retain the existing resident/guest-worker handling. Output revenue
continues to use sell prices. The Analysis tab exposes the two cost bases next
to worker type and explains each one. The selected mode is local UI state and
is passed explicitly into `buildingProfit`; other planning calculations retain
their existing convention unless they deliberately opt in.

This fixes the reported slaughterhouse result without changing its correct
recipe: 2.5 tonnes livestock consumed for 1 tonne meat produced.

## Workstream B: save-backed inflation

Create a focused pure module for economic analysis. For currency `c`, resource
`i`, and consecutive usable observations:

```text
relative[i,t,c] = price[i,t,c] / price[i,t-1,c]
factor[t,c] = exp(mean(log(relative[i,t,c])))
index[0,c] = 100
index[t,c] = index[t-1,c] * factor[t,c]
```

Only resources with finite positive prices at both endpoints belong to that
step. A step with no common resources is unavailable and does not invent a
change. Purchase and sell indices are separate; RUB and USD are separate. The
purchase index is the default because it measures the purchasing power relevant
to borrowing. The UI states that this is an equal-weight save price index, not
an official consumer-price statistic.

For endpoints separated by `days`:

```text
periodInflation = endIndex / startIndex - 1
annualizedInflation = (endIndex / startIndex) ** (365 / days) - 1
```

Dates use `year * 365 + day`. Report latest one-year, five-year, and all-history
rates when enough dated data exists, plus common-resource coverage. Render RUB
and USD index series on the existing synchronized history chart surface.

## Workstream C: exact saved loans

Extend `stats.ini` parsing with a separate `parseLoans` export. It reads every
`$LoanStart` block and the ten fields proven in the executable:

```text
annualRate, penaltyRate, currency/type, subtype,
remainingDays, currentAmount, penaltyAmount,
initialAmount, contractDays, paidAmount
```

The historical `$STAT_RECORD` parser remains unchanged in meaning. Malformed or
partial loan blocks are ignored or returned with explicit unavailable fields;
they must not contaminate price records.

The pure simulator follows the observed daily game path using float-compatible
numbers:

```text
remainingDays = max(remainingDays - 1, 0)
r = annualRate / 100 / 365
balanceAfterInterest = balance * (1 + r) + penaltyBalance * r
interestPart = balance * (1 + r) * r + penaltyBalance * r
scheduledPrincipal = remainingDays > 0
  ? balanceAfterInterest / remainingDays
  : balanceAfterInterest
amountDue = scheduledPrincipal + penaltyBalance
```

The simulator applies available currency cash, penalty-first allocation, and
the game's shortfall-to-penalty behavior. It stops when both balances are empty
or at a bounded safety horizon and returns nominal paid, interest paid, maximum
daily payment, ending balances, and duration.

For a high-level comparison, convert nominal annual loan rate to effective rate:

```text
effectiveRate = (1 + annualRate / 100 / 365) ** 365 - 1
realRate = (1 + effectiveRate) / (1 + inflationRate) - 1
```

Scenario rates come only from the imported save:

- **Base:** latest usable annualized purchase-price inflation;
- **Best for borrower:** upper quartile of usable rolling annual rates;
- **Worst for borrower:** lower quartile of usable rolling annual rates.

If history is insufficient, show nominal simulation and mark real-cost scenarios
unavailable. Recommendation is `favorable`, `tight`, or `risky`, based on real
rate plus payment/penalty evidence, and always includes plain-language reasons.

## Integration and evidence

History gains an Economic purchasing power and loans section before the generic
chart grid. It shows the selected currency, import/export basis, rate summaries,
the index chart, current loan contracts, scenario comparison, and evidence
labels. Empty states distinguish no save history, insufficient common prices,
and no active loans.

All calculations are local. No new remote dependency is added. Existing legacy
routes, RUB/USD Analysis tabs, chart synchronization, save import, and autosave
compatibility remain intact.

## Verification

- Unit tests independently derive geometric price-index and annualization
  literals, including missing resources and irregular dates.
- Unit tests parse real-format loan blocks and reject incomplete ones.
- Unit tests validate one-day and full-loan simulations against hand-calculated
  values, including insufficient cash and penalty transfer.
- Existing calculator tests prove opportunity mode stays unchanged; new tests
  prove purchase mode prices 2.5 tonnes of livestock against 1 tonne of meat.
- UI contract tests cover labels, controls, empty states, and dispatch.
- Full `npm test`, syntax check, and browser interaction in both themes complete
  the delivery gate.
