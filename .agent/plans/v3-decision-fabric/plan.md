# Agent-Rules V3 Decision Fabric + Execution Authority migration

This is the owner-authorized phase plan for the clean-room V3 directive. It
retains the proven North-Star trust kernel and migrates the decision surface in
bounded slices. The phase covers all 101 criteria in the directive through the
24 traceable requirements in `requirements.yaml` and the verification commands
attached to each requirement.

Priority order:

1. current-owner authority and generation safety;
2. removal of duplicate semantic authorities;
3. large-repository scalability and bounded context;
4. verified implementation throughput;
5. routing/context/provider precision;
6. cross-host portability;
7. operator comprehensibility;
8. artifact and legacy hygiene;
9. extensibility without implicit activation.

The phase is complete only when the canonical checks, dogfood fixtures, full
workspace test partitions, and GitHub CI agree. Missing authority, unavailable
providers, absent business/source truth, and unavailable external certification
remain BLOCKED/NEEDS_USER; they are never synthesized into PASS.
