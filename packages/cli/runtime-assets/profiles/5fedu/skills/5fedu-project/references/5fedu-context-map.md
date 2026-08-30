# 5fedu context map

Canonical North-Star context is split by ownership rather than copied into every repository:

```text
agent-rules/profiles/5fedu/
  README.md
  rules/
  behaviors/
  module-mapping/
  reference-source/       # verified, read-only ERP reference

active project/
  project schema/spec/routes/decisions/data/evidence
```

Use the central reference broker for template source. A legacy `<repo>/context/5fedu/` folder, when present, is compatibility-only and must not be assumed to exist.
