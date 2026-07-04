import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Phase 9.7 Stage C3 — folded-row focus and drill-in identity.
//
// A folded block row (a `view` block's content, gathered inline at its
// marker's position — Stage C2) carries a synthetic position key that
// positions nothing (the firewall: a gather mints no `own`-edges). Opening its
// focus panel used to pass that synthetic key straight through as the nested
// panel's scope root, so a row's real owned children silently never showed —
// even when the same row, rendered loose elsewhere, has real children.
//
// The fix resolves the row's real position by identity (resolveDrillInPosition
// in src/core/portal.ts: home if live, else the lowest-keyed live portal, else
// null) before opening the focus panel, and renders a distinct, legible state
// for each case: a real position → real children show; no live position at
// all → an intentional empty state, not a silent one.
// ---------------------------------------------------------------------------

const openSidebar = async (page: Page) => {
  const sidebar = page.locator('.app-sidebar')
  if (!(await sidebar.isVisible())) {
    await page.getByRole('button', { name: 'Toggle dev tools' }).click()
    await expect(sidebar).toBeVisible({ timeout: 3000 })
  }
}

const resetDB = async (page: Page) => {
  await page.goto('/')
  await openSidebar(page)
  const resetBtn = page.getByTestId('reset-db-btn')
  await resetBtn.click()
  await expect(resetBtn).toContainText('Confirm', { timeout: 3000 })
  await resetBtn.click()
  await expect(resetBtn).toContainText('Reset DB', { timeout: 10000 })
}

const goToWorkspace = async (page: Page) => {
  await page.getByTestId('workspace-tab').click()
}

const waitForRows = async (page: Page, minCount = 1) => {
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
  await expect(async () => {
    const count = await page.locator('.outline-row').count()
    expect(count).toBeGreaterThanOrEqual(minCount)
  }).toPass({ timeout: 5000 })
}

const appearances = (page: Page, rowId: number) =>
  page.locator(`.outline-row[data-row-id="${rowId}"]`)

const openRealPositionBtn = (page: Page) => page.getByRole('button', { name: 'Open real position' })

const doc = (text: string) =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })

/** Create a Tasks matrix (a `detail` field column, non-label-like) and a root
 *  Anchor row to fold a view block under. Returns their ids. */
const seedTasksAndAnchor = (page: Page) =>
  page.evaluate(async () => {
    // @ts-expect-error -- resolved by the Vite dev server at runtime
    const sql = await import('/src/core/client/sql-client.ts')
    // @ts-expect-error -- resolved by the Vite dev server at runtime
    const mc = await import('/src/core/client/matrix-client.ts')
    const doc = (text: string) =>
      JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      })
    const ms = await sql.execQuery("SELECT id FROM matrix WHERE title = 'Workspace'")
    const wsId = (ms[0] as { id: number }).id
    const tasksId = (await mc.createMatrix('Tasks')) as number
    await mc.addColumn(tasksId, 'detail', 'TEXT')
    const anchor = await mc.insertRow(wsId, { values: { label: doc('Anchor'), content: null } })
    return { wsId, tasksId, anchorId: anchor.rowId as number }
  })

const foldTasksUnderAnchor = (page: Page, wsId: number, anchorId: number, tasksId: number) =>
  page.evaluate(
    async ([wsId, anchorId, tasksId]) => {
      // @ts-expect-error -- resolved by the Vite dev server at runtime
      const mc = await import('/src/core/client/matrix-client.ts')
      await mc.createViewBlock(wsId, anchorId, `SELECT * FROM "mx_${tasksId}_data"`)
    },
    [wsId, anchorId, tasksId] as const,
  )

