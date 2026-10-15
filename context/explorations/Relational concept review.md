---
title: Relational concept review and next candidates
kind: working-artifact
state: proposed
updated: 2026-10-15
---

# Relational concept review and next candidates

Review at the checkpoint after [runtime sketches](Relational%20runtime%20sketches.md) and
[outline traces](Relational%20outline%20exploration.md). Separate a concrete user need from the older
mechanism chosen to serve it. Historical acceptance does not make a mechanism binding. Evidence below
is documentation and completed-plan evidence, not a fresh code audit or benchmark.

## What the older concepts served

### Named and placeable saved views

**Strong concrete use:** save a query such as Due cards, name it, return to it, link to it from prose,
and edit its query. The object must remain findable if the result is empty or the SQL breaks.

Evidence: [Decision 40](../Decisions.md#decision-40), [view contract](../Data-Model.md#views),
[Phase 11](../phases/Phase-11.md), and completed
[Phase 12 Session 7](../phases/Phase-12/Session-7-saved-view-authoring-and-editor-exits.md).
The latter records save/focus/name handoff and insert-reference behavior as completed work.

**Unproven mechanism:** a separate fundamental view-node type with mandatory outline ownership.
Stable saved-query identity and a way to place/reference it could serve the use without universal
homes. Distinguish placing the view object from ownership or reorderability of its result rows.

### Placeable matrices and containers

**Concrete use:** an empty table still needs a visible place to open, name, add its first row, configure
columns, and delete the collection. A project can provide access to Cards, Review history, and Due cards.
A shared task matrix must remain accessible even when its records appear in many notes.

Evidence: [matrix/container contract](../Data-Model.md#matrix-ownership-and-type-nodes),
[child sources](../Data-Model.md#child-sources), the container/empty-container discussion in
[Phase 9.7](../archive/phases/Phase-9.7.md), and the Cards/Review history/Due cards trace in
[plugin semantics](Revamp%20plugin%20semantics%20and%20storage.md#narrower-matrix-child-rule).

**Unproven mechanism:** every matrix must be a separately typed outline node with an owning parent,
or its navigation link must control the matrix lifetime. The use is supported; exact representation
and deletion scope need a new trace under placement/lifetime separation.

### Restrictions on matrix children

**Evidence limitation:** the earlier investigation explicitly reports that the originating proposal
specified members-only children without recording the rationale. Its explanation was reconstructed,
not recovered: keep one homogeneous immediate collection and predictable insertion. Later exploration
allowed matrix/view structural entries but still forbade foreign-matrix row children.

Source: [Why members-only matrix children?](Revamp%20plugin%20semantics%20and%20storage.md#why-members-only-matrix-children).
[Phase 9.7](../archive/phases/Phase-9.7.md) also documents the goal of one coherent child region and
homogeneous table rendering. These are real UI concerns, not proof of a global placement constraint.

**Assessment:** no need established for inheriting the blanket ban. Test a project mixing note,
task, and card records, then view a homogeneous subset as a table. Matrix extent, a record's outline
children, and a query result need not be identical sets. Explicit columns/defaults may solve the
presentation problem without restricting the graph. Do not assert the old rule was purposeless;
its original rationale is simply unavailable in the reviewed evidence.

### Label/content roles and creation defaults

**Strong concrete use:** one record behaves as a bullet and a longer note; a task or custom table
uses existing fields as its display title/content instead of copying them into fixed note columns.
Creation needs a predictable matrix and required values when Enter inserts a sibling.

Evidence: [Decision 3](../Decisions.md#decision-3) explicitly motivates label/content as the bridge
between bullet and document; [column roles](../Data-Model.md#matrixes-and-columns) records stable
column identity and editable display bindings. The [older proposal](Revamp%20architecture%20proposal.md)
records default-item designation and matrix/sibling insertion rules. The SRS worked trace binds
existing front/back fields by identity.

**Unproven mechanism:** a fixed two-column root workspace, exactly one global default matrix, root
placement granting aspect eligibility, or forbidding derived values from every presentation binding.
Separate displayable fields from writable fields. The new model must decide per-presentation bindings,
missing/derived field behavior, and creation rules; old restrictions are candidates, not defaults.

### Closure, scroll indexes, and batched data flow

**Strong concrete use:** scroll a large outline, expand/collapse, navigate across page boundaries,
show mirrors and inline query results, and edit one record without fetching or mounting the forest.

Evidence: [Decisions 23 and 24](../Decisions.md#decision-23),
[Virtualization](../Virtualization.md), and [Performance](../Performance.md). They document bounded
residency, path-versus-record identity, query-plan/work-count checks, and measured browser fixtures.
[Decision 39](../Decisions.md#decision-39) explains why derived caches remain rebuildable and local.

**Unproven mechanism:** reuse of the exact global ownership closure or pre-order scroll index, old
page sizes, or old fixture budgets as the revamp design. Acyclic placement makes finite traversal
easier but many mirror paths can still be expensive. Measure child, ancestor, reachability, focus,
search, and scroll queries against agreed fixtures before selecting caches. SQL batching addresses
real N+1 costs; it need not require the previous host architecture in full.

## Candidate next traces, pending user choice

1. **Placement integrity and discovery.** Decide acyclicity, trace the two-device cycle, parent SQL
   deletion, invalid placements, and Unplaced reattachment. Outcome: a clear boundary between
   content-preserving sync repair and data deletion, plus a precise discovery query.
2. **One mixed project across notes, outline, and table.** Use a project with a note, a task, a card
   matrix, and a saved Due cards view. Open an empty matrix/view, insert a record, change presentation,
   and remove a navigation appearance. Outcome: which identities need placement, membership versus
   position, field bindings, insertion defaults, and whether a matrix-child restriction earns anything.
3. **Query and rendering feasibility.** Use the selected model for large shallow/deep/mirrored
   fixtures. Define bounded reads and SQL subtree operations before choosing closure/scroll caches.
   Concrete performance tests follow implementation, not this documentation review.

Recommendation, not a newly accepted schedule: settle the placement-cycle preference with a short
integrity trace, then use the mixed project to evaluate places, roles, and child restrictions together.
Leave cache design until the necessary query shapes are clear. The task/SRS fixtures remain future
verification work. External plugins, implementation migration, and canonical revisions remain deferred.
