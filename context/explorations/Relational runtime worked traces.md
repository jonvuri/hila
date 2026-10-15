---
title: Relational runtime worked traces
kind: working-artifact
state: proposed
updated: 2026-10-15
---

# Relational runtime worked traces

First conceptual pass under the [exploration brief](Relational%20runtime%20exploration.md).
These are candidate behaviors and counterexamples, not accepted architecture or a schema plan.
Relation names below describe facts; they do not prescribe physical tables or a generic engine.

## 1. Two tasks in one note

Note N, `Home repairs`, contains two actions captured with an inline gesture:

```text
Call the electrician about the flickering light #task.
Order replacement hinges for the cupboard #task.
```

Capture should produce two independently actionable queue entries. Completing the first leaves
the second open. Each entry returns to its particular place in N, even when both actions occur
in one paragraph. The containing note does not become a task.

### Agreed direction: inline capture creates a lifecycle dependency

An inline-created task depends on its owning inline occurrences. Copying creates another co-owner
of the same task. Deleting one owner preserves the task while another remains; deleting the last
owner makes the task recoverably deleted. Completing any occurrence updates the same task everywhere.
Separate task identity does not imply independent lifetime. Tasks created directly in a queue may
have another lifecycle owner; item 3 will examine that creation policy.

### Item 1 resolved: atomic occurrence with an optional shared label

Typing `#task` creates a stable atomic inline unit targeting a task row. With no explicit label,
heuristics derive display context from nearby prose, usually on the same line or directly above
or below. For adjacent tasks, favor the nearest context and avoid assigning the same prose to both
where practical: closest wins. This is best-effort presentation, not exclusive ownership of prose.
Do not distort prose to make task displays unique.

The inferred context is outside the atom. Copying or deleting the atom does not automatically copy
or delete surrounding words. A selection containing both can carry both. Nearby prose stays local
to its note; changing heuristics never changes ownership or stored prose.

The user may add an explicit label after capture. It appears inside a wrapped border attached to
the atomic unit, but is the task row's label field, not surrounding document content. Editing it
changes the shared label across co-owners. Clearing it preserves the task and restores inferred
context. Adding, changing, or clearing the label never changes ownership. This gives quick tag
capture and deliberate shared wording without a separate user-built prose fragment.

For an unlabeled task with several owners, assume a stable preferred occurrence selected by a
simple deterministic property such as inherent occurrence query ordering. Do not store a separate
preferred-occurrence assignment. The exact ordering remains open; the preference changes when the
chosen occurrence is removed. A scoped queue's relationship to this preference belongs to item 3.

Boundary keystrokes, partial selections, converting selected prose into a label, plain-text export,
and cross-workspace paste remain editing details to trace. Inferred display text is not a stored
label; matrix presentation and editing of that distinction remain part of item 3.

### Earlier storage comparison: physical representation remains open

| Model                                   | Stored facts and capture                                                                        | Queue read and completion                                                                                     | Main cost                                                                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A. Task state inside prose              | Insert two identified task atoms A1/A2 into N, each storing its task fields.                    | Extract two atoms from notes; write A1's status through the document editor. An index accelerates extraction. | Background writes and shared references must resolve task state inside documents; moves must preserve that address.                   |
| B. Task-bearing fragments               | Identify fragments F1/F2 and store task fields keyed to them. Fragment and task share identity. | Read task-bearing fragments; write F1's task fields.                                                          | Two tasks in one paragraph need two independently addressable inline units. Split, merge, and shared appearances need identity rules. |
| C. Task records with owning occurrences | Create T1/T2 and owning occurrences O1/O2 in N. Task identity differs from occurrence identity. | Read live tasks once each; write T1's status. Occurrences supply navigation and lifecycle ownership.          | Ownership must be enforced across document and task storage, including moves, sync, and recovery.                                     |

All three can express inline ownership. A puts more obligations on the document representation.
B is attractive if addressable fragments already serve editing and outlining. C keeps task fields
available independently of document structure, at the cost of an explicit ownership association.
The agreed atomic occurrence and shared label narrow the product model; they do not fix physical storage.
Do not add fragment machinery solely to preserve the earlier comparison.

### Detailed trace for C

