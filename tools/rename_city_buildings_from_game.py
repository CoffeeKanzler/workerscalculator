#!/usr/bin/env python3
"""One-off backfill: replace the spreadsheet's generic placeholder residential
names ("Einwohner A -" etc.) in data/city_buildings.json with the real game
building names from data/game/buildings_raw.json, and fill in the housing
quality ("Wohnqualität" / qualityOfLiving) field where the spreadsheet has it
as null. Matched by nearest capacity (inhabitants <-> livingSpace) within a
type-specific candidate pool, since individual building instances aren't
otherwise identifiable from the spreadsheet.

Usage: python3 tools/rename_city_buildings_from_game.py [--dry-run]
"""
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Spreadsheet type.de -> pool of raw game "de" names to match against, with an
# optional dlc filter (None means "base game only", 'dlc3' means Early Start
# DLC only, '*' means any).
POOLS = {
    'Ziegelhaus': [('Wohnungen - Ziegel', None)],
    'Early Wohnhäuser': [('Wohnungen - Ziegel', 'dlc3')],
    'Plattenbau': [
        ('Wohnungen - Plattenbau', '*'),
        ('Wohnungen (Typ 75)', '*'),
        ('Wohnungen (1Lg-600A)', '*'),
        ('Wohnungen - Plattenbau (Typ 464)', '*'),
    ],
}


def load(name):
    with open(os.path.join(REPO_ROOT, 'data', name)) as f:
        return json.load(f)


def save(name, data):
    with open(os.path.join(REPO_ROOT, 'data', name), 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write('\n')


def main():
    dry_run = '--dry-run' in sys.argv
    city = load('city_buildings.json')
    raw = load(os.path.join('game', 'buildings_raw.json'))

    candidates = {}
    for type_de, pool in POOLS.items():
        pool_entries = []
        for de_name, dlc in pool:
            for b in raw:
                if b.get('de') != de_name or b.get('livingSpace', 0) <= 0:
                    continue
                if dlc == '*' or b.get('dlc') == dlc:
                    pool_entries.append(b)
        candidates[type_de] = pool_entries

    renamed, quality_filled = 0, 0
    for b in city:
        if b['kind'] != 'Vanilla' or not b['de'].strip().startswith('Einwohner'):
            continue
        pool = candidates.get(b['type']['de'])
        if not pool:
            continue
        match = min(pool, key=lambda g: abs(g['livingSpace'] - b['inhabitants']))
        b['de'] = match['de'].strip()
        b['en'] = (match.get('en') or match['de']).strip()
        renamed += 1
        # Game .ini value is ground truth; prefer it over any spreadsheet guess.
        if match.get('qualityOfLiving') is not None:
            b['quality'] = match['qualityOfLiving']
            quality_filled += 1

    print(f'renamed {renamed} residential buildings from game names; '
          f'filled housing quality for {quality_filled} of them')
    if not dry_run:
        save('city_buildings.json', city)
        print('-> data/city_buildings.json updated')
    else:
        print('(dry run, nothing written)')


if __name__ == '__main__':
    main()
