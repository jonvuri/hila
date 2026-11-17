# Hila relational exploration — first-pass decision log

Recovered 2026-11-17. Scope: all substantive decisions apparent in the available conversation, including the earlier committed foundation and later uncommitted exploration. This is an evidence-oriented recovery document, not a new architecture specification.

## Reading the log

- **Agreed:** explicit user acceptance or a clear user instruction.
- **Provisional:** accepted starting policy, subject to implementation evidence.
- **Direction:** favored approach; representation or detailed behavior remains open.
- **Candidate/open:** assistant recommendation or unresolved question; NOT silently promoted to agreement.
- `Uxx` refers to `evidence/visible-user-inputs.md`. Those quotations are selected source evidence, not a full transcript.
- **Baseline** refers to the exact committed documents archived under `baseline/committed-context.tar` at `af1b7d3`. For older decisions the baseline contains fuller wording than this inventory.
- Rationales below summarize the apparent reasoning in the conversation. They are not verbatim quotations unless marked as such.

## A. Exploration scope and governing preferences

### D01 — Provisional exploration, not canonical architecture replacement

**Status:** Agreed scope; already in baseline.

**Input/context:** User requested concrete runtime/library sketches and traces, then a provisional comparison with the older edge architecture (U15–U26).

**Decision:** Test simpler relational models against actual task/SRS/outline use cases. Older proposals are references, not constraints. Preserve canonical architecture while recording exploration separately.

**Rationale:** Avoid importing generic machinery merely because it existed before; require an identifiable product use for each abstraction. No code, migration, or performance claim follows from these discussions.

### D02 — Prefer simple object-level conflict resolution

**Status:** Agreed; baseline, reinforced later.

**Input:** U11–U13 and U29 prefer clobbering over recreating a CRDT system or tracking dependent gestures.

**Decision:** Use object-level LWW and explicit lifecycle/recovery rules, accepting some lost concurrent intent. Do not automatically pursue perfect merging.

**Rationale:** Personal note-taking scope permits a simpler implementation and predictable compromises. Lifecycle invariants still require deliberate handling; LWW is not proof that arbitrary graph conflicts disappear.

### D03 — Follow concrete use cases before choosing runtime/storage mechanisms

**Status:** Agreed sequence; selected brief was in lost draft, subsequent outcomes chat-only.

**Input:** U26 accepts film study for item 2 after placement integrity; prior review identified real uses for named views, matrices, roles, and bounded rendering.

**Decision:** Item 1 placement integrity/discovery; item 2 film-study mixed project; item 3 query/rendering feasibility. Tasks/SRS remain primary exercised features.

**Rationale:** One extra media-log schema exposes heterogeneous data behavior without requiring a second complex product. Query shapes should precede cache selection.

## B. Tasks and inline ownership

### D04 — An inline task is an owning atom, not a user-wrapped prose span

**Status:** Agreed; baseline.

**Input:** U01 compares heuristic atomic ranges with explicit fragments; U02 combines fast insertion with explicit shared labeling.

**Decision:** `#task` creates a new task row and a stable atomic owning occurrence. Surrounding contextual prose remains outside the atom.

**Rationale:** Preserve quick entry and atomic editing/deletion/clipboard behavior without requiring users to select and wrap prose. Copying the atom need not take its inferred surrounding sentence.

### D05 — Explicit labels belong to the task row

**Status:** Agreed; baseline.

**Input:** U02 identifies the bordered label as the task matrix's label, not surrounding document text.

**Decision:** Optional label is shared task content displayed within the atom; edits affect every occurrence. Clearing it keeps the task and resumes contextual labeling.

**Rationale:** User-controlled naming without fragment boundaries or per-occurrence conflicting labels.

### D06 — Infer nearby context without modifying prose

**Status:** Agreed heuristic direction; baseline.

**Input:** U01–U03: phrases on same/adjacent lines; closest task gets nearby unclaimed context where practical.

**Decision:** Best-effort contextual labels may include extra prose. Adjacent tasks should avoid claiming identical context when proximity can disambiguate, but heuristics never distort authored text.

**Rationale:** Good-enough automatic context supports fluent entry; explicit labels remain the remedy for ambiguity. Exact heuristic is not selected.

### D07 — Preferred occurrence is deterministic and shared across views

**Status:** Agreed; baseline.

**Input:** U03 proposes inherent ordering, no separately stored preferred pointer; U06 accepts display context from the usual preferred occurrence even outside the query match.

