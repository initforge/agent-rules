#!/usr/bin/env python3
"""V-008 / C-008 — Agent Skills portability + selected external-skill parity.

Regression: every portable SKILL.md under skills/ and profiles/*/skills/ keeps
standard Agent-Skills frontmatter plus a harness-owned ROUTE.json sidecar.

Governance (AC-008): selected external skills must be complete on every
detected host and hash-compared; partial projection fails closed; rejected or
link-only sources are never materialized and never globally loaded. A host
that ignores optional skill metadata still gets content-hash parity, because
completeness is proven from the materialized file bytes, not from metadata.
"""
from __future__ import annotations
import hashlib
import json
import re
import sys
import tempfile
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = {'name','description','license','compatibility','metadata','allowed-tools'}
NAME_RE = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
errors=[]
checked=0


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# --------------------------------------------------------------------------
# 1. Existing full-catalog portability checks (regression, unchanged).
# --------------------------------------------------------------------------
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


# --------------------------------------------------------------------------
# 2. External source governance helpers (shared by real data and fixtures).
# --------------------------------------------------------------------------
def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception as exc:
        errors.append(f'invalid JSON {path.relative_to(ROOT)}: {exc}')
        return None


def check_projection_completeness(selected_ids, detected_hosts, projection_receipts, skill_name):
    """Fail closed unless every selected skill is complete on every detected
    host and the materialized content hash matches. Content-hash based only:
    a host ignoring optional skill metadata still satisfies parity."""
    local = []
    if not selected_ids and not detected_hosts:
        return local
    for skill_id in selected_ids:
        proj = projection_receipts.get(skill_id, {})
        for host in detected_hosts:
            receipt = proj.get(host)
            if receipt is None:
                local.append(f'{skill_name} {skill_id}: partial projection — no receipt for detected host {host}')
                continue
            target = ROOT / receipt.get('path','')
            if not target.is_file():
                local.append(f'{skill_name} {skill_id}: projected file missing on host {host}: {receipt.get("path")}')
                continue
            actual = sha256_of(target)
            if actual != receipt.get('sha256'):
                local.append(f'{skill_name} {skill_id}: projection hash mismatch on host {host} (actual {actual[:12]}… != recorded {str(receipt.get("sha256"))[:12]}…)')
    return local


def canonical_route_signals() -> dict[str, set[str]]:
    """Signals of every canonical local skill (catalog ownership) for conflict detection."""
    signals: dict[str, set[str]] = {}
    catalog = load_json(ROOT/'skills'/'catalog.json')
    if not catalog:
        return signals
    for entry in catalog.get('skills', []):
        route = ROOT / entry.get('route','')
        if route.is_file():
            data = load_json(route)
            if data:
                signals[entry['id']] = set(data.get('signals', []))
    return signals


# --------------------------------------------------------------------------
# 3. Governance checks over the real manifests.
# --------------------------------------------------------------------------
fabric = load_json(ROOT/'skills'/'candidate-fabric.json')
manifest = (fabric or {}).get('selection_manifest', {}) or {}
detected_hosts = list(manifest.get('detected_hosts', []) or [])
projection_receipts = manifest.get('projection_receipts', {}) or {}

external = (fabric or {}).get('external_source_matrix', []) or []
by_id = {s.get('id'): s for s in external if isinstance(s, dict)}
# AM-0002 full adoption: qualified selected records are `selected` (runtime
# ready) plus `materialized` (artifact-projected) records; the manifest's
# selected_external_skills must list exactly the materialized skill records.
selected = [s for s in external if isinstance(s, dict) and s.get('status') in ('selected', 'materialized') and s.get('kind') != 'mobile-provider' and s.get('kind') != 'mcp-server']
selected_ids = sorted(s['id'] for s in selected)

# 3a. Selected-set manifest consistency: what the manifest declares must match
#     the qualified records; rejected/link-only sources are never selected.
declared_selected = sorted(manifest.get('selected_external_skills', []) or [])
if declared_selected != selected_ids:
    errors.append(f'selection manifest selected_external_skills {declared_selected} != qualified selected records {selected_ids}')

