---
title: Relational outline exploration
kind: working-artifact
state: proposed
updated: 2026-11-18
---

# Relational outline exploration

Continuation of the [runtime brief](Relational%20runtime%20exploration.md) and
[runtime sketches](Relational%20runtime%20sketches.md). This document records conversational product
outcomes and candidate representations. It does not revise canonical architecture or prescribe schema.

Reconciled with the [recovery decision log](../archive/recovery/2026-11-17/decision-log.md) and
[scenario companion](../archive/recovery/2026-11-17/decision-context.md). The film-study
[presentation and collection traces](Relational%20film-study%20exploration.md) continue this work.

## Shared records across presentations

**Agreed requirement:** notes, outline bullets, and table rows should expose interchangeable
representations of the same records, using similar SQL queries, views, and editing operations where
meaningful. Switching presentation should not copy or convert the data.

- Notes presentation: flat browsable titles and previews, with full-pane content to the right.
- Outline presentation: ordered tree relationships, titles as bullet text, longer content as
  expandable editable smaller text beneath each bullet.
- Table presentation: the same records and fields, including title/content where bound.

Stream and Miller-column presentations remain possible later consumers. The first two presentations
do not automatically settle their ordering, navigation, or virtualization behavior. Shared-record
identity, column-role bindings, and ordered children should let us test them without a new data copy.

## Position does not universally govern lifetime

**Agreed direction:** fluent SQL tree operations, including selecting/deleting a subtree, are product
requirements. The subtree-delete gesture does not justify enforcing descendant ownership whenever
any parent is deleted through SQL, sync, or another feature. Matrix membership remains a lifetime
boundary; separate ownership dependencies still serve inline tasks and card reviews.

A focused outline starts from one explicit root. That root need not be in the current loaded page
or visible. Arbitrary search/query results can be flat with ancestor context; they need not be
reconstructed into a tree. Breadcrumbs identify the path used to arrive, not a global unique parent.

## Mirrors and shared structure

**Agreed behavior:** mirrored roots have independent placements but share the record's title,
content, fields, and child structure. Only the root appearance has local placement behavior; its
subtree is shared. Editing, adding, deleting, or reordering a child affects every mirror.

Example: Projects and Today each contain a placement of Kitchen. Kitchen has Lighting as a child.
Moving the Kitchen placement under Today affects only that appearance. Reordering Lighting changes
Kitchen's shared children everywhere. Outdenting Lighting through Today removes it from Kitchen's
shared child structure and inserts it immediately below the focused Kitchen placement in Today.
It disappears beneath the other Kitchen appearances. The user tested this behavior in Workflowy.

Removing one mirror placement preserves the others. Removing the second-to-last makes the remaining
appearance behave as an ordinary record. Deleting that final appearance invokes ordinary record and
subtree deletion. These are outline gesture rules, not automatic positional ownership.

A subtree deletion encountering a mirrored child removes that appearance without recursively deleting
its shared target children, just as deleting the mirror directly would. The operation must account
for overlapping selected appearances together. A naive SQL deletion of every reachable record is
not the agreed gesture. Record reachability and gesture-specific deletion scope are separate queries.
Normal local outline gestures should preserve placement. Concurrent gestures can leave Unplaced
data after reconciliation; the accepted exception is traced below.

## Split and merge identity

The user tested Workflowy and chose lower-half identity retention for a mid-title split:

- The lower text retains the original record identity, children, longer content, fields, and mirrors.
  Other mirrors show the lower-half title. Focus enters the lower half.
- The upper text becomes a new sibling in the focused location. The later film-study trace chooses
  the same matrix/type with defaults; it need not be an ordinary-note row. Populated fields are not cloned.
- Enter at the start/end of a nonempty title inserts an empty neighbor while preserving the populated
  original record. At the start, focus stays on original text; at the end, focus enters the new row below.
- Backspace at the start merges into the upper destination, retaining its identity. Block merges
  involving mirrors or loss of longer content, meaningful fields, children, attachments, or relationships
  requiring repair/user decisions beyond label text. Transfer embedded atoms safely or block the merge.

