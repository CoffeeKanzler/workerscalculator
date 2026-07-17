#!/usr/bin/env python3
"""Add vehicles present in the game files but missing from the community sheet.

Real construction-cost/material data does not exist for vehicles in any game
file (confirmed by manual .ini inspection - see private RE notes / memory;
bbox.bin is only a 24-byte 3D bounding box, and there is no other per-vehicle
binary). But several cost fields turn out to be near-exact linear functions
of a vehicle's own stats within a Typ group - e.g. Lokomotive Arbeitstage =
45*Leergewicht + 0.25*Motorleistung fits the ~44 measured locomotives to
within 0.01%. For each Typ+field we fit weight/power/speed/length against the
measured sheet rows and use the regression when it fits tightly; otherwise we
fall back to the median cost-per-tonne ratio. Every non-literal field is
flagged via attrs['estimated'] regardless of which method produced it, since
neither is a value read from a game file. Real per-vehicle stats (speed,
power, weight, capacity, years, origin) come straight from the game files.

Vehicles with no in-game display name at all (~230 raw entries, mostly
unused/duplicate wagons) are skipped rather than invented.
"""
import json
import re
import statistics
from collections import defaultdict

import numpy as np

REGRESSION_MIN_ROWS = 8
REGRESSION_MAX_RELERR = 0.15  # use the fitted formula only if it's reasonably tight

VEH_PATH = 'data/vehicles.json'
RAW_PATH = 'data/game/vehicles_raw.json'

COST_FIELDS = [
    'Arbeitstage', 'Stahl', 'Aluminium', 'Kunststoffe', 'Stoff',
    'Mechanik-Bauteile', 'Elektronik-Bauteile', 'Elektronik',
]

COUNTRY_BAULAND = {
    39000: 'Czechoslovakia', 39003: 'Deutschland', 39004: 'East Germany',
    39005: 'West Germany', 39006: 'Poland', 39007: 'Ungarn',
    39008: 'Bulgaria', 39009: 'Romania', 39010: 'Yugoslavia',
    39011: 'Soviet Union', 39013: 'Latvian SSR', 39014: 'Byelorussian SSR',
    39016: 'France', 39017: 'Italy', 39018: 'USA', 39019: 'Belarus',
    39020: 'Ukraine', 39021: 'Russia', 39022: 'Schweden', 39024: 'Korea',
    39030: 'Japan', 39042: 'China',
}

TT_FRACHTART = {
    'RESOURCE_TRANSPORT_PASSANGER': 'Passagiere',
    'RESOURCE_TRANSPORT_OPEN': 'Offene Ladefläche',
    'RESOURCE_TRANSPORT_COVERED': 'Abgedeckte Ladefläche',
    'RESOURCE_TRANSPORT_GRAVEL': 'Kipper',
    'RESOURCE_TRANSPORT_OIL': 'Flüssigkeitstank',
    'RESOURCE_TRANSPORT_WASTE': 'Müll',
    'RESOURCE_TRANSPORT_COOLER': 'Kühlung',
    'RESOURCE_TRANSPORT_WATER': 'Flüssigkeitstank',
    'RESOURCE_TRANSPORT_CONCRETE': 'Beton',
    'RESOURCE_TRANSPORT_GENERAL': 'Ladung',
    'RESOURCE_TRANSPORT_SEWAGE': 'Flüssigkeitstank',
    'RESOURCE_TRANSPORT_CEMENT': 'Staubgut-Behälter',
    'RESOURCE_TRANSPORT_LIVESTOCK': 'Vieh',
}

KEYWORD_TYP = [
    (('fire truck', 'fire engine', 'feuerwehr'), 'Feuerwerhfahrzeug'),
    (('ambulance', 'krankenwagen'), 'Krankenwagen'),
    (('police', 'polizei'), 'Polizeiwagen'),
    (('prison bus', 'convict', 'gefangenen'), 'Gefangenen Bus'),
    (('snowplow', 'snow plow', 'schneepflug'), 'Schneepflug'),
    (('tower crane', 'turmdrehkran'), 'Turmdrehkran'),
    (('excavator', 'bagger'), 'Bagger'),
    (('bulldozer', 'planierraupe'), 'Planierraupe'),
    (('roller', 'walze'), 'Walze'),
    (('asphalt paver', 'asphaltleger', 'paver'), 'Asphaltleger'),
    (('cement mixer', 'concrete mixer', 'betonmischer'), 'Betonmischer'),
    (('garbage', 'trash', 'müllfahrzeug', 'waste truck'), 'Müllfahrzeug'),
    (('forklift', 'gabelstapler'), 'Gabelstapler'),
    (('harvester', 'combine', 'mähdrescher'), 'Mähdrescher'),
    (('tractor', 'traktor'), 'Traktor'),
    (('trolleybus', 'trolley bus'), 'Trolleybus'),
    (('mobile crane', 'truck crane', 'straßenkran'), 'Straßenkran'),
]