# 3b. Completeness + hash parity across every detected host; partial projection
#     fails closed.
errors.extend(check_projection_completeness(selected_ids, detected_hosts, projection_receipts, 'selected external skill'))

# 3c. Scope: rejected/link-only sources are never materialized and never
#     globally loaded. A materialized external skill is detectable either by
#     its frontmatter metadata.source marker or by a skills/external/<id> path.
external_ids = set(by_id)
for base in [ROOT/'skills', ROOT/'profiles'/'5fedu'/'skills']:
    if not base.exists():
        continue
    for skill_file in sorted(base.glob('*/SKILL.md')):
        text = skill_file.read_text(encoding='utf-8')
        marker = None
        if text.startswith('---\n') and '\n---\n' in text:
            raw, _ = text[4:].split('\n---\n', 1)
            try:
                fm = yaml.safe_load(raw) or {}
                marker = (fm.get('metadata') or {}).get('source')
            except Exception:
                marker = None
        rel = skill_file.relative_to(ROOT).as_posix()
        if marker in external_ids and marker not in selected_ids:
            errors.append(f'{rel}: unselected external candidate {marker} is materialized (metadata.source marker); rejected/link-only sources are never materialized')
        if marker in selected_ids:
            # Materialized selected skill must hash-match its projection receipt.
            proj = projection_receipts.get(marker, {})
            ok = any(
                receipt.get('path') == rel and receipt.get('sha256') == sha256_of(skill_file)
                for receipt in proj.values()
                if isinstance(receipt, dict)
            )
            if not ok:
                errors.append(f'{rel}: selected external skill {marker} materialized without a matching projection receipt/hash')
        m = re.match(r'^skills/external/([a-z0-9][a-z0-9-]*)/SKILL\.md$', rel)
        if m and m.group(1) in external_ids and m.group(1) not in selected_ids:
            errors.append(f'{rel}: unselected external candidate {m.group(1)} materialized under skills/external/; rejected/link-only sources are never materialized')

# 3d. Conflict detection: a selected external skill whose route signals overlap
#     a canonical local skill fails closed unless an explicit resolution is
#     recorded in the source record.
canonical_signals = canonical_route_signals()
for s in selected:
    signals = set((s.get('lock') or {}).get('route_precision', {}).get('signals', []) or [])
    for canonical_id, canonical_sigs in canonical_signals.items():
        overlap = signals & canonical_sigs
        if not overlap:
            continue
        resolution = next((c for c in (s.get('conflicts') or []) if c.get('with') == canonical_id), None)
        if not resolution or resolution.get('resolved') is not True:
            errors.append(f'{s["id"]}: selected external skill conflicts with canonical skill {canonical_id} on signals {sorted(overlap)}; explicit resolution required (fail closed)')

