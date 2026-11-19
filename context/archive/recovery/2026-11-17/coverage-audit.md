# Recovery coverage and confidence audit

Pre-reconciliation snapshot: audited 2026-11-18 at commit `f003960` against the first-pass `decision-log.md`, second-pass `decision-context.md`, U01–U51 in the preserved ZIP, the visible conversation, and the committed task/SRS, runtime-sketch and outline documents. This is an audit of recovery fidelity, not a new architecture decision.

## Result and limits

All 51 indexed user-input excerpts have a corresponding decision, open question, or explicitly superseded path. No missing major accepted product policy was found within that indexed set. The second-pass companion preserves the important corrections substantially better than the unreconciled working exploration documents.

That does **not** establish complete transcript coverage. U01–U51 are selected excerpts; some older assistant turns are available only through committed documents or the carried-forward summary. Approval of a proposal in a subsequent message can establish conversational acceptance without repeating every detail. Where the user only expressed a preference, or a detail came from an assistant recap, provenance should remain visible.

The most useful reconciliation is to remove stale active guidance and preserve the confidence distinctions below. Do not add fresh product decisions to make the recovered story look complete.

## Complete indexed-input coverage map

“Primary” means the decision/open-question IDs that preserve the substance, not that every row is a separately accepted requirement.

| Input | Primary coverage   | Audit note                                                                         |
| ----- | ------------------ | ---------------------------------------------------------------------------------- |
| U01   | D04, D06           | Atomic capture versus explicit fragment; heuristics intentionally imperfect.       |
| U02   | D04, D05           | Explicit text is shared task label, not a prose-owned span.                        |
| U03   | D06, D07           | Deterministic preferred occurrence; proximity disambiguation never rewrites prose. |
| U04   | D08, D09, D18      | Co-owner survival and clipboard identity; later guards refine undo.                |
| U05   | D09, D16           | Content edits continue in deleted/recoverable state.                               |
| U06   | D07, D11, D12      | Deduplication, consistent context, SQL Boolean scope.                              |
| U07   | D10                | Non-owning `@`; surrounding transfer proposals later dropped.                      |
| U08   | D10, D13           | Drop row-to-prose gestures; standalone matrix-row lifetime.                        |
| U09   | D14                | Visible tombstones explicitly withdrawn.                                           |
| U10   | D15                | Receipt survives note; source identity and non-owning link.                        |
| U11   | D02, D16–D20       | Prefer object-level clobbering over complex concurrent merging.                    |
| U12   | D17–D19            | Long history, sequential guarded undo, atom-clearance as prose edit.               |
| U13   | D19, D20           | No standalone recovery fallback; longer lifecycle evidence.                        |
| U14   | D23–D25            | Sequential reviews, locally known reset, ten-year performance target.              |
| U15   | D26                | B is a slight provisional preference, not finalized architecture.                  |
| U16   | D21, D22           | Same-ID restore qualified by known versus unseen occurrences.                      |
| U17   | D27, D39           | Same records across notes, outline and tables.                                     |
| U18   | D28, D29, D35      | SQL tree operations, explicit focus root, discovery problem.                       |
| U19   | D37                | Upper merge destination; block more-than-label loss or decisions.                  |
| U20   | D36, D37           | Lower-half identity chosen after Workflowy testing.                                |
| U21   | D30, D35           | Shared children/local mirror moves; no-Unplaced expectation later qualified.       |
| U22   | D31                | Last mirror becomes ordinary; final deletion invokes subtree gesture.              |
| U23   | D31                | Mirrored-child deletion and collectively selected appearances.                     |
| U24   | D30                | Incoming placements local; content/outgoing children shared.                       |
| U25   | D32, O03–O05       | Prefer no placement cycles; query hazards, not just rendering speed.               |
| U26   | D03, D38           | Film-study brief selected; item 1 precedes it.                                     |
| U27   | D32                | Whole-move rejection, not latest-edge suppression.                                 |
| U28   | D32                | Omit during sync resolution; SQL-parent example insufficient.                      |
| U29   | D02, D32, D35      | Accept outline-only concurrent orphaning; no gesture-dependency tracking.          |
| U30   | D33                | Wall-clock priority explicitly provisional.                                        |
| U31   | D34                | No automatic retry; asks clarification of Unplaced meaning.                        |
| U32   | D35                | Currently unreachable records only, not broken-placement history.                  |
| U33   | D39–D42            | Semantic roles; optional body/form fallback; cards front/back.                     |
| U34   | D45, D48           | Same-type continuation and natural empty-state escape.                             |
| U35   | D43, D44           | Heterogeneous runs, shared alignment, no fake homogeneous table.                   |
| U36   | D39, D40, D42      | No compelling override case; field names independent; fields below.                |
| U37   | D46, D48, D53, O02 | Workflowy input; nullable question open; spreadsheet model superseded.             |
| U38   | D43, D44           | Shared primary header plus secondary labeled fields.                               |
| U39   | D44, D48–D50       | State-based conversion at same depth; chooses layout A/refinements.                |
| U40   | D43, D49, D52      | Type-run boundary, air gap, anchored Insert below.                                 |
| U41   | D36, D45           | Mid-title split generally creates another film.                                    |
| U42   | D51                | Rejected upper-row alternatives preserved, not implemented rules.                  |
| U43   | D49, D51           | Enter/Up/Enter; typed rows continue if user does not go up.                        |
| U44   | D46                | Reopens table Enter policy and requests product precedent.                         |
| U45   | D46, D47, D53      | Accepts uniform title editing in both presentations.                               |
| U46   | D60                | Bounded preview is a leaning explicitly awaiting further exploration.              |
| U47   | D57, D58, D59      | Last matrix appearance deletion is a provisional preference.                       |
| U48   | D60                | Reopens full inline matrix rendering, not a completed gesture specification.       |
| U49   | D55–D59            | Matrix as unit, Unplaced, membership discovery, external-impact confirmation.      |
| U50   | D61, D62           | Missing uncommitted draft is real loss; ask actual durability.                     |
| U51   | D61, D62           | Evidence first, efficient decision inventory, richer recovery later.               |

