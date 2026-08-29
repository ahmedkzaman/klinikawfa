from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def hashes(directory: Path) -> dict[str, str]:
    return {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(directory.iterdir())
        if path.is_file()
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare two private bundle compilations.")
    parser.add_argument("first", type=Path)
    parser.add_argument("second", type=Path)
    args = parser.parse_args()
    first = hashes(args.first)
    second = hashes(args.second)
    mismatches = sorted(name for name in set(first) | set(second) if first.get(name) != second.get(name))
    print(json.dumps({"files": len(first), "identical": not mismatches and first.keys() == second.keys(), "mismatches": mismatches}, sort_keys=True))
    return 1 if mismatches or first.keys() != second.keys() else 0


if __name__ == "__main__":
    raise SystemExit(main())