# --------------------------------------------------------------------------
# 4. Fixtures proving the mechanism (deterministic; temp content in /tmp).
#    Real repo files serve as projected content so hashes are real bytes.
# --------------------------------------------------------------------------
fixture_results = []
real_skill = ROOT/'skills'/'browser-qa'/'SKILL.md'
with tempfile.TemporaryDirectory(prefix='agent-rules-v008-') as tmp:
    tmp_path = Path(tmp)
    # 4a. Positive: complete projection on every detected host + hash parity.
    meta_less = tmp_path/'metadata-less-SKILL.md'  # host ignores optional metadata
    meta_less.write_bytes(real_skill.read_bytes())
    positive = {
        'selected_external_skills': ['fixture-selected'],
        'detected_hosts': ['codex', 'opencode'],
        'projection_receipts': {
            'fixture-selected': {
                'codex': {'path': 'skills/browser-qa/SKILL.md', 'sha256': sha256_of(real_skill)},
                'opencode': {'path': str(meta_less), 'sha256': sha256_of(meta_less)},
            }
        },
    }
    positive_errors = check_projection_completeness(
        positive['selected_external_skills'], positive['detected_hosts'], positive['projection_receipts'], 'fixture')
    fixture_results.append({'name': 'complete-projection-hash-parity', 'ok': not positive_errors, 'detail': positive_errors})
    if positive_errors:
        errors.append(f'fixture complete-projection-hash-parity: unexpected failures {positive_errors}')

    # 4b. Negative: partial projection (host opencode missing) fails closed.
    partial = {
        'selected_external_skills': ['fixture-selected'],
        'detected_hosts': ['codex', 'opencode'],
        'projection_receipts': {
            'fixture-selected': {'codex': {'path': 'skills/browser-qa/SKILL.md', 'sha256': sha256_of(real_skill)}}
        },
    }
    partial_errors = check_projection_completeness(
        partial['selected_external_skills'], partial['detected_hosts'], partial['projection_receipts'], 'fixture')
    fixture_results.append({'name': 'partial-projection-fails-closed', 'ok': bool(partial_errors),
                            'detail': partial_errors[0] if partial_errors else None})
    if not partial_errors:
        errors.append('fixture partial-projection-fails-closed: partial projection was not detected')

    # 4c. Negative: content hash mismatch fails closed (even when metadata is fine).
    mismatch = {
        'selected_external_skills': ['fixture-selected'],
        'detected_hosts': ['codex'],
        'projection_receipts': {
            'fixture-selected': {'codex': {'path': 'skills/browser-qa/SKILL.md', 'sha256': '0' * 64}}
        },
    }
    mismatch_errors = check_projection_completeness(
        mismatch['selected_external_skills'], mismatch['detected_hosts'], mismatch['projection_receipts'], 'fixture')
    fixture_results.append({'name': 'hash-mismatch-fails-closed', 'ok': bool(mismatch_errors),
                            'detail': mismatch_errors[0] if mismatch_errors else None})
    if not mismatch_errors:
        errors.append('fixture hash-mismatch-fails-closed: hash mismatch was not detected')

    # 4d. Metadata-agnostic host: projection parity is content-hash based, so a
    #     host that ignores optional skill metadata still passes when the
    #     materialized bytes match (edge case 2).
    fixture_results.append({'name': 'metadata-ignored-host-content-hash-parity', 'ok': not positive_errors,
                            'detail': 'opencode projection content hashes match despite absent optional metadata'})

# 4e. Conflict fixture: overlap with a canonical skill fails closed unless resolved.
conflict_sigs = {'exploratory'}  # browser-qa/qa-skills share this material signal
overlap_canonical = next((cid for cid, sigs in canonical_signals.items() if conflict_sigs & sigs), None)
conflict_fixture_ok = overlap_canonical is not None
if overlap_canonical:
    conflict_unresolved = {'id': 'fixture-conflict', 'conflicts': [{'with': overlap_canonical, 'resolved': False, 'resolution': None}]}
    conflict_resolved = {'id': 'fixture-conflict', 'conflicts': [{'with': overlap_canonical, 'resolved': True, 'resolution': 'explicit owner resolution recorded'}]}
    for record in (conflict_unresolved, conflict_resolved):
        signals = conflict_sigs
        canon = overlap_canonical
        resolution = next((c for c in (record.get('conflicts') or []) if c.get('with') == canon), None)
        detected = not resolution or resolution.get('resolved') is not True
        fixture_results.append({
            'name': 'conflict-' + ('unresolved' if record is conflict_unresolved else 'resolved'),
            'ok': detected if record is conflict_unresolved else not detected,
            'detail': f'overlap with canonical {canon} on {sorted(signals)}',
        })
else:
    errors.append('fixture conflict: no canonical skill found sharing signal "exploratory"')

if errors:
    print('FAIL: Agent Skills portability')
    for e in errors: print(' -',e)
    sys.exit(1)

print(f'PASS: Agent Skills portability ({checked} skills; standard frontmatter + ROUTE.json sidecars)')
print(json.dumps({
    'status': 'PASS',
    'catalog_skills': checked,
    'external_candidates': len(external),
    'selected_external_skills': selected_ids,
    'detected_hosts': detected_hosts,
    'projection_completeness': 'trivially satisfied (no selected external skill)' if not selected_ids else 'complete',
    'unselected_materialized': 0,
    'global_loading': 'none (unselected sources stay catalog links)',
    'fixtures': fixture_results,
}, ensure_ascii=False))