**Decision:** Choose a stable preferred occurrence deterministically from occurrences. Use its inferred context globally rather than relabeling per queue.

**Rationale:** Consistent task identity/presentation with no additional preference state. Exact total ordering remains an implementation choice.

### D08 — Surviving owners preserve an owned task

**Status:** Agreed; baseline.

**Input:** U04: any remaining owner keeps the item alive.

**Decision:** Copying an owning inline atom creates another owning occurrence of the same task. Removing one occurrence does not delete a task with another live owner; final-owner loss yields recoverable deletion.

**Rationale:** Copy-then-delete behaves naturally, and ownership reflects the merged surviving claims rather than one replica's local count.

### D09 — Cut/paste preserves task identity and reconciled content

**Status:** Agreed; baseline.

**Input:** U04–U05 request ordinary deletion on cut, same identity on paste, continued edits while recoverable.

**Decision:** Cut removes the occurrence normally. Clipboard retains identity/recovery information. Paste creates an owner and restores the same task when needed. Repeated pastes of copy or cut co-own the same task. Clipboard eviction does not resurrect it.

**Rationale:** Intuitive transfer of an existing inline task, with concurrent field edits retained. Do not overwrite reconciled state with a stale clipboard snapshot.

### D10 — No task-row transfer gestures into prose in the starting design

**Status:** Agreed reversal; baseline.

**Input:** Earlier cut/copy/drag metaphors were debated; U08 explicitly drops them. U07 distinguishes `@` references.

**Decision:** Do not implement row-to-prose cut/copy/drag semantics from that abandoned thread. `#` focuses on creating/attaching a new task; `@` is a non-owning reference to an existing task. Inline atom copy/cut remains supported.

**Rationale:** The transfer gestures added complexity without an established gap. Do not confuse dropping row transfer with dropping atom clipboard behavior.

### D11 — Queues behave as ordinary deduplicated views

**Status:** Agreed; baseline.

**Input:** U06; earlier user distinguishes positional host queries from task-field predicates and treats project as an ordinary field.

**Decision:** Query rows are naturally deduplicated. Scope may follow owning occurrences' host positions and/or task fields with ordinary SQL Boolean combinations. `project` has no special architecture by default.

**Rationale:** SQL/query-builder semantics handle nested AND/OR and mixed scopes; no special queue ownership or context policy is needed.

### D12 — Creation requires an identifiable destination matrix

**Status:** Agreed starting rule; baseline, carried forward into item 2.

**Input/context:** User accepts general views not inherently supporting creation, then agrees to the proposed simple single-matrix starting rule.

**Decision:** General query views do not infer a creation destination. A recognized simple projection of one matrix may create rows with that matrix's defaults. Do not infer defaults from filters.

**Rationale:** Avoid inventing placement, field values, or ownership from arbitrary query logic. A new row may legitimately fail the filter and disappear from results.

## C. Lifecycle, sync, history, undo

### D13 — Matrix membership lifetime and optional ownership dependence are separate

**Status:** Agreed; baseline.

**Input:** U08 asserts ordinary standalone row lifetime with matrix membership and possible owning edges.

**Decision:** Standalone rows need no external outline owner. Inline-created tasks additionally depend on live owning occurrences. Deleting a matrix deletes its members even if those records have appearances/owners elsewhere.

**Rationale:** Do not force all records into a covering outline ownership tree. Precise storage of dependent-versus-standalone behavior remains a representation issue; a final-owner trigger alone does not solve distributed reconciliation.

### D14 — Delete inline atoms from live prose on target deletion

**Status:** Agreed reversal; baseline.

**Input:** U09 explicitly drops visible tombstones.

**Decision:** Task/matrix deletion clears affected inline owning atoms rather than leaving visible tombstones. Host cleanup is a prose edit with normal conflict/undo consequences.

**Rationale:** Simpler initial UX and consistent text-history handling. Retained lifecycle evidence is separate from visible tombstones.

### D15 — Import receipts are non-owning records of source/import

**Status:** Agreed; baseline.

**Input:** U10.

**Decision:** Receipt links to imported note without ownership in either direction. Deleting the note does not delete receipt or its import-source reference.

**Rationale:** Receipt value persists as provenance even when imported content is removed. Inline tasks and card reviews still use actual lifecycle dependence.

### D16 — Separate content updates from explicit deletion/restoration

**Status:** Agreed; baseline.

**Input:** U05, U11–U13 and task delete/edit races.