Minimal facts for this example, without prescribing separate physical tables:

```text
task(T1, status=open, label=empty)
task(T2, status=open, label=empty)
occurrence(O1, document=N, target=T1, owns_lifetime=true)
occurrence(O2, document=N, target=T2, owns_lifetime=true)
```

The document contains identified inline units O1/O2. Their surrounding text remains prose in N.
An occurrence relation can be an indexed projection of those units, rather than a second editable
source of placement truth. Stable identity is required; character offsets and matching snippets
are insufficient. Ownership must be available to deletion and recovery without mounting an editor
or task widget. This is an enforcement requirement, not a chosen indexing or replication mechanism.

1. **Capture.** One local transaction creates T1 and O1 with their ownership association. Repeat
   for T2/O2. Retrying the same capture reuses identifiers; a deliberate new task gets new ones.
   A failed insertion must not leave an unintended live task without its owner.
2. **Read the queue.** Return two task rows keyed by T1/T2, even though both occur in N. Fetch
   bounded context previews separately to avoid multiplying rows when a task has several
   occurrences. For this trace, a contextual queue finds tasks through owners in its scope.
   Explicit task project assignment remains an alternative, not an agreed requirement.
3. **Complete T1.** Both its inline checkbox and queue checkbox target `T1.status`. T2 stays open.
   All live references to T1 display its new state.
4. **Edit text.** Editing T1's optional label writes its label; editing the sentence writes N's
   prose. Without a label, show context around O1. Do not copy context into the label implicitly.
   The editor must make the owning unit clear enough that ordinary prose edits do not unexpectedly
   delete the task.
5. **Return to context.** Navigate to `(N, O1)`. Task controls still target T1. If copying creates
   several occurrences, show which context will open; never substitute another location silently.
6. **Delete the owning unit.** With no other owner, retire O1 and T1 together from live use. A
   queue appearance or non-owning reference does not keep T1 alive. Recovery restores
   both with their association; it must not restore only a broken inline reference.

A contextual queue would follow an owner moved between notes or projects. Explicit task assignment
would instead survive that move. Inline lifecycle ownership does not by itself decide queue scope;
item 3 below resolves both as ordinary query conditions without a special project primitive.

### Item 2 resolved: co-ownership, clipboard, and recovery

Rich copy/paste preserves task identity and creates a new owning occurrence. Copy-then-delete-original
preserves the task through any remaining owner. Repeated paste of either a copy or a cut creates
multiple owners of the same task, not independent tasks.

Cut removes the source owner as normal deletion and puts the task identity and recoverable content
in the clipboard buffer. If no other owner remains, the task leaves live use but remains recoverable.
Paste restores that same task row ID with an owner at the destination. If another owner already
keeps the task live, paste simply adds an owner. Clipboard eviction abandons the transfer: a deleted
task stays deleted. It does not require immediate permanent erasure of recovery history.

Concurrent field edits continue to reconcile while the row is cut-buffered or recoverably deleted.
Paste restores ownership and visibility against the reconciled row; it must not overwrite newer
fields with an old clipboard snapshot. Retained identity alone is insufficient if deletion discards
the mergeable state. Item 4 below sets the recovery and retention contract; exact retention durations remain open.

When eligible under item 4, undo reverses the ownership change. Undoing copy/paste removes the owner it created, with ordinary
last-owner deletion consequences. Undoing cut/deletion restores the removed owner and the same task.
Other surviving owners are unaffected. Ownership undo does not roll task fields back to a stale
clipboard snapshot.

| Gesture or offline race                                                        | Agreed live and recoverable result                                                                                                                         |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copy, then delete original                                                     | The new owner keeps the same task live.                                                                                                                    |
| Delete one of several owners                                                   | Remaining owners keep the task live.                                                                                                                       |
| Delete the final owner                                                         | Task becomes recoverably deleted; query appearances do not preserve it.                                                                                    |
| Cut, then paste                                                                | Source owner is removed; destination owns the same task with reconciled fields.                                                                            |
| Cut, then evict clipboard without pasting                                      | No destination owner is created; task stays deleted if no other owner exists.                                                                              |
| Repeated paste from copy or cut                                                | Each paste creates another owner of the same task.                                                                                                         |
| Delete last known owner while another device creates an owner                  | The surviving new owner keeps the task live after merge.                                                                                                   |
| Two devices each delete a different owner, each expecting the other to survive | No owners remain after merge; task becomes recoverably deleted.                                                                                            |
| Delete/cut while another device completes or edits the task                    | Fields reconcile in recoverable state; edits alone do not make the task live. Paste or eligible lifecycle undo restores it with the winning content edits. |

