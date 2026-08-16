# Context guide

Start here when `NOW.md` does not already name the documents needed for a task. This
index adds selective reading routes without reorganizing the mature context corpus
during Phase 10.

## Reading routes

| Goal                                     | Read, in order                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| Continue current work                    | [NOW](NOW.md) → named session sections → cited canonical docs and code        |
| Understand the architecture              | [Architecture](Architecture.md) → relevant topic spec below                   |
| Review the roadmap                       | [Plan](Plan.md) → relevant phase document                                     |
| Work on the current design exploration   | [NOW](NOW.md) → [Phase 10](Phase-10.md) §4 → active Session 4 brief           |
| Run or debug browser tests               | [Testing](Testing.md) → relevant test and implementation files                |
| Investigate why an older choice was made | Relevant completed phase document or visual companion → current canonical doc |

## Document roles

### Current execution state

- [NOW.md](NOW.md) is the short, rolling handoff: current session, immediate reading,
  boundaries, and next step. It must not become a second architecture or plan document.

### Current product and architecture

- [Architecture.md](Architecture.md) — system shape and cross-cutting concepts.
- [Traits.md](Traits.md) — rank, closure, joins, and provisioning.
- [Plugins.md](Plugins.md) — plugin and face composition model.
- [Query-Spec.md](Query-Spec.md) and [Launcher.md](Launcher.md) — shared query model
  and launcher surface.
- [Sync.md](Sync.md) and [Virtualization.md](Virtualization.md) — subsystem specs.
- [Design.md](Design.md) and [Design-Faces.md](Design-Faces.md) — canonical design
  system and face-theme rules. Phase 10 may explicitly mark parts as unsettled.

These topic documents carry durable current decisions. Update them when an exploration
settles; do not make `NOW.md` carry the decision instead.

### Roadmap and execution records

- [Plan.md](Plan.md) is the project roadmap and resolved-decision index.
- `Phase-*.md` files are detailed plans and execution records. The active brief defines
  the current scope and acceptance criteria. Completed briefs preserve rationale and
  should be read selectively unless another document explicitly requires them.
- `Phase-*-visuals.html` and the Session 4 theme catalogs are visual evidence and
  exploration history. They are not current design authority unless an active plan
  cites a specific surviving idea.

An active exploration may propose a change before it is promoted into a canonical topic
document. If documents disagree, do not silently choose the newest file: identify whether
the difference is an unsettled proposal, a completed decision awaiting reconciliation, or
stale documentation, then update the affected sources together.

## Maintenance rules

- Keep `NOW.md` short. Update it when a session starts, changes direction, or closes.
- Keep detailed checklists and acceptance criteria in the active phase/session document;
  link to them rather than copying them into `NOW.md`.
- Preserve completed plans and visual explorations as history. Do not keep extending a
  closed session.
- Prefer relative Markdown links between context documents.
- During Sessions 4c–4i, make only local routing and accuracy fixes. The broader context
  consolidation is explicitly deferred in
  [Phase 10 — Post-Phase 10 documentation consolidation](Phase-10.md#post-phase-10-documentation-consolidation-planned-and-deferred).
