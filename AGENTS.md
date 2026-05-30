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

## Working with phased plans

Implementation plans live in `context/Phase-*.md` as numbered stages with checkbox items (`- [ ]` / `- [x]`). When executing a stage:

- Work through each item in order, running the verification step (typecheck/lint/test) specified at the end of the stage.
- **Check off items** (`- [ ]` → `- [x]`) in the phase document as they are completed. This is the primary progress record.
- If a stage has sub-items (tests, implementation steps), check them off individually as you go.

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

## Agent-driven direct browser testing (live dev server)

For interactively verifying UI against a running dev server (e.g. `http://localhost:3000`), prefer the **chrome-devtools MCP** over Cursor's built-in browser tools. Findings:

- **Use chrome-devtools MCP for anything involving keyboard / the editors.** It drives a real Chrome, so `press_key` (Enter, Tab, Cmd/Ctrl+L) and `type_text` deliver genuine key events that reach the ProseMirror editors. This is how you create/indent rows, type labels, etc.
- **Cursor's built-in browser cannot type into the outline.** Pointer actions (clicks on aria-labeled buttons, coordinate clicks) work, but synthetic key events do **not** reach the focused contenteditable — they get routed away by the Electron webview. So it's fine for clicking/inspecting, useless for editing. This is a runtime limitation, not an app accessibility gap (the outline exposes good roles/labels: bullets are `role="button"`, the non-active focus header is a button named "Collapse to this panel", etc.).
- **Do NOT use the chrome-devtools `fill` tool on the ProseMirror editors.** It does a select-all-and-replace that PM rejects and can wipe the row. Use `type_text` / `press_key` (real per-character key events) instead.
- **A fresh chrome-devtools Chrome carries its own persistent OPFS database.** It may hold a stale schema from an older app version. Symptom: the app hangs on the "Loading…" fallback with an opaque `Uncaught (in promise)`; capture the real reason by reloading with an `initScript` that pushes `unhandledrejection`/`error` reasons onto a global array, then read it via `evaluate_script`. The fix is to reset: open dev tools (the gear / `Cmd/Ctrl+\`), click **Reset DB**, then **Confirm Reset**. This is the MCP browser's own profile — it does not touch your own browser's data.
- **Prefer `take_snapshot` (a11y tree with stable `uid`s) over screenshots** for locating elements; use `evaluate_script` to read precise DOM/computed-style facts (e.g. element heights, computed colors) when a screenshot is ambiguous (dim-until-hover affordances don't read well in a static capture).
- **The Playwright e2e suite remains the source of truth for regression testing.** Live browser driving is for spot-checking visual/interaction polish, not a replacement for `pnpm test:e2e`.
