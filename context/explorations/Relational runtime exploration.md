---
title: Relational runtime exploration
kind: working-artifact
state: proposed
updated: 2026-11-18
---

# Relational runtime exploration

## Goal and freedom to explore

Find a simpler, more elegant and coherent foundation for Hila: a small relational runtime,
a focused standard library, and an opinionated application composition. The standard library
is the promising distinction: reusable behavior can be foundational to Hila without belonging
to its smallest core or needing to be an optional plugin.

This direction is agreed as an exploration, not a settled architecture. The layers, names,
boundaries, and mechanisms below are hypotheses. Discover the concrete shapes through examples;
replace them when a simpler explanation works better.

Prior revamp decisions and baseline contracts are reference material, not inherited requirements
for this exploration. Most application behaviors and invariants are also open to revision,
especially architectural means such as universal homes, edge kinds, node types, designations,
and plugin application rules. A previous “accepted” label does not make them binding here.
Judge alternatives by whether they achieve the same rough user-facing ends, and make meaningful
changes to those ends explicit.

The aim is fluid work across notes, outlines, and structured data; useful relationships and
context; powerful discovery and editing; and trustworthy, responsive automation over local data.
Seek the simplest coherent way to achieve those experiences. Do not deconstruct and refit every
existing feature, preserve vocabulary for its own sake, or design a general framework in advance.

## Starting hypothesis

- **Relational runtime:** a thin overlay on SQL providing enough shared identity, mutation,
  durability, and query machinery to keep composed behavior safe and efficient.
- **Standard library:** focused modules for reusable behavior. Outline placement, attachments,
  editing, discovery, and derived computations are candidates, not a required inventory.
- **Hila composition:** the chosen behaviors, gestures, defaults, and surfaces that make one
  coherent product. Users should not need to assemble the architecture themselves.

Explore separating storage identity, placement, lifecycle, and presentation; expressing aspects
through relations and explicit query results; and giving modules shared facilities for bounded
reads and atomic writes. None of these mechanisms is prescribed. Ordinary tables, SQL, and small
functions may suffice. Module packaging and third-party plugin extensibility can wait.

The runtime should make focused behavior easy to express and hard to make slow or incorrect.
Test where enforcement must live: a required data guarantee cannot depend on a widget being
mounted or a plugin being active. Replication and recovery must respect whatever guarantees the
chosen model makes. Avoid merely relocating complexity into declarations or a generic engine.

## Three conceptual proofs

Use these scenarios to discover the architecture, not to verify compliance with the current model.
Names such as “task,” “attachment,” and “helper” describe the starting examples, not required types.

1. **Two tasks in one note.** Capture two actions within prose, find both in a project task queue,
   complete either independently, and return to its exact context. Trace identities, query
   multiplicity, and editing targets. Inline-created tasks depend on their owning inline units:
   copying creates a co-owner of the same task, deleting the last owner deletes the task, and
   cut-and-paste preserves it at the new location. The owner is a stable atomic inline unit with an optional shared
   task label; inferred surrounding context is outside it. The host need not inherit the task's type.
2. **Study cards and review history.** Use existing front/back fields as cards, record independent
   reviews on two devices, and obtain a useful schedule after sync. Separate durable user actions
   from recomputable results. Discover which machinery is shared and which belongs to SRS, without
   requiring outline homes, a particular store layout, or an event framework.
3. **Delete cards with owned review history.** Delete a card collection and its cards while SRS
   is inactive, with review history also displayed elsewhere. Reviews should leave live use with
   their cards: this lifecycle dependency is agreed. Trace deletion and recovery, then contrast an
   import receipt that must survive deletion of its imported note to prevent unwanted reimport.
   Discover which dependencies require ownership and which are ordinary references.

## How to continue

The initial task/SRS pass is complete at the product-policy level. Continue from the recorded
checkpoint below. Trace user actions, stored facts, reads, writes, and visible results; add failure
or concurrent-device cases where they expose hidden coupling before fixing architectural boundaries.

