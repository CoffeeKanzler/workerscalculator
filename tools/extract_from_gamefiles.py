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
import sys

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
    """Compare game rates against sheet-derived production data.

    Matches sheet buildings to game buildings by (produced resource, workers)
    and reports the implied multiplier sheet_t_per_day / game_rate.
    """
    sheet = json.load(open(os.path.join(repo_root, 'data', 'production_buildings.json')))
    res = json.load(open(os.path.join(repo_root, 'data', 'resources.json')))['resources']
    de2key = {r['de']: r['key'] for r in res}

    by_workers = {}
    for g in buildings:
        if g['production'] and g['workers']:
            by_workers.setdefault(g['workers'], []).append(g)

    print(f'{"sheet building":42s} {"game file":28s} {"resource":12s} '
          f'{"sheet t/d":>9s} {"rate":>8s} {"mult":>7s} {"≈workers?":>9s}')
    matched = unmatched = 0
    for s in sheet:
        cands = by_workers.get(s['workers'], [])
        hit = None
        for p in s['production']:
            key = de2key.get(p['de'])
            if not key:
                continue
            for g in cands:
                if key in g['production']:
                    hit = (g, key, p['rate'])
                    break
            if hit:
                break
        if not hit:
            unmatched += 1
            continue
        g, key, sheet_rate = hit
        mult = sheet_rate / g['production'][key] if g['production'][key] else 0
        approx = 'yes' if abs(mult - s['workers']) / max(s['workers'], 1) < 0.05 else ''
        print(f'{s["de"][:41]:42s} {g["id"][:27]:28s} {key:12s} '
              f'{sheet_rate:9.2f} {g["production"][key]:8.3f} {mult:7.1f} {approx:>9s}')
        matched += 1
    print(f'\nmatched {matched} / {len(sheet)} sheet buildings ({unmatched} unmatched)')


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    media = sys.argv[1]
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    buildings = extract_buildings(media)
    outdir = os.path.join(repo_root, 'data', 'game')
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, 'buildings_raw.json'), 'w') as f:
        json.dump(buildings, f, ensure_ascii=False, indent=1)
    print(f'buildings with economic data: {len(buildings)} -> data/game/buildings_raw.json')
    if '--validate' in sys.argv:
        validate(buildings, repo_root)


if __name__ == '__main__':
    main()