## Discrepancies and confidence qualifications

### A01 — The main working outline document still contains superseded policy

**Status:** Real reconciliation discrepancy; first/second-pass recovery already contain the correction.

Old outline text says, “Normal outline gestures should not create Unplaced data.” U29 explicitly accepts “unplaced in a case like this where outline gestures unluckily combine to remove a parent relationship.” Limit the former expectation to local ordinary gestures; preserve the agreed concurrent exception and its dependent-deletion example.

Old outline text also says, “Whether Unplaced tracks unreachable records, disconnected placements, or both is still open.” U32 resolves it: “Unplaced should specifically be for records that are otherwise unreachable through the outline view, not for records that ever had a broken placement.” This is no longer an open product question, although scope/query implementation remains open.

The older split wording, “creates an ordinary sibling above,” must not imply a universal ordinary-note type. U41 says, “Yes, it should create another film in general”. Preserve new upper identity with source matrix/defaults and original lower identity/content.

The old “pause for user selection” next-step instructions are also stale: U26 selected the brief/sequence, and the subsequent conversation progressed into item 2.

### A02 — Do not turn a whole-move product policy into a proven sync algorithm

**Status:** No contradiction in the recovered log; important confidence boundary.

U27 considers A’s move “fully struck from history, as if it had never happened”; U30 chooses “the most recent wall-clock competing move” as a “provisional placeholder”; U31 says, “Agreed on not retrying rejected moves.” These establish the desired result, ordering preference and no-delayed-retry behavior. They do not establish a convergent protocol for multi-edge cycles, late-arriving history or pruning.

The stable move-ID timestamp tie-breaker was supplied by the assistant, not separately selected by the user. D33 already labels that provenance; keep it. Similarly, “no retry” does not license permanent arrival-order-dependent rejection. The discarded edge-subset selector in the old draft should be labeled superseded, not presented as the implementation of whole-move rejection.

### A03 — Full starting/default state is not a just-created or unedited flag

**Status:** Recovered correctly; guard against reintroducing a superseded restriction.

U39 says conversion applies “as long as the film record is in its full starting / empty state” and that preceding insertion “is not a requirement.” U37 says, “ordinary defaults should not defeat this special gesture”. The state-based test covers more than the title and is independent of focus-entry history.

Thus an earlier assistant suggestion that any edit forever ends eligibility is not the accepted rule. Returning all substantive state to its starting/default state is not excluded merely because edits occurred. Conversely, no exact predicate for generated defaults, relationships, children or identity/membership conversion was settled. D48/O02 preserve this gap correctly.

### A04 — Nullable-field discussion is an open design question

**Status:** Recovered correctly; no all-nullable decision.

U37 says, “I'm not sure about required fields in general, vs just following Sqlite behavior of everything nullable”. That expresses uncertainty, and the assistant corrected the factual premise that SQL could bypass explicit NOT NULL constraints. Do not convert it into agreement that all user fields must be nullable, or that structural constraints are optional. The accepted default-state escape still has to work with ordinary defaults.

### A05 — Mirror-merge guard has broader baseline wording than the user's direct observation

**Status:** Provenance qualification, not a reason to reverse the recorded guard.

U20 reports, “It never allows the usual backspace-from-sibling merge into a mirror.” U19 asks to prevent operations losing more than label text or needing destructive choices. The committed outline checkpoint says, “Block merging involving mirrors”, which is broader than the precise empirical observation alone. D37 preserves that recorded conservative starting guard.