Minting replacement identities for both halves was rejected: incoming links, mirrors, feature data,
and offline edits would need ambiguous identity transfer. Rich-text selections and atom transfer still
need implementation work. See the [title gesture contract](Relational%20film-study%20exploration.md#title-editing-and-type-boundaries)
for empty-row escape and consistent outline/table behavior.

## Discovery without universal homes

**Agreed product policy:** Unplaced finds records currently unreachable through the outline's browsing
routes. Show disconnected subtree roots with normal expansion/editing and explicit reattachment.
It does not audit every broken historical appearance or become a new durable parent/lifecycle owner.

Example: SQL deletes Project from R → Project → Kitchen → Lighting without invoking subtree deletion.
Kitchen and Lighting remain matrix records. With no other route, show Kitchen once as an Unplaced root,
with Lighting beneath it. Reattaching Kitchen under R preserves identity and membership.

If a film appears under Cinematography and Favorites, deleting Cinematography does not put it in
Unplaced while Favorites remains reachable. The lost organizational relationship is not a missing-content
result. Incoming mirror positions remain distinct even though reachability is evaluated for shared records.

The later collection trace extends the same rules to matrices and saved views. A reachable matrix is
a discovery route to its members; they do not need separate positional edges merely to avoid Unplaced.
Preview length or loaded pages do not determine accessibility.

**Still open:** exact browsing entry points and matrix/feature scope, keeping helper reviews/receipts
out of accidental clutter, and the concrete discovery query. The earlier candidate of selecting unreachable
records with no accepted parent in that set must now account for membership routes as well. Acyclic
placement alone does not prove that all membership/query rendering routes are acyclic.

## Candidate relational representation

A direct logical sketch, not a physical schema:

```text
record(identity, matrix, fields...)
placement(identity, parent_record, child_record, sibling_order)
```

A record's outgoing placements describe its shared child structure; incoming placements describe its
locations. There is no separate stored child-list object required. A child placement may render
along several paths through mirrored ancestors. Rendering identity therefore includes the path;
editing identity remains the underlying record. View path state is not a second placement authority.

Ownership dependencies and non-owning references remain logically distinct from placement. A shared
edge table with kinds or separate relations are both open. Native SQL/change tracking provides
transactions/revisions/history; a shared feature runtime can enforce lifecycle; the outline library
provides structure, gestures, SQL helpers, and discovery. No universal outline home is required.

## Placement integrity: provisional product policies

Placement cycles are excluded as the starting direction. Workflowy permits them, but the user found
no legitimate product need that justified their relational-query hazards. Rendering to a limited depth
alone would not settle ancestry, deletion, or discovery queries. This constraint does not make a DAG
cheap: many mirror paths can still grow rapidly.

### Reject the entire losing move

Baseline R → A and R → B. Device 1 moves A under B; device 2 independently moves B under A.
Both moves are locally valid, but together they form a cycle.

If B's move wins, omit A's move in full and retain its prior placement. The accepted result is
R → A → B. The earlier proposal to suppress only the latest B → A edge and make A Unplaced is
superseded. Querying other current placements needs no history; reconstructing a prior placement
from a representation that overwrote it requires retained information. That is an implementation
obligation, not a reason to change the intended outcome.

### Concurrent gestures can still create Unplaced data

Start with R containing P and B, and P containing A:

1. Device 1 moves A under B, then deletes now-empty P using the outline. Its deletion targets only P.
2. Device 2 independently moves B under A.
3. Reconciliation chooses B's move and omits A's move, but retains P's recorded deletion.

A retains its former parent P, which is now deleted; B is beneath A. A becomes Unplaced with B below it.
The user accepted this rare combination of outline gestures. Ordinary direct SQL parent deletion can
also cause Unplaced, but that simpler example did not answer the question about outline-only races.

Do not re-evaluate the deletion gesture against the revised tree and expand it to A/B, which were never
selected for deletion locally. Do not track dependent gestures merely to reject P's deletion as well.
Keep the recorded affected set and accept the discontinuity, consistent with object-level clobbering.

### Priority and retry

Provisionally, the most recent recorded wall-clock competing move wins: it is most likely the user's
current remembered intention. The assistant proposed stable move-ID tie-breaking to make equal timestamps
deterministic. Clock skew is an accepted limitation of this placeholder; implementation may justify a
better resolution. Rejected moves do not automatically retry when later changes make their destinations
legal. The user can issue a new move.

### Implementation obligations remain

The product outcomes above are agreed provisionally; a convergent, efficient protocol is not established.
It must handle retained prior placements, multiple competing moves, incomplete delivery, history pruning,
endpoint deletion/restoration, and the same structural invariant for SQL mutations. First-arrival rejection
alone is insufficient. Reads for ordinary tree operations must use the accepted structure, not accidentally
expose pending invalid candidates. No universal lifecycle-cycle or query-recursion policy follows from
placement acyclicity.

## Provisional comparison with the older architecture

Sources: [baseline data model](../Data-Model.md#the-ownership-forest) and
[earlier revamp proposal](Revamp%20architecture%20proposal.md). The baseline uses own/ref/portal;
the earlier revamp adds attach. They are references, not governing constraints here.

| Older concept                                       | Current assessment                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Stable matrix-row identity                          | Keep; supports all presentations and shared editing targets                   |
| Ordered structural edges                            | Earn their place for mirrors, local moves, and SQL structure                  |
| own combines placement with lifecycle               | Separate the responsibilities; use gesture-specific subtree deletion          |
| Every row has exactly one ownership home            | Not required; standalone data and Unplaced provide an alternative             |
| portal beside a privileged ownership home           | Multiple equivalent placements are the simpler candidate                      |
| attach implies a host's type/fields plus dependence | Dependencies are useful; type inheritance is not needed by our task trace     |
| ref                                                 | Keep non-owning associations, including receipts and inline links             |
| Matrix membership                                   | Keep schema membership and matrix lifetime boundary                           |
| Placement acyclicity                                | Provisional product policy above; sync enforcement remains open               |
| Closure and scroll index                            | Preserve bounded-query/rendering goals; select caches from measured workloads |

The direction is a simplified relational edge model, not automatic reinstatement of the old edge
architecture. See the [concept review](Relational%20concept%20review.md) for evidence behind unproven
older concepts and the selected next sequence. Placement-integrity product policies are provisionally
settled; the film-study collection trace is active, followed by query/rendering feasibility.