**Decision:** Retain deleted records and apply concurrent content edits while deleted/recoverable. Ordinary edits do not resurrect explicitly deleted rows. Explicit restoration preserves identity and uses reconciled content. Delete wins over ordinary edits in the discussed sync situation.

**Rationale:** Keep simple clobbering without throwing away useful edits or allowing stale completion/title changes to revive deleted objects. Owner-derived inactivity differs from explicit deletion.

### D17 — Retain long object history, with explicit pruning

**Status:** Agreed; baseline.

**Input:** U12 expects fairly complete history for personal note taking and oldest-first cutoff when needed.

**Decision:** Retain object versions/deletions sufficiently for recovery and potential future per-object history. Prune oldest complete usable entries/groups under space pressure.

**Rationale:** Durable undo/recovery and sync cannot be obtained merely from SQL transaction atomicity. History retention makes future history UI possible but does not commit to building it early.

### D18 — Undo is guarded sequential history, not arbitrary selective merging

**Status:** Agreed; baseline.

**Input:** U12 and acceptance of explicit rules in U13.

**Decision:** Undo one change backward per object with revision eligibility guards. Group gesture/cascade effects as user actions; undo emits new writes. Skip restoring inline atoms into hosts with later edits rather than merging old text into new prose.

**Rationale:** Preserve predictable object-level clobbering and avoid text-merge complexity. Transactions group effects but do not themselves provide application undo history.

### D19 — Restoration cannot silently convert an owned row to standalone

**Status:** Agreed; baseline.

**Input:** U13.

**Decision:** A formerly owned row with no valid surviving/restorable owner is ineligible for restore. No alternate standalone recovery fallback. A whole undo changeset may need to be hidden/skipped.

**Rationale:** Keep lifecycle rules coherent and recovery simple even at the cost of unavailable undo. Eligibility of independent subsets follows the detailed baseline rules; do not assume all recovery is unconditional or every action must always be all-or-nothing.

### D20 — Lifecycle evidence may outlive content history

**Status:** Agreed direction; baseline.

**Input:** U13 explicitly allows different object kinds and retention policies.

**Decision:** Lifecycle/history evidence can be retained much longer, possibly indefinitely, while old content revisions are pruned.

**Rationale:** Prevent resurrection/confusion after pruning without keeping every content snapshot forever. Exact representation and bounds remain open.

### D21 — Known retired occurrences remain retired after target restore

**Status:** Agreed qualification; baseline sketches.

**Input/context:** Adversarial delete/edit trace and U16's acceptance of the qualified rule.

**Decision:** Restoring task T via a different owner does not automatically restore known occurrence A removed by deletion. Winning host prose must not expose a retired owning atom merely because stale text contains it.

**Rationale:** Target identity restoration does not undo every known occurrence removal. Candidate normalized live projection is not a proven physical implementation.

### D22 — Unknown offline occurrences may become valid after same-ID restore

**Status:** Agreed; baseline sketches.

**Input:** U16.

**Decision:** An occurrence unknown to the deleting device is suppressed while its target is deleted but not permanently retired just because of arrival timing. After explicit same-identity restore it may become valid, whether received before or after restore.

**Rationale:** Arrival-order-independent convergence, simple locally-known deletion scope, and consistency with SRS reset policy. Does not automatically resurrect the target while deleted.

## D. SRS and runtime direction

### D23 — Concurrent reviews are sequential learning steps

**Status:** Agreed; baseline.

**Input:** U14 and earlier choice of two sequential learning steps.

**Decision:** Store independently identified review events and process them in deterministic sequence. Do not combine concurrent reviews into one observation.

**Rationale:** Matches user intuition and simplifies syncing independent review rows. Exact deterministic ordering and scheduler choice are implementation work.

### D24 — Reset deletes locally known reviews only

**Status:** Agreed; baseline.

**Input:** U14.

**Decision:** Learning reset uses ordinary deletion of the review records seen locally. Previously unseen synced reviews survive; no reset generation/epoch mechanism initially. Card deletion follows established lifecycle rules.

**Rationale:** Simple deletion semantics with acceptable new learning evidence arriving later.

### D25 — Live recomputation first; cache only if measurement justifies it

**Status:** Agreed starting approach; baseline.

**Input:** U14 originally expected bounded per-card state; discussion clarified replay over applicable review history.

**Decision:** Recompute scheduling live initially; retrieval/work depends on cards plus applicable reviews, not necessarily a constant number of rows per card. Test a plausible ten-year daily-use fixture against roughly 250–500 ms. Consider disposable local-only caching if needed.