Reconciliation may retain the baseline guard, but should not claim the user tested every direction of mirror merge in Workflowy. The general loss/relationship safety rationale supports caution; exact allowed cases are implementation/trace work.

### A06 — Matrix deletion direction and confirmation have different confidence levels

**Status:** Recovered mostly correctly; preserve scope and wording.

U47 says, “I'm inclined towards making deleting the last appearance of a matrix automatically delete it and its rows”. That is strong provisional direction, not a fully worked cascade protocol. U49 is firmer on the confirmation rule: “Confirm deletion only if there actually are external incoming references or appearances; otherwise normal undo will suffice.” D58’s provisional status and D59’s explicit status are appropriate.

The clarification arose in matrix deletion context. Do not silently generalize it to every delete command in the product, define “external” by an invented boundary, or select behavior for saved-query dependencies. The raw-parent-SQL distinction follows D28 and was explained by the assistant; preserve it without claiming the user asked for universal positional ownership.

### A07 — Type, matrix, and query capability need exact interpretation later

**Status:** Inherited terminology/implementation boundary, not a missing accepted rule.

U40 speaks of “contiguous range of film rows” and “Adjacent contiguous rows of differing types”. Recovery uses “same-matrix/type” as shorthand. That does not separately decide whether two distinct matrices with identical schemas or role bindings belong to one segment. Avoid presenting schema similarity alone as sufficient identity for grouping or insertion.

For creation, the earlier user accepts a starting rule after distinguishing simple identifiable single-matrix views from general SQL views. The committed task/SRS record states matrix defaults and no inferred filter defaults. D12 is supported by that earlier agreement, even though U01–U51 do not quote the entire exchange. D53 is an inherited capability boundary: consistent title editing cannot itself authorize arbitrary query insertion. Exact recognizer criteria, projection writability and split destinations remain open.

### A08 — A potential implementation benefit is not a completed test result

**Status:** Wording risk in D26 companion and baseline comparison table.

The second-pass D26 says the shared runtime’s benefit is “one tested implementation of repeated rules”; the original sketches similarly use “one tested implementation” in their benefit column. Both documents elsewhere explicitly say no implementation or convergence proof exists.

For clarity, use “one shared implementation to test” or explicitly mark the benefit as prospective. No baseline test counts or implementation status should be inferred from this phrase.

## Useful context beyond the selected user excerpts

The second pass correctly recovered several important details whose strongest source is the earlier committed traces: import receipts prevent unwanted reimport; receipt-key uniqueness alone does not prevent duplicate output notes; undo checks the current winning authored revision, not merely existence of losing versions; content pruning can mark recovery entries unavailable; SRS target includes retrieval plus computation and cold/repeated runs. These are not newly invented policies.

It also correctly leaves concurrent cuts to two destinations and retaining review history after card-text edits as candidates. Neither should become mandatory merely because the simpler main stories are settled.

Two additional earlier provisional examples remain useful reference material rather than user commitments: managed time entries can outlive tasks depending on product purpose; stale automation jobs and retiring setups need admission policy. They demonstrate why managed writes, lifecycle ownership, and references are separate. Their full implementations are not required by the accepted task/SRS starting rules.

## Recommended reconciliation boundary

Carry the final agreed/provisional product rules into the working exploration documents, preserve A01’s superseded statements only as history, and keep A02–A08 qualifications visible near the relevant rules. Keep the first-pass ZIP immutable. No further user permission is needed simply to record these distinctions; unresolved policy should remain unresolved instead of prompting new design work during recovery.

## Reconciliation disposition

- **A01 corrected:** current outline policy now records the concurrent Unplaced exception, reachability-only discovery, same-type splits, and selected sequence.
- **A02 retained as a boundary:** outline integrity distinguishes whole-move outcomes, provisional wall-clock priority, assistant-supplied tie-breaking and an unproven reconciliation algorithm.
- **A03/A04 preserved:** film-study rules use current full default/empty state, not insertion history; nullable fields remain open.
- **A05 provenance retained:** the conservative mirror-involving merge guard remains the recorded starting guard. Workflowy testing is not claimed for every mirror merge direction.
- **A06 preserved:** final-appearance matrix deletion remains user-favored provisional behavior; external-impact confirmation is explicit and scoped to this collection-deletion discussion.
- **A07 explicit:** no grouping rule for different matrices with identical schemas has been selected; query capabilities still bound insertion.
- **A08 clarified:** the working runtime-sketch benefit now says “one shared implementation to test.” The archived companion retains its earlier text; this audit qualifies it as prospective.

The source addendum preserves historical wording. Current continuation documents are
[outline exploration](../../../explorations/Relational%20outline%20exploration.md),
[film-study exploration](../../../explorations/Relational%20film-study%20exploration.md), and
[the selected sequence](../../../explorations/Relational%20concept%20review.md#selected-next-sequence).
First-pass ZIP and first/second-pass logs were not rewritten by reconciliation.
