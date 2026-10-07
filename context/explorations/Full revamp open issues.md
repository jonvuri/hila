---
title: Full revamp — open issues
kind: working-artifact
state: active
updated: 2026-10-07
---

# Full revamp — open issues

Consistency issues and gaps in [Full revamp changes](Full%20revamp%20changes.md) that remain after
the [operation log](Full%20revamp%20operation%20log.md). The operation log resolves row identity
across merges, splits, and moves between matrixes; undo and provenance for automated changes; and
idempotent plugin effects across replicas.

## Resolved in discussion, not yet in the changes doc

### Cycle rules

Replace the current cycle section with:

- **Position graph (`own` ∪ `portal`) is acyclic.** A node cannot be positioned, by home or
  portal, under itself or any of its positional descendants.
- **Lifecycle graph (`own` ∪ `attach` ∪ matrix membership) is acyclic.** Membership counts as an
  edge from a matrix node to each member, because deleting a matrix deletes its members. A node
  cannot be owned by or attached to itself or any node that depends on it through any chain of
  these edges. This covers attach cycles of any length, mixed `own`/`attach` cycles, and a matrix
  node homed under one of its own members.
- **Gathered appearances get a render guard.** View results and a matrix's elsewhere-homed members
  are not positions. A node already on the current appearance path renders as an opaque indicator
  that shows only its identity and cannot be expanded or interacted with.
- **Enforcement.** Check both graph rules when an edge is created or moved by walking up from the
  new parent. The lifecycle check needs a maintained lifecycle closure or a bounded upward walk.

### Naming

- Keep **role** for columns.
- Rename matrix-level roles to **designations**: default item designation and aspect designation.
- Move "collapsed" out of designations into a matrix **display setting**.

## Consistency issues

- **Membership lifecycle.** The edge section should state that deleting a matrix deletes its
  members, including members homed elsewhere and their positional subtrees.
- **Alias uniqueness.** Matrix and view labels must be usable SQL aliases. Decide between global
  uniqueness, uniqueness among aspect matrixes with qualified names elsewhere, or stored SQL that
  references IDs and renders aliases. The last is the most robust against renames.
- **Is-a query results.** For "tasks under Project X", decide whether a result is the host node or
  the attached row. Writable fields come from the attached row; identity comes from the host.
- **Direct and attached types together.** State that a task row under X and a bullet under X with
  an attached task both count as tasks under X.
- **Portals in positional queries.** Decide whether a node portaled under X is under X.
- **Plugin-created matrix homes.** Plugins are not nodes. Decide where their matrixes are homed.
- **Two bottom regions.** Order collapsed matrixes and the elsewhere-homed member view.
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
