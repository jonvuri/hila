---
title: Relational runtime worked traces
kind: working-artifact
state: proposed
updated: 2026-10-09
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

An inline-created task depends on its owning inline content. Copying creates another co-owner of
the same task. Deleting one owner preserves the task while another remains; deleting the last owner
also deletes the task. The owner might be a token, an atomic range, or another identified fragment;
it need not be the surrounding prose. Editing nearby words does not necessarily remove the owner.
The owning unit and partial-selection behavior remain to be designed.

Cutting and pasting that unit elsewhere preserves the task and its state, or recreates it
identically in the destination. Prefer preserving task identity so other references, history, and
concurrent completion still address the same task. Co-ownership is the agreed copy behavior because
it matches the user's expected editing experience: copy-then-delete-original preserves the task.
Completing any occurrence updates the same task everywhere.

This replaces the first pass's recommendation that an inline task survive removal of its final
reference. Separate storage identity does not imply independent lifetime. Tasks created directly
in a queue may have another lifecycle owner; this gesture does not decide their creation policy.

### Three storage models under the revised behavior

| Model                                   | Stored facts and capture                                                                        | Queue read and completion                                                                                     | Main cost                                                                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A. Task state inside prose              | Insert two identified task atoms A1/A2 into N, each storing its task fields.                    | Extract two atoms from notes; write A1's status through the document editor. An index accelerates extraction. | Background writes and shared references must resolve task state inside documents; moves must preserve that address.                   |
| B. Task-bearing fragments               | Identify fragments F1/F2 and store task fields keyed to them. Fragment and task share identity. | Read task-bearing fragments; write F1's task fields.                                                          | Two tasks in one paragraph need two independently addressable inline units. Split, merge, and shared appearances need identity rules. |
| C. Task records with owning occurrences | Create T1/T2 and owning occurrences O1/O2 in N. Task identity differs from occurrence identity. | Read live tasks once each; write T1's status. Occurrences supply navigation and lifecycle ownership.          | Ownership must be enforced across document and task storage, including moves, sync, and recovery.                                     |

All three can express inline ownership. A puts more obligations on the document representation.
B is attractive if addressable fragments already serve editing and outlining. C keeps task fields
available independently of document structure, at the cost of an explicit ownership association.
The gesture now favors coupled lifecycle in every model; it does not select a storage model.
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
   queue appearance or non-owning reference does not keep T1 alive. Candidate recovery restores
   both with their association; it must not restore only a broken inline reference.

A contextual queue would follow an owner moved between notes or projects. Explicit task assignment
would instead survive that move. Inline lifecycle ownership does not by itself decide queue scope;
compare these outcomes without assuming that “project” is a lifecycle primitive.

### Cut and paste is a transfer

A drag within one editor can be one atomic move. Cut followed by paste spans separate user actions,
possibly separate documents. Implementing those actions as an unrelated delete and insert would
lose task state or sever references.

Two candidates are a pending transfer, or recoverable deletion followed by restoration at the new
location. The latter permits a cut with no paste to behave like deletion while retained transfer
identity allows a subsequent move. Both need to preserve task fields, identity, history, and the
relationship to any dependent records. Merely copying the visible checkbox and label is insufficient.

Test abandoned cuts, clipboard replacement, delayed paste, and repeated paste. A transfer must not
create several owners accidentally: a second paste needs explicit copy semantics. Define the
boundary for cross-workspace or plain-text paste, where source identity may not be available.
These are open mechanisms; do not promise an indefinitely live task hidden in the clipboard.

### Agreed copying behavior: co-ownership

Copy O1 from note N into note M. The paste creates a distinct owning occurrence O3 of the same T1.
There are now two owners and one task. Completing either occurrence completes T1 everywhere;
a task queue still returns T1 once, with its contexts available separately.

| Action                          | Result                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| Delete original O1              | T1 remains live through O3 in M.                                                          |
| Delete O3 while O1 remains      | T1 remains live through O1 in N.                                                          |
| Delete the last owner           | T1 leaves live use with that owner. Recovery behavior remains to be specified.            |
| Cut O3 and paste elsewhere      | Transfer O3 and preserve T1's identity and state; O1 is unaffected.                       |
| Create an independent duplicate | Create a new task with its own completion state through a separate duplication operation. |

