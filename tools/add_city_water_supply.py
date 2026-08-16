#!/usr/bin/env python3
"""Give the city planner the water supply side it never had.

The city catalogue could state what a town draws and never what fills the pipe.
Its two treatment plants carried a `water` field holding their own consumption,
so adding one to a plan made the shortfall worse, and there was no well in the
list at all.

Both facts are in the game's own files and already extracted into
data/game/production_buildings.json, where a `$PRODUCTION water` line is
recorded with game-file provenance. This copies that figure onto the matching
city rows as `waterSupply`, and appends the supply buildings the city catalogue
is missing entirely — the wells, the surface intake, and the early DLC water
buildings — so they can be picked under Miscellaneous like anything else.

Only water is handled. Heating plants also declare `$PRODUCTION heat` in the
game files, but that figure disagrees with the measured hot-water rate the
catalogue carries (300 against 210 on the small plant, 350 against 1050 on the
big one) and the two may not even be the same quantity. Guessing at that
conversion here would put a wrong number behind a confident badge.

Idempotent: running it twice changes nothing.

Usage: python3 tools/add_city_water_supply.py [--dry-run]
"""
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MISC_TYPE = {"de": "Sonstiges", "en": "Miscellaneous"}

# City rows that already exist and need only the supply figure attaching.
BY_GAME_ID = {
    'water_treatment_small': 'Water treatment small',
    'water_treatment_big': 'Water treatment',
    'sewage_treatment_small': 'Sewage treatment plant small',
    'sewage_treatment_big': 'Sewage treatment plant',
}

# Supply buildings the city catalogue does not list at all. Named in both
# languages here because the city catalogue is what the picker reads.
MISSING = {
    'water_well_small': {"de": "Kleiner Brunnen", "en": "Small water well"},
    'water_well_big': {"de": "Großer Brunnen", "en": "Big water well"},
    'water_to_water': {"de": "Oberflächenwasser-Entnahme", "en": "Surface water intake"},
    'dlc3/water_treatment': {
        "de": "Wasseraufbereitung (klein) (10 Arbeiter)",
        "en": "Water treatment (small) (10 workers)",
        "dlc": "dlc3", "copyPlanning": True,
    },
    'dlc3/water_well': {
        "de": "Wasserbrunnen (groß) (8 Arbeiter)",
        "en": "Big water well (8 workers)",
        "dlc": "dlc3", "copyPlanning": True,
    },
    'dlc3/water_well_small': {
        "de": "Wasserbrunnen (klein) (5 Arbeiter)",
        "en": "Small water well (5 workers)",
        "dlc": "dlc3", "copyPlanning": True,
    },
}


def load(name):
    with open(os.path.join(REPO_ROOT, 'data', name), encoding='utf-8') as source:
        return json.load(source)


def water_rate(building):
    for line in building.get('production', []) or []:
        if (line.get('en') or '').lower() == 'water':
            return line.get('rate')
    return None


def main():
    dry_run = '--dry-run' in sys.argv
    game = load(os.path.join('game', 'production_buildings.json'))
    city = load('city_buildings.json')
    rows = city if isinstance(city, list) else city['buildings']

    by_id = {b.get('gameId'): b for b in game}
    by_en = {b.get('en'): b for b in rows}
    changes = []

    for game_id, city_name in BY_GAME_ID.items():
        source, target = by_id.get(game_id), by_en.get(city_name)
        if not source or not target:
            print(f'  skipped {game_id}: no match', file=sys.stderr)
            continue
        rate = water_rate(source)
        if rate is None or target.get('waterSupply') == rate:
            continue
        target['waterSupply'] = rate
        target.setdefault('provenance', {})['waterSupply'] = 'game-file'
        # Deliberately not stamping gameId here. Identifying a spreadsheet row
        # with a game building is sync_city_buildings_from_game.py's job and it
        # checks far more than a name before doing it; borrowing the id to hang
        # one field off would assert an identity this tool has not established.
        changes.append(f'{city_name}: waterSupply = {rate}')

    for game_id, names in MISSING.items():
        source = by_id.get(game_id)
        if not source:
            print(f'  skipped {game_id}: not in the game catalogue', file=sys.stderr)
            continue
        if names['en'] in by_en:
            continue
        rate = water_rate(source)
        copy_planning = names.get('copyPlanning', False)
        planning_fields = [
            'power', 'maxKW', 'water', 'hotwater', 'workdays', 'gravel',
            'bricks', 'steel', 'concrete', 'asphalt', 'boards', 'panels',
            'ecomponents', 'mcomponents',
        ]
        planning = {
            field: source.get(field, 0) if copy_planning else 0
            for field in planning_fields
        }
        planning_provenance = {
            field: source.get('provenance', {}).get(field, 'unavailable')
            for field in planning_fields
        } if copy_planning else {
            'power': source.get('provenance', {}).get('power', 'unavailable'),
            'maxKW': source.get('provenance', {}).get('maxKW', 'unavailable'),
        }
        rows.append({
            'de': names['de'], 'en': names['en'],
            'type': dict(MISC_TYPE),
            'kind': 'Vanilla',
            **({'dlc': names['dlc']} if names.get('dlc') else {}),
            'quality': None,
            'workers': source.get('workers') or 0,
            'special': 0, 'visitors': 0, 'inhabitants': 0,
            **planning,
            # Preserve the planning values already shown in production for the
            # DLC variants; the older zero-worker sources stay at zero.
            'waste': ((source.get('wastePerWorker') or 0) * (source.get('workers') or 0)
                      if copy_planning else 0),
            'waterSupply': rate,
            'recommendedFor': 0,
            'gameId': game_id,
            'provenance': {
                # These rows are the game building, not a spreadsheet row
                # matched to one, so their identity is game-file by construction.
                'identity': 'game-file',
                'workers': 'game-file', 'waterSupply': 'game-file',
                **planning_provenance,
            },
        })
        changes.append(f"added {names['en']}: {rate} water/day, {source.get('workers') or 0} workers")

    if not changes:
        print('nothing to do; the catalogue already carries the supply side')
        return
    for line in changes:
        print(' ', line)
    if dry_run:
        print('(dry run, nothing written)')
        return
    path = os.path.join(REPO_ROOT, 'data', 'city_buildings.json')
    with open(path, 'w', encoding='utf-8') as out:
        json.dump(city, out, ensure_ascii=False, indent=1)
        out.write('\n')
    print('-> data/city_buildings.json updated')


if __name__ == '__main__':
    main()
