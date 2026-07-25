# Source-lock guide

**Vai trò:** Hướng dẫn sử dụng source-lock để pin exact template revision.  
**Ý đồ:** Một task có thể reference một template revision chính xác mà không cần copy toàn bộ template vào harness hoặc load hết vào model context.

## Source-lock là gì

Source-lock là một contract nhỏ (JSON) ghi lại:

- **repository**: URL repo template
- **commitSha**: Git commit SHA chính xác (40 ký tự hex)
- **templatePath**: đường dẫn tương đối trong repo đến template root
- **integrity**: hash tree template (sha256/sha512)
- **profileCompatibility**: danh sách profile tương thích
- **moduleIndex**: danh sách module có sẵn (optional)
- **verificationState**: trạng thái verify gần nhất

## Khi nào dùng

Source-lock được dùng khi task yêu cầu template parity:

1. Task chạm UI/module 5fedu → router chỉ vào `5fedu-module-parity`
2. Skill kiểm tra `source-lock.json` trong `context/5fedu/` (hoặc harness)
3. Nếu source-lock tồn tại: resolve → materialize → expose module
4. Nếu chưa có source-lock: chạy `14-materialize-template-source.ps1 -ProjectRoot ... -AllowNetwork -ValidateOnly`

## Materialization flow

Khi task yêu cầu template parity:

```
1. Confirm 5fedu profile enabled
   → Check: context/5fedu/ tồn tại trong workspace

2. Resolve source lock
   → Đọc source-lock.json (project > harness)
   → Validate JSON theo schema
   → Parse repository, commitSha, templatePath

3. Materialize pinned revision
   → Nếu cache hit (.agent/source-lock-cache/<hash>/):
       Verify integrity (hash tree)
   → Nếu cache miss:
       Cần AllowNetwork hoặc LocalRepoOverride
       Clone/fetch repo → checkout exact SHA
       Compute tree hash → so sánh với integrity
       Copy template path vào cache
   → Nếu materialize thất bại: dừng parity claims

4. Expose module (optional)
   → Nếu có chỉ định module:
       Chỉ copy module path + dependencies
   → Nếu không: chỉ ghi lại source info, không copy

5. Record in plan/evidence
   → Ghi source revision, paths, verification state
   → Evidence file tại .agent/source-lock-cache/<hash>/_metadata.json

6. Detect drift
   → Nếu HEAD ≠ commitSha: cảnh báo stale
   → Nếu local template khác cache: cảnh báo drift

7. Clean (optional)
   → -Clean flag: xoá cache entry
```

## Context-saving behavior

- Source-lock file (JSON) là contract nhỏ (~1KB), check-in được
- Cache tại `.agent/source-lock-cache/` isolated per-project, gitignored
- Chỉ module cần thiết và direct dependencies được materialize
- Không auto-load template vào context window
- Agent chỉ đọc source-lock.json + materialized module paths

## Security và ownership

- Template source không thể overwrite project files
- Mọi network operation cần `-AllowNetwork` flag (opt-in)
- Integrity hash verify tính toàn vẹn của materialized tree
- Cache ownership: project `.agent/` directory
- Dependencies (git, network) phải được xác nhận trước
- Cache invalidation: `-Clean` flag hoặc stale hash

## Commands

```powershell
# Validate source-lock
automation/14-materialize-template-source.ps1 -ProjectRoot <path> -ValidateOnly

# Materialize (dry run)
automation/14-materialize-template-source.ps1 -ProjectRoot <path> -DryRun

# Materialize with network fetch
automation/14-materialize-template-source.ps1 -ProjectRoot <path> -AllowNetwork

# Materialize specific module only
automation/14-materialize-template-source.ps1 -ProjectRoot <path> -Module nhan-vien -AllowNetwork

# Materialize from local repo (no network)
automation/14-materialize-template-source.ps1 -ProjectRoot <path> -LocalRepoOverride <path> -Module nhan-vien

# Clean cache
automation/14-materialize-template-source.ps1 -ProjectRoot <path> -Clean

# Doctor check
automation/doctor-5fedu-source-lock.ps1 -ProjectRoot <path>
```

## Source-lock lifecycle

| State | Ý nghĩa | Hành động |
|---|---|---|
| `unverified` | Chưa verify | Chạy `-ValidateOnly` để compute hash từ cache |
| `verified` | Cache matches lock | OK để materialize |
| `stale` | Cache không match lock | Chạy `-AllowNetwork` để re-fetch hoặc `-Clean` |

Source-lock ở trạng thái `stale` hoặc `unverified` → agent không được parity claim.