Non-owning references were considered and not selected for ordinary copying. They may still be
useful for explicit links or query results, but such appearances do not preserve the task's lifetime.
This decision concerns inline task copying; it does not make every reference in Hila an owner.
A separate command to delete a task everywhere, if offered, needs its own explicit scope.

### Editing and replica checks

- **Two tasks in one paragraph.** Split and merge the paragraph without merging T1/T2 or dropping
  their owning units. Define what deleting part of an owning range means before choosing spans.
- **Delete an owner while another device completes its task.** Without another owner, completion
  must not resurrect the task. Retaining the completion in recoverable history is a candidate;
  undo must define how it combines with that action.
- **Move an owner while another device completes the task.** Both the new location and completion
  should survive. A move cannot be mistaken for terminal deletion followed by unrelated creation.
- **Copy ownership while another device deletes the last known owner.** Shared ownership needs a
  rule for the concurrent new owner; a local reference count cannot establish global absence.
  Candidate: a valid concurrent owner preserves the task after merge. Specify how this interacts
  with provisional deletion and recovery before choosing the replication mechanism.
- **Move the same owner to two places concurrently.** Resolve or expose the competing moves;
  a competing move must not silently become a deliberate co-owner copy.
- **Delete the host note.** Its owning inline units participate in deletion even when the editor
  is closed. Under shared ownership, owners elsewhere may preserve a task; ordinary query results
  and non-owning references do not.

These obligations apply to B as well as C. Owning fragment identity may remove one association,
but it does not settle clipboard, shared-reference, or concurrent-move semantics.

## 2. Study cards and review history

This scenario does not choose between B and C. Existing records R1/R2 already have stable identity
and front/back fields. An SRS setup S binds those field identities and the source collection.
Neither model needs to copy the fields, create a prose fragment, or attach another card record.
Changing a field's display name preserves the binding; removing it makes the setup visibly invalid
until repaired. SRS must not silently substitute another field.

### Two-device trace

1. Both devices read R1's front/back and the current schedule under S.
2. Device A records a failed review V1. Device B independently records a successful review V2.
   Each review stores its own ID, setup/card identity, grade, and the timing/input information
   required by the chosen scheduler. Replaying V1 inserts no second review; V2 is not a duplicate
   merely because it concerns the same card.
3. After sync, both reviews survive. Each device derives the schedule from the same review set and
   scheduler version. A schedule row written by one device cannot replace that history.
4. Reads serve a schedule only when it corresponds to the current inputs. A persisted result needs
   an input revision or equivalent validity check. A worker that started before V2 arrived cannot
   publish its old result as current; reject that publication or mark it stale and recompute.

The schedule policy belongs to SRS. A small candidate is a deterministic fold over review time
with review ID as a tie-breaker, with defined treatment of clock skew and near-simultaneous reviews.
That ordering is reproducible, not proof of real chronology or useful learning intervals. A second
candidate groups concurrent reviews of the same prior schedule before advancing it. Test actual
grade/time examples before selecting either; do not promise equivalence to a known real-world order.

Candidate for the first product pass: keep history when card text changes and offer a learning reset.
Record the content revision reviewed so history is interpretable; an old revision is only readable
if its content is retained. A reset must distinguish its new learning history from late reviews of
the previous one. Binding changes and resets therefore need more than an overwrite of due dates.
Detailed reset semantics remain a follow-up, not a general event framework requirement.

### Shared machinery versus SRS work

The shared needs are stable identities, idempotent insertion, atomic writes, durable replication,
and a way to reject stale derived writes. Reviews can be ordinary append-only records written by a
small SRS function. Grades, review interpretation, learning resets, and schedule computation stay
with SRS. Source bindings and protected review writes need enforcement even when the UI is closed.

Index reviews by setup/card and support bounded history reads. Schedule recomputation may still
need a card's full history; paging does not make that computation cheap. Begin with measured costs.
If checkpoints become necessary, they remain derived results that can be invalidated by late input.
There is no evidence here for a universal incremental computation engine.

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

Candidate recovery behavior: retain cards and reviews together in recoverable deletion state;
restore them together, rebuilding schedules as needed. This does not retain orphan reviews in
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
   importer retains it. The receipt's useful lifetime follows the import setup/history, rather
   than the imported note.

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
| Import receipts   | Remember handled external items and prevent unwanted reimport | The import setup/history; survive imported-note deletion.             |
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

The card outcome is agreed. The receipt and timesheet cases are proposed counterexamples to test,
not accepted features or a settled lifecycle mechanism.

