# Development practices

## Static analysis and tests

Check these tasks after every major change:

- Formatter (Prettier): `npm run format`
- Linter (ESLint): `npm run lint`
- Static types (Typescript): `npm run typecheck`
- Tests (Vitest): `npm run test:run`

# Project plan

See the `context/` directory for documentation on architecture and planning. In particular:

- [Architecture](context/Architecture.md) -- layered architecture, core concepts, objectives
- [Traits](context/Traits.md) -- rank and closure trait specs, join table, provisioning model
- [Plan](context/Plan.md) -- the current implementation plan in depth
- [Plugins](context/Plugins.md) -- plugin model, face slot system, concrete examples (outline, notes, tags)

## Code style

- Prefer `type` over `interface` for type definitions.
- Prefer arrow function expressions (`const foo = () => ...`) over function declarations (`function foo() ...`).

## Development principles

- **Incremental and intentional evolution.** Only tackle necessary complexity. Stay aware of high-level goals to inform decisions, but don't build ahead of proven need. Any aspect of the design may change as concrete outcomes reveal better approaches.
- **Gestalt awareness.** Every change should be considered in context of the whole. Architecture, code, and documentation should remain internally consistent and coherent at all times. When one part changes, update all related parts.

## Architecture summary

The system has three layers: SQLite storage and sync, core (matrix registry + plugin system + trait system + join table + query engine), and plugins (all user-facing features).

- **Matrixes** are independent data containers (typed SQLite tables). Their addressable units are called **rows**. Existence does not require placement in any outline.
- **Traits** (rank, closure) are per-matrix metadata tables auto-provisioned on demand and shared by all consumers. The **join table** is global infrastructure for cross-matrix references.
- **Plugins** compose matrixes, traits, and the join table to provide user-facing features. The outline view, note editor, tag system, etc. are all plugins.
- **Faces** are the views and interaction surfaces that plugins register. Face types declare **slots** (named positions with preferred column types) that matrix columns bind to, allowing any face to render any compatible matrix.
