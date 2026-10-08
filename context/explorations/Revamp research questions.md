---
title: Revamp research questions
kind: working-artifact
state: active
updated: 2026-10-08
---

# Revamp research questions

Research queue for the [full revamp exploration](Revamp%20exploration%20guide.md). The
[architecture proposal](Revamp%20architecture%20proposal.md) holds the current proposal. The
[operations and recovery proposal](Revamp%20operations%20and%20recovery.md) proposes identity lineage, undo, provenance,
and idempotent plugin effects; its open questions still need resolution and validation.

The revised position/lifecycle cycle rules and matrix designation terminology are now incorporated
in the changes document. Collapse is a provisional display setting; its behavior remains open.

## Next session: attachment context and editor/query behavior

Session 3 is queued. Explore the shared attachment model through task scenarios, using the
accepted plugin application/store model rather than reopening helper placement or SRS sourcing.

### Starting scenarios

- A note under Project X contains two inline `#Tasks` sigils for different actions. Show both in a
  task queue, complete only one, and open each task's exact prose context.
- A project task attached to that note has its own attached subtasks. Compare nested attachments
  with subtasks positioned through `own`; trace which results appear in "tasks under Project X."
- Copy, move, or remove one sigil, including moving its surrounding prose to another note. Distinguish
  another mention of the same task, a new task, reattachment, detachment, and deletion.

### Questions and intended outcome

Define token-to-attachment linkage, context boundaries, task versus host result identities,
grouping/multiplicity, nested discovery, and explicit editing targets. Preserve independent task
IDs/statuses and optional labels without copying host prose or labels. State which actions alter
relationships and which only alter inline mentions. Test host/task deletion against the lifecycle
rules, and record remaining ambiguities explicitly.

Aim for coherent gesture-to-query behavior for these scenarios, with accepted rules and concrete
examples in this folder. Do not implement editor changes or design a general attachment framework
before the scenarios require it. Core recovery/replication, widget composition, collapse, and runtime
budgets remain later clusters; plugin-specific scheduling/content-generation algorithms are deferred.

### Read first

