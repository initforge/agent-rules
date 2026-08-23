# DeepSeek Harness adoption research

Research date: 2026-08-15 (Asia/Ho_Chi_Minh)

Upstream: https://github.com/deepseek-ai/deepseek-harness

Observed upstream source: master at 47f943859bef60e4160492346772ded9b24f765a.
The repository currently describes itself as a developer preview. Published package
metadata observed in source is 0.1.0-rc.5. No upstream installation, API call,
MCP launch, or production-file mutation was performed during this research.

## Summary

DeepSeek Harness (dsh) is a complete agent host, not merely a DeepSeek model
adapter and not merely an MCP server. It is a Cordis-based plugin runtime where
the model adapter, session log, prompt assembly, tool registry, skill registry,
agent loop, sandbox, subprocess runtime, Web UI, headless runner, hooks bridges,
and MCP client are replaceable plugin layers.

It can be adopted by agent-rules, but the correct classification is a new
external host/platform adapter. It must not replace the canonical agent-rules
engine/kernel or become a second source of PASS semantics. The first integration
should keep agent-rules as policy, routing, evidence, and acceptance authority,
and project compatible policy into a DSH profile/preset.

The Linux virtual-desktop conclusion is:

* Non-GUI MCPs can be projected into DSH Cordis mcp-client rows.
* GUI MCPs (Playwright MCP, Chrome DevTools MCP, Pencil) need the existing
  focus/workspace guardian at the exact child-process launch boundary.
* DSH documents no native Cinnamon/X11 virtual-desktop isolation contract.
  Its MCP config has a static cwd and process/plugin lifecycle, while its
  session preset mechanism scopes tools and prompt registrations. Therefore a
  multi-session Web process must not be assumed to provide per-session desktop
  binding.
* The safe initial mode is one explicitly bound DSH process/profile per
  project/virtual desktop. A true multi-session desktop-safe mode needs a
  session-aware bridge and live proof.

## Upstream evidence

### Product and lifecycle

The upstream README identifies DSH as an open-source agent harness with an
everything-is-a-plugin architecture powered by Cordis, and warns that it is a
developer preview with compatibility-breaking changes expected. It documents
the npm command npx @deepseek-ai/dsh web and source execution through pnpm
install, pnpm run build, and pnpm dsh web.

Sources:
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/README.md
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/package.json
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/apps/cli/package.json

The current CLI exposes:
* dsh web / dsh --profile web: browser UI server;
* dsh --profile headless "task": one-shot persisted session;
* dsh plugin --profile <name> <pnpm args>: profile plugin management;
* --dump-default-config and --dump-config: inspect the effective Cordis tree
  without booting it.

The invoking directory is the default workspace root. The Web UI requires a
workspace selection before a session can run. User state is under DSH_HOME
(default ~/.dsh), including settings, credentials, profiles, skills, and
sessions.

Sources:
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/apps/cli/README.md
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/user/guide/index.md
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/user/guide/providers.md

### Composition model

DSH builds a profile from ordered layers:

1. bundle patch layers;
2. the profile cordis.patch.yml;
3. DSH_HOME/cordis.patch.yml;
4. an optional --patch overlay.

A bundle is an npm package whose package.json declares dsh.bundle.patch. A
profile has a package.json with an ordered dsh.profile.bundles list plus its
cordis.patch.yml. A plugin is a module exporting apply(ctx), optional dependency
injection, and reversible registrations/effects.

This is the correct seam for an adapter: generate a DSH-owned projection patch
from the canonical agent-rules registry and policy; do not edit DSH's core loop
or copy its source into this repository.

Sources:
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/architecture.md
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/apps/cli/README.md
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/user/develop/basic/index.md
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/user/develop/basic/config.md
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/bundle/README.md

### Rules and workspace instructions

The shipped dsh-agent-instructions plugin loads a durable instruction baseline
per session. It reads DSH_HOME/AGENTS.md, then AGENTS.md and CLAUDE.md candidates
from the project root down to the session cwd, with bounded rendering and
more-specific scopes later in the chain. It also projects nested instruction
changes after successful first-party file tool calls.

This is a strong compatibility seam for the repository's AGENTS.md model, but
not a complete drop-in guarantee. DSH explicitly does not interpret conventions
such as @path imports. The current repository root AGENTS.md is managed through
an @... runtime pointer, so DSH would see that literal pointer unless the
adapter supplies a resolved DSH instruction projection or native bridge plugin.

