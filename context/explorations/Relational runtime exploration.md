---
title: Relational runtime exploration
kind: working-artifact
state: proposed
updated: 2026-10-11
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

Start with the two-task scenario and compare a few small models. Trace the user action, stored
facts, reads, writes, and visible result. Add failure or concurrent-device cases where they expose
hidden coupling. Carry promising models through the other two scenarios before fixing boundaries.

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

The worked-trace starting policies are settled enough to compare the two small sketches below.
Implementation, migration planning, and canonical revisions come later.

## Larger exploration: next investigations

1. **Challenge the proposed layers with two small architectural sketches.** Compare ordinary
   feature relations plus shared transaction/query functions with a minimal shared identity and
   lifecycle substrate plus focused libraries. Explain the same capture, copy, completion, and
   deletion in each. List durable facts, write authority, read paths, and the code that must remain
   available when a module is inactive. Count the complexity across the whole system; preserve the
   option that the “runtime” is mostly a disciplined set of functions.
2. **Discover what a standard library actually contributes.** Sketch one task operation and one
   SRS operation, including their caller, inputs, atomic writes, and result. Test fixed feature
   tables against behavior bound to existing user fields. Can ownership, editing targets, and
   bounded discovery compose without a universal node type or extensive registration metadata?
   Share only machinery both examples need; keep module packaging and external plugins deferred.
3. **Explore ownership as a reusable relation without rebuilding the old edge architecture.**
   Ask whether co-ownership is about a set of appearances keeping data live, while card review
   ownership is a direct dependency, or whether one smaller rule explains both. Locate the
   minimum enforcement for local edits, replication, deletion, and recovery. Try counterexamples
   that would demand multiple owners, cycles, or special cases before accepting a general engine.
4. **Test the composition from the user's side.** Explain capture, copy, discovery, completion,
   and deletion without storage vocabulary. Clarify shared task data versus local prose context,
   and query appearance versus ownership. Ask which distinctions Hila can make intuitive through
   defaults and which need visible gestures. Revisit an architectural shortcut if it forces users
   to understand internal rules merely to edit a note.

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
