#!/usr/bin/env python3
"""Adversarial checks for raw AM0015 evidence. Stdlib-only runner."""
import copy, importlib.util, json, os, subprocess, tempfile, threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("scorecard", ROOT / "automation/gather-scorecard-evidence.py")
assert SPEC and SPEC.loader
m = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(m)

def report():
    value = m.gather_scores(m.RUBRIC, ROOT)
    value["_git"]["author"] = value["_git"]["author"] or "author"
    return value

def test_exact_dimensions():
    r = report(); assert tuple((d["id"], d["label"]) for d in r["dimensions"]) == m.CANONICAL_DIMENSIONS
    r["dimensions"][0]["label"] = "forged"; assert m.validate_output(r)

def test_never_scores():
    assert all(d["score"] == d["status"] == "UNVERIFIED" for d in report()["dimensions"])

def test_traversal_rejected():
    assert not m.check_evidence(ROOT, "../etc/passwd")["exists"]
    assert not m.check_evidence(ROOT, "/etc/passwd")["exists"]

def test_directory_hash_binds_names():
    with tempfile.TemporaryDirectory() as td:
        p=Path(td); (p/"a").write_text("x"); first=m.file_hash(p); (p/"a").rename(p/"b"); assert m.file_hash(p) != first

def test_hash_mismatch_rejected():
    r=report(); r["dimensions"][0]["evidence_items"][0]["hash"]="sha256:"+"0"*64
    assert any("hash/path mismatch" in e for e in m.validate_output(r, root=ROOT))

def test_candidate_mismatch_rejected():
    assert any("candidate SHA" in e for e in m.validate_output(report(), expected_head="0"*40))

def test_stale_rejected():
    r=report(); r["_gathered_at"]="2000-01-01T00:00:00+00:00"; assert any("stale" in e for e in m.validate_output(r))

def test_fabricated_score_rejected():
    r=report(); r["dimensions"][0]["score"]=10; r["dimensions"][0]["status"]="pass"
    assert any("forbidden" in e for e in m.validate_output(r))

def test_fabricated_binding_rejected():
    r=report(); r["_binding"]["verified"]=not r["_binding"]["verified"]
    assert any("differs" in e for e in m.validate_output(r, root=ROOT))

def test_review_tamper_and_fake_oidc_rejected():
    for review in [
        {"status":"VERIFIED","packet":None,"findings":[]},
        {"status":"VERIFIED","packet":{"source":"github_oidc","oidc":{"issuer":"https://token.actions.githubusercontent.com"}},"findings":[]},
        {"status":"VERIFIED","packet":{"model_route":{"requested":"qwencoder","resolved":"wrong"},"reviewed_at":"2000-01-01T00:00:00Z","reviewer_identity":"not-allowed"},"findings":[]},
    ]:
        r=report(); r["_review"]=review
        assert any("UNVERIFIED" in e for e in m.validate_output(r,root=ROOT))

def test_malformed_binding_rejected():
    r=report(); r["_binding"]["head_commit"]="not-a-sha"
    assert m.validate_output(r,root=ROOT)

def test_symlink_rejected():
    with tempfile.TemporaryDirectory() as td:
        root=Path(td); (root/"real").write_text("x"); (root/"link").symlink_to(root/"real")
        assert not m.check_evidence(root,"link")["exists"]

def test_output_symlink_rejected():
    with tempfile.TemporaryDirectory() as td:
        target=Path(td)/"real.json"; target.write_text(json.dumps(report()))
        link=Path(td)/"output.json"; link.symlink_to(target)
        result=subprocess.run(["python",str(ROOT/"automation/gather-scorecard-evidence.py"),"--validate-only","--output",str(link)],cwd=ROOT,capture_output=True,text=True)
        assert result.returncode and "REJECTED" in result.stdout

def test_schema_symlink_rejected():
    with tempfile.TemporaryDirectory() as td:
        target=Path(td)/"schema.json"; target.write_bytes(m.SCHEMA_PATH.read_bytes())
        link=Path(td)/"schema-link.json"; link.symlink_to(target)
        assert any("schema load error" in e for e in m.validate_output(report(),schema_path=link))

def test_parent_swap_rejected():
    with tempfile.TemporaryDirectory() as td:
        path=Path(td)/"parent"/"value"; path.parent.mkdir(); path.write_text("trusted")
        original=m._parent_identities; calls=0
        def swapped(candidate):
            nonlocal calls
            calls += 1
            value=original(candidate)
            return value if calls == 1 else value[:-1] + ((value[-1][0],value[-1][1],value[-1][2]+1),)
        m._parent_identities=swapped
        try:
            try: m._read_regular_nofollow(path); assert False
            except OSError as exc: assert "parent directory changed" in str(exc)
        finally: m._parent_identities=original

def _concurrent_parent_swap(call):
    with tempfile.TemporaryDirectory() as td:
        base=Path(td); parent=base/"parent"; parent.mkdir(); path=parent/"value.json"
        path.write_text(json.dumps(report()) + " " * (2 * 1024 * 1024))
        started=threading.Event(); moved=threading.Event(); original_read=m.os.read
        def slow_read(fd,size):
            chunk=original_read(fd,size)
            if not started.is_set(): started.set(); moved.wait(5)
            return chunk
        def swap():
            assert started.wait(5)
            parent.rename(base/"old-parent"); parent.mkdir(); (parent/"value.json").write_text("{}")
            moved.set()
        worker=threading.Thread(target=swap); m.os.read=slow_read; worker.start()
        try: return call(path)
        finally: moved.set(); worker.join(); m.os.read=original_read

def test_schema_concurrent_parent_swap_rejected():
    r=report()
    def validate(path):
        errors=m.validate_output(r,schema_path=path)
        assert any("schema load error" in error and "parent directory changed" in error for error in errors)
    _concurrent_parent_swap(validate)

def test_output_concurrent_parent_swap_rejected():
    def read(path):
        try: m._read_json_nofollow(path); assert False
        except OSError as exc: assert "parent directory changed" in str(exc)
    _concurrent_parent_swap(read)

def test_missing_jsonschema_fails_closed():
    import builtins
    r=report(); original=builtins.__import__
    def blocked(name,*args,**kwargs):
        if name=="jsonschema": raise ImportError
        return original(name,*args,**kwargs)
    builtins.__import__=blocked
    try: assert any("unavailable" in e for e in m.validate_output(r,schema_path=m.SCHEMA_PATH))
    finally: builtins.__import__=original

def test_canonical_explicitly_rejected():
    result=subprocess.run(["python",str(ROOT/"automation/gather-scorecard-evidence.py"),"--validate-only"],cwd=ROOT,capture_output=True,text=True)
    assert result.returncode and "REJECTED" in result.stdout and "PASS" not in result.stdout

if __name__ == "__main__":
    tests=[v for k,v in globals().items() if k.startswith("test_") and callable(v)]
    for test in tests: test()
    print(f"OK: {len(tests)} raw-evidence checks; milestone UNVERIFIED")