**Rationale:** Determinism avoids stale shared schedule state. Performance assumptions must be measured. No scheduler algorithm or benchmark result has been established.

### D26 — A narrow shared feature lifecycle runtime is the leading sketch

**Status:** Provisional direction; baseline.

**Input:** U15, two agent sketch rounds, delete/edit/restore exercises.

**Decision:** Prefer B's shared feature-level lifecycle cooperation over duplicating all policy or embedding it into generic SQL/change tracking. Keep ordinary feature relations and editing libraries.

**Rationale:** Tasks/reviews/prose cleanup share real lifecycle concerns, but do not justify a universal graph/ownership engine. Transactions, history and sync stay separable; partial-delivery and normalization mechanics remain candidates.

## E. Core outline and records

### D27 — Same records across notes, outline, and table

**Status:** Agreed requirement; baseline.

**Input:** U17.

**Decision:** Interchangeable presentations share record identity and meaningful SQL/view/edit operations, without copying or converting data. Notes show titles/previews plus content pane; outline uses title bullets and expandable body; tables expose fields.

**Rationale:** Seamless Obsidian plus Workflowy is a core user goal. Stream/Miller columns remain later consumers, not automatically solved.

### D28 — Outline position does not universally govern lifetime

**Status:** Agreed; baseline.

**Input:** U18.

**Decision:** Fluent SQL tree selection/deletion is required, but deleting a parent through arbitrary SQL does not automatically delete all positional descendants. Outline subtree deletion is an explicit gesture with selected effects.

**Rationale:** Retain useful tree operations without requiring every feature/record to actively maintain a covering outline ownership home.

### D29 — Tree presentation has an explicit focused root

**Status:** Agreed; baseline.

**Input:** U18's root expectation and earlier flat search discussion.

**Decision:** Outline rendering starts from one focused root, even if it is not loaded or visible. Arbitrary results may be flat with ancestor context. Breadcrumbs reflect the traversed path, not a unique canonical parent.

**Rationale:** Predictable tree context while supporting mirrors, paging, and search.

### D30 — Mirrors share record content and outgoing children, not incoming placement

**Status:** Agreed; baseline.

**Input:** U21, U24.

**Decision:** Shared title/body/fields and child structure. Root appearances can move independently. Child edits/additions/reorders/deletions affect all mirrors. Outdenting a child through a focused mirror removes it from the shared child list and places it after that focused appearance in its local parent.

**Rationale:** Matches user-tested Workflowy behavior and avoids duplicating subtrees or conflating all incoming parents. Candidate ordered placement edges earn their place; physical schema remains open.

### D31 — Mirror deletion is appearance-aware

**Status:** Agreed; baseline.

**Input:** U22–U23.

**Decision:** Delete an appearance without deleting shared data while others survive. Final appearance behaves like a normal record; deleting it invokes root/subtree deletion. A subtree gesture encountering a mirrored child removes that appearance rather than blindly traversing its shared descendants. Evaluate overlapping selected appearances together.

**Rationale:** Deleting a branch should not unexpectedly delete content retained elsewhere. No permanent privileged original is needed. Naive delete-all-reachable SQL is insufficient for this gesture.

### D32 — Exclude cycles; reject whole losing moves; preserve other recorded effects

**Status:** Provisional product policy, final resolution after baseline.

**Input:** U25, U27–U29. Initial edge-only suppression was challenged and superseded.

**Decision:** Prevent placement cycles. For the simple concurrent A-under-B/B-under-A conflict, omit the losing move entirely, preserving its prior placement rather than dropping only its new edge. Keep other gestures' original affected sets; do not track dependent gestures or enlarge deletions during sync.

**Rationale:** Matches atomic-move intuition and the simple LWW philosophy. Two moves alone resolve to R→A→B if B's move wins. In the accepted dependent trace, D1 moves A out of P then deletes empty P; D2 moves B under A; rejecting A's move leaves A under deleted P, so A becomes Unplaced. This rare concurrent outcome is accepted. It is not a justification for unnecessarily orphaning A in the two-move-only trace.

### D33 — Most recent wall-clock move wins provisionally

**Status:** Explicit provisional placeholder; after baseline.

**Input:** U30.

**Decision:** Prefer the competing move with latest recorded wall-clock timestamp. Assistant specified stable move-ID tie-breaking for equal timestamps as the deterministic completion of this rule.

