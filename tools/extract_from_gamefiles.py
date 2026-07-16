#!/usr/bin/env python3
"""Extract economy data straight from the W&R: Soviet Republic game files.

Usage:
    python3 extract_from_gamefiles.py /path/to/media_soviet [--validate]

Reads buildings_types/*.ini (and later: vehicles, localization) and writes
data/game/*.json. With --validate it compares production/consumption rates
against the sheet-derived data/production_buildings.json and reports drift
plus the implied rate→t/day conversion per building.

Known unit semantics (verified against the sheet / game UI):
  - $TYPE_FACTORY: $PRODUCTION/$CONSUMPTION values are t per worker per day
    → t/day = value × WORKERS_NEEDED
  - Mines/fields have their own scaling (richness %); validated per type.
"""
import json
import os
import re
import struct
import sys

# Game string tables: sovietXXX.btf at media_soviet root.
# Format (all big-endian): u32 entryCount, u32 fileSize, u32 blobCharCount,
# then entryCount × (u32 id, u32 charOffset, u16 charLen), then UTF-16-BE blob.
BTF_LANGS = {
    'German': 'de', 'English': 'en', 'Russian': 'ru', 'Czech': 'cs',
    'Slovak': 'sk', 'Polish': 'pl', 'Hungarian': 'hu', 'French': 'fr',
    'Italian': 'it', 'Spanish': 'es', 'PortugueseBrazil': 'pt',
    'Romanian': 'ro', 'Serbian': 'sr', 'Bulgarian': 'bg', 'Turkish': 'tr',
    'Ukrainian': 'uk', 'Japanese': 'ja', 'Korean': 'ko',
    'Chinese': 'zh', 'ChineseTraditional': 'zh-TW',
}


def load_btf(path):
    data = open(path, 'rb').read()
    count = struct.unpack('>I', data[:4])[0]
    blob = data[12 + count * 10:]
    out = {}
    for i in range(count):
        rid, off, ln = struct.unpack('>IIH', data[12 + i * 10:12 + i * 10 + 10])
        out[rid] = blob[off * 2:(off + ln) * 2].decode('utf-16-be', errors='replace')
    return out


def load_localization(media):
    tables = {}
    for name, code in BTF_LANGS.items():
        p = os.path.join(media, f'soviet{name}.btf')
        if os.path.isfile(p):
            tables[code] = load_btf(p)
    return tables

ECON_TOKENS = {
    'NAME', 'WORKERS_NEEDED', 'PROFESORS_NEEDED', 'PRODUCTION', 'CONSUMPTION',
    'CONSUMPTION_PER_SECOND', 'CITIZEN_ABLE_SERVE', 'QUALITY_OF_LIVING',
    'ATTRACTIVE_SCORE', 'STORAGE', 'COST_RESOURCE', 'WASTE_CONSUMPTION',
    'ELETRIC_CONSUMPTION_LIGHTING_WORKER_FACTOR',
    'ELETRIC_CONSUMPTION_LIVING_WORKER_FACTOR',
}

TYPE_RE = re.compile(r'^\$(TYPE_[A-Z_]+|SUBTYPE_[A-Z_]+|CIVIL_BUILDING)\b')


