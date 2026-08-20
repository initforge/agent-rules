#!/usr/bin/env python3
"""Run all deterministic Python test suites. Exit 0 only if all pass."""
import subprocess, sys, os

TESTS = [
    ("test-artifact-schemas.py", []),
    ("test-context-router.py", []),
    ("validate-skill-catalog.py", []),
    ("validate-route-parity.py", []),
    ("validate-skill-fabric.py", []),
    ("test-agent-quality-benchmark.py", ["--contracts-only"]),
    ("test-live-agent-adapter.py", ["--contracts-only"]),
    ("test-5fedu-parity-packet.py", []),
    ("test-parity-verification.py", []),
    ("test-platform-contracts.py", []),
    ("test-skill-gate-stack.py", []),
    ("test-select-verification.py", []),
    # Installer trust-boundary checks are a required CI gate, not an advisory
    # local-only fixture.
    ("test-installer-trust-boundary.py", []),
    ("test-installer-staging.py", []),
]

HERE = os.path.dirname(os.path.abspath(__file__))
failed = 0
for name, args in TESTS:
    path = os.path.join(HERE, name)
    if not os.path.exists(path):
        print(f"MISSING: {name}")
        failed += 1
        continue
    result = subprocess.run(
        [sys.executable, path] + args,
        cwd=os.path.dirname(HERE),
        timeout=180, stdin=subprocess.DEVNULL,
    )
    if result.returncode == 0:
        print(f"PASS: {name}")
    else:
        print(f"FAIL: {name} (exit={result.returncode})")
        failed += 1

if failed:
    print(f"\n{failed} Python test(s) FAILED")
    sys.exit(1)
print(f"\nAll Python tests PASS")
