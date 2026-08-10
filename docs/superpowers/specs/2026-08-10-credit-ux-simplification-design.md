# Credit UX Simplification Design

## Status and scope

This design applies the approved blind UI/UX review to the existing Republic
Command Center Credits tab. The underlying loan, inflation, electronics recipe,
used-market, currency, and amortization models remain intact unless a display
adapter needs a small pure helper. Mobile layout work is explicitly out of
scope.

The page must answer one primary question first:

> Is this credit cheap or expensive after the republic's general inflation,
> and what cash burden still has to be paid?

The optional electronics strategy answers a separate question and must never
look like the answer to the primary one.

## User and product intent

The user has just loaded a real save and wants a fast operational decision,
not an economics lecture. They need to understand daily cash pressure and real
purchasing-power cost before exploring a speculative hedge.

The page should feel like a dense republic finance ledger: restrained,
evidence-led, and decisive. It keeps the existing Command Center typography,
palette, navigation, chart library, and compact desktop density.

Domain concepts are purchasing power, nominal debt, real debt, daily repayment,
saved evidence, and optional inventory hedge. The visual signature is a single
real-cost verdict strip that combines plain-language assessment, effective
credit cost, general inflation, and daily burden. This replaces generic KPI
prominence.

## Information architecture

The Credits page is ordered as follows:

1. **Data status** — compact facts such as active contract count, usable price
   history, and used-market availability. No repeated evidence badges.
2. **Current credit position** — one verdict per active credit, with a concise
   cash and purchasing-power summary.
3. **New credit calculator** — a self-contained calculation for exactly the
   amount, APR, and term entered by the user.
4. **Optional electronics strategy** — collapsed by default and visually
   separated from normal credit evaluation.
5. **History and evidence** — collapsed by default; contains inflation views,
   saved aggregate credit values, and provenance limits.

The current top-level imperative investment recommendation is removed.

## Current credit position

Each active contract is rendered as a readable summary rather than a 12-column
table. Its always-visible fields are:

- outstanding principal;
- penalty balance when nonzero;
- remaining days;
- projected remaining nominal payments;
- maximum daily payment;
- effective annual credit cost;
- expected real annual cost against general inflation;
- direct plain-language assessment.

The assessment copy is:

- **Inflation exceeds credit costs** when expected real cost is negative;
- **Credit costs and inflation are similar** for a small positive real cost;
- **Credit costs clearly exceed inflation** for the risky state.

The visible explanation explicitly distinguishes real burden from payment:

> Inflation can reduce the debt's value in purchasing-power terms. It does not
> make the scheduled payments disappear.

Best/base/worst real-rate details and formula reasoning move into a disclosure
named **How was this assessed?**.

## New credit calculator

The calculator owns one mental model. Its inputs are:

- credit amount;
- nominal annual interest;
- term in years;
- currency.

Its outputs all refer to that exact amount:

- total repayment;
- nominal additional cost (`total repayment - amount`);
- maximum daily payment;
- effective annual cost;
- expected real annual cost;
- plain-language verdict.

No investment-required principal appears inside this calculator. Inflation is
compared through a disclosure named **Compare with general price development**.
Import and export price views are not presented as controls that change the
credit verdict.

When price history is insufficient, the nominal calculator remains available,
but the real-cost verdict is replaced by a precise missing-data message.

## Optional electronics strategy

The section title is **Optional strategy: store electronics and export later**.
It is collapsed by default. Its summary may show only whether any qualifying
strategy exists; it must not say "take a loan".

When expanded, the section begins with this warning:

> Experimental long-term forecast, not a general recommendation to borrow.
> Not included: operations, transport, storage losses, and later rule changes.

The normal credit form and the investment strategy remain independent. The
strategy explicitly selects either hypothetical terms or terms copied from an
active contract. It calculates and labels its own required principal for ship
and full cargo.

The strategy result is phrased conditionally:

> Under these assumptions, the electronics strategy would be profitable after
> about {years} years.

Scenario labels become:

- **Expected assumption**;
- **Optimistic assumption**;
- **Cautious assumption**.

