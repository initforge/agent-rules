Use the `5fedu-project` skill to scaffold or maintain project-local 5fedu context. This is the only 5fedu slash/custom prompt.

Use `/5fedu` only when the user asks to:
- scaffold a repo as a 5fedu project
- create or refresh `AGENTS.md`
- add, change, or reorganize `.codex/5fedu/*.md`
- update decision status or unresolved questions
- add new 5fedu conventions/rules for future work
- clarify default 5fedu working format while keeping app-specific values unconfirmed

Do not require the user to call `/5fedu` for ordinary implementation. In a repo that already has `AGENTS.md` and `.codex/5fedu/`, Codex must load and follow the project context from those files during normal work.

First:
1. Read `AGENTS.md`.
2. If `AGENTS.md` or `.codex/5fedu/` is missing, scaffold the project-local context from `C:\Users\ADMIN\.codex\skills\5fedu-project\assets\project-context`.
3. If context exists, follow the loading policy in `AGENTS.md`: always read `.codex/5fedu/00-index.md`, `.codex/5fedu/06-decision-status.md`, and `.codex/5fedu/questions.md`; read other files only when relevant to the requested work. Read `.codex/5fedu/07-working-format.md` when the request is about default format/how-to.
4. Summarize what is `DA_CHOT`, `CHUA_CHOT`, and `CAN_HOI_THEM` for the requested work.
5. Ask the minimum clear questions needed to chốt the current slice.

Rules:
- Keep 5fedu context project-local.
- Treat `AGENTS.md` as the normal always-on entry for future work; `/5fedu` is a maintenance/setup shortcut, not a required context-loading ritual.
- Do not guess module mapping, credentials, database schema, auth behavior, permissions, or screen flow.
- Do not store secret values.
- If the user asks to implement auth/database/permissions, create a locked HIGH-risk plan first.
