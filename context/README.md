# Context guide

Start with [NOW.md](NOW.md). It names the current plan, boundary, and minimum reading. Use this
index when a task needs wider product or architecture context.

## Reading routes

| Goal                                | Read, in order                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| Continue current work               | [NOW](NOW.md) → named active plan or session → cited canonical topics and code       |
| Understand the system               | [Architecture](Architecture.md) → relevant focused topic below                       |
| Review future work                  | [Plan](Plan.md) → [Phase 12](phases/Phase-12.md)                                     |
| Work on query authoring or launcher | [Query Spec](Query-Spec.md) → [Launcher](Launcher.md) → current implementation phase |
| Work on visual design               | [Design](Design.md) → [Design Faces](Design-Faces.md) → current implementation phase |
| Run or debug browser tests          | [Testing](Testing.md) → relevant test and implementation files                       |
| Investigate an older decision       | Current canonical topic → linked archived phase or visual evidence                   |

## Document roles

### Hubs and execution

- [NOW.md](NOW.md) is the short rolling handoff.
- [Plan.md](Plan.md) owns future phase order, dependencies, and the resolved-decision index.
- The current phase front door owns scope and progress. Focused session plans own detailed
  checklists and acceptance criteria.
- [Documentation.md](Documentation.md) defines maintenance and archive rules.

### Canonical topics

- [Architecture.md](Architecture.md) — cross-cutting system and target product structure.
- [Data-Model.md](Data-Model.md) — current ownership forest, relationships, matrixes, derived
  caches, and block markers.
- [Plugins.md](Plugins.md) — shipped plugin mechanics and the target face/command composition model.
- [Query-Spec.md](Query-Spec.md) — shipped compiler, recognizer, query runtime, and durable SQL
  round-trip; gesture authoring remains planned.
- [Launcher.md](Launcher.md) — shipped discovery, base ranking, family filters, and rooted navigation;
  shared overlay presentation also ships, while the launcher surface, query authoring, session
  signals, and tab retirement remain planned.
- [Sync.md](Sync.md) — shipped readiness, Phase 11 repair contract, and future replica boundary.
- [Virtualization.md](Virtualization.md) — paged data and rendering residency contract.
- [Performance.md](Performance.md) — deterministic guards and calibrated browser budgets.
- [Design.md](Design.md) and [Design-Faces.md](Design-Faces.md) — canonical tokens, themes,
  fidelity, sticky navigation, and component variants.
- [Testing.md](Testing.md) — browser and E2E testing rules.

Canonical topic documents own durable decisions. They must distinguish shipped, designed, and
deferred contracts when those states differ. Code and tests settle what ships today.

### History

Completed phase plans, explorations, spikes, visual companions, and superseded roadmaps preserve
rationale. They do not direct current work. Read them only through a canonical topic or an active
plan that cites the relevant evidence.

Historical material lives under `context/archive/`. Phase 11 and later plans live under
`context/phases/`.
