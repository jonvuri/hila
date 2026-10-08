---
title: Revamp operations and recovery
kind: working-artifact
state: proposed
updated: 2026-10-08
---

# Revamp operations and recovery

Companion to [the architecture proposal](Revamp%20architecture%20proposal.md). It proposes a lightweight operation
log that gives introspection, recovery, and undo across identity-changing, bulk, automated, and
structural operations. It does not track field-level history. Conflict resolution stays whole-row
last-write-wins.

## Goals

- Make merges, splits, and moves between matrixes traceable and recoverable.
- Attribute and undo automated changes from plugin systems and agents.
- Undo user-initiated structural edits in the outline.
- Make plugin system effects idempotent across replicas.
- Stay small: no field history, no branching, no history merging.

## Layers of undo

| Layer          | Covers                                                                | Lifetime                                 |
| -------------- | --------------------------------------------------------------------- | ---------------------------------------- |
| Editor history | Text changes inside one mounted ProseMirror editor                    | Until the editor unmounts or resyncs     |
| Operation log  | Structural, identity-changing, bulk, automated, and delete operations | Durable, replicated, pruned by retention |

### Editor history

Each mounted label and content editor keeps the ProseMirror `history()` plugin. It handles
fine-grained text undo while the user types in one field. It is cheap, local, and not durable.

Known limits to fix or accept:

- Bind undo and redo keys explicitly instead of relying on browser `beforeinput` handling.
- History is lost when an editor unmounts, for example when it leaves the retained range.
- History is lost when an unfocused editor receives an external update and its state is replaced.
  Prefer applying external updates as transactions that keep history, or accept the loss.

### User-initiated structural edits

Enter-split, Backspace-merge, indent, outdent, drag, move, delete, and aspect creation are typed
worker operations, not editor transactions. Log each one as a lightweight operation so that one
undo stack covers outline gestures.

- Split and merge also record lineage, because they change identity.
- Indent, outdent, and moves record before snapshots of the affected edges only.
- Undo routing: when the focused editor has history for the most recent action, the editor undoes
  it. Otherwise undo applies to the most recent logged operation by this user in this session.
  The exact interleaving rule needs a prototype.

## What gets logged

- Identity-changing operations: merge, split, and converting or moving a row between matrixes.
- Bulk operations.
- Every automated operation from plugin systems and agents.
- Deletions, which gives a recoverable trash.
- User-initiated structural edits, as above.

Not logged: ordinary field edits and typing. Editor history covers those while the editor is
mounted.

## Plugin mutation boundary (provisional)

All plugin writes, including authorized global-plugin changes to user data, go through a managed
operation that wraps the mutations and their log record in one transaction. Structural invariants
and helper-matrix managing-plugin guards apply inside that boundary. A transaction or log entry
alone does not grant write authorization.

Distinguish the executing plugin from the initiating user or agent for attribution and write
checks. User-triggered plugin controls can write the plugin's helpers while retaining the user's
provenance. Applying a plugin supplies ongoing authorization to use its pivot; no per-operation
user approval is required in that application scope. Global execution needs authorization for
each operation changing user-managed data, including a bounded batch or direct user command.
A plugin's own managed-store updates retain normal manager authority, including background work.

The operation boundary enforces the actual scope. Matrix scope follows row membership rather than
outline ancestry; it does not silently grant writes to attached hosts or unrelated matrixes.
Binding columns are inputs, not field-level write permissions. Normal core invariants and other
plugins' manager guards still apply. Global execution cannot inherit standing authority merely
because the same plugin also has matrix applications. Logging alone does not authorize a write.

Core deletion cascades operate above the ordinary helper writer guard. Authorize the initiating
operation, then follow its lifecycle dependencies without checking the writer separately for every
managed helper. Explicit application/plugin removal likewise uses a core lifecycle operation to
clear the relevant live records and managed stores, even when plugin code is not executing. Global
off retains stores; reset clears managed global state. Ordinary ad hoc helper edits/direct deletions
still follow their writer check. Keep the cascade in the core operation's transaction and provenance.