Recommended projection:
* keep AGENTS.md, rules/manifest.yaml, and canonical rule files as source;
* generate a bounded DSH instruction projection with source/effective-plan hashes
  and an ownership receipt, or implement a native DSH plugin that reads source;
* never let a hand-edited DSH copy silently drift from canonical rules;
* preserve precedence and fail-closed meaning;
* route execution and acceptance decisions back through agent-rules.

Source:
https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/context/agent-instructions/README.md

### Skills

DSH has a provider-neutral ctx.skills registry and a local filesystem provider.
Default discovery order is:

| Rank | DSH source | Root |
|---:|---|---|
| 100 | project-dsh | <projectRoot>/.dsh/skills |
| 200 | project-agents | <projectRoot>/.agents/skills |
| 300 | custom | customSkillDirs |
| 400 | user-dsh | <DSH_HOME>/skills |
| 500 | user-agents | ~/.agents/skills |
| 600 | bundled | configured bundled root |

It recognizes one-level skill bundles (name/SKILL.md) and flat Markdown files.
Frontmatter requires kebab-case name and description. Optional fields include
whenToUse, metadata, disable-model-invocation, and user-invocable. Omitted
invocation controls default to model- and user-invocable. dsh-tool-skill
publishes a model-facing catalog and a skill tool; a whitespace-bounded /name
in direct user input is the explicit user-invocation path.

The current repository's skills/*/SKILL.md already has compatible name and
description frontmatter. Its ROUTE.json is richer than DSH's native catalog:
signals, intent signals, excludes, requires, supports, scopes, and activation
semantics. DSH's native catalog does not carry those route facts into the model
catalog and does not replace the agent-rules context router.

Required mapping:

| agent-rules fact | DSH treatment |
|---|---|
| SKILL.md body | Loadable DSH skill body via custom root or governed projection |
| ROUTE.json | Keep in canonical router; optionally expose as non-authoritative metadata |
| ROUTED | Model-invocable only after canonical route gate selects it |
| EXPLICIT | Set disable-model-invocation: true; expose only to explicit user/plugin selection |
| ON_DEMAND | Model-invocable through conservative catalog or explicit selector, subject to gates |
| provenance/license/pin | Keep in canonical fabric and receipts, not prose-only skill truth |

For the first adapter, configure customSkillDirs to read the canonical skill tree
rather than duplicating upstream content. If the DSH model catalog is enabled
for every skill, it can auto-select from descriptions and bypass deterministic
ROUTE.json gates. The safer path is a bridge or selected-skill projection where
agent-rules chooses the set and DSH loads only selected bodies.

Sources:
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/skills.md
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/skill/skill-filesystem/README.md
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/skill/tool-skill/README.md
* Local source: skills/*/SKILL.md, skills/*/ROUTE.json, skills/catalog.json,
  skills/candidate-fabric.json

### Models and model routing

The native DSH adapter is dsh-llm-deepseek, whose provider route is deliberately
deepseek-official. It supports direct DeepSeek chat-completions/SSE, model
catalog entries, context-window metadata, off/high/max reasoning effort,
settings hot reload, credential references, and per-request resolution. The
upstream docs state a default 1,000,000-token context fallback and default V4
Flash/V4 Pro catalog entries, but those are deployment claims that need a
fresh smoke test at adoption time.

This is separate from the existing agent-rules DeepSeek model references.
Adding DSH as a host must not rewrite existing model identity or silently change
model selection. A host adapter may map an explicit logical route to
deepseek-official, with observed model and reasoning effort in the receipt.

Source:
https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/llm/llm-deepseek/README.md

### MCP bridge

DSH includes dsh-mcp-client. It connects external MCP servers and registers
their tools on ctx.tools. It is not the same configuration dialect as the
current agent-rules JSON/TOML MCP materializer. One plugin instance is
configured per MCP server in cordis.yml:

    - id: mcp-example
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: example
        transport: stdio
        command: /absolute/path/to/provider-wrapper
        args: []
        cwd: /absolute/path/to/project
        env: {}
        failOnStartupError: true

Streamable HTTP is also supported. Public tool names are deterministic
mcp__<serverName>__<rawName> values, normalized to the DSH function-name
contract. The client waits for initial tools/list, supports list-changed
resync, and has bounded reconnect for stdio crashes. It bridges tools only;
MCP resources and prompts are explicitly deferred.

