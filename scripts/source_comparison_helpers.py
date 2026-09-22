"""Helpers for offline source comparisons and independent validation scripts."""
from __future__ import annotations

import json
import os
import re
from decimal import Decimal


def redact(value, secrets=()):
    if isinstance(value, dict):
        return {k: '[REDACTED]' if re.search(r'authorization|cookie|token|secret|password|signature|api.?key|^sign$', k, re.I) else redact(v, secrets) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v, secrets) for v in value]
    if isinstance(value, str):
        for secret in secrets:
            if secret:
                value = value.replace(secret, '[REDACTED]')
        return re.sub(r'Bearer\s+\S+', 'Bearer [REDACTED]', value, flags=re.I)
    return value


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, default=str))


def load_env(path):
    for line in path.read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            if key.strip().startswith('LXE_DATA_SERVER_'):
                os.environ[key.strip()] = value.strip().strip('\"').strip("'")


def quantity(value):
    if value is None or value == '':
        return None
    if isinstance(value, bool):
        raise ValueError('Boolean quantity')
    number = Decimal(str(value))
    if not number.is_finite() or number < 0:
        raise ValueError(f'Invalid quantity: {value!r}')
    return number


def keyed(rows, fields):
    unique, conflicts, duplicates = {}, {}, 0
    for row in rows:
        key = tuple(str(row.get(f) or '').strip() for f in fields)
        if key not in unique:
            unique[key] = row
        elif unique[key] == row:
            duplicates += 1
        else:
            conflicts.setdefault(key, [unique[key]]).append(row)
    return unique, conflicts, duplicates
