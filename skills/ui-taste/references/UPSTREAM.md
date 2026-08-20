# Pinned upstream source pack

The complete upstream `skills/` tree from Leonxlnx/taste-skill is a locked reference dependency, not a collection of public harness skills. Its identity and the SHA-256 of every source file are in `upstream-lock.json`.

At adoption, an earlier cache acquisition was recorded as `ORPHAN-001`. The engine must independently revalidate the remote commit, clean tree, MIT license, Git tree and aggregate content hash before materializing this exact tree at `upstream/`. Materialization is then an anchored source-acquisition receipt; it must not erase the orphan finding.

Do not run upstream scripts. Do not register `upstream/*` as skills. A release/export must contain the materialized tree and verify every hash in the lock.