Projection requirements:
* no @latest or floating source in a generated DSH profile;
* executable and args are argv, never interpolated shell text;
* credentials remain environment references or the DSH credential seam;
* failOnStartupError comes from canonical provider policy, not DSH default;
* generated patch records integration id, source pin, command digest,
  effective-plan/registry hash, and rollback target.

Sources:
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/mcp/README.md
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/mcp/mcp-client/README.md
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/mcp/mcp-client/src/index.ts
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/.agents/notes/implemented/feature/2026-07-07-mcp-client-plugin.md
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/.agents/notes/implemented/feature/2026-08-06-mcp-client-auto-reconnect.md

### Sandbox, subprocess, and session scope

DSH has a process-sandbox seam and local subprocess provider. The sandbox
controls filesystem effects only (read-only, workspace-write,
danger-full-access); it does not claim network or virtual-desktop isolation.
The subprocess seam owns explicit argv/cwd/stdio/env and managed process-tree
termination. This is useful for invoking the existing MCP guardian, but it
does not place GUI windows on a target X11 desktop.

DSH per-session agent presets can scope tools, prompt sections, persona, and
compaction policy. The host composition remains process-wide, while a preset is
mounted under an agent scope. The DSH MCP feature note still defines MCP
connections as composition/plugin instances and provides no first-class
session-to-X11-window binding. Static cwd is not virtual-desktop binding.

Sources:
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/sandbox.md
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/subsystems/subprocess.md
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/preset/agent-presets/README.md
* https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/.agents/notes/implemented/architecture/2026-08-03-per-session-agent-presets.md

## Current agent-rules comparison

The local repository currently has:
* canonical runtime in packages/engine/src/northstar and
  packages/kernel/src/northstar;
* host/platform registry in packages/cli/src/runtime/contracts.ts,
  packages/cli/src/runtime/host-adapters.ts, and
  platforms/platform-contracts.json;
* headless agent kind limited to claude, codex, opencode, and retired-platform in
  packages/kernel/src/runner/headless-executor.ts;
* per-agent MCP materialization in packages/kernel/src/runner/mcp-config.ts,
  currently emitting Claude, Codex, OpenCode, and retired-platform dialects;
* integration truth in integrations/registry.json and
  integrations/{required,recommended,optional,manual};
* governed skills under skills/, each with SKILL.md plus ROUTE.json;
* current GUI safety boundary in packages/kernel/src/runner/mcp-guardian.mjs,
  focus-workspace.ts, session-binding.mjs, and receipts/fixtures/live probe;
* existing model-level DeepSeek references, but no registered
  deepseek-harness host or DSH Cordis adapter.

The local mcp-config.ts contract is not enough for DSH. The new host needs a
separate DSH composition adapter and host lifecycle adapter; it must not pretend
an OpenCode JSON config is also a DSH config.

## Proposed integration boundary

    agent-rules canonical policy/route/evidence
                |
                +--> DSH host adapter (detect/install/doctor/receipt)
                +--> DSH instruction projection (rules/AGENTS)
                +--> DSH skill projection or route-aware bridge
                +--> DSH Cordis patch (non-GUI MCPs)
                +--> guardian-wrapped DSH GUI MCP launch
                +--> verifier/evidence bridge back to agent-rules

DSH should be:
1. an additional supported host target;
2. an optional DeepSeek-native execution surface;
3. a plugin/MCP projection consumer;
4. never the owner of PASS, acceptance, plan authority, or legacy parity.

### Mode A: initial safe adoption

Start one pinned DSH process from the project workspace and intended Linux
virtual desktop. Give it a per-project DSH home/profile and a resolved source
window/workspace binding. Non-GUI MCPs may be loaded in the profile. GUI MCPs
are launched only through the guardian with visible/headed defaults.

This matches the operator's one-project-per-virtual-desktop workflow and avoids
pretending a Web process serving several sessions can infer which desktop owns a
newly spawned GUI MCP window.

### Mode B: later multi-session adoption

Implement a native DSH plugin/bridge that binds each agent/session to:
* immutable session id;
* workspace/project root;
* exact source X11 window id and target desktop;
* visible/headed policy;
* guardian receipt directory;
* provider process tree.