These are agreed product outcomes, not a replication implementation. Determine liveness from
merged owner facts; a device's local reference count cannot prove global absence. Host-note deletion
removes its inline owners even with the editor closed; surviving owners elsewhere preserve the task.
Task-row or matrix deletion clears owning atoms elsewhere, as recorded in item 3. It differs from
removing one inline occurrence.

**Working expectation to test:** concurrent cut/paste of the same source occurrence to two
locations produces two new owners of the same task, consistent with repeated paste. This extends
the agreed gestures; it is not yet a separately confirmed concurrent-move policy. Drag/move operation
identity, retry deduplication, cross-workspace clipboard behavior, and restoration after permanent
purge remain mechanism or boundary questions.

## Item 3 resolved: views, discovery, and standalone tasks

A queue behaves as a view. Membership can follow positional queries over hosts containing owning
occurrences, or predicates over task fields. An occurrence is positionally part of its host. A
`project` field can be ordinary text or an enum; it has no special lifecycle properties. Queries
should support SQL-expressible combinations, with nesting and precedence handled by the query spec
and builder. Views deduplicate task rows even when several occurrences match.

Use the same deterministically preferred occurrence for an unlabeled task's context everywhere,
even when another occurrence caused the query match. Navigation identifies that displayed context;
an explicit shared label can remove contextual ambiguity. Editing the label changes the task row;
editing nearby prose changes its host. Inferred context is display text, not a stored label.

Recognized simple projections of identifiable rows from one matrix can offer ordinary matrix row
creation using matrix defaults. Filters do not imply defaults. Any creation presets must be explicit.
General query views do not inherently offer creation; recognized row identity can support field
editing, and recognized matrix projections can expose matrix row operations. Exact recognition
criteria remain a query-design question. Query membership alone is not ownership or deletion.

A directly created task has ordinary standalone matrix-row lifetime. Deleting its row or matrix
makes it recoverably deleted. It needs no extra positional owner or retention claim. An inline-created
task additionally depends on at least one live owning occurrence. Matrix deletion deletes member
rows regardless of other owners. A universal requirement for positional ownership is not selected.

Keep `#task` insertion focused on creating and attaching a new task. An `@` reference to an existing
task is non-owning. Cut/copy/drag of task rows into prose is dropped from this exploration; there is
no row-to-prose ownership transfer or cloning gesture to design. Item 2's clipboard rules apply to
existing inline atoms, not task rows.

Deleting a task row or task matrix clears affected owning atoms from live prose. Surrounding prose
remains. Do not leave visible inline tombstones. Atom removal is an ordinary host-content edit,
subject to item 4's object-level recovery limits. Retained lifecycle deletion evidence is distinct
from a visible marker. Non-owning references do not keep their targets alive.

## 2. Study cards and review history

This scenario does not choose between B and C. Existing records R1/R2 already have stable identity
and front/back fields. An SRS setup S binds those field identities and the source collection.
Neither model needs to copy the fields, create a prose fragment, or attach another card record.
Changing a field's display name preserves the binding; removing it makes the setup visibly invalid
until repaired. SRS must not silently substitute another field.

### Item 5 resolved: sequential reviews and live recomputation

1. Both devices read a card's front/back and current schedule.
2. Device A records `Again` at 09:00; device B independently records `Good` at 09:02 before sync.
   Each review has its own identity, card/setup identity, grade, and scheduler-required time/input
   data. Replaying one review does not create another; the two reviews are distinct records.
3. After sync, process both as sequential learning steps, not grouped observations of one prior
   schedule. Use deterministic ordering, such as review time with review ID as a tie-breaker.
   Exact ordering is still a scheduler-design detail. Clock skew can make the chosen order differ
   from real chronology; accept that limitation. The concrete SRS algorithm and resulting intervals
   remain to choose; no algorithm implementation or performance proof was completed here.
