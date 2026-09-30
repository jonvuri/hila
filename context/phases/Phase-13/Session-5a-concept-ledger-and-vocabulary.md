---
title: Phase 13 Session 5A — Concept ledger and vocabulary reconciliation
kind: phase-session
state: planned
updated: 2026-09-30
---

# Phase 13 Session 5A — Concept ledger and vocabulary reconciliation

## Goal

Rebuild the architecture documentation as one greppable concept ledger, one decision log, and a
short narrative, using plain names that each mean one thing. Change no code and no decisions.

## Why now

`Architecture.md` has become a per-session changelog. Sections mix the model with shipped detail,
pixel values, counts, and phase history. Several words carry more than one meaning: "face" names a
registry entry, a stored per-matrix choice, a registered component, and a slot; "view", "substrate",
and "ghost" each name two things. Session 6 depends on this vocabulary, so the cleanup precedes it.

## Depends on

Session 5 is complete. No code work is in flight.

## Requirements

Work the stages in order. Stage 3 stops for the user.

### Stage 1 — Inventory

- [ ] List every named concept in the canonical topics under `context/` and every exported type,
      registry, table, and column name in `src/` that a document refers to.
- [ ] Record each term once with where it appears, in the companion file
      `Session-5a-term-inventory.md`. The inventory is a working artifact and archives at closeout.

### Stage 2 — Cluster and mark collisions

- [ ] Group terms that name the same thing. Mark every word that names more than one thing.
- [ ] Mark metaphoric or compressed names whose meaning is not recoverable from the word.
- [ ] Mark document names that collide with code identifiers or SQL names.
- [ ] Draft a dependency order from atomic concepts upward. Note which concepts require others to
      be defined first.

### Stage 3 — Naming (stop for the user)

- [ ] Present one table: concept, current names, proposed plain name, collision resolved. Propose
      colorless names that state what the thing is or does. Rename only where a word currently means
      two things or a thing has two names.
- [ ] Stop. The user chooses names in one sitting. Do not continue to Stage 4 without the choices.

### Stage 4 — Ledger and decision log

- [ ] Create `context/Concepts.md`. One entry per concept in dependency order, each with identical
      field labels: Name, Also called, Kind, Owner, Definition, Invariants, Relates to, Code anchors,
      Status.
- [ ] "Also called" lists every legacy document name and code identifier so a grep on the old word
      still lands. "Kind" is one of data, presentation, runtime, or policy. "Relates to" lists upward
      and sibling concepts only. "Status" is shipped, designed, or deferred.
- [ ] Each invariant cites a numbered decision. Rationale lives only in the decision entry.
- [ ] Create `context/Decisions.md` with numbered entries: decision, rationale, consequences, and the
      concepts it constrains. Seed it from the resolved-decision list in `Plan.md` and from rationale
      currently embedded in canonical topics. `Plan.md` keeps a compact index that points here.
- [ ] Add a deprecated-terms table to `Concepts.md` mapping old names to new ones.

### Stage 5 — Narrative and re-homing

- [ ] Shrink `Architecture.md` to objectives, layers, two worked traces, and pointers into the
      ledger. Target roughly 100 lines.
- [ ] Write the two traces: a stream row from SQLite to pixels, and a saved query from launcher to
      focus panel. Traces reference ledger concepts by name.
- [ ] Move every shipped-detail paragraph to the topic document that owns it, to a code anchor, or
      to a test reference. Remove nothing until it has a new home.
- [ ] Apply the chosen names across canonical topics and `README.md`. Leave archive documents
      unchanged except for repaired links.

### Stage 6 — Mechanical checks

- [ ] Add a script that verifies every ledger code anchor resolves to an existing path and every
      "Also called" name appears in `src/` or `context/archive/`. Expose it as an npm script.
- [ ] Run it in the Phase 13 closeout alongside link verification.

### Stage 7 — Maintenance rule

- [ ] Update `Documentation.md`: a session closeout edits ledger Status and Code anchors and adds a
      decision entry when a decision changes. It never appends shipped prose to a canonical topic.
- [ ] Update `README.md` routes so the ledger and decision log are the first stop for concept and
      rationale lookups.

## Boundaries

- Rename nothing in `src/`. Code renames are a later mechanical pass after names settle.
- Change no behavior, schema, or plan decision. Record decisions; do not re-decide them. Naming is
  the only judgment the session makes, and the user makes it.
- Do not edit Session 6 requirements. Session 5B owns that revisit.
- Do not rewrite archived documents.
- Do not add concepts that no shipped or designed contract needs.

## Acceptance

- Every concept in the ledger has one name, one definition, and one owner. No word in the ledger
  names two things.
- Every invariant in the ledger cites a decision entry with rationale.
- Every code anchor resolves and every legacy name is reachable by grep, verified by the script.
- `Architecture.md` reads top to bottom without pixel values, counts, or phase chronology.
- Every paragraph removed from `Architecture.md` has a recorded new home.
- `Documentation.md` prevents re-sedimentation by rule.

## Verification

- Run the anchor and alias check script.
- Format every touched Markdown file with Prettier, run `git diff --check`, and verify links.
- Confirm `NOW.md` and `README.md` route to the ledger, the decision log, and the next session.

## Handoff

Session 5B revisits the Session 6 decision against the ledger. Archive the term inventory. Leave a
list of candidate code renames for a later mechanical pass.
