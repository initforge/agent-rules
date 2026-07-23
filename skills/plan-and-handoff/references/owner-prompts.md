## Owner prompts (copy-paste)

### 1. Research Analyst (Antigravity Gemini)

```text
Mode: advisory read-only (HB-1)
Skill: researcher
Task: [research question]

Output: .agent/research/<topic>.md — Summary, Evidence, Risks, Recommendation, Unknowns
Do NOT implement. Do NOT load 5fedu-module-parity unless ERP module UI research.
End: Hand to Plan Architect — items for PAF §5
```

### 2. Plan Architect (L1/L2)

```text
Mode: plan-authoring (HB-1 — read-only)
Skills: plan-and-handoff path A + implementation-discovery read-only
Task: [dump requirements]

Deliver: PAF đầy đủ per plan-artifact-template.md
Tier: plan_author_min_tier L1; phases prefer L0 execute where safe
Do NOT execute. End READY + HANDOFF §8 for P1 only.
```

### 3. Plan Scribe (L0)

```text
Mode: plan-authoring (HB-1)
Role: Scribe ONLY — normalize owner spec, do NOT invent

Locked input:
[paste spec]

Output: PAF per template. DRAFT if gaps; READY if Plan QA §7 pass.
Do NOT survey repo beyond path existence check.
```

### 4. Execute phase N (weak-first)

```text
Mode: execution (HB-2 pivot confirmed)
Skills: finish-to-completion + domain skills
Execute: Phase P_N ONLY — HANDOFF below:
[paste §8]

Start preferred_tier L0; respect min_tier and allowed_tiers; read only this current HANDOFF plus targeted evidence; escalate per capability-tier-routing.md
Report: tier_used | escalation_reason if any
```

### 5. Tier override (owner explicit)

```text
Execute Phase P_N with force_tier: L2
[paste HANDOFF or plan_id]
```