4. Derive schedules live from the applicable review records initially. A computed schedule does
   not replace review history and is not sync authority. Card deletion follows item 4's durable
   lifecycle rules: late reviews do not revive a deleted card or its live schedule, regardless of
   arrival batch or sync round.

### Learning reset

Reset deletes reviews known locally, using ordinary deletion semantics. A previously unseen review
arriving later through sync survives and participates in the schedule. Reset is not a barrier against
unknown reviews; do not introduce a learning generation or epoch. Deleted known reviews stay deleted
under the established lifecycle rules, including replay of those identities. Eligible undo/recovery
uses item 4's retained-history and dependency rules.

The earlier suggestion that reset must distinguish old-generation reviews is withdrawn. Keeping
review history when card text changes remains an earlier candidate, not a newly settled policy.

### Performance hypothesis and verification target

Live recomputation may need every applicable review for each candidate card. Schedulers can have
constant-size state per step without requiring constant review retrieval: without stored state, total
work is approximately O(cards + reviews). Finding due cards can require recomputing all candidate
cards before filtering or paging. Index reviews by setup/card and read bounded batches; paging alone
does not bound total scheduling work.

Use this as a test case for bounded computation. Build plausible worst-case fixtures representing
roughly ten years of daily use, reviewing all eligible/due cards each day. Vary collection sizes and
include heavy lapse/retry cases. Target roughly 250–500 ms for retrieval plus computation of the
due-card query on representative hardware, measuring cold and repeated runs. This is a future
verification target, not a measured result or a proven bound for arbitrary history sizes.

If the target is exceeded, consider local-only caching. Cache computed state against the applicable
review inputs and scheduler version; invalidate on late reviews, review deletion/reset, and recovery.
An earlier inserted review may require replaying later steps. Cached results remain disposable and
are not replicated as scheduling authority. A live computation uses a consistent input snapshot;
subsequent input changes require another computation or invalidation. No general background-derived
write framework is needed for the initial live path.

### Shared machinery versus SRS work

Shared needs are stable identities, idempotent insertion, atomic writes, lifecycle enforcement,
replication, and efficient reads. SRS owns grades, deterministic review processing, reset operations,
and schedule computation. Source bindings and protected review writes apply while UI is inactive.
Local cache freshness is conditional follow-up work if measurements justify caching, not a required
initial runtime service. No universal incremental computation engine is selected.

## 3. Lifecycle ownership and a counterexample

The initial project example left “project” undefined and conflated organization with ownership.
Replace it with a concrete case: delete a collection of study cards, including its card records,
while SRS is inactive. Review history is also displayed in a workspace-wide view.

### Agreed direction: reviews depend on their cards

The user identifies review history without its original cards as low-value clutter. Explicit
lifecycle ownership fits this case: deleting a card removes its reviews and schedule from live
use. Deleting the collection and its cards applies that consequence to each card. Displaying the
reviews elsewhere does not preserve them. This is an agreed exploration outcome; the storage and
replication mechanism remains open.

A shared history table does not make every review share one card's lifetime. The dependency is
between each review and its card, regardless of how records are physically grouped. Likewise,
a shared SRS setup may continue serving other collections after these cards disappear.

Retain cards and reviews in recoverable deletion state. Eligible recovery restores the required
dependencies together, rebuilding schedules as needed under item 4 below. This does not retain orphan reviews in
ordinary queries. Permanent purge and retention duration remain separate questions. Lifecycle
consequences must work without executing SRS code.

### Counterexample: import receipts outlive imported notes

Consider an importer that brings items from a reading service into Hila. Its product promise is
that deleting an imported note does not make the next sync recreate it.

1. Importer I processes external item E, creates ordinary note N, and records a receipt keyed by
   `(I, E)`. The receipt records that E has been handled; it may also point to N.
2. The user deletes N. The receipt survives, so I still knows E was handled. Its meaning does not
   require a live note; an optional link to N can resolve to deleted content.
3. At the next sync, I sees E again and skips automatic creation. If the receipt had been owned by
   N and deleted with it, the importer would recreate unwanted content.
