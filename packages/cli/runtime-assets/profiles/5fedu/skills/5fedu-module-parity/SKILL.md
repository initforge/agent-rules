---
name: 5fedu-module-parity
description: Use only for an explicitly activated 5fedu ERP domain pack. Read the verified central reference snapshot by pointer,
  preserve its shared shell, map project variables, and prove parity. Never auto-activate from prompt wording or use it for
  branding/non-ERP redesign.
metadata:
  signals: "5fedu, ERP module, làm module, sửa module, refactor module, drawer, listview, toolbar, parity"
  source: ROUTE.json migrated

---

# 5fedu module parity

Use only when the runtime/project configuration **explicitly activates** the
`5fedu` domain pack (for example `agent-rules init --domain-pack 5fedu` or a
validated activation marker). Prompt words such as `5fedu`, `ERP`, `drawer`, or
`listview` never activate this skill by themselves. The authoritative template
is stored once in the harness; target projects do not install or vendor it.

Do not use a branding/design capability as the primary source for ERP parity.
Pencil is manual/explicit-only and may assist a user-requested design task, but
production behavior and parity remain source/browser-evidence driven.

Typical activated work includes creating a new module ("làm module mới"), cloning
the Nhân viên baseline ("clone"), sửa module cũ after an audit, thêm chức năng
vào module, or adapting another explicitly mapped ERP role. Route module-mapping
and ui-delivery evidence through this skill when the domain pack is active.

1. Load the central `module-mapping/modules.yaml`, `ui-contracts.md`,
   `behavior-contract.json`, and `source-evidence.json`; select a reference role
   from the active project schema/spec and requested surface, not from visual
   resemblance.
2. Require a verified domain-pack source receipt before implementation. Read
   exact source through `agent-rules reference 5fedu <path>` and search it with
   `agent-rules reference-search 5fedu <query>`. Do not copy the whole template
   into the target workspace.
3. Bind each owner requirement to the manifest-bound pointers in
   `source-evidence.json`, then inspect the referenced code before editing. If a
   required behavior is not evidenced there, search the verified source and add
   an explicit pointer rather than inventing behavior.
4. Build a shell-parity map separately from the variable map. Fields, labels,
   filters, columns, KPIs, business actions, routes and data rules are owned by
   the active project schema/spec; reference code supplies reusable patterns,
   not a mandatory feature inventory.
5. Complete/update the parity packet before code. Preserve target-native
   architecture and record `must_not_copy` plus approved deviations.
6. Verify structural, visual, behavioral and architectural proof. Visual PASS
   requires browser/runtime evidence; desktop/touch, responsive, keyboard/focus,
   reduced-motion, non-admin permission, mutation refresh and console/network
   evidence remain independent verification concerns. A worker cannot self-PASS.

For the canonical roles: Nhân viên is the internal-entity CRUD/list/detail/form/
stats baseline; Phòng ban is the hierarchy + embedded subordinate/related-data
baseline; Phân quyền must reconcile its module registry with the active project
routes/modules. The exact behavior is always read from the pinned pointers, not
from this prose.

Every handoff/completion report states, in order: `Status`, `Template reference`,
`Shell parity`, `Variable map`, `Pattern fidelity`, and `Verification`. Missing
source/evidence or unresolved mapping yields `BLOCKED`/`PARTIAL`, never parity
`PASS`.
