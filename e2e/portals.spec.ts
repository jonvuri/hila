import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Phase 9.7 Stage C — portal / move-owner / two-tier-delete gestures.
//
// These drive the wired client ops (matrix-client) directly — as the existing
// focus-panel sub-table tests do (mc.createDependentRow) — and assert the outline
// effects: a portal appears as an extra outline row (position keyed by lexkey, so
// the home + portal are distinct rows with the same data-row-id), detach is
// non-destructive, move-owner relocates the home and leaves a portal behind, and
// the two-tier delete either ghosts surviving portals (default) or cascades
// everywhere (the escalation).
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

// Seed a small forest at the workspace root via the data layer and return the
// ids the tests reference. `children` are inserted under their parent so a
// move-owner has a non-root old parent to leave a portal at.
const seedForest = (page: Page) =>
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

    const a = await mc.insertRow(wsId, { values: { label: doc('Alpha'), content: null } })
    const c = await mc.insertRow(wsId, {
      parentKey: a.key,
      values: { label: doc('Charlie'), content: null },
    })
    const d = await mc.insertRow(wsId, { values: { label: doc('Delta'), content: null } })
    return { wsId, aId: a.rowId as number, cId: c.rowId as number, dId: d.rowId as number }
  })

test.describe('Phase 9.7 Stage C — portals', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await goToWorkspace(page)
    await waitForRows(page, 1)
  })

  test('a portal appears as an extra outline row and detaches non-destructively', async ({
    page,
  }) => {
    const ids = await seedForest(page)
    // Welcome + Alpha + Charlie(child) + Delta = 4 rows.
    await waitForRows(page, 4)
    await expect(appearances(page, ids.dId)).toHaveCount(1)

    // Portal Delta under Alpha.
    await page.evaluate(async ({ wsId, aId, dId }) => {
      // @ts-expect-error -- resolved by the Vite dev server at runtime
      const mc = await import('/src/core/client/matrix-client.ts')
      await mc.addPortal({ matrixId: wsId, rowId: aId }, { matrixId: wsId, rowId: dId })
    }, ids)

    // Delta now appears twice: its home + the portal under Alpha.
    await expect(appearances(page, ids.dId)).toHaveCount(2, { timeout: 5000 })

    // Detach the portal (non-destructive): the home survives.
    await page.evaluate(async ({ wsId, aId, dId }) => {
      // @ts-expect-error -- resolved by the Vite dev server at runtime
      const mc = await import('/src/core/client/matrix-client.ts')
      await mc.removePortal({ matrixId: wsId, rowId: aId }, { matrixId: wsId, rowId: dId })
    }, ids)

    await expect(appearances(page, ids.dId)).toHaveCount(1, { timeout: 5000 })
  })

  test('move-owner relocates the home and leaves a portal at the old parent', async ({
    page,
  }) => {
    const ids = await seedForest(page)
    await waitForRows(page, 4)
    // Charlie starts as the sole child of Alpha — one appearance.
    await expect(appearances(page, ids.cId)).toHaveCount(1)

    // Move Charlie's home under Delta; a portal is left behind under Alpha.
    await page.evaluate(async ({ wsId, cId, dId }) => {
      // @ts-expect-error -- resolved by the Vite dev server at runtime
      const mc = await import('/src/core/client/matrix-client.ts')
      await mc.moveOwner({ matrixId: wsId, rowId: cId }, { matrixId: wsId, rowId: dId })
    }, ids)

    // Two appearances now: the relocated home (under Delta) + the portal (under Alpha).
    await expect(appearances(page, ids.cId)).toHaveCount(2, { timeout: 5000 })
  })

  test('two-tier delete: default ghosts surviving portals, hard-delete cascades everywhere', async ({
    page,
  }) => {
    const ids = await seedForest(page)
    await waitForRows(page, 4)

    // Portal Charlie under Delta, then delete Charlie's home (default): the portal
    // survives as an is_ghost tombstone.
    await page.evaluate(async ({ wsId, cId, dId }) => {
      // @ts-expect-error -- resolved by the Vite dev server at runtime
      const mc = await import('/src/core/client/matrix-client.ts')
      await mc.addPortal({ matrixId: wsId, rowId: dId }, { matrixId: wsId, rowId: cId })
      await mc.deleteHomeGhostingPortals(wsId, cId)
    }, ids)

    // The surviving portal renders as a ghost tombstone.
    await expect(page.getByTestId('outline-row-ghost')).toBeVisible({ timeout: 5000 })

    // Escalate: hard-delete-including-refs removes every appearance, ghost included.
    await page.evaluate(async ({ wsId, cId }) => {
      // @ts-expect-error -- resolved by the Vite dev server at runtime
      const mc = await import('/src/core/client/matrix-client.ts')
      await mc.hardDeleteIncludingRefs(wsId, cId)
    }, ids)

    await expect(page.getByTestId('outline-row-ghost')).toHaveCount(0, { timeout: 5000 })
    await expect(appearances(page, ids.cId)).toHaveCount(0, { timeout: 5000 })
  })
})
