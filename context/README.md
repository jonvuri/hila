# Context guide

Start with [NOW.md](NOW.md). It names the current plan, boundary, and minimum reading. Use this
index when a task needs wider product or architecture context.

The active work is the [full revamp exploration](explorations/Revamp%20exploration%20guide.md). Its guide
defines the exploratory patch over the baseline topics below and records how sessions continue.
Proposals stay in the exploration folder until the architecture is ready to be revised.

## Reading routes

| Goal                                | Read, in order                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| Continue current work               | [NOW](NOW.md) → named active plan or session → cited canonical topics and code       |
| Look up a term or concept           | [Concepts](Concepts.md) → the concept's owner topic                                  |
| Find why something was decided      | [Decisions](Decisions.md) → constrained concepts in [Concepts](Concepts.md)          |
| Understand the system               | [Architecture](Architecture.md) → [Concepts](Concepts.md) → relevant topic below     |
| Review future work                  | [Plan](Plan.md) → [Phase 13](phases/Phase-13.md)                                     |
| Work on query authoring or launcher | [Query Spec](Query-Spec.md) → [Launcher](Launcher.md) → current implementation phase |
| Work on visual design               | [Design](Design.md) → [Design Faces](Design-Faces.md) → current implementation phase |
| Run or debug browser tests          | [Testing](Testing.md) → relevant test and implementation files                       |
| Investigate an older decision       | [Decisions](Decisions.md) → linked archived phase or visual evidence                 |

## Document roles

### Hubs and execution

- [NOW.md](NOW.md) is the short rolling handoff.
- [Plan.md](Plan.md) owns future phase order, dependencies, and the resolved-decision index.
- The current phase front door owns scope and progress. Planned session documents own high-level
  requirements, boundaries, acceptance, verification, and handoff. Detailed checklists belong only
  to active execution when they are useful.
- [Documentation.md](Documentation.md) defines maintenance and archive rules.

### Canonical topics

- [Concepts.md](Concepts.md) — the concept ledger: one name, definition, owner, and invariants per
  concept, plus the deprecated-terms table. First stop for any term.
- [Decisions.md](Decisions.md) — the numbered decision log. First stop for rationale.
- [Architecture.md](Architecture.md) — short narrative: objectives, layers, and two worked traces.
- [Data-Model.md](Data-Model.md) — matrixes, edges, nodes, positions, derived caches, child sources,
  and views.
- [Plugins.md](Plugins.md) — plugin registration, faces, face choices, hosts, renderings, and
  commands.
- [Query-Spec.md](Query-Spec.md) — shipped compiler, recognizer, query runtime, transient and durable
  chip authoring, raw SQL mode, and SQL-only durable round-trip.
- [Launcher.md](Launcher.md) — places, ancestry resolution, the stream root, and the shipped Quick
  and Deep launcher: discovery, ranking, query authoring, save and insert-ref exits, theme geometry
  adapters, and session memory.
- [Sync.md](Sync.md) — shipped readiness, Phase 11 repair contract, and future replica boundary.
- [Virtualization.md](Virtualization.md) — paged data and rendering residency contract.
- [Performance.md](Performance.md) — deterministic guards and calibrated browser budgets.
- [Design.md](Design.md) and [Design-Faces.md](Design-Faces.md) — semantic tokens, themes,
  fidelity, shell layout, sticky navigation, and component variants.
- [Testing.md](Testing.md) — browser and E2E testing rules.

Canonical topic documents own detailed contracts. Rationale lives in the decision log, and concept
definitions live in the ledger. Topics must distinguish shipped, designed, and deferred contracts
when those states differ. Code and tests settle what ships today.

### History

Completed phase plans, explorations, spikes, visual companions, and superseded roadmaps preserve
rationale. They do not direct current work. Read them only through a canonical topic or an active
plan that cites the relevant evidence.

Historical material lives under `context/archive/`. Phase 11 and later plans live under
`context/phases/`.