The bridge must create/tear down MCP connection in that session scope, pass the
binding explicitly to the provider wrapper, and fail closed when binding is
absent, ambiguous, stale, or violated. It must prove host desktop/active window
unchanged, no unrelated window movement, and provider lifecycle monitoring.
This mode is not satisfied by a static cwd, preset id, or unit test.

## Candidate installation and packaging

Do not execute these commands yet; they are candidate commands for an
owner-authorized implementation plan only.

Pinned npm surface:

    npx -y @deepseek-ai/dsh@0.1.0-rc.5 web
    npx -y @deepseek-ai/dsh@0.1.0-rc.5 --profile headless "<task>"

The upstream README omits the version pin, but agent-rules governance requires
an exact version or source commit. The npm path must be verified for package
contents, transitive licenses, binary resolution, --dump-config, and rollback
before materialization.

Source checkout surface:

    git clone https://github.com/deepseek-ai/deepseek-harness.git
    cd deepseek-harness
    pnpm install
    pnpm run build
    pnpm dsh web

For governed adoption, replace the floating branch checkout with the observed
commit 47f943859bef60e4160492346772ded9b24f765a or another owner-approved
immutable pin, then verify tree and lockfile. Upstream prerequisites are Node
^22.19.0 or >=24.0.0, Corepack pnpm 11.7.0, and Git 2.26+.
The current machine has Node 22.22.2, npm 10.9.7, and pnpm 11.19.0. This is
only a static prerequisite check, not an install proof.

## Discussion-ready work packages (not activated)

### Phase 0: authority and compatibility snapshot

* open a new owner-authorized plan; do not amend the unrelated current plan;
* pin npm/source version, upstream commit, lockfile, license evidence, and
  package integrity;
* record developer-preview compatibility risk;
* decide npm-only, source checkout, or both;
* decide whether first live surface is headless-only, Web, or both.

### Phase 1: host adapter and headless proof

* add deepseek-harness as a registered host/platform id only after contract
  and schema approval;
* detect dsh and prove help/version without treating DSH_HOME alone as
  installation evidence;
* add managed per-project DSH home/profile paths and receipts;
* add a headless invocation adapter using exact argv and explicit cwd;
* prove prompt/rules/skill/evidence delivery with a keyless/mock model where
  possible, then separately mark real-API smoke evidence.

### Phase 2: rules and skills projection

* generate bounded DSH instruction content from canonical rules/effective plan,
  or implement a native bridge that reads canonical source;
* configure customSkillDirs to the governed skill source or generate a
  provenance-bound projection;
* translate activation classes into DSH invocation policy;
* retain ROUTE.json, candidate fabric, provider provenance, and agent-rules
  route/evidence receipt as authoritative;
* test routed, explicit-only, provider-gated, and blocked-provider cases.

### Phase 3: non-GUI MCP projection

* generate cordis.patch.yml entries using one dsh-mcp-client row per approved
  integration;
* use canonical source pins, command argv, and credential references;
* verify stable server names and mcp__server__tool naming;
* select failOnStartupError from provider policy;
* test startup, discovery, list-changed resync, stdio crash/reconnect, final
  failure, cleanup, and rollback;
* do not project MCP resources/prompts as supported features.

### Phase 4: GUI MCP virtual-desktop safety

* wrap Playwright/Chrome DevTools/Pencil commands with the existing guardian;
* preserve visible/headed operation; never hidden/minimized/Xvfb fallback;
* resolve exact source window and target desktop before launch;
* pass session/project binding through explicit environment, not global config;
* refuse missing or multi-candidate binding;
* assert non-iconic provider, target workspace, no unrelated movement, no
  focus theft, and lifecycle monitoring;
* start with one DSH process per project desktop;
* enable multi-session only after a real session-aware DSH bridge and live proof;
* test stale window, rejected move, steal focus, desktop race, iconic provider,
  and unrelated window movement.

### Phase 5: lifecycle hooks and evidence bridge

* map DSH agent/pre-step, tools/pre-execute, tools/post-execute,
  agent/turn-stopping, and session-start seams to canonical gates;
* use a native Cordis plugin for richer typed behavior; use upstream Claude/Codex
  hook bridges only for a deliberately mapped subset;
