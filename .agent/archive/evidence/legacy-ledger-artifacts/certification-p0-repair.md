# Ledger: certification-p0-repair — fail-closed native host certification
tier_used: L2

## CONTEXT
- Slice ID: certification-p0-repair
- Scope IN: `.github/workflows/certification.yml`, `automation/ci-certify.sh`, minimal certification helpers/tests
- Scope OUT: `packages/control-plane/**`, engine identity/scorecard behavior, runtime mirrors, commits/push/deploy

- [ ] AC1 required host set is exactly codex, claude, grok, opencode, antigravity; Cursor remains deferred | verify: `npm run test:certification` | evidence: <chưa chạy>
- [ ] AC2 each host artifact contains an exact host attestation plus bound manifest with commit/run/plan/evidence/TTL/native identity | verify: `npm run test:certification` | evidence: <chưa chạy>
- [ ] AC3 aggregate preserves artifact boundaries, validates exact required set/count, and invokes canonical attestation validation | verify: `npm run test:certification` | evidence: <chưa chạy>
- [ ] AC4 ci-certify creates or consumes a real host artifact and fails closed when native evidence is absent | verify: `npm run test:certification` | evidence: <chưa chạy>
- [ ] AC5 relevant repository build/tests remain green without touching Control Plane or engine identity/scorecard | verify: `npm run build && npm test` | evidence: <chưa chạy>
