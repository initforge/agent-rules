# QA methodology

Rút gọn [petrkindlmann/qa-skills](https://github.com/petrkindlmann/qa-skills).

## Trước click

1. 1–3 flow; roles (≥2 nếu permission).
2. Empty vs có data; out of scope.

## Matrix

| Nhóm | Ví dụ |
|---|---|
| Happy | primary path |
| Negative | sai/thiếu input |
| Boundary | max length, unicode |
| Permission | role thấp bị chặn |
| State | empty, loading, error |
| Gesture | double submit, refresh, back |
| Consistency | list ↔ detail ↔ mutate |

## Output

```text
QA scope: <flows / roles>
Matrix: N cases
Ran: N/N (via browser-qa | deferred)
Findings: <by severity>
Evidence: <paths>
Status: PASS | PARTIAL | BLOCKED
```

## Handoff

Cases → skill **`browser-qa`**.
