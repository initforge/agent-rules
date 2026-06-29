# Runtime model

Canonical source is never a runtime mirror. `automation/build-runtime.ps1` compiles platform-neutral core and grouped capabilities into native flat runtime layouts under ignored `build/<platform>/`. Installation copies those outputs to global runtime homes.

Core and capability hashes must match across platforms. A named platform overlay is the only allowed semantic delta. Project `.agents` and `.codex` directories are thin pointers/configuration, not global mirrors.
