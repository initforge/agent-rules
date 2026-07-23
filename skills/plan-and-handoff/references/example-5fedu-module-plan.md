# Example: ERP module plan

Use this only after the 5fedu router confirms project context.

```md
# Add Purchase Receipt module

## Intent
- Outcome: authorized staff can create, review, and list purchase receipts using the confirmed ERP pattern.
- In: route/registry, list/detail surface, validated persistence, permissions, regression proof.
- Out: redesigning shared ERP shell or changing unrelated stock policy.

## Execution
- Interfaces/files: existing Nhân viên/Phòng ban template, module registry, receipt API/schema, permission mapping.
- Approach: map template behavior, implement disjoint registry and surface/persistence slices, then integrate.
- Acceptance and proof: source/template comparison, permission tests, API/data tests, and live list/detail interaction at applicable desktop/mobile sizes.

## Work slices
| Slice | Ownership | Dependencies | Context capsule | Proof |
|---|---|---|---|---|
| S1 | main | none | template + registry paths | route/typecheck |
| S2 | agent | S1 | template + surface paths | UI interaction proof |
| S3 | agent | S1 | schema/API/permission paths | allowed/denied integration proof |
```