## Provisional boundary and cost

| Responsibility exposed by the traces                                        | Smallest candidate home                           | What remains unproven                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Atomic durable mutation, identity, replay, and convergent conflict handling | Runtime/storage boundary                          | Local transactions do not establish replicated atomicity; partial arrivals must not expose broken captures. |
| Helper writer checks and lifecycle visibility                               | Shared storage enforcement                        | Concrete authority and retirement rules for imported operations, restores, and offline work.                |
| Stable occurrences, document edits, and context previews                    | Editing/reference library                         | Split, merge, cross-document move, copy, and concurrent-edit behavior without duplicate placement truth.    |
| Task capture, project defaults, and queue result shapes                     | Task behavior plus Hila composition               | Owning inline units, co-owner replication, and contextual versus explicit task scope.                       |
| Card bindings, review records, and scheduling                               | SRS behavior                                      | A useful deterministic review policy and affordable invalidation/recomputation.                             |
| Lifecycle ownership and recovery presentation                               | Hila policy backed by shared lifecycle operations | How to enforce card-owned reviews and setup-owned import receipts during sync and recovery.                 |

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

**Agreed exploration outcomes:** card reviews share their cards' lifecycle. Inline-created tasks
remain live while at least one owning inline unit exists. Ordinary copying creates a co-owner of
the same task; cut-and-paste transfers an owner while preserving the task and its state. The inline
unit's shape, concurrent ownership rules, and storage representation remain open.

**Recommendations to test:** compare task-bearing fragments with separate task records and owning
occurrences under the agreed co-ownership behavior. Test copy-then-delete-original and concurrent
owner creation/deletion. Test card-owned reviews against importer-owned receipts. The earlier
preferences for surviving unreferenced inline tasks and container-only project deletion are
withdrawn. No runtime architecture or ownership representation is selected.

### Next investigations, in order

Pause here. These are questions for the next session, not implementation tasks or new decisions.
Start with the first two; use their results to narrow the architectural sketches in the
[larger exploration](Relational%20runtime%20exploration.md#larger-exploration-next-investigations).

1. **Find the smallest understandable inline unit.** Compare a task token beside prose, an atomic
   task-bearing span, and a shared fragment embedded in prose. Trace two tasks in one paragraph
   through partial selection, split/merge, and removal of the sigil. Show exactly what the user
   selects and deletes. Then copy one into another note and edit its surrounding words: which text
   is local context, and which, if any, is shared task content? Co-ownership settles lifetime, not
   text sharing. Produce a short before/after sequence and the minimum facts each option needs.
2. **Make co-ownership survive ordinary editing and offline work.** Trace move, abandoned cut,
   repeated paste, copy-then-delete-original, and undo. Then race last-owner deletion against a
   new owner and against completion. Try the hardest case: two devices each delete a different
   owner while believing the other still exists. Specify the converged live state, recoverable
   state, and treatment of delayed paste before choosing a mechanism. Distinguish removing one
   occurrence from any future command to delete a task everywhere.
3. **Resolve discovery and context without inventing a project primitive.** Copy one task into
   notes in two organizational scopes. Compare queues based on owning occurrences with explicit
   task assignment; show result multiplicity, label/context editing targets, and navigation.
   Include a task created directly in a queue: what owns its lifetime, and how can it later appear
   inline? Seek one coherent experience without forcing every record into prose.
4. **Test whether lifecycle ownership is one reusable behavior.** Apply the same explanation to
   co-owned tasks, card-owned reviews, and importer-owned receipts. Trace host deletion and undo
   with module code inactive, including surviving owners elsewhere. Separate lifetime dependence,
   restricted writes, display references, and retention. Test small fixed relations before adding
   an ownership graph; if broader ownership is needed, expose its cycle and cascade costs.
5. **Make the SRS proof concrete.** Use two actual grade/time examples, including clock skew and
   nearly simultaneous reviews, to compare deterministic ordering with grouping reviews of the
   same prior schedule. State the resulting scheduling behavior, then race recomputation with a
   new review and deletion/reset. Identify the smallest freshness and replay facilities needed;
   avoid treating deterministic convergence alone as a useful learning schedule.

Keep storage models provisional until the editing traces discriminate between them. The next
session should leave one preferred inline model or a precise unresolved choice, a small ownership
conflict table, and revised architectural hypotheses. No implementation or migration planning yet.