Evaluate total conceptual cost, ease of composition, predictable behavior, and feasible performance
and correctness enforcement. A small core with a complicated standard library is not a success.
Record candidate shapes, tradeoffs, changed user outcomes, and unresolved questions separately from
decisions. Keep this brief compact and update the current handoff as exploration advances.

Current checkpoint: [worked traces](Relational%20runtime%20worked%20traces.md) record items 1–5.
Atomic inline owners have optional shared task labels; inferred prose context is outside the atom.
Copy/repeated paste create co-owners, while cut/paste preserves task identity and winning content.
Queues use ordinary queries; recognized matrix views create standalone rows with matrix defaults,
without deriving defaults from filters. Row-to-prose transfer gestures are dropped.

Matrix membership plus optional ownership dependencies is the provisional shared lifetime rule.
Reviews depend on cards; receipts have only non-owning links to imported notes. Task/matrix deletion
clears inline atoms. Object-level LWW, retained deleted data and content history, longer-lived lifecycle
evidence, and sequential revision-checked undo form the recovery contract. If required owners cannot
return, recovery is ineligible with no alternate standalone destination. Physical storage, sync
mechanisms, and runtime architecture remain open.

SRS processes independent reviews sequentially. Reset deletes locally known reviews; unseen reviews
arriving after sync participate normally. Begin with live recomputation from applicable review history.
A future fixture should simulate ten years of daily due-card reviews, targeting roughly 250–500 ms
for retrieval plus computation; local-only caching is a conditional fallback. Algorithm selection and
performance measurement remain future work.

The [runtime sketches](Relational%20runtime%20sketches.md) and their adversarial deletion/edit trace
favor a narrow shared feature lifecycle runtime provisionally. Explicitly removed known atoms need
their own eligible restoration; previously unknown offline atoms can become valid when the same
row identity is restored. Receipt references and SRS reset use the same known-record deletion intuition.
This is a conceptual result, not a proof of sync implementation.

The [outline exploration](Relational%20outline%20exploration.md) records shared records across notes,
outline and tables, placement separate from lifetime, mirror gestures, and reachability-based Unplaced.
Placement-cycle outcomes are provisionally settled: reject the whole losing move, prefer the latest
wall-clock competing move as a placeholder, do not automatically retry, and preserve other gestures'
recorded targets even when an unlucky combination leaves Unplaced content. A convergent protocol is
still unproven.

## Larger exploration: selected investigations

The user selected the sequence recorded in the [concept review](Relational%20concept%20review.md#selected-next-sequence):

1. Placement integrity/discovery: product-policy trace complete provisionally; implementation remains.
2. [Film-study project](Relational%20film-study%20exploration.md): role bindings, mixed layout and title
   gestures agreed; matrix/view navigation and full inline member gestures are the active boundary.
3. Bounded query/rendering workloads: choose derived indexes only after query semantics are clear.

The [recovery index](../archive/recovery/2026-11-17/README.md) preserves evidence, a 62-entry decision
inventory, richer rationale and the coverage audit. The working documents above now incorporate later
conversation outcomes; the historical snapshots retain superseded proposals without making them active.

The shared-runtime/library boundary remains provisional. Use these cases to test what truly repeats,
where fixed functions suffice, and which guarantees must apply while UI or feature code is inactive.
External plugin packaging, implementation, migration planning, and canonical revisions come later.

Keep each sketch small enough to compare directly. The useful outcome is a narrower hypothesis
and a concrete counterexample that could disprove it, not a complete framework or exhaustive
feature inventory. Preserve the rough product goals and the agreed gesture behavior while being
creative about representation and boundaries.

## References as needed

- [Revamp proposal](Revamp%20architecture%20proposal.md): motivating experiences and the current
  architectural candidate.
- [Plugin semantics and storage](Revamp%20plugin%20semantics%20and%20storage.md): task, SRS, and
  managed-data examples.
- [Operations and recovery](Revamp%20operations%20and%20recovery.md): prior recovery and replication
  proposals to test or replace.
- [Context guide](../README.md): baseline topics and implementation evidence when a concrete
  question needs them. The older revamp reading sequence is not a prerequisite for this brief.