test.describe('Phase 9.7 Stage C3 — folded-row focus and drill-in identity', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await goToWorkspace(page)
    await waitForRows(page, 1)
  })

  test('a folded row with a real, positioned child shows it after drill-in', async ({ page }) => {
    const { wsId, tasksId, anchorId } = await seedTasksAndAnchor(page)

    const { taskId, childId } = await page.evaluate(
      async ([wsId, tasksId]) => {
        // @ts-expect-error -- resolved by the Vite dev server at runtime
        const mc = await import('/src/core/client/matrix-client.ts')
        const doc = (text: string) =>
          JSON.stringify({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
          })
        // A loose task, homed at the workspace root (Tasks has no label/content
        // columns — only the `detail` field column added above), with a real
        // owned child (a workspace-matrix row — the heterogeneous-children case).
        const task = await mc.insertRow(tasksId, { values: { detail: 'Task A' } })
        const child = await mc.insertRow(wsId, {
          parentKey: task.key,
          values: { label: doc("Task A's real child"), content: null },
        })
        return { taskId: task.rowId as number, childId: child.rowId as number }
      },
      [wsId, tasksId] as const,
    )

    await foldTasksUnderAnchor(page, wsId, anchorId, tasksId)

    // The task now appears twice: its home (loose, at the root) and the folded
    // copy under Anchor's view block.
    await expect(appearances(page, taskId)).toHaveCount(2, { timeout: 5000 })

    // Only the folded copy gets the "Open real position" affordance — the
    // loose original keeps the plain "Open focus panel" tooltip.
    await expect(openRealPositionBtn(page)).toHaveCount(1, { timeout: 5000 })
    await openRealPositionBtn(page).click()

    await expect(page.getByTestId('focus-panel-folded-origin')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('focus-no-children')).toHaveCount(0)
    await expect(page.getByTestId('focus-no-position')).toHaveCount(0)
    await expect(
      page.locator(`[data-testid="focus-panel-children"] .outline-row[data-row-id="${childId}"]`),
    ).toBeVisible({ timeout: 5000 })
  })

  test('a folded row with no live position shows an intentional empty state', async ({
    page,
  }) => {
    const { wsId, tasksId, anchorId } = await seedTasksAndAnchor(page)

    // A bare data row: no outline position at all (never given a tree
    // position via insertRow), matching the model's "positioning it would make
    // it appear both loose and folded" case.
    const bareRowId = await page.evaluate(
      async ([tasksId]) => {
        // @ts-expect-error -- resolved by the Vite dev server at runtime
        const sql = await import('/src/core/client/sql-client.ts')
        await sql.execMutation(`INSERT INTO "mx_${tasksId}_data" (detail) VALUES ('Bare task')`)
        const rows = (await sql.execQuery(
          `SELECT id FROM "mx_${tasksId}_data" WHERE detail = 'Bare task'`,
        )) as { id: number }[]
        return rows[0]!.id
      },
      [tasksId] as const,
    )

    await foldTasksUnderAnchor(page, wsId, anchorId, tasksId)

    // The bare row appears only once — the folded copy (no home to duplicate).
    await expect(appearances(page, bareRowId)).toHaveCount(1, { timeout: 5000 })

    await openRealPositionBtn(page).click()

    await expect(page.getByTestId('focus-panel-folded-origin')).toBeVisible({ timeout: 5000 })
    // The distinct "not placed in the outline" state, not the generic
    // "no children yet" one — legibly different, not a silent empty result.
    await expect(page.getByTestId('focus-no-position')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('focus-no-children')).toHaveCount(0)
  })

  test('a folded row with both a home and a portal resolves to the home', async ({ page }) => {
    const { wsId, tasksId, anchorId } = await seedTasksAndAnchor(page)

    const { taskId, childId } = await page.evaluate(
      async ([wsId, tasksId]) => {
        // @ts-expect-error -- resolved by the Vite dev server at runtime
        const mc = await import('/src/core/client/matrix-client.ts')
        const doc = (text: string) =>
          JSON.stringify({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
          })
        // A loose task, homed at the workspace root, with a real owned child...
        const task = await mc.insertRow(tasksId, { values: { detail: 'Task B' } })
        const child = await mc.insertRow(wsId, {
          parentKey: task.key,
          values: { label: doc("Task B's real child"), content: null },
        })
        // ...and also portaled under a second loose row. Ownership is single
        // (§4/§5): the home stays the row-axis owner; the portal is an extra,
        // non-owning position. The resolver must prefer the home over the
        // portal so drill-in doesn't depend on which position happened to
        // resolve first.
        const host = await mc.insertRow(wsId, {
          values: { label: doc('Portal host'), content: null },
        })
        await mc.addPortal(
          { matrixId: wsId, rowId: host.rowId },
          { matrixId: tasksId, rowId: task.rowId },
        )
        return { taskId: task.rowId as number, childId: child.rowId as number }
      },
      [wsId, tasksId] as const,
    )

    await foldTasksUnderAnchor(page, wsId, anchorId, tasksId)

    // Three appearances: the home, the portal (under Portal host), and the
    // folded copy (under Anchor's view block).
    await expect(appearances(page, taskId)).toHaveCount(3, { timeout: 5000 })
    await expect(openRealPositionBtn(page)).toHaveCount(1, { timeout: 5000 })
    await openRealPositionBtn(page).click()

    await expect(page.getByTestId('focus-panel-folded-origin')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('focus-no-position')).toHaveCount(0)
    await expect(page.getByTestId('focus-no-children')).toHaveCount(0)
    await expect(
      page.locator(`[data-testid="focus-panel-children"] .outline-row[data-row-id="${childId}"]`),
    ).toBeVisible({ timeout: 5000 })
  })
})
