# The launcher surface

> **Status: designed, not implemented.** The production app still uses Workspace, Table, and Tags
> tabs. `Mod-k` still invokes the editor's insert-link path. Proposed Phase 12 owns launcher and
> tab-retirement implementation after durable `view` places land.

> Decided in [Phase 10 §3b-ii](./archive/phases/Phase-10.md#3b-launcher-deep-dive--the-query-spec) (visual companion + round-by-round reasoning: [Phase-10-Session-3b-ii-visuals.html](./archive/visuals/Phase-10-Session-3b-ii-visuals.html), determinations D20–D32 continuing [Query-Spec.md](Query-Spec.md)'s D1–D19, plus session inputs I1–I3). This is the design of the `⌘K` surface itself — the shell's universal **"go"** gesture, transient sibling of the `/` **"make"** surface ([Phase 9 §9.6](./archive/phases/Phase-9.md#96-the-unified-creation-gesture)). It consumes the query-spec model whole: chips, glyphs, escalation tiers, and the compile/recognize round-trip are [Query-Spec.md](Query-Spec.md)'s and are not restated here.

## The one-sentence model

**One surface, two tempos, and the tempo is a fact about the spec:** a text-only spec renders the quick switcher; the moment any chip commits, the same surface is in deep tempo — chip row, result preview, save affordance — and deleting the last chip is the way back. No mode state exists apart from the spec (the surface analog of "a block's mode is a fact about its SQL").

The launcher is a **gesture, never a place** (session 2). Depth changes what it _shows_, never what it _is_: its only persistent exit is save-as-node, and its ceiling (below) keeps everything past previewing exactly one save away.

## Anatomy and geometry (D20)

A centered floating palette over the dimmed stream — anchored to no panel, docked nowhere. Opening never disturbs the stream; dismissal restores it exactly. Quick tempo is a fixed ~640px column growing downward; **deep tempo expands to a viewport-proportional frame** — still floating with clear margin on all sides, never full-bleed — showing as many preview rows as comfortably fit (windowed past that). Exact proportions, scrim, and elevation are [§4 token-pass](./archive/phases/Phase-10.md#4-cohesive-design-token-and-theming-system) treatments.

## One list, one ranking (D21 · D23)

**Scope.** The launcher searches all named objects — nodes of every stripe (docs, containers, views, type-nodes; matrixes via their 1-to-1 subject nodes) plus commands — and all `label`-role and `content`-role columns (the spec's `text` dimension, `LIKE` now / FTS later).

**Layout.** One flat list ordered by relevance. No sections, no family caps, no explicit name-vs-content split — family legibility rides the objects' app-wide line renderings and glyphs (`[]` `≔` `#` `›`), and each result carries a right-aligned ancestry breadcrumb resolved down the session-2 ladder (provenance → home → membership).

**Ranking** is a weighted blend, deterministic within a session (same input → same order):

- **match quality** — exact > prefix > word-prefix > substring; no fuzzy matching in v1 (kept congruent with the `LIKE` residue: one input, one matching physics);
- **match target** — names and labels weigh above content matches _by default_; a significantly more relevant content match can outrank (a weight, not a band);
- **on-screen boost** — the object is in the current stream;
- **session recency** — focused earlier this session (in-memory only, resets on reload — input I2; deferred frecency = persisting this signal, nothing more);
- **structural tiebreaks** — shallower home depth, shorter label, rank order.

Relevance weights are expected to be **tuned during implementation and use**; the settled part is the structure (flat list, blended weights, the signal set, determinism), not the coefficients. Default result count in quick tempo: **12** (expandable); deep tempo fills its expanded frame.

## Family narrowing: sigil filter tokens (D31)

Passive sectioning is replaced by an active, one-keystroke gesture. A sigil at the start of the input applies a **filter token** — rendered as a visibly distinct hollow token (treatment: §4 placeholder), deleted by `⌫` at input start:

| sigil | narrows to                                                              |
| ----- | ----------------------------------------------------------------------- |
| `@`   | named things only (drops content matches)                               |
| `#`   | promoted types                                                          |
| `>`   | commands                                                                |
| `[`   | containers & matrixes (typing the `[]` family symbol's opening bracket) |

- **Surface channel, not spec channel.** A filter token narrows what the _finder_ shows; it never compiles, never saves, never appears in a saved node. Committing an object out of the narrowed family (`⇥`) consumes the token into the resulting chip — the sigil is also the fast on-ramp into chip authoring.
- **Sigil alone = browse the family.** `#` lists every type, `[` every container — the "browse all" lenses as gestures, replacing any lens furniture.
- **Discoverability: families are findable by name** (D15's "names are the only grammar," extended). Typing `types` surfaces a family-filter suggestion row that displays and teaches its sigil — the D16 mastery-ladder shape (menu → typeahead → sigil), applied to families. Clicking any result's family glyph is the pointer path to the same filter. This name+sigil pairing deliberately rhymes with how chip ops pair prose names with glyphs.
- Sigils are recognized at input start only; elsewhere they are literal text. No dedicated view sigil (views ride `@`, identified by `≔`) until proven need. Family-filter hotkeys — local or global — are deferred: inside the launcher the sigil already _is_ a single-keystroke hotkey, and globally `⌘`-digit is the browser's tab-switching range.

## Commands in the list (D22)

Commands (registry entries with `'launcher'` in `surfaces` — [Plugins.md](Plugins.md#commands-one-registry-two-surfaces)) rank on merit in the one list; `>` narrows to them. A command row shows its subject inline when `context: 'node'` ("New table — under ⟨Planning⟩"), with the **provenance node** — the node focused when `⌘K` fired — resolved at open time (the session-2 homing rule). A command whose required subject is absent disables with a stated reason.

## The empty state (D24 · D32)

Three fixed parts; never a directory, never a home surface (session 2):

- **Jump back** (≤6) — this-session focus history, most recent first, current stream panels excluded. In-memory; resets honestly per session.
- **Recent deep searches** (≤6) — specs dismissed with ≥1 chip committed, deduped, in-memory. `⏎` **restores** the spec into the launcher (chips, text, deep tempo) — it does not execute-and-jump. Restore-not-run keeps this a recovery mechanism, not a shadow bookmark system; the durable form of a keeper is save-as-node. This list is what makes instant `Esc` dismissal safe.
- **Help footer** — one static line of the load-bearing gestures; `?` (on empty input only) opens a one-screen keyboard guide covering the launcher and the app's global gestures, sourced from the command/shortcut registries so it cannot drift. Rotating hints rejected.

## Two tempos, one ceiling (D25 · D26)

Quick tempo is the ranked go-list above. Deep tempo — entered the moment a chip commits — shows the compiled query's results as a **read-only preview**: each row's line rendering plus **spec-touched columns** (label role + every column referenced by a committed `where`/`order` chip, in chip order, width-capped). This projection is a rendering choice by the surface — a host concern, like fetch-narrowing — not a projection dimension in the spec (D2 stands: compiled SQL is always `SELECT d.*`).

**The ceiling:** the preview never mounts a face, never edits a cell, never offers add-row (the `view` firewall applies even to a preview), and `⏎` on a row still means _go_. Everything past the ceiling — editing, a real grid, a recipe — is one `⌘S` away.

## Keyboard map (D27 · D28)

| key             | context         | action                                                                                                                                                                                                                                                                     |
| --------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `⌘K`            | everywhere (I1) | open, seeded with the provenance node; `⌘K` again or `Esc` dismisses. During implementation, retire the editors' current `Mod-k` insert-link binding and absorb its job into `⌘⏎` below.                                                                                   |
| `⏎`             | on a result     | **go** (reconstruct a focus state at the place/row) or **run** (a command); dismisses. On a recent-deep-search row: restore.                                                                                                                                               |
| `⌘⏎`            | on a result     | **insert a ref at the invoking cursor** (D28) — the launcher as link dialog. Enabled only when invoked from an editor with a cursor; disabled with a stated reason otherwise; ignored on command rows.                                                                     |
| `↑` `↓`         | list            | move selection (one flat sequence).                                                                                                                                                                                                                                        |
| `⇥`             | on a suggestion | the object-first commit (D15/D16): commit the object and open its op menu — chip authoring. On a family row: apply the filter token.                                                                                                                                       |
| `⌫`             | input empty     | pop the newest chip back into editing; again deletes it. At input start with a filter token: delete the token.                                                                                                                                                             |
| `←` `→`         | at input edges  | walk chip focus (focused chip: `⏎` edits, `⌫` deletes — the D14 grammar).                                                                                                                                                                                                  |
| `Esc`           | layered         | op/value menu open → close it; otherwise dismiss immediately, discarding the spec (recoverable via recent deep searches — the two are one design).                                                                                                                         |
| `⌘S`            | spec non-empty  | save-as-node (D30). Live for _any_ non-empty spec — text-only quick searches save as the `kind: everything` union, read-only + pick-a-kind nudge, per [Query-Spec.md](Query-Spec.md). Only a truly empty spec disables it (stated reason). Tempo never gates a capability. |
| `@` `#` `>` `[` | input start     | family filter tokens (D31).                                                                                                                                                                                                                                                |
| `?`             | empty input     | the one-screen keyboard guide (D32).                                                                                                                                                                                                                                       |
| typed ops       | input           | the D16 fluent path unchanged (`due<`, `status!=` … commit chips directly).                                                                                                                                                                                                |

## Value entry (D29)

Token-based, one physics, per column type — menu → typeahead → typed, per the mastery ladder: TEXT free text; numbers validated inline (invalid = the red frame + stated reason, the settled channel); dates via natural tokens (`today` · `tomorrow` · `this week` · `last n days` · ISO) compiling to closed literal ranges; enum-ish TEXT via distinct-values introspection (the `QueryBand` pattern); booleans a two-item menu. Widgets (calendar pickers) are deferred garnish, not physics.

**Relative tokens freeze at compile time in v1** — a saved "due < this week" is the literal range of the week it was saved, stated by a save-bar nudge. **Live-relative tokens** (a saved "today" view that is always today) are settled as _designed growth_, recorded in [Query-Spec.md](Query-Spec.md): the compile rule emits a reserved runtime parameter (`:today`-family) that the recognizer lifts back to the token; the executor binds an environment at run time and the invalidation engine gains clock-based invalidation (re-run at date rollover). Deferred because it currently has **no second consumer**: the audit found host-bound execution params (windowing, collapsed keys — a different layer, already generalized) and Phase 11's `date('now')` column defaults (write-time evaluation, no invalidation need); identity (`:me`) and context (`:here`) parameters are the eventual siblings that would justify extracting the general environment mechanism.

## Save flow (D30)

`⌘S` compiles the spec, stores the SQL as a `view` node via the existing block path, homes by provenance, and focuses it — with the **name input pre-selected** holding the default name: the chip row's prose rendering ("task · due < this week · ↓ due"). Save-then-name, the `/table` pending-handoff precedent — zero prompts inside the gesture. Nudges render in the save bar before commit, informative and non-blocking: `kind: everything` → saves read-only, pick a kind for editable; relative dates → saves as the literal range.

## Stage-4 build items

Ordered so every step ships something usable; item 7 is the tab-removal gate this session unblocks.

1. **Command registry extraction** — `slash-commands.ts` → core registry with `surfaces`; the `/` menu consumes it unchanged (session 3 D6).
2. **Query-spec compiler + recognizer** — `src/sql/query-spec/` beside `recognize-updatable.ts`, round-trip conformance suite (3b-i; shared with view blocks).
3. **Launcher shell** — overlay, input, flat ranked results, sigil filter tokens + family rows, ranking blend, jump-back + recents + help footer/`?` guide; name-match over places + commands only. `Mod-k` leaves `keymap.ts` here (I1). A useful switcher before any chip exists.
4. **Chips + deep tempo** — chip authoring (menu/typeahead/typed), per-keystroke compiled runs, viewport expansion, spec-touched preview.
5. **Save-as-node + `⌘⏎` insert-ref** — the two exits; retires insert-link's job for good.
6. **Session memory wiring** — in-memory focus history, recent deep searches, on-screen boost; isolated so frecency later only persists it.
7. **Tab retirement** — Table/Tags tabs captured as Storybook components, then removed (gated on 3–5; the §4 sequencing constraint).

## Deferred

- **Frecency** — persist the session-recency signal; slots into the ranking blend unchanged.
- **Relevance tuning** — coefficients of the ranking blend, during implementation and use.
- **Live-relative date tokens** — the runtime-parameter dialect extension above, on a second consumer or proven need.
- **Family-filter hotkeys** (local or global) · **a view-family sigil** · **filter-strip counts** (a count can ride the filter token) — each on proven need.
- **Preview-pane peek** (`⌘⏎` alternate considered and rejected for v1) · per-type widget editors — §4-era garnish.
- **Block-chrome follow-up** — the view-block authoring chrome replacing the dev textarea shares this chip grammar; details ride the §4 token pass (queued in [Phase-10.md](./archive/phases/Phase-10.md)).