4. An explicit reset of import history may clear the receipt and allow reimport. Turning off the
   importer retains it. The receipt has ordinary matrix-row lifetime, independent of the imported note.
   No ownership travels between the receipt and that note.

This is genuine managed helper data with a looser dependency on the user record it concerns.
It has little direct reading value, but its continued existence preserves an intended behavior.
It cannot be reconstructed from live notes after N has been deleted. Retained deletion history
could supply the same evidence instead; that moves the receipt's responsibility rather than
eliminating the need for memory that outlives N.

The importer promise is an assumption of this counterexample, not a new Hila feature commitment.
For an importer that intentionally mirrors its source and recreates deleted notes, the lifecycle
requirement would differ.

### A second case: managed time entries

A timer can manage start/stop entries linked to a task while a timesheet preserves date, duration,
and enough descriptive context to remain useful after the task is deleted. Those entries document
work already done. If that is the product promise, task deletion removes an optional live link,
not the entries. Their lifetime belongs to the timesheet or activity record. Unlike import receipts,
these are durable user-facing records despite having a restricted writer.

This example is conditional: if time entries only support a disposable task-local timer, owning
and deleting them with the task is coherent. The intended use determines dependency.

### What the comparison establishes

| Managed data      | Why it exists                                                 | Candidate lifecycle dependency                                        |
| ----------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| Card reviews      | Support learning and inspection of the original card          | The card; delete and recover together.                                |
| Import receipts   | Remember handled external items and prevent unwanted reimport | Ordinary matrix membership; non-owning link to the imported note.     |
| Timesheet entries | Preserve a record of work already done                        | The timesheet/activity record; the task can be an optional reference. |

“Managed” describes who may write ordinary data. Lifecycle ownership describes which deletion
makes that data cease to be live. A reference describes what it concerns. These can coincide, as
with a card and its reviews, but management alone cannot choose the lifecycle owner.

The receipt is a counterexample to “helper data dies with the user record it refers to,” not to
explicit lifecycle ownership itself. It can still have a clear owner at a different scope. These
examples do not yet require a generic dependency graph, universal ownership tree, or arbitrary
per-record lifecycle configuration. Small fixed relations may suffice.

### Replica and recovery checks still needed

- **Delete a card while another device reviews it.** After sync, the late review must not restore
  the card or its live schedule. Keeping it with recoverable deleted history is a candidate;
  restoration must define which late reviews participate.
- **Delete a note while another device imports the same source item.** A receipt key prevents
  duplicate receipt rows, but does not by itself prevent duplicate notes. Import output identity
  or reconciliation must preserve the deletion across replay. A local transaction is insufficient.
- **Retire an automation setup while offline work continues.** Admission checks must respect
  durable lifecycle state even with module code inactive. Historical user data and concurrent
  automated outputs need an explicit policy; retiring the setup cannot simply erase all earlier
  user-data changes it made.
- **Restore data while old jobs remain queued.** Recovery must not accidentally authorize stale
  work. A fresh execution generation is one candidate; data restoration and job authority are
  separate concerns.

Card-owned reviews and the receipt's non-owning note reference are agreed exploration outcomes.
The importer and timesheet remain examples, not feature commitments. Item 4 records the provisional
shared lifecycle and recovery rules; automation admission and replay details remain to test.

## Item 4 resolved provisionally: lifecycle, history, and bounded undo

### Shared lifetime rule

Every matrix row has its matrix's lifetime boundary. A standalone row needs no external owner.
A row with an ownership dependency additionally needs at least one live owner: co-owned inline
tasks survive through any remaining atom; a review is the one-owner case, depending on its card.
An import receipt has no ownership relation to its imported note in either direction. It retains
its import-source identity and an optional non-owning note reference after the note is deleted.

Locally, removing an ownership relation can check for remaining owners in the cascade-delete
trigger and delete the target only on final-owner removal. This does not inherently require a
special marker on owned rows: the ownership-removal operation supplies the cause. Sync must still
reconcile ownership facts and enforce the rule on the merged state; independent local cascades or
local counts alone do not settle the two-device last-owner race. Matrix membership and references
must not be counted as interchangeable co-ownership claims.

