---
title: Relational outline exploration
kind: working-artifact
state: proposed
updated: 2026-10-15
---

# Relational outline exploration

Continuation of the [runtime brief](Relational%20runtime%20exploration.md) and
[runtime sketches](Relational%20runtime%20sketches.md). This document records conversational product
outcomes and candidate representations. It does not revise canonical architecture or prescribe schema.

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
Normal outline gestures should not create Unplaced data.

## Split and merge trace

The user tested Workflowy's behavior and chose lower-half identity retention:

- Enter in the middle of a title creates an ordinary sibling above with the upper text. The lower
  text retains the original record identity, children, longer content, fields, and mirrors. Other
  mirrors show the lower-half title. The new sibling belongs to the focused location.
- Backspace at the start merges into the upper destination, retaining its identity.
- Block merging involving mirrors or when retiring the lower item would lose longer content,
  meaningful fields, children, attachments, or relationships requiring repair/user decisions beyond
  label text. Embedded atoms must be transferred safely or block the operation.

Minting replacement identities for both halves was rejected as the simple default: incoming links,
mirrors, feature data, and offline edits would require ambiguous identity transfer. Fine-grained
boundary keystrokes, schema/default choice for the new sibling, and rich-text atom transfer still
need concrete traces. This does not select an automatic migration between different matrix schemas.

## Discovery without universal homes

**Candidate:** an Unplaced query-backed browsing root for records/subtrees disconnected from the
chosen outline entry points. Show roots of disconnected structures, not every descendant. Allow
normal expansion/editing and explicit reattachment. Keep its matrix/discovery scope explicit so
managed review rows and receipts do not automatically become outline clutter.

Example: SQL deletes Kitchen's parent record without deleting Kitchen. Its old outer placement is
invalid; Kitchen and its intact children become discoverable through Unplaced. Reattaching Kitchen
to Projects removes that disconnected result. A subtree still reachable through another mirror may
not need to appear. Whether Unplaced tracks unreachable records, disconnected placements, or both
is still open; avoid silently hiding meaningful detached positions.

The user noted that each mirror placement has its own parent. Querying all incoming edges to a
record as one canonical parent loses that distinction. In a cyclic experiment, a mirror inside a
record does not repair a separate placement whose parent disappeared. With symmetric edges, fully
unreachable cycles nevertheless require reachability/component handling rather than only looking
for parentless records. The latest preference below aims to avoid such placement cycles entirely.

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

## Placement cycles: revised preference, not a finished protocol

Workflowy allows repeated expansion through cyclic mirrors, as observed by the user. We explored
bounded expand-all plus deduplicated reachability. The latest user concern is broader: cycles are a
footgun for relational queries and have no identified product need. **Current preference is to
exclude placement cycles**, even if that differs from Workflowy. Earlier suggestions to allow cycles
are superseded as the leading candidate; enforcement remains to evaluate rather than declare solved.

Acyclicity would simplify ancestry, Unplaced roots, and traversal termination. It still does not
make queries automatically cheap: multiple mirror paths can grow rapidly in a DAG. Rendering,
recursive SQL, and counts still need explicit semantics and work bounds.

Before adopting the constraint, trace concurrent valid local moves that form a cycle on merge
(A under B on one device, B under A on another). Deterministic rejection/suppression and discoverability
of the displaced placement remain open. First-arrival rejection alone is not a convergence rule.
SQL mutations need the same invariant boundary. Placement-cycle policy does not settle lifecycle
cycles or query-result recursion. This is a candidate next investigation, not authorization to build it.

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
| Placement acyclicity                                | Reconsider favorably under latest preference; sync enforcement remains open   |
| Closure and scroll index                            | Preserve bounded-query/rendering goals; select caches from measured workloads |

The direction is a simplified relational edge model, not automatic reinstatement of the old edge
architecture. See the [concept review](Relational%20concept%20review.md) for evidence behind unproven
older concepts and candidate next traces. Pause for user selection before expanding the exploration.
