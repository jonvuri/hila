---
title: Relational film-study exploration
kind: working-artifact
state: proposed
updated: 2026-11-18
---

# Film-study project across notes, outline, and table

Item 2 of the [selected sequence](Relational%20concept%20review.md#selected-next-sequence), following
the [outline integrity policies](Relational%20outline%20exploration.md#placement-integrity-provisional-product-policies).
This reconciles the conversation into provisional product outcomes. It selects no physical schema and
does not revise canonical architecture. [Recovery evidence](../archive/recovery/2026-11-17/README.md)
retains the earlier proposals, corrections, sources, and richer rationale under D38–D60.

## Brief and scenario

Test seamless Obsidian/Workflowy-style notes and outlines with interchangeable tabular presentation.
Tasks and SRS remain the main exercised features; add a modest media log for mixed fields and identities.
Earlier project use cases included media reviews, recipes, microjournaling and other structured data.
Film study adds prose plus simple fields without requiring aggregation, metadata automation, or a new
review-management product. Begin with one simple review per film and manually entered data.

```text
Film study
├─ Cinematography                    [topic note]
│  ├─ Arrival                        [film]
│  ├─ Lighting observations          [ordinary note, with an inline task]
│  └─ What is negative fill?         [study card]
└─ Adaptation                        [topic note]
   └─ Arrival                        [same film, another placement]
```

Film fields include title, year, rating, watched date, and longer notes. Cards provide terminology and
technique practice. Tasks cover watching, comparing scenes, or writing a reflection, using settled
task semantics; do not reintroduce task-row transfer gestures into prose. Films, Films to revisit,
and Due cards supply named collection/query examples. Exact film/review schema is not predetermined.

## Field roles and shared editing

**Agreed starting rules:**

- Bind existing columns to matrix-level title and optional longer-notes roles. Role names do not
  dictate actual column names: Preferred name can be a directory's title.
- Cards use front/back through title/longer-notes roles, so ordinary outline/notes editors work.
- No per-view role overrides initially. Bilingual review reversal and formal/preferred names did not
  establish a compelling need; review direction need not persist another presentation binding.
- Without a longer-notes column, a notes pane can show a larger form of other fields. Title-only
  records remain valid, with a minimal placeholder or no expanded focus content; exact UI is open.
- Additional fields have a consistent region below each item. A right-side compact desktop mode was
  suggested but not adopted.

Editing Arrival's title or notes through either topic appearance, a flat notes browser, or the Films
table edits the same record. There is no data conversion or copy when switching presentation.

## Heterogeneous table presentation

**Agreed visual direction:** preserve record order and distinguish contiguous same-matrix/type runs
as table segments. Do not pretend films, notes and cards form one homogeneous schema, or regroup separated
films merely to make a table easier to render.

The conversation used type and matrix as shorthand here. It did not settle a rule for combining
distinct matrices merely because they have identical columns or role bindings.

Layout A in the earlier mockup was selected:

- One shared top header and aligned primary columns for common roles such as title and notes.
- A secondary row below each item with small field labels for its additional fields.
- Align corresponding secondary fields within a contiguous homogeneous run. Shared semantics, not
  coincidentally identical field names, determine cross-schema alignment.
- Bound prose previews and allow fuller editing/expansion so one long note does not dominate the table.

The stress case film → note → film → card → film made repeated group headers noisy and sparse union
columns misleading. Local field labels stay interpretable when rows collapse or types alternate.
The original image is unavailable, but its [generation prompt and provenance](../archive/recovery/2026-11-17/source-addendum/README.md#layout-mockup-input)
are preserved. Decorative mockup details were not all separately adopted.

This supports mixed positional children without establishing a blanket foreign-matrix-child ban.
An inline task inside Lighting observations is not automatically an additional immediate child;
a query must deliberately select it through its owning occurrence.

## Title editing and type boundaries

**Agreed:** use the same title-editor behavior in outline and table presentations. The temporary
spreadsheet-style policy that Enter merely navigates to the next existing row is superseded.
The structural/type rules below apply when the surface supports the required edit and insertion.

| Caret/state                                                                          | Enter result                                                                                              |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Inside a nonempty title                                                              | Split; lower half retains original identity/data/mirrors and focus; upper becomes a new same-type sibling |
| Start of a nonempty title                                                            | Insert an empty same-type row above; focus stays with original text                                       |
| End of a nonempty title                                                              | Insert and focus an empty same-type row below, including between existing same-type rows                  |
| Focused default/empty non-ordinary row at either edge of its contiguous type segment | Convert to an ordinary note at the same level                                                             |
| Empty ordinary note that is the final outline sibling                                | Outdent if allowed by the focused root                                                                    |

New typed rows use their matrix's defaults, not cloned populated fields from the source record.
The outline's guarded backspace merge retains upper identity and blocks ambiguous structured-data loss.
Longer-notes Enter remains prose editing; other fields use their own editors. Cell selection/navigation
can be a separate concern and does not redefine Enter with a title caret.

### State-based escape, without recent-gesture flags

The full starting/default empty state qualifies regardless of whether the row was just inserted or
clicked after existing for some time. Ordinary automatic defaults do not defeat the gesture. Empty
title alone does not authorize discarding meaningful other data. Precise emptiness, identity/membership
conversion, and rich-text selection/atom handling remain implementation work.

The type-segment boundary is distinct from the final-sibling boundary:

```text
Arrival [film]             Arrival [film]           Arrival [film]
Lighting [note]   Enter →  | [empty film]   Enter → | [empty note]
                          Lighting [note]          Lighting [note]
```

The converted note joins the following note segment but is not the final sibling, so it does not outdent.
If it were final, a subsequent Enter could outdent it. Conversion and structural outdent are separate steps.

At a segment's upper edge, use Enter, Up, Enter: insert an empty typed row above, navigate to it, then
convert that focused row. Without Up, repeated Enter continues inserting typed rows, which the user
accepted. Do not convert an unfocused predecessor or change character-zero focus merely to save a key.

Insert below can always be anchored to a row and inherit its type. A neutral insert-between control
with ambiguous neighboring type inference is unnecessary for this trace.

### Creation and schema boundaries

General query views do not acquire row creation from having a title column. Preserve the settled
recognized-simple-single-matrix creation rule: explicit matrix defaults, no defaults inferred from filters.
Readonly/derived columns do not become writable through presentation changes.

The user considered nullable fields for fluent insertion; no blanket nullable-schema policy was settled.
SQLite enforces explicitly declared NOT NULL constraints even through direct SQL. Required-field
completion and the ordinary-note destination/default configuration remain to specify as needed.

## Matrix and saved-view navigation trace

Create Films while empty; it must remain findable and configurable, with a route to adding its first row.
Create Films to revisit selecting highly rated films; an empty result does not remove the saved query's
identity. Put another Films appearance under Weekend planning: both routes access the same collection.
Place Arrival itself under Cinematography independently of its membership in Films.

Changing Arrival's rating can add/remove it from Films to revisit without changing membership or its
topic placement. Creation in a recognized view uses ordinary defaults, so a new row may fail the rating
filter and not appear in the result.

### Current agreements and directions

- **Agreed product interpretation:** a matrix as one whole table can participate as an outline node.
  Physical matrix/view node representation and universal node kinds are not thereby selected.
- **Agreed discovery:** an accessible matrix is a route to its members. Members do not require
  positional edges merely to avoid Unplaced; currently loaded rows or preview size do not decide access.
- **Agreed recovery surface:** currently unreachable matrices and saved views appear in Unplaced under
  ordinary reachability rules. An All matrices/views index would be an optional management surface.
- **User-favored provisional deletion behavior:** removing a non-final matrix appearance preserves the
  collection; deleting its final appearance through the outline deletes the matrix and member records.
  This is an outline gesture, not a universal cascade from every parent deletion through SQL.
- **Agreed confirmation condition:** confirm deletion only when there are actual external incoming
  references or appearances; otherwise ordinary undo suffices. Nonemptiness alone is not the criterion.

Deleting Films can delete Arrival even if it has independent topic appearances: membership lifetime
does not become optional co-ownership. The exact scope of external references, affected member appearances,
and query dependencies needs a concrete check, without broadening the user's confirmation rule.

Keeping a saved query editable with an error after its source/column is deleted, and deleting a saved
query without deleting result records, were assistant proposals consistent with stable-view identity.
Their detailed lifecycle/appearance contract is not fully resolved here.

### Full inline rendering remains open

Bounded preview plus focus was a user leaning and assistant recommendation, not a final restriction.
The user reopened full inline spread with matrix affordances. It can preserve surrounding project
context and avoid repeated focus changes without giving every rendered member a positional edge.

The hard boundary is interaction: indent/outdent, reordering, dragging across the matrix boundary,
deleting a membership-derived row versus a mirror appearance, and selection spanning ordinary items
and collection results. Preview/focus makes that boundary easier to signal; a clearly bounded inline
collection may signal it differently. Neither choice requires fetching or mounting the whole collection.

## Next trace and remaining work

Next, follow one film in a fully inline Films collection through editing, deletion and movement,
while it also has an independent topic appearance. Distinguish membership, placement and visible
results before choosing structural gestures. This is the continuation point, not authorization to
implement or a new acceptance of all inline gestures.

Then close remaining named-view behavior and discovery scope as needed. Item 3 will test concrete
child/ancestor/reachability/subtree/search/focus/scroll queries and large shallow/deep/mirrored fixtures
before selecting closure or scroll caches. Stream/Miller columns and SRS performance checks remain
future work; no benchmarks or implementations are implied by these recovered outcomes.
