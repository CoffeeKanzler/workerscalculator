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
    'NAME', 'NAME_STR', 'WORKERS_NEEDED', 'PROFESORS_NEEDED', 'PRODUCTION', 'CONSUMPTION',
    'CONSUMPTION_PER_SECOND', 'CITIZEN_ABLE_SERVE', 'QUALITY_OF_LIVING',
    'ATTRACTIVE_SCORE', 'STORAGE', 'COST_RESOURCE', 'WASTE_CONSUMPTION',
    'ELETRIC_CONSUMPTION_LIGHTING_WORKER_FACTOR',
    'ELETRIC_CONSUMPTION_LIVING_WORKER_FACTOR',
}

TYPE_RE = re.compile(r'^\$(TYPE_[A-Z_]+|SUBTYPE_[A-Z_]+|CIVIL_BUILDING)\b')


def parse_building(path, ident=None):
    b = {
        'id': ident or os.path.splitext(os.path.basename(path))[0],
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
            if key == 'NAME_STR' and args:
                b['nameStr'] = ' '.join(args).strip('"')
            elif key == 'NAME' and args:
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
    # DLC / CWC buildings live in <dlc>/buildings/<name>/building.ini with $NAME_STR
    for dlc in sorted(os.listdir(media)):
        broot = os.path.join(media, dlc, 'buildings')
        if not os.path.isdir(broot):
            continue
        for sub in sorted(os.listdir(broot)):
            ini = os.path.join(broot, sub, 'building.ini')
            if os.path.isfile(ini):
                b = parse_building(ini, ident=f'{dlc}/{sub}')
                if b:
                    b['dlc'] = dlc
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


def bbox_length(vdir):
    """Vehicle length in meters from bbox.bin (6 big/little-endian floats:
    min XYZ, max XYZ; the z extent is the length). Validated against the
    sheet's lengths (e.g. box270 -> 15.04 m vs 15 m)."""
    p = os.path.join(vdir, 'bbox.bin')
    if not os.path.isfile(p):
        return None
    data = open(p, 'rb').read()
    if len(data) < 24:
        return None
    f = struct.unpack('<6f', data[:24])
    return round(abs(f[5] - f[2]), 2)


def parse_vehicle(path, category):
    v = {'id': os.path.basename(os.path.dirname(path)), 'category': category,
         'trainSet': []}
    length = bbox_length(os.path.dirname(path))
    if length:
        v['length'] = length
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
            elif key == 'TRAINSET' and args:
                v['trainSet'].append(args[0])
            elif key.startswith('TRAINGROUP_'):
                v['trainGroup'] = key[len('TRAINGROUP_'):].lower()
        except (ValueError, IndexError):
            pass
    if not v['trainSet']:
        del v['trainSet']
    return v if 'type' in v else None


def extract_vehicles(media):
    out = []
    roots = [(d, os.path.join(media, d)) for d in VEHICLE_DIRS]
    # DLC vehicle folders: <dlc>/vehicles/<name>/script.ini
    for dlc in sorted(os.listdir(media)):
        vroot = os.path.join(media, dlc, 'vehicles')
        if os.path.isdir(vroot):
            roots.append((f'{dlc}/vehicles', vroot))
    for cat, root in roots:
        if not os.path.isdir(root):
            continue
        for sub in sorted(os.listdir(root)):
            script = os.path.join(root, sub, 'script.ini')
            if os.path.isfile(script):
                v = parse_vehicle(script, cat)
                if v:
                    if '/' in cat:
                        v['dlc'] = cat.split('/')[0]
                    out.append(v)
    return out


# resource key -> building group (sheet group names), for buildings without a sheet match
GROUP_BY_RESOURCE = {
    'eletric': ('Strom', 'Electricity'),
    'heat': ('Heizwerk', 'Heating plant'),
    'water': ('Wasser & Abwasser', 'Water & Wastewater'),
    'usagewater': ('Wasser & Abwasser', 'Water & Wastewater'),
    'plants': ('Lebensmittel/Alkohol/Pflanzen', 'Food/Alcohol/Plants'),
    'food': ('Lebensmittel/Alkohol/Pflanzen', 'Food/Alcohol/Plants'),
    'alcohol': ('Lebensmittel/Alkohol/Pflanzen', 'Food/Alcohol/Plants'),
    'meat': ('Lebensmittel/Alkohol/Pflanzen', 'Food/Alcohol/Plants'),
    'livestock': ('Lebensmittel/Alkohol/Pflanzen', 'Food/Alcohol/Plants'),
    'fertiliser': ('Lebensmittel/Alkohol/Pflanzen', 'Food/Alcohol/Plants'),
    'fertiliser_liquid': ('Lebensmittel/Alkohol/Pflanzen', 'Food/Alcohol/Plants'),
    'gravel': ('Bauindustrie', 'Construction industry'),
    'rawgravel': ('Bauindustrie', 'Construction industry'),
    'cement': ('Bauindustrie', 'Construction industry'),
    'concrete': ('Bauindustrie', 'Construction industry'),
    'asphalt': ('Bauindustrie', 'Construction industry'),
    'bricks': ('Bauindustrie', 'Construction industry'),
    'boards': ('Bauindustrie', 'Construction industry'),
    'wood': ('Bauindustrie', 'Construction industry'),
    'prefabpanels': ('Bauindustrie', 'Construction industry'),
    'rawcoal': ('Fossile Brennstoffe', 'Fossil fuels'),
    'coal': ('Fossile Brennstoffe', 'Fossil fuels'),
    'oil': ('Fossile Brennstoffe', 'Fossil fuels'),
    'fuel': ('Fossile Brennstoffe', 'Fossil fuels'),
    'bitumen': ('Fossile Brennstoffe', 'Fossil fuels'),
    'chemicals': ('Fossile Brennstoffe', 'Fossil fuels'),
    'plastics': ('Fossile Brennstoffe', 'Fossil fuels'),
    'rawiron': ('Metallurgie', 'metallurgy'),
    'iron': ('Metallurgie', 'metallurgy'),
    'steel': ('Metallurgie', 'metallurgy'),
    'rawbauxite': ('Metallurgie', 'metallurgy'),
    'bauxite': ('Metallurgie', 'metallurgy'),
    'alumina': ('Metallurgie', 'metallurgy'),
    'aluminium': ('Metallurgie', 'metallurgy'),
}
ADVANCED = ('Fortschrittliche Industrie', 'Advanced Industry')
MISC = ('Sonstiges', 'Miscellaneous')
for k in ('uranium', 'yellowcake', 'uf6', 'nuclearfuel', 'nuclearfuelburned',
          'ecomponents', 'mcomponents', 'eletronics', 'explosives', 'fabric',
          'clothes', 'vehicles'):
    GROUP_BY_RESOURCE[k] = ADVANCED

# game construction-resource key -> app material field
CONSTRUCTION_MAP = {
    'workers': 'workdays', 'gravel': 'gravel', 'bricks': 'bricks', 'steel': 'steel',
    'concrete': 'concrete', 'asphalt': 'asphalt', 'boards': 'boards',
    'prefabpanels': 'panels', 'ecomponents': 'ecomponents', 'mcomponents': 'mcomponents',
}

EXTRA_FIELDS = ['power', 'maxKW', 'water', 'hotwater', 'wastePerWorker', 'workdays',
                'gravel', 'bricks', 'steel', 'concrete', 'asphalt', 'boards', 'panels',
                'ecomponents', 'mcomponents']


def build_dataset(buildings, repo_root, loc):
    """Merge game rates with sheet-measured extras into the app's
    production_buildings.json shape -> data/game/production_buildings.json."""
    sheet = json.load(open(os.path.join(repo_root, 'data', 'production_buildings.json')))
    res = json.load(open(os.path.join(repo_root, 'data', 'resources.json')))['resources']
    bykey = {r['key']: r for r in res}
    de2key = {r['de']: r['key'] for r in res}

    # index sheet rows for extras lookup: exact name, then normalized token set
    # (handles "Kleines Heizwerk" vs "Heizwerk (klein)" word-order/inflection)
    SPELLING = {'kohlenerz': 'kohleerz', 'kunstoff': 'kunststoff',
                'herstellung': '', 'von': '', 'kernbrennstoff': 'kernbrennstofffabrik'}

    # sheet rows whose names can't be derived from the game name
    GAMEID_ALIASES = {
        'heating_plant_big': 'Kleine Wasseraufbereitung',  # sheet data-entry bug: big heating plant row is mislabeled
        'cement_plant': 'Zementwerk klein',
        'cwc/CementPlant': 'Zementwerk groß',
        'cwc/chemical_plant_big': 'Chemieanlage groß',
    }

    def norm(name):
        name = name.lower().replace('kunstoff', 'kunststoff')
        tokens = re.sub(r'[(),/-]', ' ', name).split()
        out = set()
        for tk in tokens:
            tk = SPELLING.get(tk, tk)
            tk = re.sub(r'(es|er|en|e|s)$', '', tk) if len(tk) > 4 else tk
            if tk:
                out.add(tk)
        return frozenset(out)

    sheet_by_name, sheet_by_norm = {}, {}
    for s in sheet:
        sheet_by_name.setdefault(s['de'].lower(), []).append(s)
        sheet_by_norm.setdefault(norm(s['de']), []).append(s)

    def sheet_match(g, name):
        """Returns (sheet_row, scale). scale is 1.0 for an exact worker-count
        match; otherwise the candidate is a different capacity tier of the
        same building (e.g. a DLC variant with fewer workers) sharing the
        sheet's per-instance name, so its construction cost/utility totals
        are scaled by worker ratio rather than copied as-is (a smaller-tier
        variant needs proportionally less material/power/water, not the same
        amount the sheet measured for the bigger one)."""
        alias = GAMEID_ALIASES.get(g['id'])
        cands = (sheet_by_name.get(alias.lower(), []) if alias
                 else sheet_by_name.get(name.lower()) or sheet_by_norm.get(norm(name)) or [])
        for s in cands:
            if s['workers'] == g['workers']:
                return s, 1.0
        if cands:
            s = cands[0]
            return s, (g['workers'] / s['workers'] if s['workers'] else 1.0)
        return None, 1.0

    out, seen = [], {}
    for g in buildings:
        if not (g['production'] or g['consumption']):
            continue
        if not g.get('de') and not g.get('nameStr'):
            continue
        # farms produce via attached fields; their ini rate is not per-worker.
        # The app has a dedicated field/hectare calculator instead.
        if 'TYPE_FARM' in g['types'] or (not g['workers'] and sum(g['production'].values()) < 0.1):
            continue
        NAME_OVERRIDES = {
            'cwc/CementPlant': ('Zementwerk groß', 'Cement plant large'),
            'cwc/chemical_plant_big': ('Chemieanlage groß', 'Chemical plant large'),
        }
        name_de = g.get('de') or g['nameStr']
        name_en = g.get('en') or g.get('nameStr') or name_de
        if g['id'] in NAME_OVERRIDES:
            name_de, name_en = NAME_OVERRIDES[g['id']]
        s, scale = sheet_match(g, name_de)

        # dedupe: visual variants (_v2/_v3) share name+stats -> keep first;
        # same name but different stats -> qualify with worker count
        sig = (name_de, g['workers'], tuple(sorted(g['production'].items())),
               tuple(sorted(g['consumption'].items())))
        if sig in seen:
            continue
        seen[sig] = True
        collision = any(k[0] == name_de and k != sig for k in seen)
        if collision:
            name_de = f'{name_de} ({int(g["workers"])} 👷)'
            name_en = f'{name_en} ({int(g["workers"])} 👷)'

        # 'vehicles'/'trains' entries are service-vehicle transit markers in the
        # inis (produced AND consumed 1:1), not real economic output.
        PSEUDO = {'vehicles', 'trains'}
        heat_only = set(g['production']) - PSEUDO == {'heat'}
        prods, cons = [], []
        for key, rate in g['production'].items():
            r = bykey.get(key)
            if not r or key in PSEUDO:
                continue
            if heat_only and s:
                # heating output does not follow the ×workers rule; trust the sheet
                tday = next((p['rate'] for p in s['production'] if de2key.get(p['de']) == key), rate)
            elif heat_only:
                tday = rate
            else:
                tday = rate * g['workers'] if g['workers'] else rate
            prods.append({'de': r['de'], 'en': r['en'], 'rate': round(tday, 4)})
        for key, rate in g['consumption'].items():
            r = bykey.get(key)
            if not r or key in PSEUDO:
                continue
            tday = rate * g['workers'] if g['workers'] else rate
            cons.append({'de': r['de'], 'en': r['en'], 'rate': round(tday, 4)})

        entry = {
            'gameId': g['id'],
            'group': None,
            'de': name_de, 'en': name_en,
            'workers': g['workers'],
            'production': prods,
            'consumption': cons,
            # exact sheet measurement vs. scaled from a different capacity tier
            'measured': bool(s) and scale == 1.0,
        }
        if g.get('dlc'):
            entry['dlc'] = g['dlc']
        if s:
            entry['group'] = s['group']
            for f in EXTRA_FIELDS:
                # wastePerWorker is already a per-worker rate; everything else
                # is a building total and scales with this variant's capacity.
                entry[f] = s.get(f, 0) if f == 'wastePerWorker' else round(s.get(f, 0) * scale, 4)
        else:
            main_key = next(iter(g['production']), None) or next(iter(g['consumption']), None)
            gr = GROUP_BY_RESOURCE.get(main_key, MISC)
            entry['group'] = {'de': gr[0], 'en': gr[1]}
            for f in EXTRA_FIELDS:
                entry[f] = 0
            for ck, field in CONSTRUCTION_MAP.items():
                if ck in g.get('constructionResources', {}):
                    entry[field] = g['constructionResources'][ck]
        out.append(entry)

    out.sort(key=lambda e: (e['group']['de'], e['de']))
    path = os.path.join(repo_root, 'data', 'game', 'production_buildings.json')
    with open(path, 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    n_measured = sum(1 for e in out if e['measured'])
    print(f'game dataset: {len(out)} production buildings '
          f'({n_measured} with sheet-measured extras) -> data/game/production_buildings.json')
    return out


def build_rail_vehicles(vehicles, repo_root):
    """Game-only rail locomotives in the sheet's attr shape.

    Steam tenders are nested on their locomotive because the game attaches
    $TRAINSET components automatically; they are not purchasable vehicles.
    """
    sheet = json.load(open(os.path.join(repo_root, 'data', 'vehicles.json')))['vehicles']
    sheet_names = {v['name'].lower() for v in sheet}
    by_id = {v['id'].lower(): v for v in vehicles}

    def resolve(ref):
        direct = by_id.get(ref.lower())
        if direct:
            return direct
        local = ref.split('_', 1)[1] if '_' in ref else ref
        return by_id.get(local.lower())

    def tender_entry(v):
        attrs = {
            'Typ': 'Tender',
            'Länge': v.get('length'),
            'Leergewicht': v.get('emptyWeight'),
            'Von': v.get('from'), 'Bis': v.get('to'),
        }
        result = {
            'name': v.get('de') or v.get('en') or v['id'],
            'attrs': {k: x for k, x in attrs.items() if x is not None},
        }
        if v.get('dlc'):
            result['dlc'] = v['dlc']
        return result

    out = []
    for v in vehicles:
        t = v.get('type', '')
        group = v.get('trainGroup', '')
        is_loco = t == 'VEHICLETYPE_RAIL_LOCOMOTIVE' and group in ('locomotive', 'locomotive_steam')
        if not is_loco:
            continue
        name = v.get('de') or v.get('en') or v['id']
        if name.lower() in sheet_names:
            continue
        attrs = {
            'Typ': 'Lokomotive',
            'Länge': v.get('length'),
            'Leergewicht': v.get('emptyWeight'),
            'Von': v.get('from'), 'Bis': v.get('to'),
            'Motorleistung': v.get('powerKW'),
            'Max. Geschwindigkeit': v.get('speed'),
            'Antriebsart': 'S' if group == 'locomotive_steam' else '?',
        }
        entry = {'name': name, 'attrs': {k: x for k, x in attrs.items() if x is not None}}
        if v.get('dlc'):
            entry['dlc'] = v['dlc']
        if group == 'locomotive_steam':
            targets = [resolve(ref) for ref in v.get('trainSet', [])]
            unresolved = [ref for ref, target in zip(v.get('trainSet', []), targets) if not target]
            if unresolved:
                raise ValueError(f'{v["id"]}: unresolved $TRAINSET target(s): {unresolved}')
            tenders = [target for target in targets
                       if target.get('type') == 'VEHICLETYPE_RAIL_VAGON'
                       and (target.get('trainGroup') == 'locomotive'
                            or 'tender' in target['id'].lower())]
            if len(tenders) > 1:
                raise ValueError(f'{v["id"]}: multiple tender targets')
            if tenders:
                entry['tender'] = tender_entry(tenders[0])
        out.append(entry)
    path = os.path.join(repo_root, 'data', 'game', 'rail_vehicles.json')
    with open(path, 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    n_steam = sum(1 for e in out if e['attrs'].get('Antriebsart') == 'S')
    n_paired = sum(1 for e in out if e.get('tender'))
    print(f'game-only rail vehicles: {len(out)} ({n_steam} steam, {n_paired} paired) '
          '-> data/game/rail_vehicles.json')


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

    build_dataset(buildings, repo_root, loc)
    build_rail_vehicles(vehicles, repo_root)

    if '--validate' in sys.argv:
        validate(buildings, repo_root)


if __name__ == '__main__':
    main()
