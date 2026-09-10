# Continuity and Handoff

This directory is the persistent handoff surface for future agents and developers. It complements the code; it does not replace inspecting the repository, current branch, uncommitted diff, and relevant tests.

Update these files whenever a substantial requirement, architectural decision, implementation milestone, workflow change, or unresolved blocker occurs. The purpose is to let the next model/developer understand the product goal, current implementation, why important decisions were made, what remains, and exactly where to continue without depending on private chat history.

Keep entries concise and durable. Do not create a diary or a file for every small action.

- [Current State](./current-state.md) — verified product and implementation snapshot.
- [Requirements and Invariants](./requirements-and-invariants.md) — intended direction and rules that must remain true.
- [Active Work](./active-work.md) — next steps, proof gaps, and known discrepancies.

When a flow changes materially, update its topical flow document and summarize the continuation-relevant consequence here. Record dates and commit hashes only when they identify a useful boundary; never invent a commit for uncommitted work. If code and intent diverge, preserve both facts and record the gap in Active Work instead of silently choosing one.

## Required handoff discipline

A working agent should update continuity documentation as part of completing substantial work. Before handing work onward, ensure these files reflect the current goal and invariants, substantial requirements, implementation milestones, flow changes, tests/acceptance evidence actually run, unresolved blockers, and the next concrete continuation point.

Do not copy large implementation dumps here. Link to topical docs and let code/tests remain authoritative for implementation detail.

## Handoff reading order

1. Read this directory.
2. Inspect `git status`, the current branch/HEAD, and the relevant source/tests.
3. Read the topical docs from [`docs/README.md`](../README.md).
4. Reconcile documentation claims with current code and the invariants here before changing behavior.
5. Update this directory before handing the task onward.
