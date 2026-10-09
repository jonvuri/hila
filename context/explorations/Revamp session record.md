---
title: Revamp session record
kind: working-artifact
state: active
updated: 2026-10-08
---

# Revamp session record

Session history for the [revamp exploration](Revamp%20exploration%20guide.md). Keep chronology here
and the guide's checkpoint short. Each entry records the scenario or questions, conclusions with
links and rationale, evidence, unresolved issues, verification, and next-session handoff. Git
records approved commits; a session entry records the work and does not itself authorize a commit.

## Session 1 — 2026-10-07 — Establish the exploration guide

- Reviewed the three exploration documents and relevant baseline context.
- Recorded the patch/inheritance rule, eventual reconstruction goal, scenario-led workflow, and
  session closeout policy.
- Incorporated matrix designations and revised cycle rules into the proposal. Corrected the
  mixed-cycle example to use opposing dependencies and qualified upward traversal cost.
- Kept collapse and plugin-created matrix placement open; reconciled the research queue.
- Routed `NOW.md` and the context index here, retaining Phase 13 as an implementation-history marker.
- Evidence: `src/core/sync.ts` uses `NEW` data for update tracking. Operation-log before-snapshot
  reuse therefore needs more than tagging current update records.
- Applied the agreed document names and moved session history out of the guide.
- Scoped the Git-writing exception to this exploration on `docs/full-revamp`: stage at wrap-up,
  commit only with explicit user approval at agent-session end, and include the next-session queue.