**Rationale:** Most recent action is likely the user's most memorable/current intention. Clock skew is an accepted limitation of the provisional clobbering policy. Multi-move algorithm and durable rejection protocol are not proven.

### D34 — Rejected moves do not automatically retry

**Status:** Agreed; after baseline.

**Input:** U31 accepts the assistant default.

**Decision:** Later changes making the destination legal should not cause a previously rejected move to execute automatically; user can move again.

**Rationale:** Avoid delayed unexpected structural jumps. This product rule does not authorize arrival-order-dependent rejection; reconciliation still must converge with the same inputs.

### D35 — Unplaced is current reachability recovery

**Status:** Agreed; initial candidate in baseline, final meaning after baseline.

**Input:** U32 rejects historical broken-placement auditing.

**Decision:** Show currently unreachable records, grouped under disconnected subtree roots. A valid reachable mirror keeps the record out. Reattachment restores navigation without changing identity/membership. SQL parent deletion can leave children here; ordinary local gestures should preserve placement, but D32's concurrent exception is accepted.

**Rationale:** Solve inaccessible content/clutter rather than inventory every lost organizational relationship. Concrete entry roots, scope, internal-feature filtering and precise SQL remain implementation/design work.

### D36 — Splitting retains lower-half identity

**Status:** Agreed; baseline identity rule, type refinement later.

**Input:** U20 revises the initial upper-half preference; U41 selects same-type new rows.

**Decision:** For mid-title split, original identity, fields, longer content, children and mirrors remain with lower text. Upper text becomes a new sibling in the focused location. Other mirrors display the lower text. New row normally uses same matrix and defaults, not copied populated fields.

**Rationale:** Children and attached content visually belong below the continued record; avoid identity-transfer ambiguity. Do not apply this blindly to end-of-title insertion as if the existing populated record must move into an empty new lower row.

### D37 — Guard backspace merges against data loss

**Status:** Agreed; baseline.

**Input:** U19–U20.

**Decision:** Merge into the upper destination, preserving its identity. Block mirror-involving or destructive merges that would discard more than label text or require user decisions to reconcile fields/content/children/relationships. Embedded atoms need safe transfer or must block the gesture.

**Rationale:** Natural text gesture should not silently destroy structured data. Precise rich-text behavior remains to implement.

## F. Film-study roles and layout

### D38 — Use the film-study project as the mixed-schema test

**Status:** Agreed brief; lost staged draft excerpt recovered.

**Input:** U26 and `prior-draft-excerpts.md`.

**Decision:** Topic notes, tasks, modest film/review records, cards, Films matrix, and named saved views. Start with manually entered data and one simple review per film; avoid metadata automation or a review-management subsystem.

**Rationale:** Media logging was earmarked in prior project use cases and combines prose with ordinary structured fields. It exposes mixed presentation/creation choices without expanding feature scope.

### D39 — Shared matrix-level semantic roles

**Status:** Agreed starting rule; after baseline.

**Input:** U33, U36.

**Decision:** Bind existing fields to title and optional longer-notes roles at matrix level. Field name need not literally be title: Preferred name can fill that role. No view-specific binding override initially.

**Rationale:** Common presentations should work naturally over existing data. Bilingual card reversal and formal/preferred names were insufficient cases for persistent per-view role overrides; views can interpret roles differently without rebinding them.

### D40 — Cards use title/body roles for front/back

**Status:** Agreed; after baseline.

**Input:** U33 and U36.

**Decision:** Map front/back to title/longer-notes so cards are editable in ordinary outline/notes surfaces. Reversing SRS direction does not require persistent presentation-role state.

**Rationale:** Reuse ordinary editors rather than special-case cards in every view.

### D41 — Longer notes are optional; title-only records remain valid

**Status:** Agreed; after baseline.

**Input:** U33.

**Decision:** Without a notes field, a notes presentation may show a larger field form. Title-only rows can show a minimal placeholder or omit expanded focus content.

**Rationale:** Sparse custom schemas should still participate in all presentations. Exact empty-focus UI is not selected.

### D42 — Additional fields have a consistent region below

**Status:** Agreed; after baseline.

**Input:** U33 initially considered right/below; U36 accepts below.

**Decision:** Secondary fields appear below the item by default, associated visibly with that record.

**Rationale:** Predictability and clear association outweigh initial desktop space optimization. Assistant floated an optional right-side compact mode; user has not adopted it.

### D43 — Preserve order and show heterogeneous schema boundaries

