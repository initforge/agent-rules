# AM-0001 — Supersede terminal-harness-vnext as terminally invalid (partial)

- **Authoritative correction:** `terminal-harness-convergence-v1` is the owner-authorized
  successor. `terminal-harness-vnext` is classified **SUPERSEDED / INACTIVE / PARTIAL**.
- **Terminal truth:** the vNext plan never reached a trusted terminal state. Its 21 source
  requirements were recorded as `pending`; reconciliation was empty; the terminal attestation
  still bound the pre-final SHA `1109051…`; the prior "PASS" reports are NOT terminal truth.
- **No PASS:** this correction does NOT change the old plan to PASS. It preserves the
  partial terminal record and carries unresolved requirements forward.
- **Pointer:** `.agent/current.json` is advanced (generation 32 → 33) to point only at
  `terminal-harness-convergence-v1`. The old plan remains in history as inactive/superseded.
- **Evidence:** `.agent/ledger/terminal-harness-vnext.json` status set to SUPERSEDED with
  `execution_state: INACTIVE` and `terminal_outcome: PARTIAL`.
