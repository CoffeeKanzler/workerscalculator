# Electronics inventory and loan hedge design

## Goal

Turn a loaded save into an evidence-labelled answer to this question: can a
used cargo ship filled with electronics plausibly earn more than financing it
under one of the save's active RUB or USD loan terms?

## Evidence layers

The UI must keep three different effects separate:

1. **Normal currency inflation** remains the real-rate basis for the loan.
2. **Observed electronics export-price history** supplies the liquidation-price
   scenarios. It is save evidence, but past appreciation is not a guarantee.
3. **Year-dependent factory recipes** show structural production pressure. The
   original building INIs define consumption growth and production decline.
   This is supporting evidence and must not be presented as a market-price
   formula.

## Recipe model

For a building at game year `y`, reproduce the documented INI curves:

```text
consumptionFactor = clamp((y - startYear) / yearSpan, 0, maximumFactor)
productionFactor  = clamp(1 - (y - startYear) / yearSpan, minimumFactor, 1)
```

The direct imported-input cost per tonne of electronics is:

```text
sum(baseInputRate × consumptionFactor × currentInputPurchasePrice)
------------------------------------------------------------------
          baseOutputRate × productionFactor
```

Both vanilla and DLC3 assembly halls are shown separately. The extractor also
retains the same metadata for electronic-component factories.

## Ship trade model

Only exact used-market offers are candidates when all of these are known:

- runtime category is ship;
- transport subtype is covered or general;
- positive cargo capacity;
- exact used-market purchase quote;
- current electronics purchase and export prices;
- a selected active loan's rate and remaining duration.

For every candidate and loan-term row:

```text
capital required = used ship price + capacity × electronics purchase price
loan repayment   = exact daily loan simulation for that capital
future cargo     = capacity × current export price × (1 + scenario rate)^years
trade result     = future cargo + current-recovery reference - loan repayment
```

The current-recovery reference is the ship's current net recycling value at
current save prices. It is displayed separately and explicitly held constant;
it is not claimed as an exact future resale price. A zero-residual break-even
price is also shown so the recommendation remains auditable without that
assumption.

Scenario rates use the save's rolling annual electronics export-price changes:

- base: latest annual rate;
- best: 75th percentile;
- worst: 25th percentile.

Recommendations are intentionally conservative:

- robust only when the worst scenario is profitable;
- speculative when base is profitable but worst is not;
- reject when base is not profitable;
- unavailable when required save evidence is missing.

## Placement

Add an Electronics inventory strategy section to the History tab below the
inflation/loan overview. It uses the same currency selection, real save prices,
active loans, and resolved used-market offers. No synthetic fallback should
look like save evidence.

