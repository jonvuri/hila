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
- [Primitives](context/Primitives.md) -- rank, closure, and join table specs
- [Plan](context/Plan.md) -- the current implementation plan in depth
- [Plugins](context/Plugins.md) -- plugin model and concrete examples (outline, tags)

## Code style

- Prefer `type` over `interface` for type definitions.
- Prefer arrow function expressions (`const foo = () => ...`) over function declarations (`function foo() ...`).

## Development principles

- **Incremental and intentional evolution.** Only tackle necessary complexity. Stay aware of high-level goals to inform decisions, but don't build ahead of proven need. Any aspect of the design may change as concrete outcomes reveal better approaches.
- **Gestalt awareness.** Every change should be considered in context of the whole. Architecture, code, and documentation should remain internally consistent and coherent at all times. When one part changes, update all related parts.

## Architecture summary

The system has four layers: SQLite storage, core (matrix registry + plugin system), structural primitives (rank, closure, joins), and plugins (all user-facing features).

- **Matrixes** are independent data containers (typed SQLite tables). Their addressable units are called **entries**. Existence does not require placement in any outline.
- **Structural primitives** (rank, closure, joins) are core-provided building blocks that plugins request for their matrixes.
- **Plugins** compose matrixes and primitives to provide user-facing features. The outline view, tag system, etc. are all plugins.
- **Faces** are the views and interaction surfaces that plugins register and provide.
