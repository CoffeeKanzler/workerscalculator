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
is missing entirely — the wells and the surface intake — so they can be picked
under Miscellaneous like anything else.

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
        rows.append({
            **names,
            'type': dict(MISC_TYPE),
            'kind': 'Vanilla',
            'quality': None,
            'workers': source.get('workers') or 0,
            'special': 0, 'visitors': 0, 'inhabitants': 0,
            'power': source.get('power') or 0,
            'maxKW': source.get('maxKW') or 0,
            # What it draws for itself is not recorded for these; a well that
            # needs nobody and nothing is left at zero rather than invented.
            'water': 0, 'hotwater': 0.0, 'waste': 0,
            'waterSupply': rate,
            'workdays': 0,
            'gravel': 0, 'bricks': 0, 'steel': 0, 'concrete': 0, 'asphalt': 0,
            'boards': 0, 'panels': 0, 'ecomponents': 0, 'mcomponents': 0,
            'recommendedFor': 0,
            'gameId': game_id,
            'provenance': {
                # These rows are the game building, not a spreadsheet row
                # matched to one, so their identity is game-file by construction.
                'identity': 'game-file',
                'workers': 'game-file', 'waterSupply': 'game-file',
                'power': source.get('provenance', {}).get('power', 'unavailable'),
                'maxKW': source.get('provenance', {}).get('maxKW', 'unavailable'),
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
