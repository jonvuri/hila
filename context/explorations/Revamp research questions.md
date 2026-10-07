---
title: Revamp research questions
kind: working-artifact
state: active
updated: 2026-10-07
---

# Revamp research questions

Research queue for the [full revamp exploration](Revamp%20exploration%20guide.md). The
[architecture proposal](Revamp%20architecture%20proposal.md) holds the current proposal. The
[operations and recovery proposal](Revamp%20operations%20and%20recovery.md) proposes identity lineage, undo, provenance,
and idempotent plugin effects; its open questions still need resolution and validation.

The revised position/lifecycle cycle rules and matrix designation terminology are now incorporated
in the changes document. Collapse is a provisional display setting; its behavior remains open.

## Next session: plugin semantics and storage

Selected by the user as the next connected question cluster. Begin with concrete scenarios and
follow their semantic and storage requirements before designing plugin APIs.

### Starting scenarios

- Turn a bullet under a project into a task with status and due date. Also create a task directly
  in its matrix. Explore how the plugin recognizes both, where fields live, and what a query for
  tasks under that project returns.
- Turn a note's label and content into a study card. Explore how the plugin reads those fields,
  where scheduling state lives, and what happens when the host or plugin is removed.

### Questions and intended outcome

- How does a plugin declare meaning and eligibility? Distinguish storage types, column roles,
  matrix designations, user enrollment, and role multiplicity.
- How are fields bound across a host and attached rows? Compare the identity and write targets
  required for direct rows and attached aspects without assuming the answer.
- Which data belongs on user rows, attached rows, or plugin-created matrixes? Consider lifecycle,
  plugin removal, schema evolution, and system/user writes under whole-row last-write-wins.
- Where are plugin-created matrixes homed and how are they found? Use those requirements to inform
  provisional collapse and display settings; defer unrelated presentation details explicitly.

Aim for a coherent proposed semantic and storage model traced through these scenarios, with
rationale, inherited assumptions reviewed, and remaining choices recorded. Do not implement plugin
APIs or attempt to resolve every plugin and widget question in this session.

### Read first

Read the plugin, designation, attachment, and use-case sections of the
[architecture proposal](Revamp%20architecture%20proposal.md), then the semantics/plugins and
systems/sync questions below. Consult [operations and recovery](Revamp%20operations%20and%20recovery.md)
for automation assumptions. Read baseline `Plugins.md`, `Data-Model.md`, `Sync.md`, and relevant
code only as evidence needed by a specific question.

## Consistency issues

- **Alias uniqueness.** Matrix and view labels must be usable SQL aliases. Decide between global
  uniqueness, uniqueness among aspect matrixes with qualified names elsewhere, or stored SQL that
  references IDs and renders aliases. The last is the most robust against renames.
- **Is-a query results.** For "tasks under Project X", decide whether a result is the host node or
  the attached row. Writable fields come from the attached row; identity comes from the host.
- **Direct and attached types together.** State that a task row under X and a bullet under X with
  an attached task both count as tasks under X.
- **Portals in positional queries.** Decide whether a node portaled under X is under X.
- **Plugin-created matrix homes.** Plugins are not nodes. Decide where their matrixes are homed.
- **Collapse, placement, and plugin data.** Explore collapsed matrixes, collapsed inline results,
  and the elsewhere-homed member view together with plugin-created matrix homes. Decide what
  should be de-emphasized, how users find it, whether bottom regions are needed, and the scope,
  defaults, overrides, and persistence of display settings.
- **Tabular presentation.** The personal database use case needs a table arrangement for a matrix
  node's members. The changes doc defines block widgets but not a matrix's own presentation.
- **Capability gating.** State as a principle that behavior is gated by roles and capabilities,
  never by matrix identity or literal column names.

## Gaps

### Semantics and plugins

- **Plugin scope.** Passive scope by column type enrolls matrixes by storage shape. Resolution in
  progress.
- **Role vocabulary.** How a column gets a role, who defines role names, whether core roles are
  shared, and how values are interpreted (which statuses mean done).
- **Role multiplicity.** SRS forward and reverse cards, or start and due dates, need one role more
  than once per matrix.
- **Host fields through attachments.** SRS cards over bullets read the host's label and content
  while card state lives in an attached row. Plugin roles must reach host fields through the
  attachment.
- **Widget composition.** Field widgets replace the default view. Define precedence when two
  plugins target one field, additive slots such as an inline completion checkbox, and where block
  widgets may appear relative to the stream's single paged sequence.
- **Plugin trust and network access.** User-written plugins with web ingestion need a sandbox and
  permission model, or an explicit decision that plugins are trusted.
- **Plugin removal and schema evolution.** Define what happens to roles, designations, systems, and
  plugin matrixes when a plugin is removed or changes its role set.

### Systems and sync

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
