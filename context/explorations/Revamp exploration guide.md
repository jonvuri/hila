---
title: Revamp exploration guide
kind: working-artifact
state: active
updated: 2026-10-07
---

# Revamp exploration guide

## Purpose and authority

Explore a full revamp of Hila through concrete user scenarios and connected question clusters.
The eventual outcome is a coherent architecture and implementation plan, built from reconsidered
requirements and useful parts of the existing implementation. Original architectural assumptions
and decisions are open to replacement; they are not constraints that the revamp must preserve.

For now, keep the exploration lightweight and separate from implementation planning. The proposal
is a large patch over the recorded architecture: explicit changes override the baseline;
unspecified fundamentals provisionally carry forward only where consistent with the changes.
Inheritance does not endorse an assumption permanently. When an inherited assumption affects a
question, identify it, test it against the scenarios, and retain, revise, or reject it explicitly.
Record an unresolved conflict as a question rather than silently choosing either account.

Keep exploration content in this folder. `NOW.md` and the context index route sessions here.
Explore and inspect code as evidence; do not resume old implementation stages or promote proposals
into canonical contracts as part of routine exploration closeout. The baseline context describes
existing design, and code and tests establish what is implemented. Neither determines what the
revamp must become. Rewrite canonical architecture and implementation plans when the exploration
is ready for that separate step.

## Reading map

1. This guide: scope, session workflow, and current checkpoint.
2. [Architecture proposal](Revamp%20architecture%20proposal.md): current architectural patch and motivating use cases.
3. [Operations and recovery](Revamp%20operations%20and%20recovery.md): proposed operations, lineage, undo, and
   automation recovery.
4. [Research questions](Revamp%20research%20questions.md): queued next session and unresolved questions.
5. [Session record](Revamp%20session%20record.md): completed work, rationale, evidence, and handoffs.
   Read the latest entry when resuming; older entries are history.

Read baseline topics and code only as needed for the chosen question. Use the
[context index](../README.md) to find them. Keep substantive decisions in the proposal or its
focused companion; link to them from this guide instead of duplicating their contracts.

## Session workflow

1. Read the checkpoint and relevant proposal sections. Choose one connected question cluster and
   a concrete scenario: what the user is trying to do, their starting data, and expected outcome.
2. Trace the scenario through gestures, identity, relationships, queries, presentation, and
   lifecycle as relevant. Add failure, deletion, recursion, or concurrent-device cases where they
   can expose a contradiction. Avoid designing abstractions without a scenario that needs them.
3. Identify the changed and inherited assumptions involved. Compare alternatives and inspect code
   or external evidence only where it can settle a question. Separate verified facts, accepted
   exploration decisions, provisional proposals, and open questions.
4. Edit the proposal and research queue as conclusions emerge. Record enough rationale and
   evidence to resume in a fresh session. Do not treat a proposed mechanism as a resolved result.
5. When inspecting useful implementation parts, record the relevant code and its assumptions.
   Classify it as reusable, adaptable, or replaceable when evidence supports that judgment. Keep
   these notes with the relevant question until a separate inventory would improve lookup.
6. At the end of an agent session, follow the explicit wrap-up below. Intermediate responses do
   not close the session.

## Wrap-up and Git writes

This special writing workflow applies only to the lightweight revamp exploration on
`docs/full-revamp`. Stay on this branch until the exploration is complete and the user is ready to
execute the revamp. Do not return to `main` as part of exploration wrap-up. This exception does not
carry into other branches or later implementation work.

1. Reconcile the proposal and research questions. Record conclusions, evidence, and unresolved
   issues in the separate session record; keep this guide's checkpoint short.
2. Queue the next session explicitly in the research questions document: its connected question
   cluster, starting scenarios, relevant reading, and intended outcome. Update `NOW.md` to route
   there. Include this next-session handoff in the current session's commit.
3. Check whether any decisions, questions, links, or handoff details still need cleanup. Complete
   that work before requesting commit approval. Format touched Markdown, run `git diff --check`,
   and run `npm run check:concepts` for affected context links. Documentation-only changes need no
   code tests.
4. Review and stage only the session's changes. Present a concise wrap-up, verification results,
   next-session scope, and proposed commit message. Ask for the user's explicit approval to commit.
5. Commit only after that approval, at the end of this agent session. Approval to edit documents or
   start wrapping up is not approval to commit. If the user requests changes, finish and verify
   them before presenting the revised wrap-up for approval. Do not commit on intermediate turns.

The user's exploration instructions authorize staging for review and, after explicit wrap-up
approval, committing despite the repository's default restriction on writing Git operations.
They do not authorize pushing, merging, or other Git writes. Reassess the workflow with the user
when the exploration ends.

## Research order and completion

Choose the next cluster by user interest and unresolved dependencies, not a fixed phase sequence.
The detailed queue lives in [Research questions](Revamp%20research%20questions.md). Current clusters are:

- Identity, lifecycle, query meaning, and cycle enforcement.
- Plugin semantics, field access, and widget composition.
- Collapse, navigation, and plugin-created matrix homes.
- Operations, recovery, automation, and replication.
- Bounded gathering, invalidation, derived data, and file storage.

The exploration is ready for architectural synthesis when:

- Core user scenarios have coherent end-to-end explanations, including important failure cases.
- Fundamental contradictions are resolved; remaining questions have explicit deferrals and impact.
- Relevant inherited assumptions have been reviewed rather than accidentally carried forward.
- Useful implementation parts and their coupling are understood well enough to plan reuse.
- The model can be explained as one composed architecture, with a feasible implementation order.

Completion does not require designing every extended use case. Those cases should pressure-test
the model without forcing speculative infrastructure. The eventual architecture must stand on its
own rather than require readers to reconstruct this patch over the old context.

## Current checkpoint

The exploration workflow is established, and the user's cycle and terminology edits are
incorporated. Detailed session history lives in the [session record](Revamp%20session%20record.md).

- Position and lifecycle acyclicity and the gathered-appearance render guard are accepted in the
  exploration. Their implementation and replication behavior still need validation.
- Matrix designations cover default items and aspects. Column terminology remains roles.
- Collapse is a provisional display setting. Behavior for matrixes, inline results, and
  plugin-created matrixes remains open.
- Operations and recovery remain proposed; the companion's open questions are not resolved.
- Next session: **plugin semantics and storage**, selected by the user. Start from the scenarios
  and questions in [the queued session](Revamp%20research%20questions.md#next-session-plugin-semantics-and-storage).
