---
title: Relational runtime sketches
kind: working-artifact
state: proposed
updated: 2026-10-15
---

# Relational runtime sketches

Continuation of the [brief](Relational%20runtime%20exploration.md) and
[task/SRS worked traces](Relational%20runtime%20worked%20traces.md). Two independent subagent
analyses compared each sketch, then traced the same offline deletion/edit race. These are conceptual
results, not implementation tests or a convergence proof. Canonical contracts remain unchanged.

## Two candidate boundaries

| Concern                | A: feature relations plus shared functions                                    | B: shared feature lifecycle runtime plus libraries                                |
| ---------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Feature data           | Ordinary task, document, review, receipt, and user-field relations            | Same; no universal node schema required                                           |
| Shared storage         | Identity, revisions, LWW, transactions, replication, history, bounded queries | Same                                                                              |
| Ownership and recovery | Permanently installed feature functions reconcile dependencies                | One shared resolver interprets ownership/lifecycle facts and recovery eligibility |
| Prose and atoms        | Editing library owns atom identity, placement extraction, cleanup             | Same; lifecycle bookkeeping cannot edit prose alone                               |
| Primary benefit        | Concrete code, little upfront abstraction                                     | Repeated lifecycle rules have one tested implementation                           |
| Primary cost           | Repeated rules and sync awareness of feature dependencies                     | Shared metadata and obligations on all writers                                    |

Both sketches retain independent content and lifecycle state. Last-owner inactivity must be
reconciled from merged ownership facts, not emitted as an unconditional explicit-deletion tombstone.
A concurrent surviving owner preserves the task; independent removals of two owners can leave none.
Retained ownership evidence distinguishes formerly dependent data from standalone rows without
requiring a special task-field flag. That evidence must not disappear with short-lived content history.

SRS reviews remain ordinary independent records over existing card-field bindings. Receipts have
source-item identity and non-owning note links. A unique receipt key alone does not prevent duplicate
imported notes across devices; stable output identity or replay reconciliation remains necessary.
Required lifecycle/writer/editing code remains installed while feature UI is inactive.

**Provisional direction:** B has earned consideration as shared feature behavior above native SQL
and generic change tracking. Keep ordinary relations and explicit editing adapters. No arbitrary
lifecycle-expression engine, mandatory outline homes, or external plugin framework is selected.

## Adversarial trace: delete a task while its host is edited

Baseline: host N at revision n0 contains A targeting T and B targeting U. Each atom is its task's
sole owner. Device 1 explicitly deletes T in action G: lifecycle deletion of T, an ordinary content
revision n1 clearing A from N, and retained retirement evidence for known occurrence A. Device 2,
offline, writes n2 with changed prose and possibly moved A, retaining A and B. It may also complete T.

| Winning host revision | Live result after both actions                                                             | Recovery of G                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| n1                    | Device 1's prose wins; A absent, B/U live; T remains deleted with winning retained content | If post-action revisions and dependencies remain eligible, restore host, A, and T lifecycle together; preserve winning T content                  |
| n2                    | Device 2's prose wins; A must still be removed from live content; B/U remain live          | Host revision differs from G's post-action revision, so skip its undo; with no valid restorable owner, T is ineligible and G can be skipped whole |

A losing concurrent host revision is already clobbered under the chosen LWW model. The candidate
undo check uses the current winning authored revision and relevant lifecycle revisions, not equal
text or the mere existence of a losing historical revision. No undo may restore an old document
snapshot as an implicit authorization to reactivate a retired atom.

### Candidate cleanup mechanism

Retain the winning authored host revision as placement truth. The editing adapter derives live
content by excluding retired atom identities and atoms whose targets are currently deleted; build
the occurrence index from that same live content. Known A's retirement stores identity/lifecycle,
not another copy of its coordinates. It survives later restoration of T until A itself is validly
restored. An explicit local deletion still creates ordinary host edit n1 and grouped history.

This normalizes a stale winning host without minting fresh per-replica repair writes. A local cache
is optional; no broad effective-document fingerprint is required for this trace. This is an explicit
extension to pure host-content LWW: live content is also subject to lifecycle validity. If every
clearance must instead be a replicated authored edit, a deterministic repair-write protocol remains
to design. The conceptual analysis did not prove either complete implementation.

For partial delivery, the sketches propose staging an action until its declared required records
arrive, then publishing atomically. This needs a manifest/completion mechanism or equivalent admission
contract; local SQL transactions do not supply it. With that assumption, n1-first and n2-first delivery
produce the same final result. Content completion can arrive in either order without restoring T.

## Agreed extension: unseen occurrences after deletion and restoration

Known retired atom A must not reappear merely because T is restored through another valid owner C.
An unknown atom X created offline was not part of the deletion cleanup. The user chose a simpler
rule for X, consistent with deleting only known SRS reviews on reset:

- While T is deleted, retain X's underlying content but exclude it from live task appearance and
  ownership. X cannot revive T.
- If T is explicitly restored with the same row identity, X may become valid again.
- X arriving before restoration and X arriving afterward must give the same final result. Merely
  receiving X while T is deleted must not permanently retire it.
- Known A retains explicit removal evidence and requires its own eligible restoration. Restoration
  of T does not cancel the prose edits or occurrence retirement caused by its deletion.

Thus explicit known-occurrence removal and temporary suppression by target lifecycle are distinct.
A learning generation solely to invalidate unknown owners is not required by this chosen behavior.
Detailed encoding, admission, retirement cleanup, and multi-replica verification remain future work.

## Implication for the next exploration

Both sketches require the same hard mechanisms. B centralizes lifetime and recovery checks; it does
not remove editor-specific work. The next product proof moved to
[outlines, notes, and tables](Relational%20outline%20exploration.md), to ensure this foundation serves
core editing rather than only task/SRS behavior. Read the
[older-concept review](Relational%20concept%20review.md) before choosing the next investigation.
