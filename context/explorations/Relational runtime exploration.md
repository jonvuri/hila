---
title: Relational runtime exploration
kind: working-artifact
state: proposed
updated: 2026-10-09
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
   multiplicity, and editing targets. Try moving or removing the prose reference. Seek clear user
   outcomes without assuming that a host inherits an attached record's type.
2. **Study cards and review history.** Use existing front/back fields as cards, record independent
   reviews on two devices, and obtain a useful schedule after sync. Separate durable user actions
   from recomputable results. Discover which machinery is shared and which belongs to SRS, without
   requiring outline homes, a particular store layout, or an event framework.
3. **Delete a project with managed helpers.** Include ordinary content and automation state, with
   some related data visible elsewhere. Explain the deletion's scope and recovery, including when
   module code is inactive. Find understandable lifecycle and authority rules; revisit the current
   cascades if a simpler policy serves users better.

## How to continue

Start with the two-task scenario and compare a few small models. Trace the user action, stored
facts, reads, writes, and visible result. Add failure or concurrent-device cases where they expose
hidden coupling. Carry promising models through the other two scenarios before fixing boundaries.

Evaluate total conceptual cost, ease of composition, predictable behavior, and feasible performance
and correctness enforcement. A small core with a complicated standard library is not a success.
Record candidate shapes, tradeoffs, changed user outcomes, and unresolved questions separately from
decisions. Keep this brief compact and update the current handoff as exploration advances.

Current checkpoint: direction and proof scenarios agreed; no concrete architecture selected.
Next: conceptually trace two inline tasks. This is design exploration; implementation, migration
planning, and canonical contract revisions come later.

## References as needed

- [Revamp proposal](Revamp%20architecture%20proposal.md): motivating experiences and the current
  architectural candidate.
- [Plugin semantics and storage](Revamp%20plugin%20semantics%20and%20storage.md): task, SRS, and
  managed-data examples.
- [Operations and recovery](Revamp%20operations%20and%20recovery.md): prior recovery and replication
  proposals to test or replace.
- [Context guide](../README.md): baseline topics and implementation evidence when a concrete
  question needs them. The older revamp reading sequence is not a prerequisite for this brief.