**Status:** Agreed; after baseline.

**Input:** U35, U38, U40.

**Decision:** Treat contiguous same-matrix/type runs as separate table segments. Shared semantic-role columns align, but do not pretend all rows share a schema or regroup separated films automatically.

**Rationale:** Mixed project outlines are legitimate. Layout/defaults can address heterogeneity without inheriting a blanket graph-level ban on foreign-matrix children. Membership, positional children, and query results remain distinct sets.

### D44 — Layout A: common primary row plus labeled secondary row

**Status:** Agreed visual direction; after baseline.

**Input:** U38–U39 choose A in generated comparison.

**Decision:** Shared top header for common fields; each record's additional fields below with small labels. Align corresponding secondary fields within contiguous homogeneous runs; use bounded body previews with expansion/editing.

**Rationale:** Repeated local labels remain readable when types alternate or sections collapse. Per-group secondary headers competed with primary headers and became verbose for one-row runs. Alignment is by semantic identity, not coincidental column names.

## G. Title gestures across outline and table

### D45 — Same-type continuation is the default

**Status:** Agreed; after baseline.

**Input:** U34, U41.

**Decision:** Insertion from a film normally creates another film using matrix defaults. Mid-title split likewise creates a same-type upper row. It does not clone rating/year/notes from the original.

**Rationale:** Most natural way to fluently continue a typed list, with a simple escape to ordinary notes. Required-field handling is not fully settled.

### D46 — Uniform title-editor Enter semantics in both presentations

**Status:** Agreed reversal; after baseline.

**Input:** U37 temporarily proposes spreadsheet navigation; U44 reopens it; U45 accepts uniform title editing.

**Decision:** With a caret in a title, Enter splits/inserts in outline and table alike. End-of-title Enter inserts even when another same-type row already exists below. Earlier navigate-to-next-existing-row behavior is superseded.

**Rationale:** Consistent expectations and natural gestures outweigh spreadsheet familiarity for this app. Non-title fields retain their own editing behavior. Cell-selection/navigation mode is a possible distinct concern, not a reason to change title semantics.

### D47 — Start and end insertion have explicit focus behavior

**Status:** Agreed; after baseline.

**Input:** U39–U45 and accepted assistant recap.

**Decision:** Enter at start of nonempty title inserts an empty same-type row above and leaves focus on original text. Enter at end inserts and focuses an empty same-type row below. Mid-title split focuses the original lower half.

**Rationale:** Preserve familiar text-editing focus. Start/end insertions preserve populated original record data; they are not destructive general conversions.

### D48 — Empty typed-row escape is state-based, not gesture-history-based

**Status:** Agreed correction; after baseline.

**Input:** U39 explicitly says prior insertion is not required; U37 says defaults should not defeat it.

**Decision:** A typed row in its full starting/default empty state can become an ordinary note when Enter is pressed at an eligible segment boundary, regardless of how it received focus. Empty title alone is insufficient if substantive other data exists.

**Rationale:** Works identically after keyboard insertion or clicking an existing empty row. Ordinary auto-default fields do not prevent the gesture. Precise eligibility and safe identity/matrix handling require implementation work.

### D49 — Conversion occurs at either contiguous-type boundary

**Status:** Agreed in two steps; after baseline.

**Input:** U40 corrects final-sibling to end-of-type-run; U43 accepts upper-edge extension.

**Decision:** Enter converts a focused default/empty typed row at either beginning or end of its same-type segment. Adjacent differing types form a boundary even within one sibling list. Interior empty rows do not receive this boundary escape merely for being empty.

**Rationale:** Enable leaving a typed sequence naturally while preserving continuation within it. Do not confuse type-segment boundaries with structural outline depth.

### D50 — Conversion keeps depth; ordinary outdent is a later gesture

**Status:** Agreed; after baseline.

**Input:** U39–U40.

**Decision:** Conversion changes the typed row to an ordinary note at the same level. A subsequent Enter on an empty ordinary final sibling can outdent if the focused root permits. A note followed by other siblings does not outdent merely because it was just converted.

**Rationale:** Two distinct intentions—exit type and exit nesting—have predictable local steps.

### D51 — Upper insertion escape is Enter, Up, Enter

**Status:** Agreed; after baseline.

**Input:** U42 rejects action-at-distance/dragging-empty-row alternatives; U43 accepts first recommendation.

