# Browser QA runbook

## Preconditions

1. URL local/staging.
2. MCP: `playwright` + `chrome-devtools` (sau install agent-rules).
3. Matrix từ `qa-skills`.

## Session

1. **Playwright:** navigate → login → cases (click/fill/assert).
2. Mỗi case: expect vs actual; snapshot khi assert.
3. **Fail:** Chrome DevTools → console + network; gắn evidence.
4. Permission: ≥2 role khi chạm quyền.

## Evidence

```text
Case: <name>
Tool: playwright | chrome-devtools | both
Steps: ...
Expect: ...
Actual: ...
Evidence: <snapshot | screenshot | console | network>
```

## Artifact gitignore

```gitignore
.agent/qa-reports/
```
