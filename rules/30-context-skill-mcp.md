# Context, Skill và MCP Routing

Load the smallest matching capability and never infer domain authority from words alone.
Keep living context cohesive, imperative, and within budget.
Use progressive disclosure and durable checkpoints without shrinking scope.

SKILL.md is the single author source for name, description, activation boundary and metadata.
Build generates catalog for check; generated catalog is not a second source.
TaskPacket calls SkillResolver exactly once; CapabilityBroker receives selected result; context engine only materializes selected skill; host native catalog only receives name/description/path at startup.

Keep one IntegrationRegistry with capability, transport, auth requirement, side effects, approval policy, supported hosts and probe.
Normal install registers the approved standard MCP providers in each supported native host. Registration is not a tool call and must preserve user-owned entries and an explicit user disable.
Each task selects whether to use a registered MCP exactly once from explicit capability or deterministic project fact. A task without MCP need must not call a provider or mutate host config.
Task-local config is only for genuine isolation, has lease, timeout and cleanup, and never overwrites global user config.
Explicit-only providers never auto-route. Provider needing login/key reports Needs action, not native host install failure.

Native layer always has base rules, native skills and lifecycle adapter of host.
Runtime layer only adds task delta: raw intent, scope, selected claims, selected skills/integrations and proof plan.
Check native receipt before run; drift not silently replaced by prompt wrapper.

Intentional oversize packs (docs-style, plan-and-handoff, finish-to-completion, code-review) are owner-approved for cohesion; audits do not FAIL size-only.
Hard core budget stays manifest.yaml core_total_tokens.

Enforcement: graph-router-and-context-compiler, context-audit, context-budget-audit, capability-broker.