Enforcement works while feature code and UI are inactive. Ownership, restricted write authority,
non-owning references, and recovery retention remain separate. Deleting a card removes its reviews;
deleting a note removes its atoms and may delete final-owner tasks. Deleting a task clears its atoms
from other notes. These consequences can be one local transaction without implying replicated
atomicity or choosing a generic ownership engine.

### Object-level conflict resolution and retained history

Use object-level last-write-wins for conflicting content updates as the starting policy. Concurrent
edits to the same content object may clobber each other. Retain deleted records and a fairly long,
complete object change history within the intended personal-note-taking scope. This can support
per-object versions later; a version-history UI is not required initially. No precise concurrent
prose-edit undo or general CRDT implementation is required by this contract.

Lifecycle and content are separate logical state with potentially separate retention policies;
representing them as different object kinds is a candidate, not a fixed schema. Ordinary content
edits continue to resolve while a row is recoverably deleted, but do not revive it. Explicit paste
or eligible recovery restores lifecycle against current winning content. Use deterministic revision
ordering and tie-breaking; restoring old content is a new write subject to normal sync resolution.

Prune oldest content history when space requires it. Remove complete recovery entries/groups or
mark them unavailable when required prior state is no longer retained. Lifecycle deletion evidence
may survive much longer, potentially indefinitely, so a long-offline replica cannot resurrect data
merely because old content snapshots were discarded. Exact retention durations and safe lifecycle
compaction remain storage/sync design questions.

### Recovery and undo eligibility

Transactions provide atomic writes, not automatic post-commit undo. Retained history must include
trigger-generated cascades and host-content edits. Group changes by the user action for recovery;
that group need not be identical to every database transaction or background/sync operation.
Apply an eligible undo atomically as new writes, preserving the identity of restored objects.

Object-level undo proceeds one change at a time backward. Track revision identity and a history
cursor; identical text does not prove that an object has had no later edits. Undo itself must allow
continued backward traversal. Lifecycle recovery uses current winning content rather than a stale
clipboard snapshot; content undo explicitly restores an earlier content version.

Clearing an atom is an ordinary prose edit. If the host has later edits, skip undo of that atom-removal
edit rather than merging the atom into newer prose or overwriting that prose. Evaluate dependencies
before applying the remaining restorations. If a formerly owned row has no valid surviving or
restorable owner, it is ineligible for restoration. Do not convert it to standalone data or offer
an alternative recovery destination. A required matrix or card dependency must likewise be live
or validly restored.

If those dependency checks make the whole undo changeset ineligible, hide or skip the whole entry.
A skipped entry must not produce a broken reference or a live row without required owners. Where
an eligible subset remains, a brief result may report objects skipped because of later edits;
wholly ineligible entries need no confirmation or alternative recovery flow.

### Deletion and recovery trace

Start with atom A in note N owning task T, and atom B in note M plus atom C in note P owning task U.
Delete N and M in one user action. A and B disappear; T loses its final owner and becomes recoverably
deleted. U survives through C. History groups the initiating deletions and their cascades.

If the affected objects remain eligible, undo restores N, M, A, B, and T's lifecycle together. U's
current content remains intact. A concurrent completion of deleted T updates its recoverable content;
lifecycle restoration uses that winning completion state, rather than an old snapshot.

Separately, deleting T directly clears A from otherwise surviving N. If N has no later edits,
eligible undo can restore A and T. If N was subsequently edited and no other owner is valid,
skip A's content undo and do not restore T; hide or skip the ineligible deletion changeset. There
is no fallback standalone recovery. This knowingly sacrifices some recovery after conflicts to
keep editing and undo simple.

## Provisional boundary and cost

| Responsibility exposed by the traces                                        | Smallest candidate home                           | What remains unproven                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Atomic durable mutation, identity, replay, and convergent conflict handling | Runtime/storage boundary                          | Local transactions do not establish replicated atomicity; partial arrivals must not expose broken captures. |
| Helper writer checks and lifecycle visibility                               | Shared storage enforcement                        | Concrete authority and retirement rules for imported operations, restores, and offline work.                |
| Stable occurrences, document edits, and context previews                    | Editing/reference library                         | Split, merge, cross-document move, copy, and concurrent-edit behavior without duplicate placement truth.    |
| Task capture, project defaults, and queue result shapes                     | Task behavior plus Hila composition               | Merged ownership enforcement and concrete bounded access paths for the agreed scopes.                       |
| Card bindings, review records, and scheduling                               | SRS behavior                                      | A useful deterministic review policy and affordable invalidation/recomputation.                             |
| Lifecycle ownership and recovery presentation                               | Hila policy backed by shared lifecycle operations | How to enforce card-owned reviews and independent import receipts during sync and recovery.                 |

