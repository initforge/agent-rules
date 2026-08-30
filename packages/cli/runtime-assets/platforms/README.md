# Platforms

`platform-contracts.json` is the versioned support matrix. Each host directory
contains only its native delta: an overlay, shallow static projector contract,
and native installation/readback support.

Build and install through the public CLI:

```bash
npm run build
node packages/cli/dist/index.js install --all
node packages/cli/dist/index.js doctor --all --json
```

The installer preserves user-owned configuration, refuses unowned collisions,
and reports each host as `NATIVE_ENFORCED`, `NATIVE_ADVISORY`, `MANAGED`, or
`UNAVAILABLE`. A platform directory or config file alone is never proof that a
host loaded the harness.