def parse_building(path):
    b = {
        'id': os.path.splitext(os.path.basename(path))[0],
        'nameId': None, 'types': [], 'workers': 0, 'professors': 0,
        'production': {}, 'consumption': {}, 'livingSpace': 0,
        'citizenAbleServe': 0, 'qualityOfLiving': None, 'attractiveScore': None,
        'constructionResources': {},
    }
    try:
        text = open(path, encoding='utf-8', errors='replace').read()
    except OSError:
        return None
    for raw in text.splitlines():
        line = raw.strip()
        if not line.startswith('$'):
            continue
        m = TYPE_RE.match(line)
        if m:
            b['types'].append(m.group(1))
            continue
        parts = line[1:].split()
        key, args = parts[0], parts[1:]
        if key not in ECON_TOKENS:
            continue
        try:
            if key == 'NAME' and args:
                b['nameId'] = int(args[0])
            elif key == 'WORKERS_NEEDED':
                b['workers'] = float(args[0])
            elif key == 'PROFESORS_NEEDED':
                b['professors'] = float(args[0])
            elif key == 'PRODUCTION':
                b['production'][args[0]] = float(args[1])
            elif key in ('CONSUMPTION', 'CONSUMPTION_PER_SECOND'):
                b['consumption'][args[0]] = float(args[1])
            elif key == 'CITIZEN_ABLE_SERVE':
                b['citizenAbleServe'] = float(args[0])
            elif key == 'QUALITY_OF_LIVING':
                b['qualityOfLiving'] = float(args[0])
            elif key == 'ATTRACTIVE_SCORE':
                b['attractiveScore'] = float(args[0])
            elif key == 'STORAGE' and len(args) >= 2 and args[0] == 'RESOURCE_TRANSPORT_PASSANGER':
                b['livingSpace'] = float(args[1])
            elif key == 'COST_RESOURCE' and len(args) >= 2:
                b['constructionResources'][args[0]] = \
                    b['constructionResources'].get(args[0], 0) + float(args[1])
        except (ValueError, IndexError):
            pass
    # keep only buildings with economic relevance
    if not (b['workers'] or b['production'] or b['consumption']
            or b['livingSpace'] or b['citizenAbleServe']):
        return None
    return b


def extract_buildings(media):
    root = os.path.join(media, 'buildings_types')
    out = []
    for fn in sorted(os.listdir(root)):
        if fn.endswith('.ini'):
            b = parse_building(os.path.join(root, fn))
            if b:
                out.append(b)
    return out


def validate(buildings, repo_root):
    """Compare game rates against sheet-derived production data, matched by
    German name, and report the implied multiplier sheet_t_per_day / game_rate."""
    sheet = json.load(open(os.path.join(repo_root, 'data', 'production_buildings.json')))
    res = json.load(open(os.path.join(repo_root, 'data', 'resources.json')))['resources']
    de2key = {r['de']: r['key'] for r in res}

    by_de = {}
    for g in buildings:
        if g.get('de'):
            by_de.setdefault(g['de'].lower(), g)

    print(f'{"sheet building":42s} {"game building":28s} {"resource":12s} '
          f'{"sheet t/d":>9s} {"rate":>8s} {"mult":>7s} {"≈workers?":>9s}')
    matched, unmatched = 0, []
    for s in sheet:
        # strip sheet-only suffixes like ' Early'
        base = re.sub(r'\s+(early|groß|klein)\s*$', '', s['de'], flags=re.I).lower()
        g = by_de.get(s['de'].lower()) or by_de.get(base)
        if not g or not g['production']:
            unmatched.append(s['de'])
            continue
        for p in s['production']:
            key = de2key.get(p['de'])
            if not key or key not in g['production']:
                continue
            rate = g['production'][key]
            mult = p['rate'] / rate if rate else 0
            approx = 'yes' if s['workers'] and abs(mult - s['workers']) / s['workers'] < 0.05 else ''
            print(f'{s["de"][:41]:42s} {g["id"][:27]:28s} {key:12s} '
                  f'{p["rate"]:9.2f} {rate:8.3f} {mult:7.1f} {approx:>9s}')
            matched += 1
    print(f'\nmatched {matched} production lines; unmatched sheet buildings: {len(unmatched)}')
    print('  ' + ', '.join(unmatched[:25]) + (' …' if len(unmatched) > 25 else ''))


VEHICLE_DIRS = ['vehicles', 'trains', 'airplanes', 'helicopters', 'ships']

