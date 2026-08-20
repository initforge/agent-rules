#!/usr/bin/env python3
from __future__ import annotations
import json, re, sys
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = {'name','description','license','compatibility','metadata','allowed-tools'}
NAME_RE = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
errors=[]
checked=0
for base in [ROOT/'skills', ROOT/'profiles'/'5fedu'/'skills']:
    if not base.exists(): continue
    for skill_file in sorted(base.glob('*/SKILL.md')):
        checked += 1
        text=skill_file.read_text(encoding='utf-8')
        if not text.startswith('---\n') or '\n---\n' not in text:
            errors.append(f'{skill_file.relative_to(ROOT)}: missing YAML frontmatter'); continue
        raw, _ = text[4:].split('\n---\n',1)
        try: fm=yaml.safe_load(raw) or {}
        except Exception as e:
            errors.append(f'{skill_file.relative_to(ROOT)}: invalid YAML: {e}'); continue
        extras=set(fm)-ALLOWED
        if extras: errors.append(f'{skill_file.relative_to(ROOT)}: non-Agent-Skills frontmatter keys: {sorted(extras)}')
        name=fm.get('name')
        if not isinstance(name,str) or not NAME_RE.fullmatch(name) or name != skill_file.parent.name:
            errors.append(f'{skill_file.relative_to(ROOT)}: name must match directory and Agent Skills name syntax')
        desc=fm.get('description')
        if not isinstance(desc,str) or not (1 <= len(desc) <= 1024): errors.append(f'{skill_file.relative_to(ROOT)}: description must be 1..1024 chars')
        comp=fm.get('compatibility')
        if comp is not None and (not isinstance(comp,str) or not (1 <= len(comp) <= 500)): errors.append(f'{skill_file.relative_to(ROOT)}: compatibility must be 1..500 chars')
        metadata=fm.get('metadata')
        if metadata is not None and (not isinstance(metadata,dict) or any(not isinstance(k,str) or not isinstance(v,str) for k,v in metadata.items())):
            errors.append(f'{skill_file.relative_to(ROOT)}: metadata must be string->string')
        allowed=fm.get('allowed-tools')
        if allowed is not None and not isinstance(allowed,str): errors.append(f'{skill_file.relative_to(ROOT)}: allowed-tools must be a space-separated string')
        route=skill_file.with_name('ROUTE.json')
        if not route.exists(): errors.append(f'{skill_file.relative_to(ROOT)}: missing agent-rules ROUTE.json sidecar'); continue
        try: r=json.loads(route.read_text(encoding='utf-8'))
        except Exception as e: errors.append(f'{route.relative_to(ROOT)}: invalid JSON: {e}'); continue
        if not isinstance(r,dict): errors.append(f'{route.relative_to(ROOT)}: route must be object'); continue
        for key in ['signals','excludes','loads','requires','supports']:
            if key in r and (not isinstance(r[key],list) or any(not isinstance(x,str) for x in r[key])):
                errors.append(f'{route.relative_to(ROOT)}: {key} must be string[]')
        if 'priority' in r and not isinstance(r['priority'],int): errors.append(f'{route.relative_to(ROOT)}: priority must be integer')

if errors:
    print('FAIL: Agent Skills portability')
    for e in errors: print(' -',e)
    sys.exit(1)
print(f'PASS: Agent Skills portability ({checked} skills; standard frontmatter + ROUTE.json sidecars)')
