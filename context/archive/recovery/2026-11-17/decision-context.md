# Decision inputs, scenarios, and rationale — second recovery pass

Recorded 2026-11-17. Companion to the [first-pass decision log](decision-log.md), preserving its D01–D62 identifiers. This document enriches the evidence; it does not adopt a new design, overwrite the first-pass archive, or revise canonical architecture.

## Evidence and reading conventions

Each D heading below corresponds to the same ID in the first-pass log. Source codes identify the supporting material:

- **W** — [task/SRS worked traces](../../../explorations/Relational%20runtime%20worked%20traces.md), committed before the loss.
- **S** — [runtime sketches](../../../explorations/Relational%20runtime%20sketches.md), including the two-device delete/edit trace.
- **B** — [runtime exploration brief](../../../explorations/Relational%20runtime%20exploration.md).
- **O** — [outline exploration](../../../explorations/Relational%20outline%20exploration.md), the older committed checkpoint; later conversational corrections may supersede it.
- **C** — [older-concept review](../../../explorations/Relational%20concept%20review.md).
- **U01–U51** — verbatim user-input excerpts in `evidence/visible-user-inputs.md` inside the [first-pass ZIP](hila-recovery-2026-11-17.zip).
- **P** — prior uncommitted draft excerpts in that ZIP's `evidence/prior-draft-excerpts.md`.
- **H** — reconstructed handoff in that ZIP's `evidence/context-snapshot.md`; secondary evidence, not a transcript.
- **Conversation** — assistant/user turns still directly available when this second pass was written. Quoted wording is attributed; other prose is a reconstruction of the discussion.

Diagrams compactly restate discussed scenarios; they are not verbatim screenshots or claims of executed tests. Where the surviving record does not supply a full worked example, the entry says so rather than inventing an historical exchange. Earlier assistant recommendations are distinguished from user acceptance. The original generated layout image remains unavailable on this filesystem.

## Earlier runtime and feature decisions

### D01

**Explore a smaller foundation without inheriting every old mechanism.** The brief proposed three possible layers: a thin relational runtime, a reusable standard library, and Hila's opinionated composition. The important hypothesis was that reusable behavior can belong to Hila's foundation without becoming either its smallest core or an optional plugin. Universal homes, node/edge kinds, designations, and plugin rules were explicitly open to replacement.

The success criterion was total conceptual cost, not a deceptively small core that moves complexity into declarations or a large library. Concrete traces should identify which guarantees must remain enforced when the relevant widget/module is inactive. Historical concepts were retained when supported by uses, not merely because an older document marked them accepted.

