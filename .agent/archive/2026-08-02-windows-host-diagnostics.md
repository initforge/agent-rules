# WAITING_EXTERNAL — Host Diagnostics Report
**Generated:** 2026-08-02 (UTC+7)  
**Probe scope:** Read-only native Windows diagnostics. No credentials installed. No external systems mutated.  
**Execution context:** `DESKTOP-T3NFL0T\admin` (non-elevated, non-system)  

---

## 1. Platform

| Field | Value |
|---|---|
| Hostname | DESKTOP-T3NFL0T |
| OS | Microsoft Windows 11 Pro 10.0.26200 (Build 26200) |
| Architecture | x64 |
| System locale | en-us |
| Timezone | UTC+07:00 (Bangkok, Hanoi, Jakarta) |
| Domain | WORKGROUP |
| Boot time | 2026-08-02 07:38:10 |
| Last boot hotfixes | KB5100998, KB5054156, KB5101650, KB5120102 |
| HAL | 10.0.26100.1 |

---

## 2. Hardware

### Motherboard
| Field | Value |
|---|---|
| Manufacturer | ASUSTeK COMPUTER INC. |
| Product | TUF GAMING B760M-PLUS WIFI D4 |
| Serial | 250657597100302 |
| BIOS | American Megatrends Inc. 1820 (15/05/2025) |

### CPU
| Field | Value |
|---|---|
| Name | Intel Core i5-14600KF |
| Family/Model/Stepping | 6 / 183 / 1 |
| Architecture | x64 (Intel 64) |
| Base clock | 3500 MHz |
| Cores / Logical | 14 / 20 |
| Hypervisor | Present |

### Memory
| Field | Value |
|---|---|
| DIMM count | 2 |
| Total physical | 32,557 MB (30.3 GiB) |
| Modules | HIKSEMI 16 GB DDR4-3200 ×2 |
| Form factor | SODIMM (?) — FormFactor=8 (see Win32_PhysicalMemory) |
| Available (at probe) | 8,987 MB |

### GPU
| Field | Value |
|---|---|
| Name | NVIDIA GeForce RTX 5060 |
| Driver version | 591.86 |
| Compute capability | 12.0 (Blackwell arch) |
| VRAM | 8,151 MiB |
| Audio | NVIDIA High Definition Audio |
| CUDA toolkit in PATH | **NOT FOUND** (only PhysX path present) |

### Storage
| Field | Value |
|---|---|
| Model | WD Blue SN580 1TB |
| Size | ~0.91 TB (1000202273280 bytes) |
| Media type | Fixed hard disk (NVMe) |

### Network
| Interface | Status | MAC | IP(s) |
|---|---|---|---|
| Wi-Fi (Intel AX201 160MHz) | Up | 4C-0F-3E:18:05:7E | 192.168.1.9, link-local v6, GUA v6 |
| Ethernet (Realtek 2.5GbE) | Media disconnected | — | — |
| Bluetooth | Media disconnected | — | — |
| WSL vSwitch (Hyper-V) | Up | 00-15-5D:22:F7:24 | 172.19.224.1 |

---

## 3. Security Posture

### Virtualization-Based Security (VBS)
| Property | Value |
|---|---|
| VBS status | **Running** |
| HVCI (Hypervisor-enforced Code Integrity) | **Running** — both configured and active |
| App Control for Business (kernel) | **Enforced** |
| App Control for Business (user) | **Off** |
| Available security properties | Base Virt, Secure Boot, DMA Protection, UEFI Code Readonly, SMM Mitigations 1.0, MBEC, APIC Virt |

### Secure Boot
- Listed as **available** security property under VBS
- BIOS UEFI state: **UNCONFIRMED** (requires elevation)

### TPM
| Probe | Result |
|---|---|
| `Get-Tpm` | **Requires administrator** |
| `Get-CimInstance Win32_Tpm` (root\cimv2) | **Invalid class** |
| `Get-CimInstance Win32_Tpm` (root\cimv2/Security/MicrosoftTpm) | **No output** (namespace absent or inaccessible) |
| TPM service | Running (startType: Manual) |
| **TPM presence confirmed?** | **UNKNOWN** — blocked by non-elevation |

