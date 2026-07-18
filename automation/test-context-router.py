#!/usr/bin/env python3
"""Regression tests for graph-backed routing and false-positive control."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "platforms" / "shared" / "scripts"))

from context_router import load_graph, route  # noqa: E402


def expect(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    graph = load_graph(ROOT / "05-generated" / "context-graph.json")
    generic = route("Refactor module thanh toán Node.js", [], graph)
    expect(generic["primary"] != "5fedu-module-parity", "generic module routed to 5fedu")
    expect("5fedu-project" not in generic["stack"], "generic module loaded 5fedu project")

    harness = route("Tạo màn hình quản lý đơn hàng cho dự án bán lẻ", [ROOT], graph)
    expect(not any("5fedu" in item for item in harness["context_nodes"]), "harness loaded 5fedu context")

    ui = route("Sửa module 5fedu lệch pattern drawer", [], graph)
    expect(ui["primary"] == "5fedu-module-parity", "5fedu UI did not select parity")
    expect("5fedu-project" in ui["stack"], "5fedu UI missed project support")
    expect(ui["context_nodes"], "5fedu UI missed project context nodes")

    research = route("Kiểm tra changelog API mới nhất", [], graph)
    expect(research["primary"] == "researcher", "research route mismatch")

    browser = route("Manual browser QA click-through và console proof", [], graph)
    expect(browser["primary"] == "browser-qa", "browser route mismatch")

    plan = route("Lập kế hoạch nhiều phase cho harness", [], graph)
    expect(plan["primary"] == "plan-and-handoff", "plan route mismatch")

    print("PASS: graph context router regression")


if __name__ == "__main__":
    main()