**Sources:** B, “Goal and freedom to explore” and “Starting hypothesis”; C. **Related:** [D02](#d02), [D03](#d03), [D26](#d26).

### D02

**The simplicity preference arose from undo and cross-device deletion, not indifference to correctness.** The user hoped SQL transactions could avoid an application change log, then worried that rich history might lead to rebuilding CRDTs. They explicitly preferred object-level conflicting updates clobbering one another if that kept the system manageable.

The compromise preserved durable identity, deletion evidence, current winning content, and guarded recovery while declining precise concurrent prose merges. Thus accepting LWW did not mean treating every event as an undifferentiated latest write: ordinary content updates cannot cancel explicit deletion, and owner-derived inactivity must still reflect merged owners. Later rejection of gesture-dependency tracking repeats this same tradeoff.

**Sources:** U11–U13; W, “Object-level conflict resolution and retained history”; S. **Related:** [D16](#d16), [D18](#d18), [D32](#d32).

### D03

**Two investigation sequences must not be conflated.** The initial task/SRS pass had five items: inline unit, co-ownership, discovery/creation, lifecycle/recovery, then SRS. These reached starting policies before the A/B runtime sketches. The later three-item sequence concerns placement integrity, mixed presentation/creation, and query/rendering feasibility.

The concept review distinguished real uses from their older implementation: named views remain findable when empty/broken; empty matrices need creation/configuration; label/body roles bridge bullets and documents; virtualization addresses genuine bounded-work needs. The original rationale for a members-only matrix-child restriction was not recovered, so it was a hypothesis to test, not a proven mistake. The film-study selection adds ordinary structured media data without expanding into scheduling or inventory logic.

**Sources:** W, “Next investigations, in order”; B; C; U26; recovered draft brief. **Related:** [D38](#d38), [D43](#d43), [D54](#d54).

### D04

**Recorded starting trace:** Home repairs contains “Call the electrician about the flickering light #task” and “Order replacement hinges for the cupboard #task.” A queue must expose two actionable records; completing one must not complete the other or make the whole note a task. Navigation must return to the particular inline occurrence.

Alternatives included fields inside prose atoms, addressable task-bearing fragments, and separate task rows with owning occurrences. Explicit fragments offer deliberate context but more entry work. The chosen product unit is an atom with separate task targeting; it does not select separate physical occurrence tables. Stable IDs, rather than offsets or matching snippets, support exact navigation and replay. Capture needs coordinated task/occurrence creation so failed insertion does not leak an unintended ownerless task.

**Sources:** U01–U02; W, “Two tasks in one note,” storage comparison, detailed trace C. **Related:** [D05](#d05), [D06](#d06), [D26](#d26).

### D05

**The hybrid resolved the apparent fragment-versus-atom dilemma.** The user noticed that an explicit bordered fragment-like label could actually be the task matrix's label field. That gives deliberate naming without claiming a span of the host's prose.

In the recorded trace, editing a task label writes the task; editing its contextual sentence writes the note. Clearing a label returns to inference without deleting the task, removing owners, or copying the sentence into the label. Two copied atoms therefore share explicit wording and status while retaining different local prose around them. This is the substantive distinction behind the agreement, rather than merely a border treatment.

**Sources:** U02; W, “Item 1 resolved” and detailed trace C. **Related:** [D04](#d04), [D07](#d07), [D08](#d08).

### D06

**The user accepted imperfect context extraction rather than requiring exact prose capture.** The expected failure was often extra unrelated prose from the same or neighboring line. Two adjacent task atoms with prose before/after should prefer the closest available contextual phrase and avoid identical labels when practical.

“Claimed” context was clarified as best-effort presentation, not exclusive ownership or rewriting. Changing the heuristic must not change stored prose or lifecycle. Selecting an atom alone copies/deletes the atom; selecting surrounding words too can carry both. That boundary avoids a heuristic unexpectedly expanding a destructive edit. Converting selected prose into an explicit label and plain-text export were left as editing traces, not settled by the label design.

**Sources:** U01–U03; W, “Item 1 resolved.” **Related:** [D04](#d04), [D05](#d05), [D07](#d07).

### D07

**Several owners can offer different reasonable descriptions of the same unlabeled task.** The selected shortcut is an inherent deterministic occurrence ordering, avoiding a second stored “preferred owner” assignment. Removing the chosen occurrence can naturally change which context is preferred.

The queue edge case was deliberate: a project-scoped queue may match occurrence B, but display preferred occurrence A's context elsewhere. The user accepted that surprise in exchange for a consistent task label everywhere, with an explicit task label available to resolve confusion. Navigation must identify the displayed context rather than silently opening another location. This policy does not make the preferred occurrence a privileged lifecycle owner.

**Sources:** U03, U06; W, “Item 3 resolved.” **Related:** [D05](#d05), [D08](#d08), [D11](#d11).

### D08

**The offline races show why counting owners locally is insufficient.** One device can remove its last known owner while another creates an owner: after merge the surviving owner preserves the task. Conversely, two devices can each remove a different owner believing the other still exists: after merge none remain and the task becomes recoverably deleted.

Those outcomes make copied inline atoms co-owners, not clones, and require liveness to follow merged claims. A queue result or non-owning reference does not count as an owner. Host-note deletion must remove its claims even with no editor mounted. A local final-owner trigger remains plausible, but must not emit an unconditional explicit-deletion tombstone that overrides a concurrent surviving owner.

**Sources:** U04; W, ownership-race table; S, “Two candidate boundaries.” **Related:** [D09](#d09), [D13](#d13), [D16](#d16).

### D09

**Recorded clipboard trace:** cutting the sole inline owner makes the task absent from live queues but recoverable; paste restores that task ID with a destination owner. If another owner already keeps it live, paste only adds the destination occurrence. Evicting the clipboard abandons the transfer, not necessarily its retained recovery history.

The user initially expected stable identity alone to solve concurrent completion during cut/paste. The qualification was that mergeable content must survive deletion and paste must use its winning state, not replay an obsolete clipboard snapshot. Undoing a paste removes only its new owner; undoing an eligible cut restores the removed owner. Simultaneous cuts to two destinations were only a working expectation, not a separately confirmed concurrency policy.

**Sources:** U04–U05; W, “Item 2 resolved.” **Related:** [D08](#d08), [D16](#d16), [D18](#d18).

### D10

**A lengthy metaphor exploration was explicitly abandoned.** Candidate gestures for existing task rows included selecting an existing task during `#` insertion, dragging a row into prose, and cutting/pasting a row. Copying a standalone row was tentatively treated as cloning/template use, unlike copying an owning prose atom. Cutting/dragging through recognized matrix views also raised whether all prior owners should be severed.

On returning, the user questioned what gap these gestures filled and dropped them. The surviving distinction is simple: `#task` creates a new attached task; `@` refers to an existing task without lifecycle ownership. Inline atom clipboard operations remain. Recovery must not revive the discarded clone/move policies just because earlier reasoning sounded plausible.

**Sources:** U07–U08; W, “Item 3 resolved”; earlier visible user transfer discussion. **Related:** [D04](#d04), [D09](#d09), [D12](#d12).

### D11

**The scope discussion reduced apparent special cases to query semantics.** The user classified examples as either positional queries finding hosts with owning occurrences, or predicates on the task's own fields. An occurrence belongs positionally to its host; a field named project can simply be text/enum.

Several matching occurrences should still yield one task row, and AND/OR nesting should be expressible with ordinary SQL meaning. Explicit project assignment can keep a task in a scope when its prose owner moves; positional scope follows the owner. That difference comes from the query, not the lifetime model. The preferred-label policy remains independent of which occurrence matched. Exact query-recognizer/builder mechanics were not selected.

**Sources:** U06; W, detailed trace C and “Item 3 resolved.” **Related:** [D07](#d07), [D12](#d12), [D13](#d13).

### D12

**Creation exposed a distinction between row identity recognition and matrix recognition.** A general SQL result may permit edits to identifiable fields while providing no obvious matrix/defaults for a new row. A sufficiently simple single-matrix projection can instead expose ordinary matrix operations.

The user entertained a task-specific Add task control, but the shared starting rule avoids making queues a special owner or collection type. Creation uses explicit matrix defaults/presets; filters are not instructions to invent field values. The later highly-rated-films example illustrates why a newly created row may not satisfy its view. Recognition criteria remain open: identifying one destination matrix is not blanket permission for insertion into every query touching it.

**Sources:** W, “Item 3 resolved”; earlier visible user queue-creation discussion. **Related:** [D11](#d11), [D13](#d13), [D53](#d53).

### D13

**Standalone tasks removed an unnecessary retention problem.** After dropping row transfers, the user asked why a standalone task needed anything beyond normal matrix-row lifetime. The answer separates that row from an inline-created task requiring at least one owning occurrence, and from a review requiring its card.

Matrix membership is a boundary, not another co-owner interchangeable with an atom. A task cannot survive deletion of its entire matrix merely because prose elsewhere points to it. The proposed local owner-removal trigger need not add a special task-field flag: the removal cause and retained ownership evidence can establish dependence. But that evidence must survive long enough for sync/recovery; saying “no flag” does not eliminate the underlying distinction.

**Sources:** U08; W, “Shared lifetime rule”; S. **Related:** [D08](#d08), [D16](#d16), [D20](#d20).

### D14

**Visible tombstones were considered and withdrawn.** The user briefly preferred inline owner atoms becoming tombstones, then explicitly chose clearing them for a simpler first version. Deleting a task row or its matrix therefore removes affected owning atoms from live prose while preserving surrounding words.

This differs from deleting one co-owner: direct target deletion invalidates all relevant owner appearances. The clearance is a host-content edit, so restoring it can conflict with later prose edits. Hidden lifecycle evidence still needs to survive; removing a visible marker does not mean forgetting deletion. The later stale-host race tests exactly how clearance can remain effective when another prose revision wins.

**Sources:** U09; W, “Item 3 resolved”; S, adversarial trace. **Related:** [D16](#d16), [D18](#d18), [D21](#d21).

### D15

**The import receipt is a counterexample with a specific behavioral purpose.** Importer I handles external item E, creates note N, and records receipt R keyed to the source item. If the user deletes N, retaining R lets the next import skip E instead of recreating unwanted content. Deleting R with N would defeat that promise.

The user settled a non-owning note link in either direction and retained import-source identity. This is more specific than provenance alone. A conditional timesheet example reinforced that restricted writers do not determine lifetime: recorded work may outlive its task. Neither importer nor timesheet became a new feature commitment. A unique receipt key alone also cannot prevent duplicate imported notes across devices; stable output identity/reconciliation remains necessary.

**Sources:** U10; W, import/timesheet counterexamples; S. **Related:** [D13](#d13), [D20](#d20), [D26](#d26).

### D16

**Deletion must clobber visibility without discarding later content.** In the clipboard race, one device cuts/deletes while another completes or edits the task. The deleted task's fields continue to reconcile, but completion alone cannot restore it to live queries. Explicit paste or eligible recovery restores lifecycle against the winning content.

Likewise, a late review cannot revive a deleted card or schedule. The invariant is not limited to edits delivered in one “sync round”; arrival batches must not determine whether deletion holds. Last-owner inactivity remains a different cause from explicit deletion because merged surviving owners can resolve the former. These are logical state distinctions, not a committed physical table layout.

**Sources:** U05, U11–U13; W, “Object-level conflict resolution” and SRS deletion; S. **Related:** [D08](#d08), [D09](#d09), [D24](#d24).

### D17

**Atomic transactions were insufficient for the requested post-commit recovery.** The user's question was whether putting cascades in one transaction automatically supplied an undo stack. The recorded answer separates all-or-nothing mutation from preserving enough before/after evidence to perform a later reversal.

The accepted personal-note-taking assumption allows long, fairly complete change history and eventual per-object version inspection. Space pressure may prune oldest content history, but whole recovery entries/groups must either remain usable or be marked unavailable when prerequisites are gone. This does not require a history UI initially. History must include trigger-produced effects and host-content edits, not only the initiating row operation.

**Sources:** U12–U13; W, retained history and recovery eligibility. **Related:** [D18](#d18), [D19](#d19), [D20](#d20).

### D18

**Recorded cascade example:** N contains sole owner A of T; M contains owner B of U, while P contains another owner C of U. Deleting N and M in one action removes A/B, deletes T recoverably, and leaves U live through C. Eligible undo restores N/M/A/B/T lifecycle together without rolling back U's current content or a concurrent completion of T.

Undo groups follow user actions, not necessarily every database transaction. Eligibility uses revision identity and a backward history cursor; identical current text is not proof of no intervening edit. The later sketch further clarifies that merely having a losing concurrent revision in history does not itself disqualify undo: the current winning authored revision and relevant lifecycle revisions matter.

**Sources:** U12–U13; W, deletion/recovery trace; S, winning-host table. **Related:** [D16](#d16), [D17](#d17), [D19](#d19).

### D19

**The no-fallback rule deliberately sacrifices some recovery.** Directly deleting T clears sole owner A from surviving note N. If N is subsequently edited, the old atom-removal edit cannot be undone safely under the chosen object-level rules. With no other valid/restorable owner, T also cannot be restored.

The user explicitly rejected alternative destinations or silently making T standalone. The whole undo entry can be hidden/skipped when its dependency checks leave nothing eligible. An independent eligible subset may still restore with a brief skipped-object report; wholly ineligible entries need no extra confirmation flow. Required matrix/card dependencies must also survive or be validly restored. This prevents “successful undo” that actually produces broken links or changes lifetime semantics.

**Sources:** U13; W, recovery eligibility and direct-delete example. **Related:** [D13](#d13), [D18](#d18), [D21](#d21).

### D20

**History retention has two different jobs.** Old text snapshots support user-visible undo; lifecycle evidence prevents a long-offline replica from reintroducing deleted data. The user observed that lifecycle data need not grow with content volume and could survive much longer, potentially indefinitely.

The sketches add a concrete use: retained ownership claims distinguish formerly dependent rows from standalone rows even after old host content is pruned. This avoids requiring a special task-field marker without pretending the fact can be forgotten. Separate logical lifecycle/content state was accepted; representing them as distinct physical object kinds and safe lifecycle compaction were left open. Pruning old content must not silently erase the deletion rule.

**Sources:** U13; W, history retention; S, ownership evidence. **Related:** [D13](#d13), [D17](#d17), [D22](#d22).

### D21

**The adversarial host race motivated explicit known-atom retirement.** N initially contains A→T and B→U. Device 1 deletes T, writes n1 clearing A, and retires known A. Device 2 writes n2 changing prose but retaining A/B and may complete T. If n2 wins, T must remain deleted and A must still be absent from live content; B/U survive.

The candidate adapter filters the winning authored document by retired atom IDs/current target lifecycle and indexes that same live projection. That avoids repair-write loops, but is explicitly an extension beyond pure document LWW, not a proven implementation. Restoring T through owner C later must not reactivate known A automatically. If n2 prevents host undo and no owner can return, the deletion action is ineligible.

**Sources:** S, adversarial trace/cleanup; U16 qualification. **Related:** [D14](#d14), [D18](#d18), [D19](#d19), [D22](#d22).

### D22

**Unknown X is different from known retired A.** The user proposed same-ID restoration effectively cancelling deletion. The accepted qualification preserves known occurrence removals while allowing previously unknown offline X to become live after explicit restoration of T.

While T is deleted, X's underlying authored content is retained but excluded from live appearance and ownership; X cannot revive T. Receiving X before versus after restore must produce the same result, so merely arriving during deletion cannot permanently retire it. This removes a potential deletion-generation mechanism for unknown owners and parallels locally-known SRS reset scope. It does not erase the host edits or known retirement caused by deletion, nor establish a full multi-replica proof.

**Sources:** U16; S, “Agreed extension.” **Related:** [D16](#d16), [D20](#d20), [D21](#d21), [D24](#d24).

### D23

**Recorded review race:** two devices read one card's existing schedule; device A records Again at 09:00, while B independently records Good at 09:02 before sync. Each review has its own stable identity and scheduler inputs. Replaying one event is not another review; the two genuine actions remain two steps.

The user preferred processing them sequentially rather than grouping them as observations of the same prior schedule. Review time plus ID was an illustrative deterministic order, with clock skew accepted; exact ordering and SRS algorithm were not selected. Existing front/back fields bind by stable field identity: renaming a field should preserve the binding, whereas deletion visibly invalidates it rather than silently selecting a replacement.

**Sources:** U14; W, study-card trace. **Related:** [D24](#d24), [D25](#d25), [D40](#d40).

### D24

**Reset deliberately has local knowledge scope.** When a device resets learning, it deletes the review identities it knows. A genuinely unseen review arriving later remains applicable; re-delivery of an already-deleted known review does not count as new evidence and cannot undo its deletion.

This replaced an earlier proposed old/new learning generation distinction. The user explicitly accepted incoming unknown reviews instead of adding an epoch barrier. Card deletion remains stronger: reviews cannot restore the card or its live schedule. Whether card text edits should retain review history was still only an earlier candidate, not settled by the reset decision. That boundary should not be lost when recovering a simple summary.

**Sources:** U14; W, “Learning reset” and SRS deletion. **Related:** [D16](#d16), [D22](#d22), [D23](#d23).

### D25

**Deterministic computation did not establish constant retrieval.** The user proposed computing schedules live and expected constant rows per card. The discussion separated constant-size per-step scheduler state from replaying all applicable reviews without cached state: due-card selection may require O(cards + reviews) work before filtering or paging.

The agreed experiment is plausible ten-year daily due-card use, varying collection sizes and heavy lapse/retry histories. The documented target includes retrieval plus computation, roughly 250–500 ms on representative hardware, cold and repeated runs. Paging alone is not a total-work bound. If necessary, disposable local cache keys must include review inputs and scheduler version, invalidating for late reviews, deletion/reset and recovery. No measured result or concrete algorithm exists.

**Sources:** U14; W, “Performance hypothesis and verification target.” **Related:** [D23](#d23), [D24](#d24), [D03](#d03).

### D26

**The A/B exercise found a shared boundary, not a way to eliminate the hard work.** A uses permanently installed feature functions over ordinary relations plus generic storage/history; B centralizes recurring lifecycle/recovery checks in a feature runtime. Both need editor adapters for atom extraction/cleanup, retained ownership evidence, and distinction between content and lifecycle.

The user favored B because ownership belongs above generic change tracking/native SQL. Its benefit is one tested implementation of repeated rules; its cost is shared metadata and obligations on every writer. Required checks must work with UI inactive. Staging partially received actions until required records arrive was only a candidate admission mechanism; local SQL atomicity does not supply replicated atomicity. No arbitrary lifecycle-expression engine or external plugin framework was selected.

**Sources:** U15; S; W, “Provisional boundary and cost”; B. **Related:** [D01](#d01), [D08](#d08), [D18](#d18), [D21](#d21).

## Outline structure, conflicts, and discovery

### D27

**Shared records across presentations.** Sources: O; U17; film-study conversation.

The motivating product was explicitly a combined Obsidian/Workflowy experience. In a notes presentation, one selects a title from a flat list and edits full content beside it. The same identity becomes an outline bullet whose title is editable inline and whose longer text expands below. A table exposes the same fields. These are not import/export conversions or three copies that must be synchronized.

The later film example makes that concrete: Arrival appears under Cinematography and Adaptation, in the Films collection, and in a flat note browser. Editing its title or notes through any route changes the same row. The work therefore needs common field roles and stable identities more urgently than a universal renderer or a fixed storage schema for every surface.

Stream and Miller columns were mentioned as possible future consumers. The discussion deliberately did not infer that their paging, path navigation, or screen layout was already solved merely because shared records were solved. Related: [D29](#d29), [D38](#d38), [D39](#d39), [D43](#d43).

### D28

**Outline position versus lifetime.** Sources: O; U18; P; Conversation.

The older architecture used a covering ownership outline: every record had a home, which helped discovery but made every feature responsible for managing ownership. The user identified subtree deletion as the main concrete reason outlining appeared to need ownership, then separated the gesture from universal deletion policy.

Recorded SQL example:

```text
Before: R → Project → Kitchen → Lighting
SQL deletes only Project.
After: Kitchen and Lighting survive as matrix records.
```

Kitchen's former incoming route is invalid. Its intact subtree can appear under Unplaced and be reattached without changing identities or matrix membership. An outline subtree-delete command would deliberately select more affected records; that is a different operation. SQL should make tree operations fluent without imposing subtree lifetime on every parent-row deletion.

This separation later permits natural last-appearance matrix deletion as an explicit gesture without reviving the old universal ownership model. Related: [D13](#d13), [D31](#d31), [D35](#d35), [D58](#d58).

### D29

**One focused root, with path-specific navigation.** Sources: O; U18.

The user could see value in flat search results with ancestor context but did not expect arbitrary query results to be rendered as a tree without a focused root. Paging may omit the root from the loaded/visible region; that does not remove the logical focus.

Mirrors make a single canonical breadcrumb misleading. Arrival reached through Cinematography has a different navigation path from Arrival reached through Adaptation, while remaining the same editable record. The shared node does not need duplicated data to preserve those paths; rendered occurrence identity includes the path.

This is a presentation requirement, not a selected root-record storage scheme or a complete paging algorithm. It also bounds auto-outdent: the current view's focused root can prevent moving to a higher visible level. Related: [D27](#d27), [D30](#d30), [D50](#d50).

### D30

**Independent root appearances; shared children.** Sources: O; U21, U24; Conversation.

Recorded example:

```text
Projects                    Today
└─ Kitchen                  └─ Kitchen  (same record)
   └─ Lighting                 └─ Lighting  (same shared child)
```

Moving Today's Kitchen appearance does not move the Projects appearance. Editing/deleting/reordering Lighting changes the shared Kitchen child structure everywhere. Outdenting Lighting while focused through Today removes the shared Kitchen→Lighting relationship and places Lighting after the focused Kitchen appearance in Today. It no longer appears beneath Kitchen through Projects.

The user tested this Workflowy outdent behavior and found it natural. The conceptual simplification was that every appearance has its own incoming location; sharing begins with record content and its outgoing children. Treating all incoming parents as one canonical parent would lose that distinction. A separate stored child-list object or rendered-appearance object was not shown necessary; ordered placement relations remained a candidate representation.

This does not mean every rendered descendant path needs its own stored edge. Related: [D29](#d29), [D31](#d31), [D36](#d36).

### D31

**Subtree deletion must account for appearances collectively.** Sources: O; U22–U23.

The user first explored original-versus-mirror behavior, then tested that deleting the second-to-last Workflowy appearance makes the final one behave like an ordinary record. That supported equivalent incoming appearances rather than a permanent privileged original.

Deleting a subtree that contains one Kitchen mirror should remove that appearance, not delete Kitchen's shared children while another Kitchen appearance remains elsewhere. Conversely, deleting all appearances within a selected structure must not preserve their contents merely because each appearance sees another selected appearance.

The user supplied the thought experiment of B mirroring A with no other mirrors: act as if B is deleted first, leaving A ordinary, then delete A and its remaining subtree. That example arose while cycles were still being considered; the later no-cycle preference removes some such shapes but not the need to consider overlapping deletion targets together.

The conclusion is narrower than “delete every reachable record”: record reachability and the gesture's affected set are different queries. Exact query implementation remains open. Related: [D28](#d28), [D30](#d30), [D32](#d32).

### D32

**Three stages of the move-conflict argument.** Sources: O; P; U25, U27–U29; directly visible Conversation.

First, the user observed that Workflowy permits cyclic mirrors. Expand-all stopped after a few levels while manual expansion continued. The user then questioned the product need for cycles and their effect on relational queries. The leading policy became exclusion of placement cycles; limiting rendered depth alone did not address query semantics.

Second, the assistant initially proposed choosing an acyclic subset of latest placement edges. With concurrent moves A-under-B and B-under-A, it would retain A→B, suppress B→A, and make A Unplaced because both former root edges had been overwritten. The user correctly challenged the premise: rejecting A's entire atomic move should leave its former placement intact.

```text
Initial                 Concurrent intents         Resolution if B's move wins
R                       Device 1: A under B        R
├─ A                    Device 2: B under A        └─ A
└─ B                                                  └─ B
```

There is no inherent reason for A to be Unplaced in this two-move-only trace. Checking another current valid appearance requires current-state queries, not history. Recovering a prior parent after a latest-parent overwrite requires retained information, but that is a representation issue, not a product argument for orphaning the record. The user preferred detecting and omitting the losing move during resolution, not applying it and then visibly rolling it back. No physical replay engine was selected.

Third, the accepted outline-only counterexample introduced a later deletion whose local selection depended on the losing move:

```text
Initial             Device 1                    Device 2
R                   Move A under B.             Move B under A.
├─ P                Delete now-empty P.
│  └─ A             Deletion targets only P.
└─ B
```

Choose B's move and omit A's move. A therefore retains P as parent; B is beneath A; the recorded deletion still deletes P. A is now Unplaced with B below it. No SQL gesture is needed to produce this case.

Three alternatives were explicitly contrasted:

| Resolution                                                    | Consequence                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| Omit the losing move; keep recorded deletion targets          | P disappears; A/B survive under Unplaced                      |
| Replay the semantic subtree gesture against revised structure | P, A, and B disappear, including records not targeted locally |
| Reject later gestures dependent on the losing move            | Preserve P/A/B, but need gesture-dependency machinery         |

The user accepted the first as consistent with clobbering and rejected dependency tracking as excessive sync complexity. A preceding example using raw SQL deletion of P had been correctly criticized as a non sequitur; preserve the outline-only trace when explaining the compromise.

Accepted product behavior is not a proven convergence algorithm. Same-placement conflicts, multi-move cycles, retained predecessor information, atomic delivery, and late evidence still need implementation work. Related: [D02](#d02), [D28](#d28), [D33](#d33), [D34](#d34), [D35](#d35).

### D33

**Wall-clock ordering reflects remembered intent, not causal certainty.** Sources: U30; Conversation.

After the behavioral argument was resolved, the user supplied the provisional tie policy: latest wall-clock competing move is most likely the user's current, memorable intention. This was explicitly a placeholder until implementation reveals a good reason to prefer something else.

The assistant completed that proposal with a stable move-ID tie-breaker and noted clock skew. The user then asked whether item 1 was complete, rather than requesting a clock-correction or causal-order subsystem. Treat the timestamp preference as explicit user policy and the ID tie-breaker as its assistant-supplied deterministic completion.

The policy orders competing valid intents; it does not prove that first-arrival rejection, per-edge LWW, or sorting all edges without prior locations implements whole-move rejection. Related: [D02](#d02), [D32](#d32), [D34](#d34).

### D34

**No deferred surprise from a rejected move.** Sources: U31; Conversation.

The older draft left open whether suppressed candidates might later reactivate. The assistant proposed that rejected moves should not retry simply because a subsequent edit makes their destination permissible; the user explicitly agreed.

The important distinction is a product outcome versus storage mechanics. The user can issue a new move. An old failed action should not unexpectedly move a record days later after another branch changes. This does not license replicas to permanently reject different operations according to arrival order; a deterministic rejection protocol is still required.

No separate replay/resurrection example was worked to completion beyond this policy clarification. Related: [D32](#d32), [D33](#d33).

### D35

**Unplaced solves missing access, not historical organizational damage.** Sources: P; U32; Conversation.

The assistant's initial question about “unreachable records versus broken placements” was unclear to the user. The concrete example clarified it: a film appears under Cinematography and Favorites; SQL deletes Cinematography but Favorites survives. Should Unplaced flag the lost Cinematography appearance?

The user answered no: Unplaced is specifically for records otherwise unreachable through the outline, not records that ever had a broken placement. Favorites still provides access to the film and its shared children.

The earlier Kitchen/Lighting example supplies the positive case: no surviving route after parent deletion means Kitchen appears as the disconnected subtree root, not a flat list containing both Kitchen and Lighting. Reattach Kitchen and the subtree leaves Unplaced. This is a derived discovery surface, not a new durable parent or owner.

The conversation did not finalize discovery entry points or internal-feature scope. A later matrix-as-route decision broadens the access relation beyond stored positional edges. Related: [D28](#d28), [D32](#d32), [D56](#d56), [D57](#d57).

### D36

**Why the lower half keeps identity.** Sources: O; U19–U20, U41; Conversation.

The user initially proposed minting new identities for both split/merged records and transferring dependencies. Discussion exposed the burden on incoming links, mirrors, feature data, and offline edits. The direction changed to retaining identity: upper destination for merge; one existing identity for split.

The user then tested Workflowy. A mid-title split of a mirror leaves the lower half as the shared record, updates other appearances to lower-half text, and inserts an ordinary upper sibling locally. Initially the user expected the upper half to remain original, then reversed that preference: children appear below the item, making lower-half identity more natural.

Later film-study discussion refined the type of the newly created upper row: another film is generally the natural default. “Ordinary sibling” in the older committed outline document therefore needs qualification; the sibling is a new independent appearance/record, but not necessarily an ordinary-note matrix member.

Fields/body/children remain with the original lower identity rather than being duplicated or guessed across halves. At the beginning/end of a title, the later insertion rules preserve the populated original and create an empty neighbor; do not interpret every boundary insertion as moving all structured data into an empty row. Related: [D37](#d37), [D45](#d45), [D47](#d47).

### D37

**Merge simplicity comes from refusing ambiguous loss.** Sources: O; U19–U20.

Backspace at the beginning of a lower bullet naturally merges into the upper one. Keeping the upper identity avoids rewriting every incoming relationship to two replacement records. But a title-text gesture should not silently discard a lower record's notes, fields, children, or feature connections.

The user preferred blocking whenever more than label text would be lost or a destructive choice would need user input. Their Workflowy test also found that ordinary backspace merging into a mirror was disallowed. The recorded starting guard covers mirror-involving merges rather than trying to define cross-appearance text merging.

Rich inline atoms and which field values count as substantive are implementation questions. The discussion did not invent a generalized record-merging wizard. Related: [D02](#d02), [D30](#d30), [D36](#d36), [D48](#d48).

## Mixed-project roles, fields, and layout

### D38

**Why film study was selected.** Sources: C; P; U26; Conversation.

The user asked to look beyond tasks/SRS for an already earmarked use case that would make a mixed project easier to reason about. Prior notes mentioned media reviews/metadata, recipes/groceries, microjournaling, inventories, fitness and web clipping. Media logging was chosen because it adds substantial prose and straightforward fields without requiring recipe aggregation or scheduled journaling behavior.

The accepted brief uses topic notes on cinematography/editing/adaptation; a film/review record with title, year, rating, watched date, longer notes; tasks to watch/compare/write; terminology cards; Films and Films to revisit/Due cards navigation entries. One simple review per film and manually entered metadata keep the exercise bounded. Separate Films and Reviews matrices were not mandated by the brief.

The first actual tree was Film study → Cinematography with Arrival, Lighting observations, and What is negative fill?, plus Adaptation with a mirror of Arrival. This gives an ordinary note, a film, a card, and a task inside prose without reopening the abandoned task-row transfer gestures.

The remaining large item after these traces is query/rendering feasibility, not another feature family. Related: [D03](#d03), [D27](#d27), [D39](#d39), [D43](#d43), [D54](#d54).

### D39

**Role bindings should solve common representation, not create view-specific state gratuitously.** Sources: C; U33, U36; Conversation.

The user accepted title and optional longer-notes as roles naturally shared by notes and outline, with a sensible table-column presentation too. The assistant tried two counterexamples for overrides: English/Japanese vocabulary with reversed front/back, and people with familiar versus formal names.

The user found neither compelling. Review reversal need not persist a new presentation mapping; a person matrix can choose Preferred name or Full name as its title role regardless of its actual field name. Different views can interpret a role without rebinding it to another column.

Thus stable matrix-level role binding is the starting requirement; per-view override machinery is deferred. This does not settle whether every derived expression is writable or which exact field types qualify for a role. Related: [D27](#d27), [D40](#d40), [D41](#d41), [D53](#d53).

### D40

**Cards are ordinary editable records outside review.** Sources: U33, U36; W; Conversation.

The user specifically preferred overloading title/longer-notes roles for front/back. In the film-study outline, What is negative fill? can display its question as bullet text and its answer below; a notes view can edit the same fields without a card-specific document model.

Reversing a review prompt is not a compelling reason to store a second view binding. The review interaction can choose direction independently of ordinary browsing roles. This was a rejection of unnecessary persistent presentation state, not a complete scheduling or reversible-card specification.

Do not infer that splitting any populated card is harmless: title gestures retain original attached data according to established rules, and merge/type-conversion guards remain relevant. Related: [D23](#d23), [D36](#d36), [D39](#d39), [D48](#d48).

### D41

**Absent body content should not invalidate a presentation.** Sources: U33; Conversation.

The user walked through three schema shapes: title plus longer notes; title plus structured fields but no body; and title alone. The second can use the notes pane as a larger form editor. The third is awkward but still valid, using a placeholder or no expanded focus content.

This matters because forcing every matrix to own a body column would weaken the promise that existing structured data can participate naturally. Presentation has graceful fallbacks rather than imposing one universal fixed note schema.

No exact title-only placeholder, focus interaction, or mandatory column count was selected. Related: [D27](#d27), [D39](#d39), [D42](#d42).

### D42

**Secondary fields below are an association cue.** Sources: U33, U36, U38; Conversation.

The user considered fields to the right when there is space and a secondary row below otherwise. Always below felt more predictable and made it easier to tell which record each value belongs to, although it could waste width on desktop. They then agreed to the consistent below-item region.

The assistant floated an optional compact desktop mode to the right, but that was not adopted. The later mixed-table design deliberately reuses below-item secondary rows to reduce the conceptual difference between outline and table presentations.

This is a layout direction, not a pixel specification or a requirement to expose all fields at all times. Related: [D41](#d41), [D43](#d43), [D44](#d44).

### D43

**Heterogeneous tables preserve the outline's actual order.** Sources: U35, U38, U40; C; Conversation.

The user rejected squeezing dissimilar records into a visually homogeneous table without markings. They proposed contiguous homogeneous runs sharing vertical alignment for semantic common fields. The assistant compared that with common-columns-plus-expansion and a sparse union of columns.

The stress case was film → note → film → card → film. Grouping all films together would change positional order; repeating a full table header for every one-row run would overwhelm the content; a union table would be wide and make unsupported fields look misleadingly empty. Those tradeoffs led to the chosen hybrid in D44.

The later “air gap” correction is behavioral as well as visual: the end of a film run is a collection segment boundary even if ordinary notes immediately follow. It is not the same as the end of the outline sibling list.

This supplies a concrete alternative to the older blanket foreign-matrix-child ban. It does not imply that all different schemas share field meaning just because two columns have the same label. Related: [D38](#d38), [D44](#d44), [D49](#d49), [D56](#d56).

### D44

**What layout A established, and what the lost image cannot establish.** Sources: U38–U39; Conversation; H.

The generated comparison used Arrival and Blade Runner 2049, then Lighting observations, What is negative fill?, then In the Mood for Love. Shared Title/Notes columns stayed aligned. Films had secondary Year/Rating/Watched values; notes/cards did not display fake empty film fields.

Variant A repeated small field labels beside each record's secondary values. Variant B tried secondary headers for contiguous film groups. The assistant preferred A because values stayed self-describing, alternating schemas did not produce repeated header bands, and collapsing one record did not make another harder to understand. B's Year heading beneath the Title column could look like a competing set of columns.

The user explicitly chose A and accepted alignment of secondary fields within homogeneous runs plus bounded notes previews. Long prose should expand into editing rather than make a single table row dominate the screen. A single top header marks shared fields; secondary labels retain local context.

The original image path is recorded in H but the file is unavailable. This entry recovers the described structure and the actual choice, not exact typography, dimensions, or a pixel-perfect mockup. Related: [D42](#d42), [D43](#d43), [D60](#d60).

## Editing traces and corrections

### D45

**Why new rows usually inherit type.** Sources: U34, U41; Conversation.

The original tension was symmetric: creating an ordinary note after a film makes continuing a film list awkward, while creating another film makes inserting prose awkward. A special add-row button or unfamiliar shortcut for every typed insertion would undermine fluent outlining.

The user preferred same-type creation and a natural empty-row escape, analogous to ending a list. Mid-title splitting remained harder, but they eventually explicitly chose another film as the natural upper row. Ordinary matrix defaults carry over; the source film's populated rating/year/notes are not cloned.

This answer concerns type choice, not a general populated-record conversion system or a new task-row clone gesture. Required fields and default generation remain bounded implementation questions. Related: [D36](#d36), [D48](#d48), [D49](#d49).

### D46

**The table Enter reversal was deliberate.** Sources: U37, U40, U44–U45; Conversation.

Initially, while film-title splitting felt awkward, the user proposed spreadsheet-style Enter in tables: commit/navigate to an existing next row, create below only if necessary, never split text. The assistant endorsed presentation-specific behavior. The user later corrected cross-type navigation: differing contiguous runs have an air gap, so Enter at the end of a film run should create another film rather than navigate into the following note.

Once same-type splits and both-boundary empty-row exits were understood, the user questioned why a table title should insert at an end but not within a sequence with the same gesture. The rationale for avoiding split had weakened: identity and type handling were now specified. The remaining benefit was spreadsheet familiarity.

Research found that Tana officially documents end-of-title insertion between table rows. Its docs did not establish exact mid-title splitting; Notion's docs did not establish exact mid-title database-cell Enter either. The final recommendation was a product choice, not a claim that Tana/Notion had verified identical behavior.

The user accepted the same title-editing rules in outline and table. Enter at end now inserts below even when a same-type row already follows. A caret editing a title is distinct from a possible cell-selection navigation mode. Non-title fields remain different editors. Related: [D36](#d36), [D45](#d45), [D47](#d47), [D53](#d53).

### D47

**Focus behavior preserves the text being split.** Sources: U37, U41–U45; Conversation.

For a mid-title split, focus enters the lower text, which retains the original identity. At the beginning of a nonempty title, an empty typed row appears above and focus remains with original text below. At the end, a new empty typed row appears below and receives focus.

The asymmetry was not accidental: a newline before existing text ordinarily leaves the cursor with that text. Changing only character-zero behavior to focus the new upper row would make it differ from splitting at character one and disturb repeated-Enter expectations. The user ultimately accepted navigation Up when they want to edit/convert that inserted predecessor.

This focuses title behavior; it does not define caret restoration after every rich-text selection or IME event. Related: [D36](#d36), [D46](#d46), [D51](#d51).

### D48

**Current state, not remembered keystrokes, controls conversion.** Sources: U34, U37, U39; Conversation.

The assistant first restricted the escape to an untouched newly inserted row, to avoid erasing an existing film that merely had an empty title. The user corrected the history requirement: clicking an existing default/empty terminal row should behave the same as arriving there after an insertion.

The accepted guard is the row's full starting/empty state. Ordinary automatic defaults—such as an initial status—should not defeat the gesture. Conversely, an empty title with meaningful rating, notes, children or other substantive state cannot be treated as an empty placeholder solely from that title.

This gives consistent behavior after navigation without a special “just-created” mode. What precisely counts as defaults, and how a conversion affects identity/matrix membership under sync, was not finalized. SQLite does enforce explicitly declared NOT NULL constraints; the user's nullable-fields thought was not accepted as proof that SQL can bypass all requirements. Related: [D37](#d37), [D45](#d45), [D49](#d49), [D50](#d50).

### D49

**Type-run boundaries and sibling-list boundaries are separate.** Sources: U39–U40, U43; Conversation.

The assistant initially applied “terminal” to the entire sibling list. The user corrected it to the end of a contiguous run of film rows. Recorded trace:

```text
Arrival [film]             Arrival [film]           Arrival [film]
Lighting [note]   Enter →  | [empty film]   Enter → | [empty note]
                          Lighting [note]          Lighting [note]
```

The film converts without being the final sibling. The new note joins the following note segment; it does not automatically outdent.

The initial acceptance applied at the trailing edge. The later insert-above discussion extends conversion to the leading edge too, provided the empty typed row itself has focus. Interior emptiness alone is not the same boundary case. The rows' semantic matrix/type determines the segment; exact presentation rules for filtering or hidden rows were not settled by this example.

Related: [D43](#d43), [D48](#d48), [D50](#d50), [D51](#d51).

### D50

**Exit type first, then optionally exit nesting.** Sources: U39–U40; Conversation.

The user explicitly chose conversion to an ordinary note at the same level. They also expected the resulting ordinary row to qualify for the normal empty-final-sibling outdent if it is at the end of the level and there is a level above within the focused view.

Thus a final empty film can undergo two separate Enter actions: first become an ordinary note without moving; then outdent as an empty ordinary final sibling. If another sibling follows, the structural outdent condition is absent even though the typed-segment exit was valid.

This avoids combining a schema change and a structural move into a surprising single action. At the focused root, do not invent a higher destination. Related: [D29](#d29), [D48](#d48), [D49](#d49).

### D51

**Upper-edge escape and the alternatives rejected.** Sources: U42–U43; Conversation.

After Enter at the start of the first film, the empty film above is not focused. The user considered two double-Enter variants: add an ordinary row above the empty film, or convert that empty film in place from focus on the original below. The first would make repeated Enter appear to drag the old empty typed row downward; the second felt like action at a distance.

The assistant recommended Enter, Up, Enter:

```text
|Arrival [film]       [empty film]         | [empty film]        | [ordinary note]
               Enter |Arrival [film]  Up  Arrival [film]  Enter Arrival [film]
```

Only the focused row converts. Clicking it first works too. The user explicitly accepted that without Up, repeated Enter continues making typed rows. This preserves conventional focus and avoids an extra special history flag.

An alternative was to focus the upper insertion immediately only at character zero; it was discussed but not selected. This entry therefore does not justify changing initial split focus to make the two-Enter shortcut shorter. Related: [D47](#d47), [D48](#d48), [D49](#d49).

### D52

**Neutral insertion was an invented problem, not a product requirement.** Sources: U40; Conversation.

The assistant proposed an “insert directly at the boundary” control and asked whether its type should follow the film above or note below. The user challenged why such a control was needed at all: Insert below is just as capable and has an unambiguous anchor.

The assistant withdrew the neutral-gap requirement. An anchored row insertion can inherit the source matrix, while the boundary conversion gesture handles switching to an ordinary note. A general type selector may still be useful later, but it is not required to solve this trace.

The lesson for recovery is to preserve the removal of an unnecessary question, not convert every floated control into an unresolved mandatory feature. Related: [D45](#d45), [D49](#d49), [D51](#d51).

### D53

**Uniform title gestures have a capability boundary.** Sources: U37, U45; W; Conversation.

The agreement was about the title editor. Enter inside longer-notes should behave like prose editing, and rating/date/select fields have their own completion/navigation semantics. Displaying a title column is not a reason to split a record while editing a different field.

Likewise, the earlier queue/view discussion did not grant arbitrary SQL results a creation target. A title split requires a writable record and an authorized creation/placement destination. A simple recognized matrix view differs from an aggregate or arbitrary projection.

These limits were stated in assistant recaps while preserving the settled view rules. No exhaustive matrix of readonly/derived editor behaviors was worked through. Related: [D12](#d12), [D39](#d39), [D46](#d46), [D60](#d60).

## Collection identities, navigation, and deletion

### D54

**Empty or broken results must not erase the thing being navigated to.** Sources: C; P; Conversation.

The historical review found concrete evidence for saved query identity: save/name/link/focus a query even when its result is empty or invalid. Empty matrices similarly need a place to configure columns, add a first record and name/delete the collection. These uses did not themselves justify mandatory outline ownership or a separate fundamental node type.

The later trace starts with empty Films and empty Films to revisit alongside topic notes. Opening Films exposes schema/creation controls; opening the saved view shows no matching films. Add Arrival, raise its rating and it enters the saved result; lower it and it leaves the result without leaving its matrix or topic placement.

The assistant also proposed keeping a saved query editable with an error after removing a referenced column/source matrix. That fits the identity need, but exact dependent-view lifecycle was not explicitly settled. Filters must not silently manufacture row defaults merely to ensure new rows stay visible.

Related: [D12](#d12), [D38](#d38), [D55](#d55), [D57](#d57), [D58](#d58).

### D55

**Matrix as one whole-table node, without equating membership with placement.** Sources: U46, U49; Conversation.

The concrete navigation trace gave Films an appearance under Film study and another under Weekend planning. Both open the same collection; adding Arrival through either affects the same matrix. Separately, Arrival may be placed under Cinematography.

The latest user phrasing was explicit: “a matrix node (as one unit, the whole table)” can be treated as a node. The assistant affirmed this at the product level while leaving physical schema open. A node-like collection identity can have a name, appearances and discovery behavior without allocating ordinary positional edges to every rendered member row.

This avoids both extremes: denying collections natural outline affordances, and automatically restoring the old universal matrix/view/node ownership architecture. The exact behavior of deleting the collection's last appearance is a separate gesture decision. Related: [D13](#d13), [D28](#d28), [D54](#d54), [D58](#d58), [D60](#d60).

### D56

**Opening Films counts as access to Arrival.** Sources: U49; Conversation.

The assistant identified a discovery consequence of treating matrix members as non-positional: if only stored outline placement edges count as access, every film lacking an individual appearance could be listed as Unplaced despite an obvious reachable Films collection.

The user explicitly accepted the matrix as a discovery route, especially with full inline rendering. Therefore preview length, current viewport and whether Arrival itself has a topic placement do not determine whether its content is accessible through the collection.

This changes the discovery relation, not matrix membership into ordinary child positioning. It also leaves open broader query-result discovery: the user accepted matrices as routes, not a blanket rule that every arbitrary saved query recursively supplies a new structural parent. Related: [D35](#d35), [D55](#d55), [D57](#d57), [D60](#d60).

### D57

**One Unplaced surface; optional all-collections inventory serves another use.** Sources: U47, U49; Conversation.

When asked where collections without an outline appearance should be found, the user proposed Unplaced. The assistant contrasted this with an All matrices / All saved views browser: Unplaced answers what cannot otherwise be reached; the all-objects browser finds an object even if the user has forgotten a still-valid location and supports collection-wide management.

The user confirmed Unplaced for currently unreachable matrices and saved views with the same ordinary-node rules. A dedicated catalog is therefore an optional management feature, not a required separate recovery mechanism.

The exact discovery scope still must avoid exposing internal review/receipt collections as accidental clutter. That scope question predates collection nodes and was not resolved merely by choosing the shared Unplaced surface. Related: [D35](#d35), [D54](#d54), [D56](#d56).

### D58

**The user changed the default for the final matrix appearance.** Sources: U47, U49; Conversation.

The assistant first proposed always preserving a matrix when its final navigation appearance was removed, distinguishing navigation deletion from explicit collection deletion. The user preferred final-appearance deletion to remove the matrix and its rows, matching ordinary outline entries and making deletion possible naturally in the outline.

The assistant reconciled this with position/lifetime separation: the outline command can select matrix deletion explicitly, while a raw SQL deletion of the matrix's parent need not infer that command. In the latter case, the matrix can remain and become Unplaced.

The nonlocal consequence was illustrated with Arrival. It can have topic appearances under Cinematography and Favorites, but if Films itself is deleted, membership lifetime deletes Arrival despite those appearances. By contrast, removing one of several Films appearances should leave the collection accessible through the others.

This remains a provisional product direction rather than a completed cascade/undo implementation. The next trace must distinguish deleting a membership-derived row from deleting an independent mirror appearance. Related: [D13](#d13), [D28](#d28), [D31](#d31), [D55](#d55), [D59](#d59).

### D59

**Confirmation is about external consequences, not collection size.** Sources: U47, U49; Conversation.

The assistant initially recommended confirmation for every nonempty matrix's final appearance, using a sample message about deleting Films and its 42 records and removing their appearances elsewhere. The argument was that undo can be ineligible after later edits or missing dependencies, so it is not an unconditional guarantee.

The user narrowed the rule: confirm only when external incoming references or appearances actually exist; otherwise ordinary undo suffices. That is the latest explicit policy, superseding the blanket nonempty-matrix rule. An arbitrary row-count threshold was never selected.

The target scope for an “external” relationship remains to be made precise: references to the matrix, its members, and saved-query dependencies are not automatically interchangeable. The natural test case is Arrival's appearances in other topics, but the discussion did not specify counting, wording, or concurrency handling for the dialog.

Related: [D18](#d18), [D19](#d19), [D31](#d31), [D58](#d58).

### D60

**Preview-only was a leaning; full inline rendering is not ruled out.** Sources: U46, U48–U49; Conversation.

The user initially leaned toward a bounded preview requiring focus to browse all members. It visibly makes Films the outline entry and avoids pretending each member already has an outline position. They recalled that trying to support member positions became difficult in the prior architecture, but explicitly requested devil's-advocate arguments before settling.

The assistant's strongest inline case was a project with surrounding notes, Films rows, and Due cards all browsable/editable without repeated focus changes. A preview with preserved cursor/scroll and quick return might capture part of that advantage, while making the structural boundary clearer.

The actual unresolved complexity is gesture semantics, not the ability to render membership-derived rows: what does indent, outdent, reorder, drag across the collection boundary, delete, or select across an ordinary-note/collection boundary mean? None requires granting a stored positional edge merely for rendering a row, but each needs a meaningful action.

After the long break, the user explicitly reopened full inline spread with collection affordances. The assistant clarified that preview-only had never been adopted and that full inline can still use bounded reads/virtualization. Latest discussion accepted matrix-as-node and matrix-as-discovery-route, while leaving these member-row gestures as the next product trace.

Do not turn this into either a final preview-only restriction or a claim that all full-inline gestures are already specified. Related: [D27](#d27), [D43](#d43), [D53](#d53), [D55](#d55), [D56](#d56), [D58](#d58).

## Recovery and durability

### D61

**Evidence preservation is not equivalent to transcript reconstruction.** Sources: U50–U51; Conversation; first-pass README and ZIP.

The resumed environment was clean on an older branch, while the remote documentation branch still held the latest pushed checkpoint. The assistant initially emphasized that committed work was intact; the user clarified that the missing uncommitted draft itself was substantial loss, because reconstructing it from discussion would have lower fidelity.

The first recovery pass therefore preserved a byte-exact committed baseline, selected verbatim user messages, old draft excerpts recovered from earlier tool output, and a clearly labeled context reconstruction before writing the decision inventory. This pass enriches that inventory without replacing evidence with newly invented rationales.

Transcript tools were unavailable on the host. An initial search only checked /workspace/.codex; after the user's correction, the actual /home/agent/.codex was checked too. Usual session/history paths were absent in the Cloud workspace. That establishes an access limitation here, not proof that all service-side or desktop copies have been destroyed. The generated layout image is likewise described, not falsely claimed recovered.

The initial package was subsequently committed/pushed as 5d88dc2. Its history is now durable independently of the VM; this newly written companion needs its own later checkpoint or export. Related: [D01](#d01), [D62](#d62).

### D62

**A pushed checkpoint is different from staging or a local commit.** Sources: U50–U51; Conversation; Git checks and official documentation recorded in first-pass package.

The concrete loss involved five previously staged documentation files, not missing remote commits. A fresh Cloud checkout exposed older prepared state, while GitHub retained af1b7d3 and its predecessors. The first-pass archive later became three committed files in 5d88dc2: README, decision log, and the 777,032-byte ZIP.

The assistant checked official documentation reporting a default saved-VM recovery window of up to seven days after the last start of a turn/task resume, separate from conversation history. The roughly month-long absence was consistent with expiry, but no lifecycle logs proved causation. Support investigation was mentioned without promising recovery.

The operational conclusion is that files, staging and local-only Git objects all depend on the same VM unless copied out. A remote push or user-saved archive provides an independent checkpoint. This is not retroactive permission for arbitrary future pushes; the user explicitly authorized the first package's commit/push, and subsequent requests must be interpreted in scope.

Related: [D61](#d61). No product architecture decision follows from the Cloud retention behavior.

## Relationships and unresolved seams

The main dependencies recovered from the discussion are:

- Shared identity connects atom co-ownership, mirror editing, and multiple presentations, but their **lifetime** and **placement** relationships remain distinct: D04–D10, D13, D27–D31, D55–D58.
- The same local-knowledge philosophy underlies review reset and unknown-occurrence recovery; it does not automatically select an outline move-rejection algorithm: D21–D24 versus D32–D34.
- Simple clobbering motivates guarded undo and acceptance of rare Unplaced outcomes rather than automatic recovery inventions: D02, D16–D20, D32, D35.
- Role bindings enable shared editors; contiguous segments and empty-state conversion make typed insertion fluent; neither grants arbitrary query writes: D12, D39–D53.
- Discovery is broader than placement, while deletion depends on the invoked gesture and matrix lifetime: D28, D31, D35, D55–D59.
- Rendering membership inline does not imply a positional edge or an unbounded query. That is precisely the next unresolved behavior/performance boundary: D56, D60, and first-pass O03–O06.

Remaining gaps must stay explicit: no fully specified move-convergence protocol, no final definition of all discovery entry points, no general cross-matrix conversion semantics, no complete full-inline matrix gesture contract, no measured query/rendering/SRS performance, and no exact recreation of missing assistant/tool history or image pixels. These are boundaries of recovery, not new requirements invented by this pass.
