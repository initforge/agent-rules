AM-0016 — Required-host certification owner decision

Status: `OWNER_APPROVED_PENDING_ACTIVATION`

## 1. Owner decision

The required-now certification hosts are:

- Codex Desktop/native CLI
- Claude
- Grok
- OpenCode
- Antigravity (`agy`)

Cursor is deferred. It remains a supported build target, but no Cursor native-host
attestation is required for the current certification gate.

This decision supersedes only the required-host membership established by prior
amendments. It does not rewrite the original plan or any prior amendment.

## 2. Evidence boundary

Host installation and version proof is distinct from per-session model evidence.

- Installation/version proof identifies the host executable or desktop runtime and
  its observed version.
- Per-session evidence records the requested, resolved, and observed model values
  for that specific session.
- Neither evidence class substitutes for the other, and neither may be inferred
  from configuration, an installed flag, or a self-authored JSON record.

Every required-now host must provide truthful native evidence bound to the exact
certification head and applicable artifact identity. Missing, stale, emulated, or
unavailable evidence remains missing, stale, emulated, or unavailable; no
attestation may be fabricated to satisfy the host set.

## 3. Activation and remediation

Activation appends AM-0016 after AM-0015, recomputes the effective plan identity,
and invalidates prior review, reconciliation, certification, and evidence claims
bound to the previous identity. The execution state remains `NEEDS_REMEDIATION`
until fresh evidence is independently collected for the new identity.
