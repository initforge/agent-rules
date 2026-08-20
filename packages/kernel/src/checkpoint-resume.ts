/**
 * Compatibility facade delegating to canonical kernel state for the historical
 * runner checkpoint entrypoint.
 *
 * Canonical implementation: `state/checkpoint-resume.ts`.
 * New consumers must import the state entrypoint or the kernel package root.
 * This facade remains until parity and delete review are complete.
 */
export * from './state/checkpoint-resume.js';
