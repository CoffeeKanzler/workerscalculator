#!/usr/bin/env python3
"""Add vehicles present in the game files but missing from the community sheet.

Real construction-cost/material data does not exist for vehicles in any game
file (confirmed by manual .ini inspection - see private RE notes / memory;
bbox.bin is only a 24-byte 3D bounding box, and there is no other per-vehicle
binary). But several cost fields turn out to be near-exact linear functions
of a vehicle's own stats within a Typ group - e.g. Lokomotive Arbeitstage =
45*Leergewicht + 0.25*Motorleistung fits the ~44 measured locomotives to
within 0.01%. For each Typ+field we fit both that regression and a flat
cost-per-tonne ratio against the measured sheet rows and keep whichever fits
tighter. Every non-literal field is flagged via attrs['estimated'] regardless
of which method produced it, since neither is a value read from a game file
directly. Real per-vehicle stats (speed,
power, weight, capacity, years, origin) come straight from the game files.

Vehicles with no in-game display name at all (~230 raw entries, mostly
unused/duplicate wagons) are skipped rather than invented.
"""
import json
import re
import statistics
from collections import defaultdict

import numpy as np

REGRESSION_MIN_ROWS = 8  # minimum measured rows before we trust either method

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

    # For each Typ+field, fit both a per-Typ linear regression against
    # weight/power/speed/length/capacity and a flat cost-per-tonne-weight
    # ratio, then keep whichever fits the measured rows tighter (by median
    # relative error). The regression is near-exact for several Typ groups -
    # e.g. Lokomotive Arbeitstage = 45*Leergewicht + 0.25*Motorleistung fits
    # to <0.02% - while a handful of Typ groups spanning many design eras
    # (Personenkraftwagen, Kipper, Flugzeug) fit the ratio better on some
    # fields because a 1913 and a 1980s vehicle of similar weight just have
    # different material complexity that these stats alone don't explain.
    # Many vehicles (service/utility types, and even some cargo types) have
    # no cost data at all in the sheet - that's a missing field, not a zero
    # measurement, so each field is fit only on the rows that actually have it.
    chosen = defaultdict(dict)
    for typ, rows in by_typ.items():
        for f in COST_FIELDS:
            present = [(a, cap) for a, cap in rows if isinstance(a.get(f), (int, float)) and a.get(f) > 0]
            if len(present) < REGRESSION_MIN_ROWS:
                continue
            vals = np.array([a[f] for a, cap in present], dtype=float)

            ratio_med = statistics.median(a[f] / a['Leergewicht'] for a, cap in present)
            ratio_pred = np.array([ratio_med * a['Leergewicht'] for a, cap in present])
            ratio_relerr = np.median(np.abs((vals - ratio_pred) / vals))

            X = np.array([predictor_row(a, cap) for a, cap in present], dtype=float)
            coef, _, _, _ = np.linalg.lstsq(X, vals, rcond=None)
            pred = X @ coef
            reg_relerr = np.median(np.abs((vals - pred) / vals))

            if reg_relerr <= ratio_relerr:
                chosen[typ][f] = ('regression', coef)
            else:
                chosen[typ][f] = ('ratio', ratio_med)

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
        typ_chosen = chosen.get(typ, {})
        x_row = np.array(predictor_row(attrs, r.get('capacity') or 0), dtype=float)
        for f in COST_FIELDS:
            if f in attrs:
                continue  # never overwrite a real cargo-capacity value
            method = typ_chosen.get(f)
            if method is None:
                continue
            kind, param = method
            est = float(x_row @ param) if kind == 'regression' else param * weight
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
