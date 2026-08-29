# Browser and E2E testing guide

Read this guide before writing or running Playwright tests, diagnosing browser failures,
or interactively testing the live app. The general verification commands remain in
[AGENTS.md](../AGENTS.md).

## Playwright E2E tests

### Running tests

- Full suite: `pnpm test:e2e` (about four minutes).
- Single test by name: `pnpm test:e2e --grep "test name substring"`.
- Always run outside the sandbox so Playwright can use the system-installed browsers.
  Sandboxed browser binaries do not persist and can trigger a large download.

### Writing robust tests

**Target the correct matrix.** The Matrix Debug sidebar lists matrixes ordered by random
ID. When multiple matrixes exist, a global `.first()` can target the wrong one. Anchor the
locator to its matrix heading:

```typescript
const btn = page
  .locator('h3')
  .filter({ hasText: '"Outline"' })
  .locator('xpath=..')
  .getByRole('button', { name: 'Add Sample Rows' })
```

**Wait for reactive updates; do not use fixed timeouts.** Database changes propagate
through the worker, SQLite update hook, subscription rerun, message, Solid reconcile, and
DOM update. Prefer Playwright's retrying assertions:

```typescript
await expect(async () => {
  const count = await page.locator('.outline-row').count()
  expect(count).toBeGreaterThanOrEqual(3)
}).toPass({ timeout: 5000 })
```

**Stabilize counts before comparing.** After `addSampleRows`, the button can re-enable
before the outline finishes updating. Wait for the expected minimum with
`waitForRows(page, minCount)` before taking the baseline count.

### Debugging failures

**Read the error context file.** A failed test writes an accessibility snapshot to
`test-results/<test-name>/error-context.md`. It shows what the page contained at the point
of failure.

**Capture console logs.** Attach a listener near the top of the test to surface worker
errors and `console.error` calls:

```typescript
const logs: string[] = []
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`))
```

**Handle fire-and-forget failures.** Operations such as `void reparentRow(...)` otherwise
hide rejected promises. Add a focused `.catch(console.error)` while diagnosing the
operation, then decide on the proper production handling.

### Known pitfalls

- **Global rank-key uniqueness.** The `rank` table has a `key BLOB PRIMARY KEY` shared
  across matrixes. New keys for insert and reparent operations must be checked globally.
- **`<Show>` guards remove UI.** Solid's `<Show when={...}>` removes children from the DOM.
  A test must first satisfy the guard, or the control must live outside it when that better
  matches the product behavior.

## Agent-driven live browser testing

For interactive checks against a running dev server, prefer the Chrome DevTools MCP.
The Playwright suite remains the regression source of truth.

- Use real key events for ProseMirror editors. `type_text` and `press_key` reach the
  contenteditable; synthetic events from embedded browser controls may not.
- Do not use a bulk `fill` operation on ProseMirror. Its select-all replacement can be
  rejected and can wipe the row.
- A fresh automation profile has its own persistent OPFS database and may contain an old
  schema. If the app hangs on “Loading…”, capture `unhandledrejection` and `error` reasons.
  If the cause is stale schema, open dev tools, choose **Reset DB**, and confirm. This
  affects only the automation profile.
- Prefer accessibility snapshots for stable element identities. Use DOM evaluation for
  exact dimensions or computed colors when a screenshot is ambiguous.
- For keyboard/editor checks, drive a real Chrome session. Embedded browser pointer
  actions can still be useful for clicking and inspection, but their synthetic keyboard
  events may not reach the editor.

## Performance and churn

[Performance.md](Performance.md) owns performance budgets and test design. Keep two layers:

- deterministic query-plan, work-count, scaling, invalidation, and lifecycle guards;
- bounded browser stress cases for layout, DOM, WASM, and constant-factor regressions.

Calibrate browser runs against the estimated slowdown from this development machine to a typical
downmarket target. Use Chrome DevTools' maximum CPU slowdown when it is at least as severe as that
estimate. Record the estimate, throttle, browser, fixture, warmed median, and p95 with the result.

Use the ProseMirror counters in `src/debug/debugState.ts` for exact mount/unmount assertions. A
performance test must fail on unrelated editor churn even when its wall-clock result remains under
budget.