Recommended follow-through, not yet explicitly agreed: core undo/restore recovers managed helpers
and their management metadata without requiring the managing plugin to execute. Settle this with
the broader recovery contract, including restoration after uninstall and preservation of graph
invariants; do not implement an arbitrary caller-controlled guard bypass.

## Shape

```text
op:      id, actor (user | plugin:<id>/<system> | agent:<id>), kind, created_at,
         idempotency_key?, summary
lineage: op_id, from_node → to_node,
         relation (merged_into | split_into | moved_to | created_by | deleted)
before:  op_id, node, snapshot (full-row JSON plus its edges)
```

- `op` and `lineage` are small and kept indefinitely. They answer "where did this come from?"
  and "what happened to that?"
- `before` snapshots make undo possible and are pruned after a retention window.
- The sync triggers already write full-row JSON snapshots to `_sync_changelog`. An operation could
  tag the changelog rows it produces with its op ID and reuse them as before snapshots, if their
  retention can outlast sync. Verify this before adding a separate snapshot table.

## Identity across merges and splits

- Rewrite edges (`joins`) eagerly inside the operation's transaction. They are system rows.
- Resolve references inside prose and stored SQL lazily through lineage. A dangling reference
  follows `merged_into` or `moved_to`. For a split it follows the primary target or asks which one
  was meant. A background fixup may rewrite them later without blocking the operation.

## Undo

Undoing an operation restores its before snapshots in one new logged operation. A row changed
after the original operation is skipped and reported instead of overwritten. This matches the
honesty of last-write-wins without a merge engine.

## Idempotent plugin systems

1. Each system effect carries an idempotency key:
   `hash(plugin, system, trigger identity, occurrence)`. For example, a row ID and
   "2026-10-07 daily prompt".
2. Rows created by a system take IDs derived from that key. Two offline replicas that create the
   same occurrence produce the same row ID, and sync converges on one row.
3. Systems set values and never increment them. A streak is recomputed from check-ins.
4. Local effects, such as notifications, check the synced log for the key before firing. Offline
   duplicates remain possible and are acceptable for personal use.

### Actual events, derived output, and application identity

The exploration accepts distinct IDs for independent actual reviews and point-in-time dismissals.
Replaying the same event retains its ID; two independent offline actions must not collapse into
one event merely because they concern the same card or suggestion. Deterministic occurrence IDs
above serve a different purpose: duplicate generation of the same system effect.

Scheduling idempotently recomputes from the combined review state after sync, updating in place
as if both reviews had occurred on one client. Durable events remain the inputs; a persisted
last-write-wins schedule cannot replace recomputation from the current inputs. Event ordering and
scheduling algorithms are plugin business logic. Likewise, dismissal events survive sync/refresh;
the second-brain plugin decides when changed content becomes a new generation and how prior
dismissals apply to it. Content-generation policy is not sync conflict resolution.

Each matrix application instance has its own identity. Removal revokes that identity and removes
its live system record/helpers; reapplication uses a new identity. Writes targeting a removed
identity are discarded and cannot revive old stores or affect the new application. Removal
tracking across replicas, recomputation triggers, and concurrent application setup remain
implementation questions in the broader replication design.

## Durability

| Data                              | Class                              |
| --------------------------------- | ---------------------------------- |
| `op`, `lineage`, idempotency keys | Replicated source of truth         |
| `before` snapshots                | Replicated, pruned after retention |

## Boundaries

- No per-field history, branching, or history merging.
- Undo covers only logged operations within the retention window.
- Logging lives in the typed operation layer, the only write path. Plugins and agents cannot skip
  it.

## Open questions

- Retention window length, and whether it differs for automated and user operations.
- Whether `_sync_changelog` snapshots can serve as before snapshots.
- How a split chooses its primary target for lazy reference resolution.
- How undo behaves for an operation that another device performed.
- The exact rule that interleaves editor history with the operation log.