The production selector is labelled **Electronics production chain** with
options **Vanilla** and **DLC 3**. The word "assembly hall" is not used.

The default result shows required principal, expected break-even, cautious
break-even, and exit currency. Alternate exits, the forecast chart, production
chain detail, and 5/10/20/30-year milestones are nested under **Show assumptions
and forecast curve**. The 20- and 30-year values are not prominent cards.

The existing relevance gate remains: losing strategies and strategies whose
expected path never crosses zero within 30 years stay hidden.

## History and evidence

Inflation and aggregate saved credit history move below the decision tools into
a collapsed disclosure named **History and data basis**.

The general/base price series is described as **General price development** and
is the only series used for real credit cost. Import and export series may be
inspected there as market context, with explicit copy that they do not alter the
normal credit verdict.

Saved aggregate balance and interest are labelled **Saved credit values from
this save**. The UI retains the boundary that completed individual contracts
cannot be reconstructed from aggregate history.

Evidence provenance is shown once per section, not repeated on every metric.

## Empty and partial states

The page must not render a wall of large dash cards.

- No price history: explain that `stats.ini` needs multiple dated price records
  for an inflation comparison.
- No active credit: say so once; keep the new-credit calculator available.
- No used market: the collapsed optional-strategy summary says that a save with
  used-market offers is required.
- Missing recipe or price evidence: no strategy recommendation is rendered.
- No profitable electronics strategy: retain the exact 30-year empty result,
  inside the optional section only.

Nominal loan results derived solely from entered terms remain clearly labelled
as calculations, not save evidence.

## Content changes

Required German labels include:

- `Kredite: Kosten und Tragbarkeit`
- `Deine aktuelle Kreditlage`
- `Neuen Kredit berechnen`
- `Allgemeine Preisentwicklung`
- `Kreditsumme`
- `Summe aller Zahlungen`
- `Zusätzliche Kreditkosten`
- `Höchste Rate pro Tag`
- `Inflation übersteigt Kreditkosten`
- `Kreditkosten und Inflation sind ähnlich`
- `Kreditkosten übersteigen die Inflation deutlich`
- `Optionale Strategie: Elektronik lagern und später exportieren`
- `Erwartete Annahme`, `Optimistische Annahme`, `Vorsichtige Annahme`
- `Elektronik-Produktionskette`, `Vanilla`, `DLC 3`
- `Verlauf und Datengrundlage`

English receives equivalent plain-language strings. Existing translation
parity and placeholder tests remain mandatory.

## Visual treatment

Keep existing colors and desktop-focused density. Use fewer bordered cards and
one section-level provenance badge. Active credits become ledger rows/cards
with a strong verdict edge and compact secondary facts. Inputs remain inset.
Disclosures create progressive depth without hiding the primary repayment
facts.

No mobile-specific CSS, responsive-table rewrite, breakpoint change, or mobile
acceptance requirement is included.

## Testing and acceptance

Source-contract tests must first fail on the old hierarchy and copy. Pure model
tests cover any new presentation helper for additional nominal cost or credit
verdicts. Browser acceptance uses the existing real-save plus controlled stats
path and verifies:

- active-credit assessment appears before the calculator;
- all calculator outputs use the entered amount;
- no visible imperative "take a loan" copy exists;
- inflation controls do not imply changing the credit verdict;
- electronics is collapsed initially;
- expanding it shows the warning, conditional result, required principal,
  understandable scenario names, and no "assembly hall" label;
- history/evidence is collapsed and independently expandable;
- empty history gives an actionable data message instead of dash metrics;
- light and dark desktop rendering have no page or console errors.

Run focused tests, `node --check js/app.js`, the full `npm test`, cache-marker
verification, and both existing credit browser scenarios before merge.

## Explicit non-goals

- Mobile layout or mobile browser acceptance.
- Changing the game-derived loan formula.
- Changing forecast mathematics or the 30-year relevance gate.
- Adding new investment goods beyond electronics.
- Reconstructing completed historical contracts without save evidence.
- Redesigning global navigation or the Command Center theme.
