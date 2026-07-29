// Every alert the republic raises today is computed from one moment: staffing
// is 86.6%, and that is all it says. Whether that is the bottom of a recovery
// or the start of a collapse is a different instruction to the player, and the
// save already holds the answer — thousands of records spanning decades.
//
// These are alerts the snapshot cannot raise. A republic whose population has
// fallen for three straight years has nothing wrong with it *right now*, which
// is exactly why nothing currently says so.
//
// Per-area trends are deliberately absent: stats.ini carries one record per
// city, not a series, so anything claiming a per-area direction would be
// invented. Only the republic-wide series are real.

import { recordDateKey } from '../timeseries.js';

const YEAR = 366;

// Direction is decided by comparing two adjacent windows rather than by
// fitting a line: game series are noisy day to day and a mean over a year is
// both steadier and easier to explain than a gradient.
export function windowMean(records, valueOf, { from, to }) {
  let sum = 0;
  let count = 0;
  for (const record of records) {
    const key = recordDateKey(record);
    if (key < from || key >= to) continue;
    const value = valueOf(record);
    if (Number.isFinite(value)) { sum += value; count += 1; }
  }
  return count ? sum / count : null;
}

// deadband keeps ordinary drift from reading as a trend: a republic whose
// population wobbles by a percent is not in decline.
export function trendOf(records, valueOf, { window = YEAR, deadband = 0.03 } = {}) {
  const usable = (records ?? []).filter(record => Number.isFinite(valueOf(record)));
  if (usable.length < 2) return { direction: 'unknown', change: null, years: 0 };

  const latest = recordDateKey(usable.at(-1));
  const earliest = recordDateKey(usable[0]);
  if (latest - earliest < window * 2) return { direction: 'unknown', change: null, years: 0 };

  const recent = windowMean(usable, valueOf, { from: latest - window, to: latest + 1 });
  const prior = windowMean(usable, valueOf, { from: latest - window * 2, to: latest - window });
  if (recent === null || prior === null) return { direction: 'unknown', change: null, years: 0 };

  // A prior of zero has no meaningful ratio; treat any move off zero as a
  // change of direction but not of measurable size.
  const change = prior === 0 ? (recent === 0 ? 0 : null) : (recent - prior) / Math.abs(prior);
  const direction = change === null
    ? (recent > 0 ? 'rising' : 'falling')
    : change > deadband ? 'rising' : change < -deadband ? 'falling' : 'stable';

  // How long it has held: walk back window by window while the direction holds.
  let years = direction === 'stable' || direction === 'unknown' ? 0 : 1;
  if (years) {
    for (let step = 2; step < 40; step += 1) {
      const older = windowMean(usable, valueOf, {
        from: latest - window * (step + 1), to: latest - window * step,
      });
      const newer = windowMean(usable, valueOf, {
        from: latest - window * step, to: latest - window * (step - 1),
      });
      if (older === null || newer === null) break;
      const moved = older === 0 ? null : (newer - older) / Math.abs(older);
      if (moved === null) break;
      const same = direction === 'rising' ? moved > deadband : moved < -deadband;
      if (!same) break;
      years += 1;
    }
  }
  return { direction, change, years };
}

// Only directions worth acting on. A rising population is good news and does
// not belong in a list of things needing attention.
const WATCHED = Object.freeze([
  { metric: 'trend.population', concerning: 'falling', of: record => record.adults },
  { metric: 'trend.unemployed', concerning: 'rising', of: record => record.unemployed },
  { metric: 'trend.productivity', concerning: 'falling', of: record => record.averageProductivity },
  { metric: 'trend.crime', concerning: 'rising', of: record => record.seriousCrimes },
  { metric: 'trend.debt', concerning: 'rising', of: record => record.loanBalanceRUB },
]);

export function republicTrendAlerts(records, { window = YEAR, deadband = 0.03 } = {}) {
  const usable = Array.isArray(records) ? records : [];
  if (usable.length < 2) return [];

  const alerts = [];
  for (const watch of WATCHED) {
    const trend = trendOf(usable, watch.of, { window, deadband });
    if (trend.direction !== watch.concerning) continue;
    // Two years of the same direction is a trend; one is a bad year.
    alerts.push({
      severity: trend.years >= 2 ? 'critical' : 'warning',
      scopeId: null,
      scopeName: '',
      metric: watch.metric,
      observed: trend.change,
      threshold: deadband,
      evidence: 'stats.ini',
      trend,
    });
  }
  return alerts;
}

export { WATCHED, YEAR };
