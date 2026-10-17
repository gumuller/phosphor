#!/usr/bin/env python3
"""Measure a Linux app and descendants without counting dev/build tooling.
Usage: python3 scripts/measure-memory.py PID --samples 3 --interval 3
PSS apportions shared pages; RSS sums each process's resident pages.
"""
import argparse
import json
import time
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('pid', type=int)
parser.add_argument('--samples', type=int, default=3)
parser.add_argument('--interval', type=float, default=3)
args = parser.parse_args()


def snapshot(root):
    parents = {}
    for path in Path('/proc').glob('[0-9]*'):
        try:
            tail = (path / 'stat').read_text().rsplit(')', 1)[1].split()
            parents[int(path.name)] = int(tail[1])
        except (OSError, ValueError):
            continue
    if root not in parents:
        raise SystemExit(f'Process {root} is not running')
    pids = {root}
    while True:
        expanded = pids | {pid for pid, parent in parents.items() if parent in pids}
        if pids == expanded:
            break
        pids = expanded
    rows = []
    for pid in sorted(pids):
        path = Path('/proc') / str(pid)
        try:
            values = {}
            for line in (path / 'smaps_rollup').read_text().splitlines():
                fields = line.split()
                if len(fields) > 1 and fields[1].isdigit():
                    values[fields[0].rstrip(':')] = int(fields[1])
            rows.append({
                'pid': pid,
                'process': (path / 'comm').read_text().strip(),
                'rss_mib': round(values.get('Rss', 0) / 1024, 2),
                'pss_mib': round(values.get('Pss', 0) / 1024, 2),
                'private_mib': round((values.get('Private_Clean', 0) + values.get('Private_Dirty', 0)) / 1024, 2),
                'swap_pss_mib': round(values.get('SwapPss', 0) / 1024, 2),
            })
        except FileNotFoundError:
            continue
        except PermissionError:
            raise SystemExit(f'Cannot read memory counters for process {pid}')
    return {'processes': rows, **{
        f'total_{key}': round(sum(row[key] for row in rows), 2)
        for key in ['rss_mib', 'pss_mib', 'private_mib', 'swap_pss_mib']
    }}


for index in range(max(1, args.samples)):
    print(json.dumps({'sample': index + 1, **snapshot(args.pid)}), flush=True)
    if index + 1 < args.samples:
        time.sleep(max(0, args.interval))