Read the [working attachment examples](Revamp%20plugin%20semantics%20and%20storage.md#worked-attachment-examples)
and the brief's [identity/context discussion](Revamp%20plugin%20semantics%20and%20storage.md#attachments-identity-and-labels),
then node labels, insertion, edges, and use cases in the
[architecture proposal](Revamp%20architecture%20proposal.md). Use the consistency issues below to
check combined-object results and direct/attached types. Consult baseline
[Data model](../Data-Model.md), [Design](../Design.md), [Query spec](../Query-Spec.md), and
attachment/editor code only for evidence needed by a question.

## Completed session: plugin semantics and storage

Session 2 established the [application/store model](Revamp%20plugin%20semantics%20and%20storage.md)
through tasks/recurrence, direct SRS, second-brain suggestions, and global capture/ingest.
Explicit per-application input bindings and status meanings support existing or freshly configured
matrixes. Application/helper linkage uses a narrow system table; business data lives in matrixes.
One application per plugin/pivot pair allows multiple different plugins on a pivot.

Pivot helpers use ordinary `own` homes beneath their pivots; global stores are root-homed. Matrixes
may position their own member rows, matrix nodes, and view nodes, excluding foreign-matrix rows.
Only user-managed matrixes are designation-eligible. Manager guards protect ordinary helper writes;
core deletion cascades operate above them. Removal/uninstall clears managed data; reapplication is
fresh. Global off retains stores, while reset/removal clears them. User-managed data remains.

Application authorizes ongoing pivot use; global user-data writes need per-operation authorization.
Reads are unrestricted, but global discovery scans user-managed matrixes. Independent review and
dismissal events survive sync, schedules recompute, and writes to removed application identities
are discarded. Content-generation/scheduling algorithms are plugin business logic. Basic SRS reads
each card's own bound front/back fields and needs no attachment or host sourcing.

The basic model is settled in the exploration, not implemented. Shared attachment/editor/query
semantics are queued above. Core recovery/replication enforcement, concurrent setup, compatibility
and invalid-configuration behavior, widget composition, and runtime work remain in the gaps below.
Visual clutter is deferred while working with the accepted positions and matrix-child rule.

## Consistency issues

- **Alias uniqueness.** Matrix and view labels must be usable SQL aliases. Decide between global
  uniqueness, uniqueness among aspect matrixes with qualified names elsewhere, or stored SQL that
  references IDs and renders aliases. The last is the most robust against renames.
- **Combined-object query results.** The host provisionally supplies identity and positional
  context, while the aspect keeps its stored identity and writable fields. Define result shape,
  grouping/deduplication, and behavior when one host has several matching attachments. Task queues
  need distinct task write targets even when host-oriented results group them together.
- **Direct and attached types together.** State that a task row under X and a bullet under X with
  an attached task both count as tasks under X.
- **Portals in positional queries.** Decide whether a node portaled under X is under X.
- **Matrix-child rule and presentation.** The narrower positional rule is accepted for `own` and
  `portal`: member rows, matrix nodes, and view nodes are allowed; foreign-matrix rows are not.
  Matrix-parent context governs inserted row types. Pivot helpers are owned beneath the pivot;
  global stores are root-homed. Test concrete outline/table presentation without adding special
  root categories in advance. See the
  [accepted rule](Revamp%20plugin%20semantics%20and%20storage.md#narrower-matrix-child-rule).
- **Collapse and matrix focus.** Aspect designation does not justify automatic collapse. Set aside
  implicit root grouping as the current recommendation. Define how a matrix presents its owned
  outline, table, and elsewhere-homed members; avoid unwanted duplicate appearances when the
  default item matrix becomes the everyday starting point. Broader display settings remain open.
- **Tabular presentation.** The personal database use case needs a table arrangement for a matrix
  node's members. The changes doc defines block widgets but not a matrix's own presentation.
- **Capability gating.** State as a principle that behavior is gated by roles and capabilities,
  never by matrix identity or literal column names.

## Gaps

### Semantics and plugins

- **Plugin application.** Per-application column-ID binding, flexible input shapes, and configurable
  status meaning are provisionally agreed. Ineligible inputs report invalid configuration until
  manual repair. Define optional/repeated inputs, compatibility/suspension and repair behavior,
  enforcement of unique application/helper identities during concurrent setup. Reapplication has a
  fresh application identity and old-identity writes are discarded. Bindings
  and associations are durable system records; business data stays in matrixes. One plugin has at
  most one application per pivot, while multiple plugins may share a pivot. Passive plugins remain
  a possible later capability, not a gap in this explicit-application model.
- **Managed helpers and lifecycle.** A central managing-plugin write guard is provisionally agreed.
  Dedicated helpers are deleted on explicit application removal/undo or pivot deletion. Define
  card/task history retention during ordinary row deletion and recovery of removed state. Application
  removal deletes its record/helpers; uninstall deletes all managed plugin stores; reapplication is
  fresh. Global off retains stores, while reset/removal clears them. User-managed data survives as user data. Core deletion cascades outrank the ordinary writer guard; undo/restore
  treatment is a recovery follow-through. Only user-managed matrixes qualify for default/aspect
  designations, regardless of creator. Ordinary logged writes do not bypass another plugin's guard.
- **Input semantics and core roles.** Per-application plugin inputs avoid assuming a universal
  role vocabulary. Clarify their relationship to core label/content roles and compatibility checks.
  Define handling for new status values beyond the selected per-application mapping.
- **Input multiplicity.** SRS forward/reverse cards and multiple date/prose inputs must fit the
  flexible input shape without duplicating core role assignments or card prose.
- **Task context through attachments.** The host supplies positional/prose context; each task can
  have its own optional label, with no copied text and explicit edit targets. This supersedes
  tentative host-label precedence. Define token-to-task linkage, context boundaries, token removal,
  detachment, and nested discovery while preserving aspect storage IDs. Basic SRS uses a card's
  own bound columns. The earlier host-sourced SRS assumption is not a required capability; revisit
  it only if a concrete expanded scenario is requested.
- **Widget composition.** Field widgets replace the default view. Define precedence when two
  plugins target one field, additive slots such as an inline completion checkbox, and where block
  widgets may appear relative to the stream's single paged sequence.
- **Plugin trust and network access.** User-written plugins with web ingestion need a sandbox and
  permission model, or an explicit decision that plugins are trusted.
- **Plugin evolution.** Uninstall clears application records and managed stores; user-managed data
  is retained regardless of creator. Define upgrade behavior for changed input contracts/helper
  schemas separately from clean removal; no upgrade protocol is specified yet.

### Systems and sync

- **Read/discovery and write scope (settled).** Scope-based write authorization is settled: matrix application grants
  ongoing use of the pivot; global writes to user-managed data need per-operation authorization.
  Own managed-store writes retain manager authority without per-write approval. Global user-data
  reads remain broad. Managed-store reads are unrestricted, but second-brain and similar global
  discovery plugins scan user-managed matrixes only; deliberate cross-plugin reads need semantic
  understanding, not another read permission mechanism.
  All writes remain transactional/logged, and ordinary manager guards/core invariants still apply.
- **Application replication enforcement.** Each application instance has its own identity;
  reapplication is fresh and writes to removed identities are discarded. Specify removal tracking
  across replicas, including application-scoped writes to pivots, and concurrent setup of the same
  plugin/pivot under the one-application constraint. Live removed application records stay cleared.
- **Durable plugin events and derivation (semantics settled).** Independent reviews and dismissals
  get distinct IDs and survive sync; replay keeps the event ID. Schedules recompute idempotently
  from merged review state, consistently with one-client processing. Specify recomputation triggers
  and invalidation so stale persisted output cannot remain authoritative. Scheduling and the
  second-brain's content-generation/dismissal policies belong to plugin business logic.

- **Operation log and recovery.** Resolve the operation log's retention, split-target,
  cross-device undo, and editor/structural undo questions. Define how partial undo preserves graph
  invariants and how lineage resolves references in stored SQL. Current update tracking in
  `src/core/sync.ts` records after-images, so tagging those records alone cannot supply before
  snapshots. Verify a complete recovery strategy before treating the proposal as resolved.
- **Cycle enforcement.** Validate upward traversal or closure maintenance for both graphs,
  including portal parents and membership changes. Bound total traversal, not just immediate
  parent counts. Define behavior when a bound is reached and when individually valid offline
  changes form a cycle after replication.

- **Same-row conflicts.** Set-not-increment and deterministic IDs prevent duplicates, but a system
  write and a user edit to one row still lose one change under whole-row last-write-wins. Keep
  system state in separate rows, such as attached rows, or add field-level merging.
- **Loops and budgets.** Row-update systems that write rows can trigger themselves or each other.
  Define bounded queries, time and write budgets, cycle detection, and batching.
- **Background execution.** Scheduled reminders and prompts do not run while a local-first browser
  app is closed. Decide on service workers and push, or accept in-app-only schedules.
- **Derived second-brain data.** Embeddings, staleness, context load, and pattern caches need a
  durability class, a storage location, and bounded recomputation.

### Storage

- **Files and binary data.** SRS file parts, posters, and preview images need blob storage, sync,
  and quotas.

### Performance

- **Nested gathering.** Inline results and elsewhere-homed members with expandable subtrees, and
  views inside views, must fit the bounded paged sequence.
- **Depth limit.** `MAX_POSITION_DEPTH = 100` appears to drop deeper positions silently. Replace it
  with a reported limit or remove it.
- **Many distinct matrixes per page.** Bound hydration statements and schema loads for a page drawn
  from many matrixes.
- **Schema cache.** The per-matrix column cache must react to schema changes.
- **Non-keyed invalidation.** Per-row invalidation covers keyed records. View membership, counts,
  and aggregates need their own invalidation rule.