def strip_paren(name):
    return re.sub(r'\s*\([^)]*\)\s*$', '', name or '').strip().lower()


def classify(r):
    name = ((r.get('en') or '') + ' ' + (r.get('de') or '')).lower()
    t = r.get('type')
    tg = r.get('trainGroup')
    tt = r.get('transportType')
    cap = r.get('capacity') or 0

    if t == 'VEHICLETYPE_AIRPLANE':
        return 'Flugzeug', '-'
    if t == 'VEHICLETYPE_HELICOPTER':
        return 'Hubschrauber', '-'
    if t == 'VEHICLETYPE_SHIP':
        typ = 'Passagierschiff' if tt == 'RESOURCE_TRANSPORT_PASSANGER' else 'Frachtschiff'
        return typ, TT_FRACHTART.get(tt, '-')
    if t in ('VEHICLETYPE_RAIL_LOCOMOTIVE', 'VEHICLETYPE_RAIL_VAGON'):
        if tg == 'tram':
            return 'Straßenbahn', TT_FRACHTART.get(tt, 'Passagiere')
        if tg == 'metro':
            return 'U-Bahn', 'Passagiere'
        if tg in ('locomotive', 'locomotive_steam'):
            return 'Lokomotive', '-'
        if tg in ('trackbuilder', 'trackbuilder_steam'):
            return 'Gleisbau', '-'
        if tg == 'motorvagon':
            return 'Triebwagen', TT_FRACHTART.get(tt, 'Passagiere')
        if tg == 'trainset':
            return 'Zugverband', TT_FRACHTART.get(tt, 'Passagiere')
        if tt == 'RESOURCE_TRANSPORT_PASSANGER':
            return 'Passagierwagen', 'Passagiere'
        return 'Güterwagon', TT_FRACHTART.get(tt, 'Ladung')

    # VEHICLETYPE_ROAD and anything else
    for keywords, typ in KEYWORD_TYP:
        if any(k in name for k in keywords):
            return typ, TT_FRACHTART.get(tt, '-')
    if tt == 'RESOURCE_TRANSPORT_PASSANGER':
        return ('Personenkraftwagen' if cap and cap <= 8 else 'Bus'), 'Passagiere'
    if tt in TT_FRACHTART:
        frachtart = TT_FRACHTART[tt]
        typ = {
            'Kipper': 'Kipper', 'Flüssigkeitstank': 'Tanklaster',
            'Abgedeckte Ladefläche': 'Abgedeckter LKW',
            'Offene Ladefläche': 'Offene Ladefläche',
            'Kühlung': 'Kühllaster', 'Beton': 'Betonmischer',
            'Staubgut-Behälter': 'Trockenschüttguttank', 'Müll': 'Müllfahrzeug',
            'Ladung': 'Offene Ladefläche', 'Vieh': 'Offene Ladefläche',
        }.get(frachtart, 'Offene Ladefläche')
        if 'sewage' in name or 'abwasser' in name:
            typ = 'Abwassertank'
        elif frachtart == 'Flüssigkeitstank' and ('water' in name or 'wasser' in name):
            typ = 'Wassertank'
        return typ, frachtart
    return 'Offene Ladefläche', '-'


