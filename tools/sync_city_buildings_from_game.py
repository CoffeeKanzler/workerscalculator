#!/usr/bin/env python3
"""Attach stable game IDs to uniquely named vanilla city-planner rows.

Only a single exact localized-name match is accepted. Once identified, fields
that the building INI exposes directly (workers, housing, quality, and nominal
service capacity) replace their spreadsheet counterparts. Ambiguous names are
left untouched rather than guessed.

Usage: python3 tools/sync_city_buildings_from_game.py [--dry-run]
"""
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(path):
    with open(os.path.join(REPO_ROOT, 'data', path), encoding='utf-8') as source:
        return json.load(source)


def normalized(name):
    return name.strip().lower() if name else None


def main():
    city = load('city_buildings.json')
    raw = load(os.path.join('game', 'buildings_raw.json'))
    by_name = {}
    for building in raw:
        for name in (building.get('de'), building.get('en'), building.get('nameStr')):
            key = normalized(name)
            if not key:
                continue
            matches = by_name.setdefault(key, [])
            if building not in matches:
                matches.append(building)

    matched = changed = 0
    for row in city:
        if row.get('kind') != 'Vanilla':
            continue
        matches = {
            candidate['id']: candidate
            for name in (row.get('de'), row.get('en'))
            for candidate in by_name.get(normalized(name), [])
        }
        if len(matches) != 1:
            continue
        source = next(iter(matches.values()))
        matched += 1
        before = json.dumps(row, ensure_ascii=False, sort_keys=True)
        row['gameId'] = source['id']
        row['workers'] = source['workers']
        if source.get('livingSpace', 0) > 0:
            row['inhabitants'] = source['livingSpace']
            if source.get('qualityOfLiving') is not None:
                row['quality'] = source['qualityOfLiving']
        service_capacity = source.get('workers', 0) * source.get('citizenAbleServe', 0)
        if service_capacity > 0:
            if row.get('special', 0) > row.get('visitors', 0):
                row['special'] = service_capacity
            else:
                row['visitors'] = service_capacity
        row['provenance'] = {
            **row.get('provenance', {}),
            'identity': 'game-file',
            'workers': 'game-file',
            **({'housing': 'game-file'} if source.get('livingSpace', 0) > 0 else {}),
            **({'serviceCapacity': 'game-file'} if service_capacity > 0 else {}),
        }
        changed += before != json.dumps(row, ensure_ascii=False, sort_keys=True)

    print(f'unique exact-name matches: {matched}; rows changed: {changed}')
    if '--dry-run' not in sys.argv:
        path = os.path.join(REPO_ROOT, 'data', 'city_buildings.json')
        with open(path, 'w', encoding='utf-8') as target:
            json.dump(city, target, ensure_ascii=False, indent=1)
            target.write('\n')
        print('-> data/city_buildings.json updated')


if __name__ == '__main__':
    main()