* never make a DSH worker or prompt projection author PASS;
* write claim-matched evidence into the existing receipt/ledger model;
* treat DSH session logs as supporting telemetry, not instruction authority;
* verify cancellation, cleanup, resume, and plan/acceptance boundaries.

### Phase 6: live acceptance and rollout

* certify headless and Web modes separately;
* certify non-GUI and GUI MCPs separately;
* certify process-per-desktop before multi-session Web;
* run lifecycle/reconcile/doctor and the existing full suite;
* keep DSH PARTIAL/BLOCKED for missing live proof; never claim native desktop
  isolation from static configuration.

## Risks

1. Developer-preview churn can invalidate unpinned adapters and receipts.
2. Existing DeepSeek model policy is not evidence that DSH is installed.
3. DSH loads file contents but does not infer the repository's @... managed
   runtime include convention.
4. DSH description matching can bypass deterministic ROUTE.json gates.
5. Boot-time MCP rows and static cwd do not identify the owning X11 desktop for
   every Web session.
6. DSH sandbox/workspace controls govern file effects, not X11 placement,
   visibility, or active-window preservation.
7. Cordis patches, logs, model-visible schemas, and receipts must not leak keys.
8. DSH subprocess cleanup does not replace guardian attribution/GUI receipts.
9. Process-global services and per-session scopes need collision tests.
10. DSH JSONL/session events must not silently override agent-rules plans,
    pointer, acceptance, or owner authority.

## Unknowns requiring owner decision or live proof

* npm package contents and integrity for dsh 0.1.0-rc.5;
* whether published Web artifacts include every plugin/native dependency needed;
* exact DSH Web UI process/window identity on this Linux Cinnamon session;
* how Web session metadata can provide an exact X11 source-window id to the
  server-side Cordis plugin without first-window heuristics;
* whether upstream MCP client can be mounted in a per-agent preset with
  distinct cwd and guardian environment per session;
* native DSH plugin versus generated AGENTS/skill projection, or both;
* real API budget/credential receipt policy;
* preservation of model attestation/review-independence semantics;
* required acceptance surfaces: headless, Web, ACP, Python SDK, or npm CLI;
* owner policy for danger-full-access versus workspace-write.

## Recommendation

Proceed with an owner-authorized, additive deepseek-harness host adapter, but
do not install it or change production files as part of this research turn.

Recommended order:
1. pin and audit upstream package/source;
2. implement/demonstrate headless host detection and invocation;
3. project rules and skills while preserving canonical routing;
4. project non-GUI MCPs through generated Cordis rows;
5. make GUI MCPs visible and focus-safe using the existing guardian, initially
   one DSH process per project virtual desktop;
6. only then design and certify a multi-session Web/session-aware bridge.

Do not create a registry record that merely lists the name, do not add it to
nativeHosts before a host adapter exists, and do not call an unpinned npx
@deepseek-ai/dsh command from an installer.

## Hand to Plan Architect

### PAF Section 5: assumptions

* Install/adapt means support DSH as an additional host while retaining
  agent-rules as canonical policy/evidence authority.
* This research request authorized no source checkout, npm install, API call,
  MCP provider launch, or GUI probe.
* Linux X11/Cinnamon visible operation is required for GUI MCPs; hidden/headless
  fallback cannot satisfy a manual-visible claim.
* Existing skills, MCP registry, guardian, plan/ledger/pointer invariants, and
  legacy behavior remain additive.
* Per-project virtual-desktop isolation is the default workflow; one DSH process
  per project is an acceptable first safety boundary.

### PAF Section 5: known unknowns

* DSH developer-preview compatibility and npm artifact integrity are unverified.
* DSH has no documented native X11 virtual-desktop contract.
* Multi-session Web-to-X11 source binding is unproven.
* DSH skill descriptions do not encode full ROUTE.json semantics.
* The root AGENTS.md pointer convention is not automatically followed by DSH.
* A profile-level MCP row is not evidence of per-session MCP isolation.

### Owner decisions before activation

1. Approve a new deepseek-harness phase/plan rather than amending the unrelated
   current plan.
2. Choose pinned npm 0.1.0-rc.5, pinned source commit, or both.
3. Choose first certification surface: headless, Web, or both.
4. Approve process-per-project-desktop as first GUI MCP mode.
5. Choose custom-root skill view, governed projection, or native route-aware
   plugin.
6. Approve API budget/credential handling and real-call acceptance evidence.
