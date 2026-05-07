# Development practices

## Static analysis and tests

Check these tasks after every major change:

- Formatter (Prettier): `npm run format`
- Linter (ESLint): `npm run lint`
- Static types (Typescript): `npm run typecheck`
- Tests (Vitest): `npm run test:run`
- E2E tests (Playwright): `pnpm test:e2e`

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

## Playwright E2E tests

### Running tests

- Full suite: `pnpm test:e2e` (~4 minutes, 110 tests).
- Single test by name: `pnpm test:e2e --grep "test name substring"`.
- **Always run with `required_permissions: ["all"]`** to use the system-installed Playwright browsers. The sandbox does not persist browser binaries across sessions, so running inside the sandbox would require a ~250MB re-download every time.

### Writing robust tests

**Target the correct matrix.** The Matrix Debug sidebar lists matrixes ordered by random ID. When multiple matrixes exist (Outline + Notes), `page.getByRole('button', { name: 'Add Sample Rows' }).first()` may target the wrong one. Use a locator anchored to the matrix heading instead:

```typescript
const btn = page
  .locator('h3')
  .filter({ hasText: '"Outline"' })
  .locator('xpath=..')
  .getByRole('button', { name: 'Add Sample Rows' })
```

**Wait for reactive updates, don't use fixed timeouts.** Database changes propagate through the worker → SQLite update hook → subscription re-run → postMessage → Solid reconcile → DOM update. This chain is fast but not instant. Prefer Playwright's auto-retry assertions:

```typescript
// Bad: brittle fixed wait
await page.waitForTimeout(1000)
const count = await page.locator('.outline-row').count()
expect(count).toBeGreaterThanOrEqual(3)

// Good: polls until the assertion passes or times out
await expect(async () => {
  const count = await page.locator('.outline-row').count()
  expect(count).toBeGreaterThanOrEqual(3)
}).toPass({ timeout: 5000 })
```

**Stabilize counts before comparing.** After `addSampleRows`, the button re-enables before the outline UI finishes updating. If you need an accurate "before" count, wait for the expected minimum first with `waitForRows(page, minCount)`, or add a short stabilization wait.

### Debugging failures

**Read the error context file.** Every failed test writes a Playwright page snapshot to `test-results/<test-name>/error-context.md`. This YAML snapshot shows the full accessibility tree at the point of failure — element roles, text content, and refs. It is the single most useful artifact for understanding what the page actually looked like.

**Capture console logs.** To surface worker errors or `console.error` calls from the app, attach a listener at the top of the test:

```typescript
const logs: string[] = []
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`))
```

Then inspect `logs` in the assertion output. This is how the `reparentRow` UNIQUE constraint failure was discovered — the promise rejection was silently swallowed until a `.catch()` was added.

**Add `.catch()` to fire-and-forget promises.** The outline code uses `void reparentRow(...)` extensively. Failures are invisible unless you add `.catch(console.error)`. When debugging, temporarily add catch handlers to the specific operation under investigation.

### Common pitfalls

- **Global rank key uniqueness.** The `rank` table has `key BLOB PRIMARY KEY` shared across all matrixes. Any code that computes new rank keys (insert, reparent) must check for global collisions, not just within the current matrix. `insertRow` already does this; `reparentRow` was missing it for the outdent (root-level reparent) path.
- **`<Show>` guards hiding UI.** SolidJS `<Show when={...}>` blocks remove their children from the DOM entirely. If a test expects a button that's inside a `<Show>` guard, the guard condition must be met first — or the element should be moved outside the guard.
