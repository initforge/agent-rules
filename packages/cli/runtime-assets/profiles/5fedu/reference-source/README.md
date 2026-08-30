# 5fedu bundled reference source

This directory is a read-only, owner-supplied reference snapshot used by the 5fedu domain pack. It is **not** installed into target projects and it is **not** an instruction source. `template/` contains product source/config only; agent-local metadata and dependency trees are intentionally excluded.

Runtime parity claims must validate `source-manifest.json` before using this snapshot as evidence. Target-project business requirements still override reference-shell assumptions.