**Decision:** Insert above while retaining focus below; navigate Up to the new empty row; Enter converts it at the leading segment edge. Without Up, repeated Enter continues creating typed rows, which the user accepts.

**Rationale:** One ordinary navigation key avoids special recent-gesture memory, unexpected focus changes, and conversion of an unfocused row. Starting a split at character zero does not require different focus semantics from character one.

### D52 — Prefer anchored Insert below over neutral Insert between

**Status:** Agreed; after baseline.

**Input:** U40 challenges the extra control as ambiguous and unnecessary.

**Decision:** Insertion actions can be attached to the preceding record and inherit its type. Do not introduce a neutral gap control with unspecified type inference as a requirement.

**Rationale:** Same capability with less ambiguity. Earlier empty-row type-selector suggestions are not necessary for the accepted boundary escape; a general type-changing UI remains separate.

### D53 — Title gestures do not override field/query capabilities

**Status:** Agreed boundary, with implementation details open.

**Input:** U37 limits escape to title editor; D12's view-creation rule retained throughout.

**Decision:** Longer-notes Enter remains prose editing; other fields use their editor semantics. Arbitrary query results do not gain insertion/splitting capability solely by displaying a title.

**Rationale:** Consistency applies where operations are meaningful and writable, not to every text field or arbitrary SQL projection.

## H. Matrices, saved views, discovery, deletion

### D54 — Collection/query identity must survive empty results

**Status:** Established need in baseline; concrete navigation trace still developing.

**Input/context:** Historical named-view/empty-matrix use cases and current Films / Films to revisit scenario.

**Decision/direction:** Matrices and saved views need stable identities and names independent of row results so users can find/open/configure empty objects. Placing a saved query is distinct from placing every result row.

**Rationale:** An empty collection still needs its first-row/column controls; an empty result still needs query editing. Exact node representation not committed.

### D55 — Whole matrix can be one outline navigation node

**Status:** Accepted product direction; latest input, after baseline.

**Input:** U49: treat the matrix as one unit, the whole table, as a node; assistant affirms product-level interpretation.

**Decision:** Permit matrix identity to participate as an outline unit. This does not imply that membership-derived rows each require an independent placement edge or that a universal fundamental node schema is already selected.

**Rationale:** Natural naming, appearances, discovery and deletion for collections, while keeping membership separate from positional organization.

### D56 — Membership is a discovery route

**Status:** Explicitly agreed; latest input.

**Input:** U49.

**Decision:** Reaching a matrix gives access to its members. Members without individual positional appearances need not be listed as Unplaced solely for that absence.

**Rationale:** Collection access is an obvious route, especially with full inline rendering. Access must not depend on which preview rows are currently loaded. This extends discovery, not positional ownership.

### D57 — Unplaced includes unreachable matrices and saved views

**Status:** Explicitly agreed; latest input.

**Input:** U47 suggests it; U49 confirms ordinary-node rules.

**Decision:** Apply current-reachability Unplaced behavior to matrices/views as well. No separate collection-specific recovery surface is required initially.

**Rationale:** One coherent discovery mechanism. An optional All matrices / All views index would serve management/find-anywhere, not replace Unplaced; such a browser is not yet required.

### D58 — Last-appearance matrix deletion can delete its members

**Status:** Provisional user direction, reinforced by confirmation discussion; not implemented.

**Input:** U47 prefers deleting last matrix appearance to delete matrix/rows; U49 determines when to confirm.

**Decision/direction:** Ordinary outline deletion of a non-final matrix appearance removes that appearance. Deleting the last one invokes deletion of the matrix and member records. Treat this as a gesture, not automatic lifetime ownership whenever a parent disappears through SQL.

**Rationale:** Matches ordinary outline deletion and lets users delete collections naturally from the outline. Matrix membership deletion can remove film records even if they have independent appearances elsewhere. Raw parent SQL deletion may instead leave matrix Unplaced.

### D59 — Confirm only actual external impact, not merely a nonempty matrix

**Status:** Explicitly agreed; latest input.

**Input:** U49 supersedes assistant's confirm-all-nonempty-matrices recommendation.

**Decision:** Confirm deletion when there actually are external incoming references or appearances affected; otherwise normal undo suffices.

**Rationale:** Prompt for nonlocal consequences rather than collection size alone. Exact external boundary, inclusion of references to member records, and treatment of query dependencies must be made concrete later. Do not silently broaden this into a generic safety checklist.

### D60 — Full inline browsing remains available for evaluation

**Status:** Open direction, not a final behavior contract.