- Next session: **plugin semantics and storage**, selected by the user. See the
  [queued scenarios and questions](Revamp%20research%20questions.md#completed-session-plugin-semantics-and-storage).
- Review found no further cleanup needed for this session. Collapse behavior, lifecycle enforcement,
  and recovery remain research questions rather than blockers to this documentation handoff.
- Verification: touched Markdown formatted; context links and concept anchors checked with
  `npm run check:concepts`; `git diff --check` passed. No code changed.

## Session 2 — 2026-10-07–08 — Plugin semantics and storage

- The user selected continued work in this task.
- Starting direction: usually apply plugins explicitly to eligible matrixes; offer column setup
  when needed; use each applied matrix as a pivot; allow visible, protected plugin-created child
  matrixes and root matrixes for global state. These are working proposals, not settled contracts.
- Recorded [task, study, second-brain, and web-clip slices](Revamp%20plugin%20semantics%20and%20storage.md).
- Found two proposal conflicts: matrix nodes currently admit only member rows as positional
  children, and root-level matrixes become aspect matrixes by default.
- Evidence: `src/core/plugin.ts` provisions one matrix-key mapping per plugin registration, not
  per pivot. `src/core/matrix.ts` guards managed-column removal/rename; this is not a general
  writer-authorization mechanism. Plugin removal currently preserves matrixes and clears plugin
  provenance through foreign keys (`src/core/plugin.test.ts`).
- Provisional agreements: stable-column input bindings and status interpretation per application;
  flexible input shapes/defaults; host identity/context for combined attachments; a managing-plugin
  helper-write guard; deletion of dedicated helpers on application removal/undo or pivot deletion;
  global on/off with broad user-data reads and authorized transactional logged writes.
- Subsequent clarification supersedes tentative host-label precedence: tasks each support their
  own optional label, while hosts supply positional/prose context and discovery breadcrumbs. No
  copied label/prose text; editing targets must be explicit. Added multiple inline tasks, nested
  project-task attachments, and standalone unlabeled-task examples to the working brief.
- Ineligible inputs after schema changes report invalid configuration until manual repair. No
  silent rebinding or destructive application removal.
- Initially recommended `own` for child helpers, assuming visible stores needed a position beneath
  the pivot. The user challenged that assumption. Revised recommendation: evaluate `attach` for
  dependent matrix parts, keeping members-only positional children. The recorded proposal has no
  explicit matrix-to-matrix attachment prohibition.
- The user initially reaffirmed shared positions for all matrixes, including attached helpers,
  for consistent rules/discovery. They subsequently reopened that invariant when presentation
  strategies accumulated too many rules. Matrix-part attachment still needs clarification if used.
- Added a root-clutter pressure case and alternatives: implicit sections, access through pivots,
  working views/pinning, real containers, and compact lists. Recommended testing implicit sections
  with prominence overrides first. The user judged this direction too complex; it is set aside as
  the current recommendation. Aspect designation alone does not justify collapse.
- Considered alternatives before selecting the narrower rule: start inside the default item matrix with an unfiltered root; make root
  a matrix directory; use a separate store root or positionless stores; remove the members-only
  matrix-child restriction so pivots can own helpers directly. Recommend tracing the smallest
  navigation change first and comparing owned versus attached helpers. No alternative is selected.
- Investigated the members-only rule's provenance on 2026-10-08. Original commit `d0a8c39`
  includes the restriction without rationale. Baseline child sources and Phase 9.7 support a
  reconstructed presentation rationale: homogeneous immediate matrix content and one child source.
  This is inference, not recovered historical intent. Owned helpers must address mixed outline
  children versus the member table; removing the restriction does not alone establish simpler UI.
- The user proposed a narrower candidate: restrict a matrix's direct owned row children to its own
  members, but allow matrix/view children. This preserves homogeneous row children while allowing
  owned helpers with one natural home. Proposed portal parity and matrix-parent insertion precedence
  remain unagreed; the current default-item insertion after matrix/view siblings would conflict with
  the parent constraint. Trace matrix focus,
  table/outline presentation, and application removal before accepting the placement contract.
- The user accepted the narrower rule for now, including portal parity and parent-matrix insertion.
  Pivot helpers use ordinary `own` homes beneath their pivots; global stores stay at root. Retain
  universal homes and try this model before revisiting visual clutter. Separate roots, positionless
  stores, matrix-part attachment, and automatic categories are set aside as current directions.
- Reconciled active docs and condensed superseded placement alternatives into history. Recorded
  [remaining plugin decisions](Revamp%20plugin%20semantics%20and%20storage.md#remaining-plugin-decisions):
  attached input sources, management/designations, application identity/removal, global authorization,
  and durability/replicas. Start with attached inputs, then the protection/lifecycle boundary.
- Other recommendations awaiting agreement: designation eligibility derived from managing-plugin
  status, independent of creation provenance; global off preserves state, with feature-specific
  pauses rather than an unsupported universal per-application disabled state.
- Open attachment questions: token linkage/context boundaries, token removal, nested discovery,
  task-versus-host result shapes, and SRS input sources. Transaction/logging does not supersede
  authorization or other plugins' write guards.
- The user clarified basic SRS: directly apply the plugin to a matrix with front/back rich-text
  columns, possibly also label/content roles. Inputs read the card row, with no attachments. The
  assistant had treated an expanded host-sourced scenario as a necessary gap. Removed that
  prerequisite from active guidance and explicitly qualified the inherited host-SRS assumption.
  Task prose context remains separate from stored plugin input fields.
- The user resolved cascade precedence and designation eligibility: core deletion cascades are
  higher-order lifecycle operations outside ordinary helper writer checks. Only user-managed matrixes
  qualify for default/aspect designation, regardless of creation provenance. Core/plugin-created
  user data may qualify; helper ownership beneath a user pivot does not transfer management.
- Core undo/restore treatment remains a follow-through in the recovery proposal. Recommend applying
  the higher-order principle while restoring management metadata; it is not yet explicitly settled.
- The user settled durable application storage and multiplicity: a focused system table records
  bindings/helper associations, while business data stays in matrixes. One application per
  plugin/pivot pair; multiple plugins can apply independently to one pivot. Status interpretation
  stays with binding configuration, not arbitrary business state. No schema/code was implemented.
- Added the task-automation/time-tracking example: removing one application deletes only its
  dedicated helper, while pivot deletion cascades through both. Uninstall/reinstall retention and
  reapplication remain lifecycle choices; concurrent setup/late writes remain durability questions.
- The user settled cleanup: uninstall removes all plugin-managed data/matrixes and applications;
  application removal fully clears its system record and helpers, so reapplication is fresh. Global
  off preserves stores, reset clears global state, and removal deletes global stores. Management,
  rather than creation provenance, determines the boundary with retained user data. Cleanup uses
  core lifecycle operations even when the plugin is not running; recovery is a separate contract.
- Renamed management terminology from `user-owned`/`plugin-owned` to `user-managed`/`plugin-managed`
  at the user's request, keeping actual `own` edges and lifecycle ownership terminology intact.
- Reviewed use cases for ongoing write authorization. Broad open rights are unnecessary for the
  basic second-brain slice: managed suggestions plus user-accepted actions suffice. Recurrence and
  unattended imports may need narrow continuing action authorization if they write user-managed
  rows, or can instead use managed occurrence/staging records. This choice remains open; do not
  impose a generic permissions framework or redundant prompts on direct user commands.
- The user resolved authorization by scope: applying implicitly authorizes ongoing use of that
  pivot, with no per-operation authorization. Global writes to user-managed data require authorization
  for each operation; no global standing grants. Recurrence and known-destination external ingest fit
  matrix applications, so no separate recurring-action permission mechanism is needed.
- Scope follows membership, including elsewhere-homed rows, and input bindings are not write
  allowlists. Matrix application does not grant automatic edits to attached hosts/unrelated matrixes.
  Own managed-store updates retain ordinary manager authority; every write is transactional/logged.
- The user settled reads: no read restrictions on managed stores, but second-brain and similar
  global discovery plugins scan user-managed matrixes only. Dense plugin business data is not a
  reliable generic content source; deliberate cross-plugin reads require semantic understanding.
- The user settled event durability/derivation: independent reviews and point-in-time dismissals
  have distinct IDs and all survive sync. Scheduling idempotently recomputes from combined review
  state, consistently with both events occurring on one client. Replay retains each event's ID.
  Content-generation boundaries and their effects on earlier dismissals belong to second-brain
  business logic, not sync reconciliation.
- Each application instance has its own identity. Reapplication gets a fresh identity; writes to
  removed identities are discarded, not allowed to resurrect history or enter the fresh application.
  Live removed system records remain cleared. Replication enforcement and recomputation triggers
  remain core implementation follow-throughs rather than unresolved plugin retention semantics.
- The basic plugin application/store model is settled in the exploration. Task attachment
  editor/query behavior and broader recovery/replication, widget, runtime, and background execution
  remain queued.
- Wrap-up review reconciled the proposal, plugin brief, research queue, and operation companion.
  Shortened the guide/NOW checkpoint, added the brief to the reading map, and queued
  [Session 3 — attachment context and editor/query behavior](Revamp%20research%20questions.md#next-session-attachment-context-and-editorquery-behavior).
  Start with two inline tasks, nested attachments, and sigil copy/move/removal; resolve task/host
  identities, context, editing targets, and project-scoped queries. No implementation or canonical
  promotion occurred. Broader recovery/replication and presentation are explicitly deferred.
- Verification: touched Markdown formatted; `npm run check:concepts` and `git diff --check` passed.
  No code changed, so code tests were not required.
- The user explicitly authorized this session's wrap-up commit.
