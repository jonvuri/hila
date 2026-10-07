---
title: Full revamp — operation log
kind: working-artifact
state: proposed
updated: 2026-10-07
---

# Full revamp — operation log

Companion to [Full revamp changes](Full%20revamp%20changes.md). It proposes a lightweight operation
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