def main():
    data = json.load(open(VEH_PATH, encoding='utf-8'))
    sheet = data['vehicles']
    raw = json.load(open(RAW_PATH, encoding='utf-8'))

    by_name = {}
    by_stripped = defaultdict(list)
    for v in sheet:
        by_name[v['name'].strip().lower()] = v
        by_stripped[strip_paren(v['name'])].append(v)

    # join each sheet vehicle to its raw game record so we can use real
    # (unrounded) cargo capacity as a regression predictor too
    by_stripped_raw = {}
    for r in raw:
        for nm in (r.get('de'), r.get('en')):
            if nm:
                by_stripped_raw.setdefault(strip_paren(nm), r)

    def capacity_for(name):
        rr = by_stripped_raw.get(strip_paren(name))
        return (rr.get('capacity') or 0) if rr else 0

    def predictor_row(a, cap):
        return [a.get('Leergewicht') or 0, a.get('Motorleistung') or 0,
                a.get('Max. Geschwindigkeit') or 0, a.get('Länge') or 0, cap, 1]

    # only fit against real, measured sheet rows - never against our own
    # previously-estimated additions (attrs.estimated marks those)
    measured = [v for v in sheet if 'estimated' not in v['attrs']]
    by_typ = defaultdict(list)
    for v in measured:
        a = v['attrs']
        if not a.get('Leergewicht'):
            continue
        by_typ[a.get('Typ')].append((a, capacity_for(v['name'])))

    # cost-per-empty-weight-tonne ratios, grouped by Typ (fallback method)
    ratios = defaultdict(lambda: defaultdict(list))
    for typ, rows in by_typ.items():
        for a, cap in rows:
            w = a.get('Leergewicht')
            for f in COST_FIELDS:
                val = a.get(f)
                if isinstance(val, (int, float)) and val > 0:
                    ratios[typ][f].append(val / w)

    # per-Typ linear regression against weight/power/speed/length/capacity
    # (primary method - near-exact for several Typ groups, e.g. Lokomotive
    # Arbeitstage = 45*Leergewicht + 0.25*Motorleistung fits to <0.02%)
    regressions = defaultdict(dict)
    for typ, rows in by_typ.items():
        if len(rows) < REGRESSION_MIN_ROWS:
            continue
        X = np.array([predictor_row(a, cap) for a, cap in rows], dtype=float)
        for f in COST_FIELDS:
            vals = np.array([a.get(f) or 0 for a, cap in rows], dtype=float)
            if np.max(vals) <= 0:
                continue
            coef, _, _, _ = np.linalg.lstsq(X, vals, rcond=None)
            pred = X @ coef
            denom = np.where(np.abs(vals) < 1e-9, 1, vals)
            relerr = np.max(np.abs((vals - pred) / denom))
            if relerr <= REGRESSION_MAX_RELERR:
                regressions[typ][f] = coef

    added = []
    skipped_unnamed = 0
    seen_dup_keys = set()
    for r in raw:
        de = (r.get('de') or '').strip()
        en = (r.get('en') or '').strip()
        if not de and not en:
            skipped_unnamed += 1
            continue
        if de.lower() in by_name or en.lower() in by_name:
            continue
        if by_stripped.get(strip_paren(de)) or by_stripped.get(strip_paren(en)):
            continue

        dup_key = (de or en, en, r.get('emptyWeight'), r.get('speed'), r.get('powerKW'),
                   r.get('capacity'), r.get('from'), r.get('to'),
                   r.get('transportType'), r.get('trainGroup'))
        if dup_key in seen_dup_keys:
            continue
        seen_dup_keys.add(dup_key)

        typ, frachtart = classify(r)
        weight = r.get('emptyWeight') or 0
        attrs = {'Typ': typ, 'Frachtart': frachtart}

        cid = r.get('countryId')
        if cid in COUNTRY_BAULAND:
            attrs['Bauland'] = COUNTRY_BAULAND[cid]

        if r.get('from'):
            attrs['Von'] = float(r['from'])
        if r.get('to'):
            attrs['Bis'] = float(r['to'])
        if r.get('speed'):
            attrs['Max. Geschwindigkeit'] = float(r['speed'])
        if r.get('powerKW'):
            attrs['Motorleistung'] = float(r['powerKW'])
        if weight:
            attrs['Leergewicht'] = float(weight)
        if r.get('length'):
            attrs['Länge'] = float(r['length'])

        cap = r.get('capacity')
        if cap:
            if frachtart == 'Passagiere':
                attrs['Passagiere'] = float(cap)
            else:
                attrs['Ladefläche'] = float(cap)

        estimated = []
        typ_ratios = ratios.get(typ, {})
        typ_regressions = regressions.get(typ, {})
        x_row = np.array(predictor_row(attrs, r.get('capacity') or 0), dtype=float)
        for f in COST_FIELDS:
            if f in attrs:
                continue  # never overwrite a real cargo-capacity value
            coef = typ_regressions.get(f)
            if coef is not None:
                est = float(x_row @ coef)
            else:
                vals = typ_ratios.get(f)
                est = statistics.median(vals) * weight if vals and weight else 0
            if est <= 0:
                continue
            attrs[f] = round(est, 3)
            estimated.append(f)

        if estimated:
            attrs['estimated'] = estimated

        added.append({'name': de or en, 'attrs': attrs})

    print(f'Adding {len(added)} vehicles, skipped {skipped_unnamed} unnamed raw entries')
    sheet.extend(added)
    with open(VEH_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write('\n')


if __name__ == '__main__':
    main()
