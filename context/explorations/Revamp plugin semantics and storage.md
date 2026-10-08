---
title: Revamp plugin semantics and storage
kind: working-artifact
state: proposed
updated: 2026-10-08
---

# Revamp plugin semantics and storage

Session 2 established the basic application/store model recorded here. Accepted exploration
rules are not implemented contracts; recommendations and deferred choices are labeled separately.
See the [architecture proposal](Revamp%20architecture%20proposal.md) and the
[next-session queue](Revamp%20research%20questions.md#next-session-attachment-context-and-editorquery-behavior).

## Starting direction and existing constraints

Plugins are usually applied explicitly to eligible matrixes, with each application using that
matrix as its primary pivot. Inputs are bound to stable column IDs per application. Plugin input
shapes should accommodate existing compatible columns and support quick setup of blank matrixes
with reasonable defaults. A setup workflow can offer missing columns rather than require users to
recreate existing data in a plugin-specific schema.

Status meaning is selected per application. Offer existing populated values for selection; when
there are none, suggest useful values. Suggested defaults still need to respect the column's
storage type and constraints. Core label/content roles remain distinct from plugin input bindings.
An application does not make the user's pivot data plugin-managed. The basic input model reads the
bound columns on each row of that matrix. Core column roles may overlap those bindings without
becoming plugin requirements.

Plugins may create visible helper matrixes owned beneath each pivot, or root-homed workspace-wide
stores for global state. This placement is accepted for the exploration. Matrix nodes may directly
position member rows, matrix nodes, and view nodes; foreign-matrix rows remain forbidden. All nodes
retain ordinary homes. Do not introduce root categories or exceptional positionless stores now.

A central write guard admits only the managing plugin for normal helper mutations. Core deletion
cascades operate above that guard: the initiating operation is authorized normally, then its
lifecycle consequences apply without per-helper writer checks. Undo/restore follow-through belongs
to the recovery discussion. This is a focused application contract, not a general permissions framework.

Only user-managed matrixes are eligible for default/aspect designations, regardless of creator. A
plugin-managed root store is ineligible; a core- or plugin-created user-managed matrix may qualify.
User/plugin management describes write authority, not the matrix's positional `own` parent.

The baseline protects plugin-required columns from removal/rename and preserves data on plugin
removal. Those are not a complete matrix protection contract. The current registration model also
has one helper-key mapping per plugin, not one per pivot application. Both need reconsideration.

## Exploration decisions and remaining choices

### Application inputs

The user agrees on per-application stable-column bindings and configurable value interpretation,
with flexible input shapes and quick setup defaults. If a schema change makes the bound inputs
ineligible, report an invalid configuration until the user manually repairs it. Do not silently
rebind columns, recreate missing inputs, or remove the application and its helpers. Recommended:
suspend systems that require the invalid inputs while retaining configuration and stored state.

Still define required/optional/repeated inputs and compatibility checks. A plugin has at most one
application per pivot; different plugins may each apply to that pivot. Suggesting status values does not automatically
establish which values mean done or how to handle newly introduced values. Task labels may be
empty; a nonempty label must not be an eligibility requirement.

### Durable application records

**Accepted:** add a narrow system table for durable input bindings and helper associations. It
identifies the plugin/pivot relationship, binds stable column IDs to plugin inputs, and associates
managed helper matrixes with that application. Per-application status-value interpretation belongs
with binding configuration. Plugin business data, including recurrence state, review history,
queues, caches, and business-logic settings, belongs in matrixes rather than an expanding system
record. The exact schema and encoding are implementation work, not part of this exploration.

There is at most one application per `(plugin, pivot matrix)` pair. Different plugins may apply
to the same matrix, with independent bindings and helper associations. Their input bindings do not
take management of the bound user columns or make the pivot plugin-managed. Global helper management also
needs durable association without inventing a pivot; exact table representation can be specified
later, keeping global activation distinct from matrix application.

For example, task automation and time tracking both apply to `Tasks`. Automation manages a recurrence
helper; time tracking manages an entry-log helper. Removing automation deletes its dedicated helper,
not the time-tracking helper or user task data. Deleting `Tasks` cascades through both. The system
record must identify these associations without relying only on helper names or current homes.

Application storage, multiplicity, and clean removal are settled. Removal clears its live system
record and dedicated helpers; reapplication starts fresh with a new application identity. Writes
addressed to a removed application identity are discarded, even after that plugin is reapplied
to the same pivot. Uninstall clears all of the plugin's applications and managed stores, including
global stores. Cross-device duplicate setup and enforcement of removal remain implementation
questions; they do not require multiple active applications per pair.

### Attachments, identity, and labels

The host supplies positional and prose context for an attached task. Its label primarily helps
users discover and navigate back to that context. The user now wants each task to support its own
optional label, whether attached or standalone, regardless of the host's label. This supersedes the
earlier tentative host-label precedence. Do not copy prose or labels between rows: compute display
context and make every editing target explicit.

Recommended interpretation: preserve both the task identity and host identity in task surfaces.
The host identifies the containing item; the task row identifies the particular task and its
status, dates, label, and plugin state. Two tasks attached to the same note cannot share one task
identity even if a combined host-oriented query returns only one containing note. Define these
result shapes explicitly instead of replacing attachment IDs with the host ID everywhere.

A task's own label editor writes only its label-role column. Editing the host label or contextual
prose is a separate action on the host. An unlabeled task can display computed prose context and
a host breadcrumb without treating either as a stored task label. What happens when there is no
usable prose context remains a display question; it does not make the task invalid.

Remaining choices are traced through the examples below: inline anchors and context boundaries,
nesting and task-list multiplicity, missing label columns, and detachment. These are task/context
questions, not requirements for the basic SRS setup, which reads a card's own front/back fields.

### Worked attachment examples

**Two inline tasks in one note.** Note N is labeled `Home repairs`. Its content contains:

```text
Call the electrician about the flickering light #Tasks.
Order replacement hinges for the cupboard #Tasks.
```

Each quick-attach creates a distinct task row, T1 and T2, attached to N and initially homed in
`Tasks`. Both can start without labels. Their statuses, dates, and optional labels are independent.
At the note, each token exposes its own task controls. In a task queue, show two actionable tasks
with their respective prose context and the same `Home repairs` breadcrumb. Completing T1 does
not complete T2 or N. Opening the context takes the user to the relevant token in N.

This requires a token to identify the specific attached row, not just the `Tasks` matrix. A repeated
mention of T1 and a newly created T3 must also be distinguishable. Recommend context computed from
the containing block/paragraph as a starting rule; arbitrary character windows would be fragile.
Multi-task paragraphs still need a clear visual anchor. No snippet is copied into the task label.

Decide what moving, copying, or deleting a token does. Attachments can exist without inline tokens,
so removing a token need not mean deleting the task. Token removal, detachment, and task deletion
must have explicit, distinguishable outcomes; none is decided here. Moving prose between hosts
also cannot silently change the attachment relationship without a defined operation.

**A project task with subtasks.** Task P is labeled `Kitchen remodel`. Its content contains
`Arrange contractor #Tasks` and `Order cabinets #Tasks`, creating attached tasks S1 and S2. They
may be unlabeled while the prose is sufficient; optional labels can later improve their standalone
presentation. P and S1/S2 each retain their own label values and editing targets. P's completion
must not automatically imply subtask completion without a task-plugin rule.

If P is itself attached to note N, S1/S2 are nested attachments. The immediate prose source is P;
N supplies broader context. Recommend showing that context chain rather than replacing all three
task identities with N. Decide whether task discovery follows nested attachments, how it exposes
the chain, and how much context a queue loads. The existing positional-query rule does not by
itself define this semantic traversal.

An attachment is a part relationship without outline position. If the desired project/subtask
interaction is an expandable outline, `own` is the existing positional relationship: P can own S1
and S2 instead. Do not equate nested attachments with outline children. A task owned beneath an
aspect whose own home is in `Tasks` is not automatically positionally beneath that aspect's note
host; project-scope queries need an explicit rule if that result is wanted.

**One standalone unlabeled task.** T is homed under Project X, has a status and due date, but has
no label. It remains editable and browsable through its matrix and outline context. The user may
add its own label or prose, without borrowing Project X's label as its task identity. Setup should
support optional label values; if a matrix lacks a label-role column, decide how users add that
capability later without forcing a populated label during plugin enrollment.

### Managed helpers and lifecycle

The user agrees on a managing-plugin write guard. It should run at the central operation boundary,
not only hide generic editors. The executing plugin's identity must come from runtime context,
not an arbitrary caller-supplied management claim. User actions through plugin controls can mutate
helpers while retaining user attribution in the operation log.

Core deletion cascades are higher-order lifecycle behavior and do not participate in the helper
writer check. Deleting a user-managed pivot therefore deletes its managed helper stores even when
the plugin is not executing. This does not authorize ordinary edits or direct helper deletion
by another writer: authorize the initiating operation, then follow genuine lifecycle dependencies.
The cascade's scope, transaction, and provenance remain part of the core operation contract.

Recommended recovery follow-through: core undo/restore should likewise recover managed data and
its management association without requiring the plugin to execute. This is not yet explicitly
settled; track it in the operations/recovery proposal rather than add a new plugin permission model.

The user accepted these lifecycle actions:

| Action                    | Live application records and managed stores                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove an application     | Delete its system record, bindings/helper associations, and dedicated helper matrixes. Preserve other applications on the pivot.               |
| Delete a pivot            | Remove its applications and cascade through their owned helpers and members.                                                                   |
| Apply again after removal | Fresh application and helper state; no residual record is reused.                                                                              |
| Uninstall/remove a plugin | Remove all of its applications and all managed stores, including global stores. Reinstallation starts without the old application/store state. |
| Turn a global plugin off  | Stop execution and retain global stores.                                                                                                       |
| Reset a global plugin     | Fully clear its managed global state; fresh initial state may be provisioned.                                                                  |
| Remove a global plugin    | Delete its managed global stores and associations.                                                                                             |

The system's lifecycle cleanup must work even if the plugin is not executing. Application/plugin
removal is a core lifecycle action using the durable associations; the normal helper writer guard
must not prevent that cleanup. Remove live records and managed data together so no detached helper
matrixes remain. Core operation history and removal markers follow the recovery/replication policy.

Management determines cleanup scope. User-managed pivots, columns, and other user-managed matrixes are
user data even when provisioned by the core or a plugin. Uninstall clears plugin-managed data;
it does not roll back all earlier authorized changes to user data. This replaces the baseline's
plugin-removal preservation policy for managed stores. Retention while off differs from uninstall.

A generic per-application disabled state is not required by these slices; feature pauses remain
possible. Ordinary row deletion/history retention and core undo/restore belong to the durability
and recovery questions below. Helper movement can wait for a concrete navigation use case; its
application association remains authoritative if movement is introduced.

### Write authorization by scope

**Accepted:** applying a plugin grants its ongoing use of the pivot matrix; global execution
requires authorization for each operation that changes user-managed data.

| Execution scope    | Writes to user-managed data                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Matrix application | Applying the plugin supplies authorization to use that pivot. No per-operation approval is required, including for background recurrence or ingest.   |
| Global             | Authorize each concrete operation, which may be a bounded batch. No standing global write grant. A direct user command can supply that authorization. |

Application authority follows the pivot's matrix identity and membership, not outline ancestry.
It covers member rows even when homed elsewhere. Input bindings describe plugin inputs, not a
field-level permission list. A plugin may use the pivot beyond the bound columns, subject to the
ordinary core invariants. The application does not grant writes to an attached host's prose or
other user-managed matrixes merely because they are related; those writes need their own matrix
application scope or global operation authorization.

Applying does not change a user-managed pivot into plugin-managed data or override another plugin's
management guard. Normal writes to a plugin's own managed stores remain permitted under its manager
identity, including background global suggestions/cache updates; they do not require approval for
every internal write. Core lifecycle cleanup follows the accepted higher-order rules.

All writes still use managed operations with a transaction and operation-log record. Authorize and
enforce the actual execution scope; global execution does not acquire standing rights from the
plugin's unrelated matrix applications. Removal revokes the removed application's authority;
late offline operations addressed to that removed identity are discarded. Reapplication uses a
new identity; replication must enforce that distinction without restoring removed live records.

**Worked cases:** a recurrence plugin applied to `Tasks` may create task rows or advance dates;
an ingest plugin applied to `Workouts` may insert arriving records. Neither needs a new approval
for each occurrence/record. Business configuration stays in matrixes. The global second-brain
plugin may maintain its managed suggestion queue, but each accepted user-data edit or batch needs
operation authorization. These examples need no separate recurring-action grant mechanism.

### Global activation and reads

The second-brain plugin uses one on/off activation and broad reads of user-managed workspace data,
without a per-root/matrix picker. Off preserves its managed global stores, reset fully clears their
state, and removal deletes them. Reads of plugin-managed matrixes are unrestricted, but the
second-brain plugin and similar global discovery plugins should scan user-managed matrixes only.
Managed stores tend to be dense business-logic data; interpreting them correctly requires knowing
the managing plugin's semantics. This is a discovery/input policy, not an access restriction.
A plugin that understands another plugin's store may read it deliberately.

Transaction boundaries do not themselves bound background work, preserve concurrent
edits, or prevent system-trigger loops; those remain runtime/replication follow-throughs.

### Replicated events and derived state

**Accepted:** independent actual reviews and point-in-time dismissals have distinct IDs and all
survive sync while their application/store exists. Replaying the same event retains its ID rather
than creating another event. Plugin-managed storage does not make such records disposable.

The scheduling system idempotently derives the schedule from the event state it sees. After sync
adds another review, it updates the schedule in place to account for both, just as if both reviews
had occurred on one client. The same combined event state and configuration must give a consistent
result; the plugin's algorithm must define any ordering it needs, including tightly spaced reviews.
A persisted schedule is derived output, not a substitute for surviving review events. Recompute
after relevant state changes rather than treating a last-write-wins scheduling row as final truth.

Dismissals likewise survive refresh and sync as distinct events. Which content changes create a
new content generation, and whether an earlier dismissal applies to that generation, belong to
second-brain business logic. These are not additional sync conflict rules. The core preserves the
events; the plugin interprets them alongside the current content. Generated scores/candidates may
be rebuilt without erasing dismissal events.

Application removal still deletes its managed state. Reapplication has a fresh identity, and late
writes targeting the old identity are discarded. How replication tracks removed identities and
triggers recomputation is implementation follow-through, not an unresolved retention policy.

### Is a disabled state needed?

The second-brain slice already requires on/off. Retaining dismissed/snoozed suggestions while
pausing scans and prompts gives that distinction a concrete purpose. A web-clip inbox could also
pause processing while retaining pending captures. These are workspace-level activation choices.

For tasks, pausing recurrence generation or reminders while leaving tasks editable is plausible;
this may be a feature setting rather than disabling the whole application. SRS review-history
storage does not itself require a disabled application; paused reminders or a break from study can
also be feature settings. Do not introduce a universal enabled/disabled/removed state machine
without deciding which behavior stops.

Invalid configuration is a separate reason execution cannot proceed, not a request to remove the
application. Keep intended activation distinct from configuration validity. A valid, enabled
application may resume after manual repair; an intentionally paused one should remain paused.
This is a recommendation, not a settled execution contract.

### Helper homes and designation eligibility

**Accepted placement: `own` beneath the pivot.** Matrix nodes may directly position matrix/view
nodes and their own member rows. This allows a helper's one ordinary home to be its pivot's child,
while preserving homogeneous row children. Apply the rule to both `own` and `portal`.

For example, `Cards` owns `Review history`. Deleting `Cards` cascades through ownership and helper
membership using existing lifecycle rules. Event rows do not become card members. User-created
submatrixes/views use the same child rule; there is no plugin-specific allowance. Global stores
keep ordinary root homes. Matrix-part `attach`, separate roots, and positionless stores are set
aside; their earlier rationale is recorded in the session history.

Core deletion cascades bypass the ordinary helper writer check as accepted higher-order lifecycle
operations. Core undo/restore follow-through remains in the recovery discussion. Explicit application removal also
needs a stable application-to-helper association; it must not delete unrelated child matrixes or
views. Whether helpers are movable remains open. If allowed, moving does not erase the association.

**Accepted eligibility rule: only user-managed matrixes may have default/aspect designations.**
User-managed means ordinary user-controlled data; it does not mean manually created or root-owned.
The automatically provisioned default item matrix is user-managed. A second-brain plugin can create
user-managed matrixes, which remain eligible if they meet the ordinary designation requirements.
A plugin-managed helper beneath a user-managed pivot remains managed and ineligible.

Creation provenance, management authority, outline ownership, designation, and collapse serve
different purposes. Root placement assigns aspect designation automatically only to eligible
user-managed matrixes. Managed helpers remain visible, readable, and queryable. There is no new
color or third designation. Changing management authority is not needed for the current use cases;
consider an explicit handover operation only if a later scenario needs it.

### Why members-only matrix children?

The original exploration commit `d0a8c39` states that matrix nodes can have only their own members
as positional children. It does not record a rationale. This rule predates the current session;
we did not introduce it here. The original discussion that produced it is not in this checkout.

Related recorded baseline: [Data-Model](../Data-Model.md#child-sources) defines one of three child
sources per subject: ordinary positions, a matrix extent, or SQL results. The earlier
[Phase 9.7 exploration](../archive/phases/Phase-9.7.md#3-three-child-sourcing-modes-the-unification)
explicitly sought one ordered region in place of several competing row-set surfaces. This is
historical evidence of the presentation goal, not proof of why the revamp adopted the restriction.

**Reconstructed rationale, not a recovered decision:** keep a matrix's immediate content about its
own rows. Direct positional members and gathered elsewhere-homed members have the same schema;
the immediate content can support consistent outline/table rendering and member insertion. A row
can still have heterogeneous descendants, so this is not a restriction on the whole subtree.

Allowing helper matrixes or foreign rows as immediate children would require a coherent mixed
outline, a distinct member-table presentation, or another related-parts region. That may be
reasonable, but dropping the graph restriction does not automatically simplify the interface.
The baseline's child-source principle is a presentation contract; it does not by itself prove
that other kinds of ownership must be forbidden.

The accepted narrower rule preserves homogeneous direct row children while allowing distinct
matrix/view nodes. Its outline and member table therefore need not contain exactly the same
immediate objects. This is an explicit exploration choice; it does not claim the original
historical rationale has been recovered.

### Narrower matrix-child rule

The user accepted the following positional-child rule in the exploration:

| Direct child of a matrix node   | `own` / `portal` rule |
| ------------------------------- | --------------------- |
| Row belonging to that matrix    | Allowed               |
| Row belonging to another matrix | Not allowed           |
| Matrix node                     | Allowed               |
| View node                       | Allowed               |

This retains the useful row-level homogeneity without requiring every immediate child to be a
row. A matrix node or named view is distinguishable from a record, so allowing either does not
introduce another schema into the matrix's own record list. A helper can therefore be an ordinary
owned child with a natural home, instead of an attachment plus an unrelated root home.

The rule applies to `own` and `portal`, so foreign rows cannot bypass it through another position.
Existing position/lifecycle cycle checks still apply; no new cycle rule follows from the revision.

**Presentation consequence:** in outline presentation, matrix/view children are structural node
entries and row children are records. The matrix table's columns and contents are still determined
by membership; helper nodes and named views are not fake table rows. They need a clear presentation
when focusing the parent matrix. A view's gathered results may have another schema, and member-row
descendants can remain heterogeneous; neither is a direct row child of the parent matrix.

Trace `Cards` owning card rows, `Review history`, and a `Due cards` view. The view reads cards but
does not own its results. The history matrix owns event rows but does not add events to `Cards`.
Deleting the view leaves cards untouched; deleting `Cards` deletes its owned helper and view and
all card members. Explicit application removal deletes dedicated helpers without deleting card
rows or unrelated user-managed child matrixes/views. Automatic duplication of card appearances
between their homes and view results remains a presentation issue, not extra membership.

**Insertion consequence:** the old sibling rule creates a default-item row after a matrix or view
node. Under `Cards`, a sibling inserted after `Review history` must instead be a card row, or
another explicitly chosen allowed structural node. A matrix parent determines the matrix of newly inserted rows before sibling-type defaults. Switching a direct
child to a foreign row type must obey the same constraint. This also exposes an ambiguity in the
original members-only proposal; it is not a new requirement peculiar to helper matrixes.

**Status:** accepted in the exploration, not implemented. Visual clutter and concrete matrix
focus/table presentation still need scenario validation, but do not block working with this model.

### Workspace entry and helper placement

Retain the shared outline with ordinary homes. Pivot helpers are owned beneath their pivots;
global stores live at root. Try this first. Do not add implicit categories, special helper roots,
positionless exceptions, or automatic aspect collapse to anticipate visual clutter.

Starting inside the default item matrix remains an optional navigation idea, not an accepted
requirement. If pursued, define whether matrix focus shows its owned outline, table, or both,
and avoid unwanted duplicate appearances of nested and elsewhere-homed members. Saved starting
points and presentation preferences can wait for a concrete need.

## Remaining plugin decisions

The basic application/store model is settled in the exploration. The remaining questions are
shared editor/query behavior and cross-cutting implementation follow-throughs, not a request to
design a large plugin framework.

**Task attachment context and results:** task queues need explicit identities/context for multiple
and nested attachments. Sigil copy/move/removal belongs to the shared attachment/editor model and
must fit those task results. This does not require cross-host plugin input bindings: task
status/dates and SRS front/back are read from each row's bound columns. Host-derived SRS content is
a possible later scenario, not an unresolved prerequisite for plugin application.

Basic SRS sourcing, deletion-cascade precedence, and designation eligibility are clarified.
Application storage, multiplicity, and removal/reinstallation semantics are also settled.
Write authorization is settled by application/global scope. Reads are unrestricted; global
discovery focuses on user-managed matrixes. Independent events survive sync, schedules recompute,
and old-application writes are discarded. Replication enforcement, concurrent setup of the same
plugin/pivot, and derived-state invalidation remain implementation follow-throughs. Content
generation and scheduling algorithms remain plugin business logic.
Core undo/restore guard treatment remains a recovery follow-through, not an unresolved designation rule.
Widget conflict rules, runtime trust/network policy, system budgets, and background execution
remain cross-cutting questions in the research queue. They do not need full resolution to settle
this session's basic application/store semantics.

### Resolved read and replication examples

- **Cross-plugin reads:** could the global second-brain plugin read the SRS plugin's review history
  to find topics that the user struggles with? It is allowed, but ordinary second-brain discovery
  scans user-managed matrixes only. Reading SRS history deliberately requires understanding its
  business meaning; no read permission or exposure mechanism is needed.
- **Independent offline actions:** a phone records a failed card review while an offline laptop
  records a successful review of the same card. Each review has its own ID and both survive sync.
  Scheduling recomputes consistently from both events, as if they had occurred on one client.
  Replay of either event retains that event's ID.
- **Refresh versus durable decisions:** dismissing a second-brain suggestion should not be lost
  when its score is recomputed. Independent dismissals have distinct IDs and survive sync.
  Whether changed source content creates a new generation warranting another suggestion belongs
  to second-brain business logic; the sync layer does not decide that policy.
- **Removal versus late writes:** a phone removes an SRS application and reapplies it fresh, while
  an offline laptop still has review operations from the old application. After sync, those old
  operations target the old application identity and are discarded. The reapplied plugin has a
  new application identity and fresh history. Enforcing removal across replicas does not mean
  retaining a removed live application record.

## Slice 1: tasks and recurrence

Start with a `Tasks` matrix containing a label, status, and due date. The user applies a task
plugin, binds the corresponding columns, and maps the existing status values to open/done. A setup
flow offers missing columns and defaults without guessing which existing text or date column has
that meaning. Extra user fields remain ordinary editable data.

A direct task row is homed under Project X. Separately, a note under the same project gets a task
aspect row from the enrolled `Tasks` matrix. The note supplies positional/prose context, while the
task keeps its own identity, optional label, and task-field write targets. Changing status targets
task data in both cases. The multiple/nested examples above test the richer case. Query result
shapes still need decisions; eligibility of the matrix does not alone bind inputs to host fields.

For recurrence, the plugin could create a protected helper matrix owned beneath `Tasks`, containing
occurrence records and generation state. Placement follows the accepted rule; the choice to persist
occurrences is still a plugin-specific proposal. Separate rows keep automation bookkeeping out of
user edits to the task row. Prefer deterministic occurrence identities over an incrementing counter.
The simplest task slice needs no helper matrix until recurrence or another real consumer needs it.
The applied plugin may create user-managed task rows or advance dates without per-operation
approval. Whether separate occurrence records belong in managed helpers is a storage/lifecycle
choice; neither representation needs an additional standing authorization mechanism.

Test deletion of the note, task row, pivot, and helper, and deactivation of this plugin application.
A protected helper may still need deletion through the core's normal lifecycle cascade. Two
matrixes enrolled in the plugin need distinct application settings and correctly scoped helpers.

## Slice 2: study cards and review history

A `Cards` matrix has front and back rich-text columns. Apply the SRS plugin directly to it and
bind the front/back inputs to those stable column IDs. They can also be the label/content-role
columns, but those roles are not required for SRS and do not replace explicit bindings. Setup can
offer the overlapping roles as a convenient default. Files may supplement the prose later; that
storage question is deferred.

For every card, the plugin reads front/back from that card row. Card content stays ordinary editable
user data. No aspect row, attachment, inherited host fields, or copied prose is necessary. A
plugin-managed helper matrix owned beneath `Cards` can hold review events keyed to the card and
direction; scheduling state can be derived or persisted with a specified rebuilding rule.

The earlier scenario where an attached card reads a note host's label/content was introduced as
an expanded use case and then mistakenly treated as a required gap. The user clarified the direct
matrix application above. Do not require a cross-host input mechanism for basic SRS. The inherited
open-issue assumption about host-sourced SRS is not carried forward as a requirement. If that
scenario is desired later, specify its sources explicitly rather than redirecting existing bound
columns automatically because of an attachment.

Each actual review is a distinct event. Replaying the same action should not duplicate it, while
independent offline reviews on two devices get distinct IDs and survive sync. The scheduler
idempotently recomputes from the combined review state and updates the schedule in place, as if
both reviews had occurred on one client. Event interpretation/ordering is part of the scheduling
algorithm. Whole-row last-write-wins on one scheduling row is not the final scheduling authority.

Test card deletion, editing its content after reviews, plugin removal, and later reactivation.
History remains inspectable while the application exists or a global plugin is off. Explicit
application removal/uninstall deletes managed history; later setup starts fresh. Core undo/restore
is separate. Card deletion and content changes still need an event-retention interpretation.

## Slice 3: a global second-brain review queue

Enable a global plugin with one on/off setting. It can read broadly across user-managed workspace
data. Start with one modest rule: find stale notes worth reviewing. Avoid requiring embeddings or
general AI infrastructure for this proof.

A root-level plugin-managed matrix contains suggestions referencing source notes, explanation,
and review state. The user inspects it through normal discovery and a plugin review widget, then
accepts, dismisses, or snoozes a suggestion through plugin commands. Any accepted change to a note
is a separate logged action; a suggestion does not itself mutate or own the source note.

Generated scores and disposable candidates may be derived. Dismissals, snoozes, and accepted
outcomes are user-authored state even if the matrix is plugin-managed. Independent point-in-time
dismissals have distinct IDs, survive sync, and are preserved during refreshes. Changed content
may create a new content generation; defining that boundary and its effect on earlier dismissals
is second-brain business logic. Exact event/store layout is deferred. Classify durability by
actual data purpose rather than by the fact that a plugin created the store.

This case distinguishes workspace-level activation from matrix application. Reading broadly does
not establish write authorization or access to mutate other plugins' managed helpers. Candidate
identity, bounded rescans, and stale references remain open. Off retains the queue; reset clears its
state, and plugin removal deletes it.

## Slice 4: another global case — a web-clip inbox

A workspace-wide capture plugin keeps a root-level queue of incoming URLs, captured material,
processing state, and intended destinations. It has no natural source pivot: captures arrive before
the user knows where they belong. Processed content becomes user-managed notes in selected matrixes;
source and import metadata can remain in the plugin's store. Routing a global capture to user-managed
notes requires authorization for that concrete import operation/batch. For unattended ingest into
a known destination, apply an ingest plugin to that destination matrix; application authorizes
ongoing inserts there. These are distinct execution scopes, not a global standing grant.

This tests global durable state without speculative intelligence. Users interact through capture,
retry, route, and discard commands while the generic table remains inspectable. Decide how users
can correct a destination and how failed work is retained during ordinary use. Off retains pending
captures; reset clears managed capture state and removal deletes managed stores. User-managed
imported notes remain user data. Network/file handling can be deferred while testing the state model with pasted text.

## Discussion order

Use the [remaining plugin decisions](#remaining-plugin-decisions) to guide the next discussion.
Basic SRS sourcing, cascade precedence, designations, application storage, multiplicity, and removal
and scope-based write authorization are settled. Read/discovery scope, durable event preservation,
schedule recomputation, and fresh application identities with discarded old writes are also
settled. Keep the task, study, and global slices as concrete checks for remaining attachment and
core recovery/replication work; do not reopen placement merely because presentation is unfinished.

## Evidence and reuse candidates

- `src/core/plugin.ts`: idempotent registration and helper lookup are useful starting pieces, but
  the plugin-wide mapping is not a per-pivot application model.
- `src/core/matrix.ts`: stable column IDs and managed-column guards can support binding/schema
  protection. These guards do not authorize all row writes or enforce a plugin-only writer rule.
- `src/core/plugin.test.ts`: current removal preserves matrixes and clears plugin provenance.
  The accepted revamp instead clears application records and deletes managed stores; this behavior
  requires replacement. Core recovery of removed stores must restore their management association.
- `context/Sync.md`: whole-row last-write-wins and deterministic identities remain inherited
  proposals for this discussion. Neither implies reliable event aggregation or conflict-free
  changes to a task, card, or suggestion row.

No code or schema changes are part of this session.
