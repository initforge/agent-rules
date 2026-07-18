"""Import-compatible wrapper for the hyphenated runtime module name."""
from __future__ import annotations

import importlib.util
from pathlib import Path

_path = Path(__file__).with_name("context-router.py")
_spec = importlib.util.spec_from_file_location("context_router_impl", _path)
if _spec is None or _spec.loader is None:
    raise ImportError(f"Cannot load {_path}")
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)

has_5fedu_context = _module.has_5fedu_context
load_graph = _module.load_graph
route = _module.route
route_signature = _module.route_signature
