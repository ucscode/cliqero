# Continuity and Handoff

This directory is the persistent handoff surface for future agents and developers. It complements the code; it does not replace inspecting the repository, current branch, and uncommitted diff.

Update these files when a substantial requirement, architectural decision, implementation milestone, workflow change, or unresolved blocker occurs. Keep entries concise and durable. Do not create a diary or a file for every small action.

- [Current State](./current-state.md) — verified product and implementation snapshot.
- [Requirements and Invariants](./requirements-and-invariants.md) — intended direction and rules that must remain true.
- [Active Work](./active-work.md) — next steps, proof gaps, and known discrepancies.

When a flow changes materially, add or update a focused note and link it from this index. Record dates and commit hashes only when they identify a useful boundary; never invent a commit for uncommitted work. If code and intent diverge, preserve both facts and record the gap in Active Work.

## Handoff reading order

1. Read this directory.
2. Inspect `git status`, the current branch, and the relevant source/tests.
3. Read the topical docs from [`docs/README.md`](../README.md).
4. Update this directory before handing the task onward.
