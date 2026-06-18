# RTK Usage For Codex

Use `rtk` to reduce token-heavy shell output when it helps.

## External Commands

Prefer:

```bash
rtk git status
rtk git diff
rtk rg "pattern" .
rtk npm test -- --runInBand
```

## PowerShell Cmdlets

PowerShell cmdlets are not standalone executables.
Do not run things like `rtk Get-ChildItem`.

Use:

```powershell
rtk proxy powershell -NoProfile -Command "Get-ChildItem -Force"
rtk proxy powershell -NoProfile -Command "Get-Content -Raw C:\path\file.txt"
```

## When Raw Shell Is Fine

Use plain PowerShell when:
- `rtk proxy` adds no value
- command quoting becomes fragile
- you need exact shell behavior and filtered output is not helpful

## Useful Checks

```bash
rtk --version
rtk gain
```

Optional:

```bash
rtk init -g
```

That installs the hook if you want RTK token savings to apply more broadly.