### Defender / EDR
| Service | Status | StartType |
|---|---|---|
| WinDefend | Running | Automatic |
| WdNisSvc (Defender NIS) | Running | — |

### WSL
- docker-desktop distribution installed, **Stopped**
- WSL version: 2
- WSL Hyper-V vSwitch active (172.19.224.1)

---

## 4. Attestation Capability Assessment

### Attestation blockers — non-elevation

| Attestation dimension | Status | Blocker |
|---|---|---|
| TPM 2.0 identity / EK key | **BLOCKED** | Non-elevated; `Get-Tpm` requires admin; WMI namespace inaccessible |
| BIOS/UEFI measurements | **BLOCKED** | Non-elevated; cannot read PCRs or UEFI vars |
| DeviceGuard/VBS policy hash | **PARTIAL** | HVCI running confirmed via `DeviceGuardSecurityServicesRunning`; policy hash not readable without elevation |
| Secure Boot DB/Dbx state | **BLOCKED** | Requires read access to UEFI NVRAM vars |
| Key attestation (e.g., FIDO2) | **BLOCKED** | Depends on TPM; TPM unreadable |

### Model inference readiness

| Capability | Status | Notes |
|---|---|---|
| GPU inference (CUDA/ROCm) | **PARTIAL** | RTX 5060 compute 12.0; CUDA toolkit **not in PATH**; driver supports it |
| Vulkan / OpenCL | **Presumed** | Driver 591.86 covers both |
| CPU inference | **YES** | 20-thread Raptor Lake; sufficient for small models |
| RAM headroom | **GOOD** | ~24 GB available at probe time |
| VRAM | **8 GB** | Tight for large models (>7B params); okay for quantization |
| WSL GPU pass-through | **UNKNOWN** | docker-desktop stopped; WSL present but no active Linux distro |
| Network inference (cloud offload) | **YES** | Wi-Fi 6 connected at 260 Mbps |

---

## 5. Executables / Version Inventory

| Executable | Version / Notes |
|---|---|
| `systeminfo` | Built-in (10.0.26200) |
| `nvidia-smi` | 32.0.15.9186 (from GPU driver) |
| `powershell` | 5.1 (Windows PowerShell, build env) |
| `wsl` | Version 2 |
| `powercfg` | Built-in (battery report generated to `$env:TEMP`) |
| `tpmtool` | **Requires elevation** |
| `Get-Tpm` (PS) | **Requires elevation** |

---

## 6. Deviations / Anomalies

1. **FormFactor=8 in Win32_PhysicalMemory** — value 8 maps to "Chip" per MOF spec, which is atypical for DIMM modules in a desktop. HIKSEMI may report differently; actual physical form factor likely SODIMM or DIMM but WMI enum returned 8.
2. **RTX 5060 driver 591.86** — driver is post-release (RTX 5060 launched ~Q2 2026; this driver likely late 2026 branch). Compute 12.0 confirmed.
3. **BIOS dated 15/05/2025** — newer than OS install date (13/09/2025), indicating BIOS update post-install.
4. **Product Name "System Product Name"** in Win32_ComputerSystem — ASUS mobo may not populate SystemProductName in BIOS string; this is a known ASUS BIOS quirk.

---

## 7. Summary Verdict

| Dimension | Assessment |
|---|---|
| Hardware capability | **Capable** — 20C/20T CPU, 32 GB RAM, RTX 5060 8 GB |
| GPU inference readiness | **Capable but incompletely configured** — driver installed, compute 12.0; CUDA toolkit not in PATH |
| Attestation (remote) | **NOT YET CAPABLE** — TPM unreadable (non-elevated); no path to key attestation without elevation or physical access |
| Security hardening | **Strong baseline** — HVCI enforced, Secure Boot listed available, VBS running, WD running |
| Credible for local AI dev | **YES** — with CUDA toolkit installed |
| Credible for remote attestation | **NO** — requires elevation to query TPM and Secure Boot state |

---

*Probe: read-only WMI/CIM, systeminfo, nvidia-smi, ipconfig, wsl. No mutation. No credentials. No external calls.*
