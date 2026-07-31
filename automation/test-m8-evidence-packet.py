#!/usr/bin/env python3
import importlib.util, json, subprocess, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("v", ROOT / "automation/validate-m8-evidence-packet.py"); mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)

def test_collector_is_explicitly_unverified():
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "packet.json"
        subprocess.run(["python", str(ROOT / "automation/collect-m8-evidence-packet.py"), "--output", str(out)], cwd=ROOT, check=True)
        packet = json.loads(out.read_text())
        assert packet["status"] == "UNVERIFIED" and len(packet["dimensions"]) == 18
        assert mod.validate(packet, ROOT)

if __name__ == "__main__": test_collector_is_explicitly_unverified(); print("OK: M8 packet remains UNVERIFIED")