Shared storage enforcement means writer and lifecycle rules apply even when the module or UI is
inactive. Ordinary helper writes require an authorized operation; deletion and recovery can follow
stored ownership without module code. Normal reads exclude deleted data while recovery reads can
inspect it. This could use database constraints and shared functions; it does not require a
continuously running service or a generic policy engine.

“Library” here does not mean optional enforcement. Required checks must remain installed for stored
data and apply to local writes, sync, and recovery. Whether these are fixed functions in Hila or a
small runtime facility is still open. Moving all these obligations into declarations would not
reduce their total cost.

Bounded queue reads require indexed task scope/status, bounded occurrence lookup, and lazy
context previews. Neither parsing every note per query nor fetching every occurrence per task is
an acceptable implicit implementation. The traces motivate these access paths; they do not prove
latency, replication correctness, or a final storage layout.

## Findings, decisions, and next session

**Findings:** task queries need an explicit unit of result and edit target. Context references and
task identities can differ. SRS needs durable independent reviews, not an attachment mechanism.
Deletion scope cannot safely be derived from presentation. Each finding constrains a candidate's
explanation; none selects a whole architecture.

**Agreed exploration outcomes:** items 1–3 resolve atomic owners, shared labels, inferred context,
co-owner clipboard behavior, ordinary query scope, standalone matrix creation, and clearing atoms
on task deletion. Row-to-prose transfer gestures are dropped. Item 4 provisionally shares lifecycle
rules across tasks and reviews, keeps receipt links non-owning, and adopts object-level LWW with
retained history and dependency-checked sequential undo. Physical storage remains open.

**Recommendations to test:** carry these outcomes into small runtime/library sketches. The SRS algorithm and
performance fixture remain to implement and measure. Local ownership triggers and transaction-grouped history are candidate means,
not proof of sync correctness. Item 5 selects sequential reviews, simple deletion reset, and live
scheduling with a future performance target. No complete runtime architecture is selected.

### Next investigations, in order

Items 1–5 have starting outcomes recorded above. Subsequent
[runtime sketches](Relational%20runtime%20sketches.md) record the adversarial deletion/edit trace
and the agreed treatment of unknown occurrences after restoration.
[Outlining](Relational%20outline%20exploration.md) is the next product proof already explored; the
[concept review](Relational%20concept%20review.md) lists candidate follow-ups pending user selection.
These are exploration questions, not implementation tasks.

1. **Inline unit — resolved at the product level.** Atomic occurrence with optional shared label
   and inferred local context.
2. **Co-ownership gestures — resolved at the product level.** Inline copy/cut/paste/undo and the
   ownership-race table define outcomes, subject to item 4's recovery eligibility.
3. **Discovery and standalone creation — resolved at the product level.** Ordinary view queries,
   deterministic context, matrix defaults without inferred filter defaults, and matrix-row lifetime.
   Row-to-prose transfers are dropped; task/matrix deletion clears inline atoms.
4. **Lifecycle and recovery — provisionally resolved.** Matrix lifetime plus optional owners;
   non-owning receipt links; object-level LWW, retained content/lifecycle history, and bounded undo.
   Unrestorable required ownership makes recovery ineligible, without alternate destinations.
5. **SRS starting policy — resolved.** Sequential independent reviews, simple deletion reset,
   live recomputation, and a ten-year-use performance fixture targeting roughly 250–500 ms.
   Local-only caching is a conditional fallback. Algorithm selection and measurement remain future
   work; the policy does not establish a proven performance bound.

Keep physical storage provisional. The runtime sketches and outline traces are recorded separately
so these task/SRS outcomes remain easy to find. Follow the concept review for the next checkpoint.
No implementation or migration planning yet.
