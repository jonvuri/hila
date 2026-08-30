---
title: Phase 11 Stage 1 — Durability inventory
kind: evidence
state: complete
updated: 2026-08-29
---

# Phase 11 Stage 1 — Durability inventory

This is the review companion for
[Phase 11 Stage 1](Phase-11.md#stage-1--current-schema-durability-inventory). The executable
[durability manifest](../../src/core/durability-policy.ts) and its
[focused inventory test](../../src/core/durability-policy.test.ts) generate the fresh application
schema from SQLite, provision the root dynamic data table, and compare the result with the policy.

SQLite creates `sqlite_sequence` for its own `AUTOINCREMENT` bookkeeping. The report excludes
`sqlite_*` engine tables. They are not application state and must not enter changesets.

## Classification summary

The fresh application schema has 17 fixed tables with 83 fixed columns, plus one dynamic table
family. The manifest classifies 51 fixed columns as replicated source, 14 as derived, and 18 as
device-local. All physical dynamic data columns are replicated source. Stage 2 added the stable
filter-order field identified by this review.

| Table                 | Class             | Columns                                                                                                               | Logical identity                   |
| --------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `plugins`             | replicated source | `id`, `name`, `version`, `enabled`, `metadata`                                                                        | `id`                               |
| `matrix`              | replicated source | `id`, `title`, `source_plugin_id`, `owner_matrix_id`, `owner_row_id`                                                  | `id`                               |
| `matrix_columns`      | replicated source | `id`, `matrix_id`, `name`, `type`, `display_type`, `order`, `options`, `formula`, `constraints`, `managed_by`, `role` | `id`                               |
| `joins`               | replicated source | `source_matrix_id`, `source_row_id`, `target_matrix_id`, `target_row_id`, `kind`, `edge_key`                          | source and target node identities  |
| `face_configs`        | replicated source | `id`, `face_type_id`, `matrix_id`, `query`, `slot_bindings`, `settings`, `created_by_plugin`                          | `id`                               |
| `promoted_nodes`      | replicated source | `matrix_id`, `row_id`                                                                                                 | node identity                      |
| `block_sources`       | replicated source | `marker_matrix_id`, `marker_row_id`, `kind`, `sql`                                                                    | marker identity                    |
| `face_slot_bindings`  | replicated source | `face_config_id`, `slot_name`, `column_id`                                                                            | face config and slot               |
| `face_sort_config`    | replicated source | `face_config_id`, `column_id`, `direction`                                                                            | face config                        |
| `face_filter_configs` | replicated source | `id`, `face_config_id`, `column_id`, `operator`, `value`, `order`                                                     | stable filter UUID                 |
| `mx_<matrix-id>_data` | replicated source | stable `id` plus every physical, non-formula column declared by `matrix_columns`                                      | `id`                               |
| `closure`             | derived           | `ancestor_matrix_id`, `ancestor_row_id`, `descendant_matrix_id`, `descendant_row_id`, `depth`                         | ancestor and descendant identities |
| `scroll_index`        | derived           | `global_lexkey`, `matrix_id`, `row_id`, `depth`, `is_ghost`, `lazy`                                                   | appearance-path key                |
| `formula_column_deps` | derived           | `formula_col_id`, `dep_col_id`                                                                                        | formula and dependency column IDs  |
| `_sync_state`         | device-local      | `key`, `value`                                                                                                        | `key`                              |
| `_sync_changelog`     | device-local      | `seq`, `device_id`, `timestamp`, `table_name`, `row_id`, `operation`, `data`                                          | replica-local `seq`                |
| `_sync_conflicts`     | device-local      | `id`, `table_name`, `row_id`, `winner`, `losing_data`, `winning_data`, `detected_at`, `resolved`                      | replica-local `id`                 |
| `_sync_applying`      | device-local      | `flag`                                                                                                                | singleton flag                     |

`face_configs.slot_bindings` is the one fixed-table exception to its table class. It is a derived,
obsolete JSON compatibility copy. `face_slot_bindings` is the source of truth. Stage 2 excluded the
JSON copy when it generated trigger columns from the manifest.

`matrix.title` remains replicated because it is authoritative for ordinary and dedicated
matrixes. For a promoted type's owned matrix, the same field is a display cache derived from the
owner label. Replicating the shared field preserves current user-visible behavior; rebuild or
validation may overwrite only the promoted subset.

## Durable owners

- User-authored row content and stable row identity live in dynamic matrix data tables.
- Matrix and column metadata, including plugin provenance, constraints, roles, formulas, and
  ordering, live in `matrix`, `matrix_columns`, and `plugins`.
- Ownership, references, portals, and position truth live in `joins`.
- Matrix ownership lives in `matrix.owner_matrix_id` and `matrix.owner_row_id`.
- Promoted type identity lives in `promoted_nodes`.
- Saved-view marker identity is a normal matrix row; its position lives in `joins` and its SQL lives
  only in `block_sources`.
- Face recipes and plugin metadata live in the face-config tables and `plugins.metadata`.

No user-authored or user-visible durable field lacks an intended replicated owner. Stage 2 aligned
tracking and remote apply with that intent; Stage 4 owns the complete two-replica proof.

## Derived and local state

`closure` and `scroll_index` rebuild from `joins`. `formula_column_deps` rebuilds by parsing
`matrix_columns.formula`; remote schema apply must refresh it. Reactive query caches, prepared
results, worker queues, worker subscription state, editor state, focus stacks, sticky ancestry,
drag state, and open panels live in memory or the DOM and are intentionally session-local.

No device-local user preference is proposed. `_sync_state`, `_sync_changelog`, `_sync_applying`, and
`_sync_conflicts` are local sync-engine state, not preferences. A conflict detected on one replica
therefore remains visible only on that replica until a future conflict product defines shared
semantics.

## Identity and delete review

- `joins`, `promoted_nodes`, `block_sources`, and `face_slot_bindings` use full logical-key upsert
  and delete. Replica-local `rowid` is invalid for them.
- `face_sort_config` uses the stable face-config UUID as its key.
- Stage 1 found that `face_filter_configs.id` used a replica-local integer sequence as both identity
  and order. Stage 2 replaced it with a stable UUID and explicit `order` field.
- Dynamic rows, matrixes, and columns use stable random integer IDs. Plugins use stable text IDs;
  face configs use UUIDs.
- Delete records for every composite-key source table carry the old logical key. Child deletes
  precede parent deletes when foreign keys require it.
- Changesets retain source sequence so later mutations supersede earlier ones. That sequence is
  dependency-valid because each source operation committed in order. Structural caches rebuild
  after the batch.
- `INSERT OR REPLACE` on `face_configs` can cascade-delete normalized children. Stage 2 replaced
  that apply path with logical-key upsert so replacement side effects are not treated as intent.

## Stage 2 repair inputs

At the Stage 1 handoff, the reviewed manifest confirmed the known omissions and added three
discovered requirements:

1. Track matrix ownership, promoted nodes, and block sources.
2. Generate fixed-table trigger columns from the manifest and exclude derived
   `face_configs.slot_bindings`.
3. Apply every composite-key table by logical identity and record old keys for deletes.
4. Repair stable identity and ordering for `face_filter_configs`.
5. Rebuild formula dependencies after remotely applying formula metadata, in addition to rebuilding
   structural caches after `joins` changes.
6. Preserve dependency-valid source operation order during apply without local echo changes.

The Stage 1 tests intentionally stop at schema-to-policy coverage. Stage 3 adds failure controls,
installed-trigger comparison, and dynamic schema-mutation guards.
