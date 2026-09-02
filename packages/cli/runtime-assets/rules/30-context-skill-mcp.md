# Context, Skill và MCP Routing

Load the smallest matching capability and never infer domain authority from words alone.
Keep living context cohesive, imperative, and useful to the current turn.

SKILL.md owns exact skill content, name and description. `registry/skills.yaml`
owns provenance, role, activation, dependencies, conflicts and lifecycle.
Global installation projects only active implicit skills. The complete library
stays in runtime-assets; an accepted task may transactionally project selected
explicit-only skills and true `requires` dependencies into a supported
repository-local skill surface. `supports` never activates. Replacement/close
removes only Agent Rules-owned task projections and preserves user files.

Keep one IntegrationRegistry with capability, transport, auth requirement, side effects, approval policy, supported hosts and probe.
Normal install registers the approved standard MCP providers in each supported native host. Registration is not a tool call and must preserve user-owned entries and an explicit user disable.
Each turn selects whether to use a registered MCP once from explicit capability or deterministic project fact. A turn without MCP need must not call a provider or mutate host config.
Task-local config is only for genuine isolation, has lease, timeout and cleanup, and never overwrites global user config.
Explicit-only providers never auto-route. Provider needing login/key reports Needs action, not native host install failure.

Native installation consists only of self-contained rules, skills, explicitly selected profiles and native MCP registrations. Installed host configuration never calls agent-rules, a router, launcher or interpreter during startup or a model turn. Build-time and explicit diagnostic routing may test selection behavior, but it is not a production session dependency.
Check the native static receipt before operator-driven install/update/doctor work; drift is never hidden by a prompt wrapper.

At intake, resolve implicit skills through native description discovery and
exact explicit skills from accepted task state. Repository facts only filter
compatibility. If the host cannot expose repository-local task skills, report
UNSUPPORTED/NEEDS_USER; never fall back to global explicit projection. Activate
profiles only from explicit owner selection or structured project fact.

Enforcement: portable compiler, generated context graph checks, native skill discovery, and static doctor readback.