**Input:** U46 leaned toward bounded preview, U48 reopens full inline rendering, U49 says matrix-as-route feels natural particularly inline.

**Decision about prior decisions:** Preview-only was not settled and must not be recorded as a requirement. Full inline rendering need not grant members positional edges. It can use matrix-specific affordances, paging/virtualization and field editing.

**Rationale:** Inline access preserves surrounding context; preview/focus simplifies explaining structural gesture boundaries. Next trace must settle edit/delete/reorder/indent/outdent/drag/selection behavior on membership-derived rows. No unbounded materialization is implied.

## I. Open proposals and implementation obligations — not settled decisions

### O01 — Saved-view lifecycle details

Assistant proposed that deleting a saved view deletes the saved query but not result rows, and a view whose matrix/column is removed stays editable with an error. These fit the established stable-view need but were not separately explicitly resolved in the latest trace. Do not assert exact cascading/query-dependency behavior as final.

### O02 — Required fields and empty-state detection

User questioned required fields and leaned toward nullable user data. Assistant correctly noted SQLite enforces explicit NOT NULL constraints even via SQL. No blanket all-nullable schema decision was made. Structural identifiers/invariants are distinct. Define default/empty predicates and safe type conversion without erasing non-title data or breaking references.

### O03 — Concrete graph and sync machinery

Candidate record/placement representation is `record(identity, matrix, fields...)` plus `placement(identity, parent_record, child_record, sibling_order)`. Physical tables, matrix/view metadata identities, lifecycle relations, SQL mutation boundaries, move operation history, partial delivery, pruning, and incremental cycle checks remain unproven. No implicit conversion to a general CRDT design is authorized.

### O04 — Discovery and recursive rendering

Need precise entry-root/scope rules, helpers/internal collection filtering, deduplication, and treatment of cycles arising through membership or query-result rendering rather than placement edges. Accepted placement acyclicity alone does not prove all rendering paths acyclic or cheap. Multiple mirror paths in a DAG can still grow rapidly.

### O05 — Query/performance work

Item 3 remains: child/ancestor/reachability/subtree/search/focus/scroll queries, large shallow/deep/mirrored fixtures, bounded resident rendering, and measured need for closure/scroll caches. SRS ten-year performance check remains future work. No measurements or implementations exist from this exploration.

### O06 — Remaining input details

Rich-text selections and atomic fields during splits, exact merge guards, contextual collection insertion capabilities, matrix membership changes versus local placements, undo of collection deletion, field-editor navigation and full inline collection boundary gestures remain to trace/implement. Preserve settled rules while filling these gaps.

## J. Durability and next recovery pass

### D61 — Recovery must distinguish original evidence from reconstruction

**Status:** User-directed workflow; U50–U51.

**Input:** User identifies missing uncommitted draft as substantial loss; requests efficient first-pass preservation before further compaction.

**Decision:** Preserve accessible source evidence and artifacts first, then this decision log. Do not call reconstructed discussion equivalent to original files or a complete transcript. Defer richer examples/rationales/interrelationships to next pass.

**Rationale:** Preserve fidelity and provenance while context is available. Some exact draft excerpts survive in tool output; committed baseline is recoverable byte-for-byte. Full transcript export is unavailable through current host tools.

### D62 — Durable checkpoint must exist outside the temporary VM

**Status:** Verified operational constraint and assistant recommendation; no new automatic-push authorization inferred.

**Input:** U50, verified official Cloud documentation, existing intact pushed commits.

**Decision/constraint:** Working files, staging and local-only commits are not independent backups. Current default VM recovery is up to seven days after last turn start/resume; chat retention is separate. Preserve a downloadable package and later make an authorized remote checkpoint.

**Rationale:** A month-long absence is consistent with expiry but not proven causation. This recovery pass must not imply temporary files now guarantee long-term retention.

## Coverage and commit gap

Baseline contains most of sections A–E up through initial outline concepts, including task/SRS/runtime decisions. It does NOT contain finalized D32–D35 or the film-study role/layout/gesture/navigation decisions in F–H. The lost staged patch introduced the selected sequence, film-study brief and initial item-1 traces, but still proposed edge suppression later rejected. The new decisions must be reconciled into exploration docs without copying that obsolete proposal as the final policy.

Next step after this first pass: recover fuller trace examples and rationale relationships using evidence files and exact baseline, then update docs on the intended branch. Preserve the distinction between user agreements, assistant implementation suggestions, and still-open questions.
