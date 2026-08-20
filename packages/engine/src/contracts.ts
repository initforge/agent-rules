// Compatibility facade delegating to the canonical kernel contract entrypoint.
// Keep the type-only contract surface separate from the kernel root's runtime
// WorkLedger class so consumers cannot accidentally resolve two WorkLedger
// symbols with different meanings.
export * from '@initforge/agent-rules-kernel/contracts.js';
