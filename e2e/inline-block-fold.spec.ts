import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Inline block folding — Phase 9.7 Stage C2 (the last build piece).
//
// A `view` block's *content* folds inline into the loose outline at its marker's
// position, via the worker↔client gather RPC (count+slice flattening — see
// src/core/worker/gather-handler.ts + src/workspace/gather-flatten.ts). The
// folded rows render through the same substrate cell renderer as a meshed
// cross-matrix loose row, update live, and a block spanning a window boundary
// folds correctly across it. (The straddling/coverage math is also guarded
// deterministically in src/workspace/gather-flatten.test.ts.)
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

/** The workspace matrix id + its first (welcome) row id, read from the index. */
const workspaceRoot = (page: Page): Promise<{ wsId: number; rowId: number }> =>
  page.evaluate(async () => {
    // @ts-expect-error -- resolved by Vite dev server at runtime
    const sql = await import('/src/core/client/sql-client.ts')
    const rows = (await sql.execQuery(
      'SELECT matrix_id, row_id FROM scroll_index ORDER BY global_lexkey LIMIT 1',
    )) as { matrix_id: number; row_id: number }[]
    return { wsId: rows[0]!.matrix_id, rowId: rows[0]!.row_id }
  })

/** Create a Tasks matrix with `count` rows, and a `view` block over it (a
 *  recognized `SELECT *`, so its rows carry identity) minted under `focal`. */
const seedFoldedView = (
  page: Page,
  focal: { wsId: number; rowId: number },
  count: number,
): Promise<number> =>
  page.evaluate(
    async ([wsId, focalRowId, n]) => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const client = await import('/src/core/client/matrix-client.ts')
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const sql = await import('/src/core/client/sql-client.ts')
      const tasksId = (await client.createMatrix('Tasks')) as number
      // A plain, non-label-like field column so the folded rows render their
      // value through the substrate cell strip (a `title`/`name` column is
      // label-like and would be hoisted out of the field partition).
      await client.addColumn(tasksId, 'detail', 'TEXT')
      // Insert bare data rows (no outline position) — the view's rows are
      // gathered by its query, not positioned in the loose forest. (Positioning
      // them would make them appear *both* as loose rows and folded, which is the
      // aspect/portal story, not view folding.)
      for (let i = 0; i < n; i++) {
        await sql.execMutation(`INSERT INTO "mx_${tasksId}_data" (detail) VALUES ('Task ${i}')`)
      }
      await client.createViewBlock(wsId, focalRowId, `SELECT * FROM "mx_${tasksId}_data"`)
      return tasksId
    },
    [focal.wsId, focal.rowId, count] as const,
  )

test.describe('Inline block folding (view block content in the outline)', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await goToWorkspace(page)
    await waitForRows(page, 1)
  })

  test("a view block's content renders inline at its marker, and updates live", async ({
    page,
  }) => {
    const focal = await workspaceRoot(page)
    const tasksId = await seedFoldedView(page, focal, 3)
    expect(tasksId).toBeGreaterThan(0)

    // The three task rows fold inline as substrate cell strips (cross-matrix
    // rows rendered through the same OutlineCellStrip path). The folded cells are
    // live `FieldEditor` inputs, so their values are read via inputValue (not
    // text content).
    const cellValues = () =>
      page
        .getByTestId('outline-cell-strip')
        .locator('input')
        .evaluateAll((els) => (els as HTMLInputElement[]).map((e) => e.value).sort())

    await expect(async () => {
      expect(await cellValues()).toEqual(['Task 0', 'Task 1', 'Task 2'])
    }).toPass({ timeout: 5000 })

    // Edit the underlying row → the folded cell updates live (the gather re-runs
    // on the write via the same tables-visited invalidation).
    await page.evaluate(
      async ([mid]) => {
        // @ts-expect-error -- resolved by Vite dev server at runtime
        const sql = await import('/src/core/client/sql-client.ts')
        const client = await import('/src/core/client/matrix-client.ts')
        const rows = (await sql.execQuery(
          `SELECT id FROM "mx_${mid}_data" WHERE detail = 'Task 0'`,
        )) as { id: number }[]
        await client.updateRow(mid, rows[0]!.id, { detail: 'Task edited' })
      },
      [tasksId] as const,
    )
    await expect(async () => {
      expect(await cellValues()).toEqual(['Task 1', 'Task 2', 'Task edited'])
    }).toPass({ timeout: 5000 })
  })

  test('a block spanning a window boundary folds correctly across it', async ({ page }) => {
    const focal = await workspaceRoot(page)
    // 120 folded rows > ROWS_PER_WINDOW (100): the block straddles the window
    // 0/1 boundary. Both are in the eager INITIAL_NEEDED_WINDOWS pool, so all
    // 120 fold in — exact coverage across the boundary.
    await seedFoldedView(page, focal, 120)

    const strips = page.getByTestId('outline-cell-strip')
    await expect(async () => {
      expect(await strips.count()).toBe(120)
    }).toPass({ timeout: 8000 })

    // A row well past the first window (index 110) is present — it lives in the
    // second window's slice of the same block (the folded cells are inputs, so
    // their values are read via inputValue).
    const values = await strips.locator('input').evaluateAll((els) =>
      (els as HTMLInputElement[]).map((e) => e.value),
    )
    expect(values).toContain('Task 110')
    expect(new Set(values).size).toBe(120)
  })
})