VEHICLE_SCALARS = {
    'NAME': ('nameId', int), 'DESCRIPTION': ('descriptionId', int),
    'COST_RUB': ('costRUB', float), 'COST_USD': ('costUSD', float),
    'MOVEMENT_SPEED': ('speed', float), 'MOVEMENT_POWER_KW': ('powerKW', float),
    'MOVEMENT_EMPTY_WEIGHT': ('emptyWeight', float),
    'MOVEMENT_CONSPUMPTION': ('consumption', float),
    'RESOURCE_CAPACITY': ('capacity', float),
    'COUNTRY': ('countryId', int),
}


def parse_vehicle(path, category):
    v = {'id': os.path.basename(os.path.dirname(path)), 'category': category}
    try:
        text = open(path, encoding='utf-8', errors='replace').read()
    except OSError:
        return None
    for raw in text.splitlines():
        line = raw.strip()
        if not line.startswith('$'):
            continue
        parts = line[1:].split()
        key, args = parts[0], parts[1:]
        try:
            if key in VEHICLE_SCALARS and args:
                field, conv = VEHICLE_SCALARS[key]
                v[field] = conv(float(args[0])) if conv is int else conv(args[0])
            elif key == 'TYPE' and args:
                v['type'] = args[0]
            elif key == 'RESOURCE_TRANSPORT_TYPE' and args:
                v['transportType'] = args[0]
            elif key == 'AVAILABLE' and len(args) >= 2:
                v['from'] = int(float(args[0]))
                v['to'] = int(float(args[1]))
            elif key.startswith('TRAINGROUP_'):
                v['trainGroup'] = key[len('TRAINGROUP_'):].lower()
        except (ValueError, IndexError):
            pass
    return v if 'type' in v else None


def extract_vehicles(media):
    out = []
    for d in VEHICLE_DIRS:
        root = os.path.join(media, d)
        if not os.path.isdir(root):
            continue
        for sub in sorted(os.listdir(root)):
            script = os.path.join(root, sub, 'script.ini')
            if os.path.isfile(script):
                v = parse_vehicle(script, d)
                if v:
                    out.append(v)
    return out


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    media = sys.argv[1]
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    outdir = os.path.join(repo_root, 'data', 'game')
    os.makedirs(outdir, exist_ok=True)

    loc = load_localization(media)
    print(f'localization: {len(loc)} languages, {len(loc.get("en", {}))} strings (en)')

    def attach_names(items):
        for it in items:
            nid = it.get('nameId')
            if nid is not None:
                it['de'] = loc.get('de', {}).get(nid)
                it['en'] = loc.get('en', {}).get(nid)

    buildings = extract_buildings(media)
    attach_names(buildings)
    with open(os.path.join(outdir, 'buildings_raw.json'), 'w') as f:
        json.dump(buildings, f, ensure_ascii=False, indent=1)
    print(f'buildings with economic data: {len(buildings)} -> data/game/buildings_raw.json')

    vehicles = extract_vehicles(media)
    attach_names(vehicles)
    with open(os.path.join(outdir, 'vehicles_raw.json'), 'w') as f:
        json.dump(vehicles, f, ensure_ascii=False, indent=1)
    from collections import Counter
    print(f'vehicles: {len(vehicles)} -> data/game/vehicles_raw.json '
          f'{dict(Counter(v["category"] for v in vehicles))}')

    # full multi-language name table for every referenced id (for ROADMAP 5.2)
    ids = {it.get('nameId') for it in buildings + vehicles} - {None}
    names = {str(i): {code: tbl[i] for code, tbl in loc.items() if i in tbl} for i in sorted(ids)}
    with open(os.path.join(outdir, 'names.json'), 'w') as f:
        json.dump(names, f, ensure_ascii=False, indent=1)
    print(f'names: {len(names)} ids × {len(loc)} languages -> data/game/names.json')

    if '--validate' in sys.argv:
        validate(buildings, repo_root)


if __name__ == '__main__':
    main()
