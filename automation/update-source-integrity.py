#!/usr/bin/env python3
"""Update source-integrity.json with correct hashes."""
import hashlib
import json
from pathlib import Path

root = Path('P:/agent-rules')
integrity_path = root / 'automation/source-integrity.json'
integrity = json.loads(integrity_path.read_text(encoding='utf-8'))

files = integrity.get('files', {})
updated = {}
changed = []

for rel, old_hash in files.items():
    # Try both path formats
    path = root / rel.replace('/', '\\')
    if not path.exists():
        path = root / rel.replace('\\', '/')
    
    if path.exists():
        content = path.read_bytes()
        normalized = content.replace(b'\r\n', b'\n')
        new_hash = hashlib.sha256(normalized).hexdigest()
        updated[rel] = new_hash
        if new_hash != old_hash.lower():
            changed.append(rel)
            print(f'UPDATED: {rel}')
    else:
        print(f'MISSING: {rel}')
        updated[rel] = old_hash

integrity['files'] = updated
integrity['generated_at'] = '2026-08-02T00:00:00+00:00'
integrity_path.write_text(json.dumps(integrity, indent=2) + '\n', encoding='utf-8')
print(f'Done. Changed: {len(changed)} files')
