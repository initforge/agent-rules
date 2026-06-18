# Clean Code Reference

## Purpose

This is the longer reference for pragmatic clean code.

Use it when refactor, cleanup, dead code removal, duplication control, or module split decisions need more than the always-on runtime rules.

## Core philosophy

Clean code is not the goal by itself.

It is a way to:
- reduce bug risk
- reduce blast radius
- reduce hidden dependency
- reduce future reading cost
- keep later changes cheaper and safer

Do not optimize for visual neatness if it increases scope, token cost, or regression risk.

## The right questions

Do not ask:
- "Is this code clean enough?"

Ask:
- "Does this area increase bug risk?"
- "Will this make the next edit harder?"
- "Does this force the model or human to read too much unrelated code?"
- "Does this create shared blast radius?"
- "Is there dead code, dead export, or dead flow here?"

## Cleanup classes

### 1. Opportunistic cleanup

Do it now when:
- it is tiny
- it is inside the exact area already being changed
- it does not change behavior
- it reduces risk or local confusion

Examples:
- remove unused local variable
- remove same-file dead helper
- rename unclear local variable
- extract one nested block

### 2. Guarded refactor

Do it only with:
- plan
- blast-radius check
- clear verification
- explicit scope boundary

Examples:
- split module
- move shared logic
- internal API change
- remove painful duplication

### 3. Dead code cleanup

Do it when "dead" is proven, not guessed.

Evidence sources:
- GitNexus callers/import impact
- `rg`
- tests/runtime path checks
- deprecation trail if needed

### 4. Cosmetic cleanup

Usually skip.

Examples:
- style-only renames
- broad DRY chase
- unrelated file split
- rewrite for beauty

## GitNexus-assisted refactor

Use GitNexus before:
- delete
- rename
- move
- split shared modules
- remove public exports

GitNexus answers:
- who calls this
- what depends on this
- whether the symbol is shared
- what execution flows are affected

Fallback:
- `rg`
- targeted file reads

## What is worth investing in

High-value cleanup:
- dead code cleanup
- dead export cleanup
- giant-file reduction in hot areas
- side-effect isolation from pure logic
- duplicate reduction where repetition is already painful
- hidden dependency reduction
- better context packets
- better verification contracts

Low-value cleanup:
- broad style churn
- abstraction too early
- DRY with weak evidence
- large rename waves without payoff

## Plan requirements for cleanup/refactor

A cleanup/refactor plan should say:
- objective
- allowed cleanup
- forbidden cleanup
- dead code candidates
- refactor boundary
- blast-radius evidence
- verification

Good objective:
- remove dead export from shared module
- split payment gateway orchestration from controller
- isolate side effects from mapper

Bad objective:
- clean up this area
- refactor for readability
- improve architecture generally

## Pre-done checklist

Before marking done, ask:
- correctness still holds?
- dead code introduced?
- unused export introduced?
- duplicate logic increased?
- hidden dependency increased?
- scope drift happened?
- shared callers rechecked?
- verification depth matches risk?

## Trigger guidance

Use this reference when:
- the user explicitly asks to refactor or clean up
- dead code removal is part of the task
- bug or feature work exposes duplicated or dangerous local structure
- shared module work needs deletion/rename/move decisions
