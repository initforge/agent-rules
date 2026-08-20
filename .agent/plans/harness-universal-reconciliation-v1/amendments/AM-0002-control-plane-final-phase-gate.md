# AM-0002 — Control Plane is the final phase

Status: `OWNER_APPROVED_EFFECTIVE`

Applied to plan revision: `3`

## Owner correction

Control Plane work is not merely a later parallel successor. It is the final
phase after the harness capability surface is complete and installed.

## Eligibility gate

Control Plane planning, Pencil design, rebuild, Docker packaging, and browser
parity remain ineligible until all of the following are proven for the exact
candidate:

1. Every selected skill is semantically converged, fully materialized, and
   discoverable on every detected compatible coding host.
2. Provider, tool, MCP, host-adapter, rule, command, and runtime projections are
   reconciled without unowned drift or false parity.
3. OpenCode and every other detected host have fresh install/doctor receipts.
4. All universal-reconciliation requirements and claims are terminally proven.
5. Required local verification and exact-SHA hosted CI are green and bounded.
6. The owner-approved closeout for the harness phase is complete.

Before this gate passes, S8 may preserve and report the Control Plane candidate
only. It must not start Pencil, redesign UI, modify Control Plane source, build a
Docker image, or activate a Control Plane goal.

After the gate passes, Control Plane V2 is the sole final product phase:
foreground Pencil MCP design and owner approval first, then rebuild, Docker
Compose packaging, and foreground browser/runtime parity.

## Impact allocation

- S8 owns eligibility evidence and final successor handoff.
- REQ-021 / AC-021 enforce the negative precondition and final ordering.
- DEC-020 supersedes any interpretation of DEC-019 that permits Control Plane
  work before complete skill/runtime/provider reconciliation and closeout.
