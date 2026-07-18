#!/usr/bin/env python3
"""Extract the LowTech-relevant research checklist from current game files.

Usage: python3 tools/extract_research.py /path/to/media_soviet [output.json]

The LowTech rule source makes prerequisite-only research free. A research block
is therefore free only when it unlocks later research and has no other
``$UNLOCK_*`` directive. Terminal blocks are paid because their effect is
implemented by the game under the research key (the guide explicitly names
phone tapping, OPEC, and woodcutting/planting as examples).
"""
import json
import os
import re
import sys

from extract_from_gamefiles import load_localization


def parse_research(path, localization):
    text = open(path, encoding='utf-8', errors='replace').read()
    blocks = re.split(r'(?m)^\$RESEARCH\s+', text)[1:]
    records = []
    for block in blocks:
        lines = block.splitlines()
        key = lines[0].strip()
        directives = [line.strip() for line in lines[1:] if line.strip().startswith('$')]
        name_match = next((re.match(r'^\$NAME\s+(\d+)', line) for line in directives
                           if line.startswith('$NAME ')), None)
        cost_match = next((re.match(r'^\$COST\s+([\d.]+)', line) for line in directives
                           if line.startswith('$COST ')), None)
        name_id = int(name_match.group(1)) if name_match else None
        unlocks_research = any(line.startswith('$UNLOCK_RESEARCH ') for line in directives)
        functional_unlocks = [line.split()[0][1:] for line in directives
                              if line.startswith('$UNLOCK_')
                              and not line.startswith('$UNLOCK_RESEARCH ')]
        paid = bool(functional_unlocks) or not unlocks_research
        record = {
            'key': key,
            'nameId': name_id,
            'de': localization.get('de', {}).get(name_id, key),
            'en': localization.get('en', {}).get(name_id, key),
            'cost': float(cost_match.group(1)) if cost_match else None,
            'pointCost': 1 if paid else 0,
            'classification': ('gameplay-unlock' if functional_unlocks
                               else 'terminal-effect' if paid else 'prerequisite-only'),
        }
        records.append(record)
    return records


def validate(records):
    by_key = {record['key']: record for record in records}
    expected = {
        'phone_tapping': 1, 'woodcutting_planting': 1, 'opec': 1,
        'concrete_study': 0, 'logistic_optimization': 0, 'faculty_geology': 0,
    }
    assert len(records) == 117, f'expected 117 research entries, got {len(records)}'
    assert sum(record['pointCost'] for record in records) == 84
    for key, point_cost in expected.items():
        assert by_key[key]['pointCost'] == point_cost, (key, by_key[key])
    assert all(record['en'] and record['de'] for record in records)


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    media = os.path.abspath(sys.argv[1])
    output = (sys.argv[2] if len(sys.argv) > 2 else
              os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'game', 'research.json'))
    records = parse_research(os.path.join(media, 'research', 'research.ini'), load_localization(media))
    validate(records)
    with open(output, 'w', encoding='utf-8') as handle:
        json.dump(records, handle, ensure_ascii=False, indent=1)
        handle.write('\n')
    print(f'research: {len(records)} total, {sum(r["pointCost"] for r in records)} paid -> {output}')


if __name__ == '__main__':
    main()
