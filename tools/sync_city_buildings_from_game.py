#!/usr/bin/env python3
"""Attach stable game IDs to safely identified vanilla city-planner rows.

A single exact localized-name match is accepted. Non-residential rows can also
use punctuation/accent-insensitive names when workers and nominal service
capacity identify exactly one candidate and that game ID maps to only one row.
Generic housing names were backfilled heuristically by an older tool, so they
remain excluded from this second tier. Once identified, fields that the building
INI exposes directly replace their spreadsheet counterparts. Ambiguous rows are
left untouched rather than guessed.

Usage: python3 tools/sync_city_buildings_from_game.py [--dry-run]
"""
import json
import os
import re
import sys
import unicodedata

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(path):
    with open(os.path.join(REPO_ROOT, 'data', path), encoding='utf-8') as source:
        return json.load(source)


def normalized(name):
    return name.strip().lower() if name else None


def loose_normalized(name):
    if not name:
        return None
    ascii_name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', ' ', ascii_name.lower()).strip()


def name_index(raw, normalizer):
    by_name = {}
    for building in raw:
        for name in (building.get('de'), building.get('en'), building.get('nameStr')):
            key = normalizer(name)
            if not key:
                continue
            matches = by_name.setdefault(key, {})
            matches[building['id']] = building
    return by_name


def candidates_for(row, index, normalizer):
    return {
        candidate_id: candidate
        for name in (row.get('de'), row.get('en'))
        for candidate_id, candidate in index.get(normalizer(name), {}).items()
    }


def direct_facts_match(row, source):
    row_capacity = max(row.get('visitors', 0), row.get('special', 0))
    source_capacity = source.get('workers', 0) * source.get('citizenAbleServe', 0)
    return row.get('workers', 0) == source.get('workers', 0) and row_capacity == source_capacity


def main():
    city = load('city_buildings.json')
    raw = load(os.path.join('game', 'buildings_raw.json'))
    by_id = {building['id']: building for building in raw}
    exact_names = name_index(raw, normalized)
    loose_names = name_index(raw, loose_normalized)

    selected = {}
    loose_proposals = {}
    for index, row in enumerate(city):
        if row.get('kind') != 'Vanilla':
            continue
        if row.get('gameId') in by_id:
            selected[index] = by_id[row['gameId']]
            continue
        exact = candidates_for(row, exact_names, normalized)
        if len(exact) == 1:
            selected[index] = next(iter(exact.values()))
            continue
        if row.get('inhabitants', 0) > 0:
            continue
        loose = candidates_for(row, loose_names, loose_normalized)
        compatible = [source for source in loose.values() if direct_facts_match(row, source)]
        if len(compatible) == 1:
            loose_proposals[index] = compatible[0]

    # A source ID cannot identify two separate spreadsheet rows safely.
    proposal_counts = {}
    for source in loose_proposals.values():
        proposal_counts[source['id']] = proposal_counts.get(source['id'], 0) + 1
    selected.update({index: source for index, source in loose_proposals.items()
                     if proposal_counts[source['id']] == 1})

    matched = changed = 0
    for index, row in enumerate(city):
        source = selected.get(index)
        if not source:
            continue
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
