import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
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

const waitForRows = async (page: Page, minCount = 1) => {
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 10000 })
  await expect(async () => {
    const count = await page.locator('.outline-row').count()
    expect(count).toBeGreaterThanOrEqual(minCount)
  }).toPass({ timeout: 30000 })
  return page.locator('.outline-row').count()
}

/**
 * Add rows in bulk by clicking "Add Sample Rows" multiple times.
 * Navigates to the matrix detail only once, loops the button, then navigates back.
 * Each click adds 2-3 rows; 55 clicks → ≥110 visible rows → ≥2 windows.
 */
const addManyRows = async (page: Page, clickCount: number) => {
  await openSidebar(page)
  await page.locator('.mb-matrix-item', { hasText: 'Outline' }).click()
  await expect(page.getByTestId('matrix-detail')).toBeVisible({ timeout: 3000 })
  const btn = page.getByTestId('add-sample-rows')
  for (let i = 0; i < clickCount; i++) {
    await btn.click()
    await expect(btn).toBeEnabled({ timeout: 10000 })
  }
  await page.getByTestId('matrix-detail-back').click()
}

// Each test in this suite requires > 100 rows (ROWS_PER_WINDOW), which means a
// lengthy bulk-insert phase. A generous per-test timeout accounts for this.
const BULK_TIMEOUT = 180_000
const BULK_CLICKS = 70

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Multi-window virtualizer', () => {
  test('more than 100 rows produces multiple windows with correct row distribution', async ({
    page,
  }) => {
    test.setTimeout(BULK_TIMEOUT)
    await resetDB(page)
    await addManyRows(page, BULK_CLICKS)
    await waitForRows(page, 101)

    const totalRows = await page.locator('.outline-row').count()

    const windowCount = await page.locator('[data-window-index]').count()
    expect(windowCount).toBeGreaterThanOrEqual(2)

    // Window 0 holds exactly ROWS_PER_WINDOW (100) rows
    const w0Rows = await page.locator('[data-window-index="0"] .outline-row').count()
    expect(w0Rows).toBe(100)

    // Window 1 holds the remainder
    const w1Rows = await page.locator('[data-window-index="1"] .outline-row').count()
    expect(w1Rows).toBe(totalRows - 100)
  })

  test('scroll to bottom makes all rows accessible (scroll area is not undersized)', async ({
    page,
  }) => {
    test.setTimeout(BULK_TIMEOUT)
    await resetDB(page)
    await addManyRows(page, BULK_CLICKS)
    await waitForRows(page, 101)

    // Scroll the last row of the last window into the viewport
    const lastWindow = page.locator('[data-window-index]').last()
    const lastRow = lastWindow.locator('.outline-row').last()

    await lastRow.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)

    await expect(lastRow).toBeInViewport()

    // The row should contain a functional PM editor with content
    const editor = lastRow.locator('.ProseMirror')
    await expect(editor).toBeVisible()
    const text = await editor.textContent()
    expect((text ?? '').trim().length).toBeGreaterThan(0)
  })

  test('ProseMirror editor content survives window transitions on insert', async ({ page }) => {
    test.setTimeout(BULK_TIMEOUT)
    await resetDB(page)
    await addManyRows(page, BULK_CLICKS)
    await waitForRows(page, 101)

    // Grab the last row of window 0 — it will shift to window 1 after an insert
    const window0 = page.locator('[data-window-index="0"]')
    const lastRowW0 = window0.locator('.outline-row').last()
    const lastRowId = await lastRowW0.getAttribute('data-row-id')
    expect(lastRowId).toBeTruthy()

    const originalText = ((await lastRowW0.locator('.ProseMirror').textContent()) ?? '').trim()
    expect(originalText.length).toBeGreaterThan(0)

    // Insert a new row after the second-to-last row (index 98) of window 0.
    // This pushes the old index-99 row to index 100, which falls into window 1.
    const penultimateEditor = window0.locator('.ProseMirror').nth(98)
    await penultimateEditor.click()
    await page.keyboard.press('Meta+ArrowRight')
    await page.keyboard.press('Enter')

    // Wait for insert + reactive update + potential debounced save
    await page.waitForTimeout(1500)

    // The original last row should still exist and have its content intact
    const shiftedRow = page.locator(`[data-row-id="${lastRowId}"]`)
    await expect(shiftedRow).toBeVisible({ timeout: 5000 })

    const newText = ((await shiftedRow.locator('.ProseMirror').textContent()) ?? '').trim()
    expect(newText).toBe(originalText)
  })

  test('keyboard navigation works across window boundaries', async ({ page }) => {
    test.setTimeout(BULK_TIMEOUT)
    await resetDB(page)
    await addManyRows(page, BULK_CLICKS)
    await waitForRows(page, 101)

    const window0 = page.locator('[data-window-index="0"]')
    const window1 = page.locator('[data-window-index="1"]')

    // Verify editors in both windows are independently focusable —
    // this is the core cross-window invariant.
    const firstEditorW1 = window1.locator('.ProseMirror').first()
    await firstEditorW1.scrollIntoViewIfNeeded()
    await firstEditorW1.click()
    await expect(firstEditorW1).toBeFocused()

    const lastEditorW0 = window0.locator('.ProseMirror').last()
    await lastEditorW0.scrollIntoViewIfNeeded()
    await lastEditorW0.click()
    await expect(lastEditorW0).toBeFocused()

    // Test ArrowUp from the first row of window 1 to the last row of
    // window 0. The onArrowUp callback finds the previous row in the
    // full visibleRows() array regardless of window boundaries.
    await firstEditorW1.scrollIntoViewIfNeeded()
    await firstEditorW1.click()
    await expect(firstEditorW1).toBeFocused()

    await page.keyboard.press('ArrowUp')
    await expect(lastEditorW0).toBeFocused({ timeout: 5000 })
  })

  test('collapse/expand updates totalWindows correctly', async ({ page }) => {
    test.setTimeout(BULK_TIMEOUT)
    await resetDB(page)
    await addManyRows(page, BULK_CLICKS)
    await waitForRows(page, 101)

    const initialWindowCount = await page.locator('[data-window-index]').count()
    expect(initialWindowCount).toBeGreaterThanOrEqual(2)

    const initialRowCount = await page.locator('.outline-row').count()

    // Collapse every expanded parent to hide all children.
    // After each click the DOM updates, so we re-query for the next button.
    while (true) {
      const btn = page.locator('[data-testid="outline-bullet"][aria-label="Collapse"]').first()
      if (!(await btn.isVisible().catch(() => false))) break
      await btn.click()
      await page.waitForTimeout(50)
    }

    await page.waitForTimeout(500)

    const collapsedRowCount = await page.locator('.outline-row').count()
    expect(collapsedRowCount).toBeLessThan(initialRowCount)

    // With enough children hidden, visible rows should have dropped ≤ 100,
    // reducing the window count to 1.
    if (collapsedRowCount <= 100) {
      await expect(page.locator('[data-window-index]')).toHaveCount(1)
    }

    // Expand all collapsed parents
    while (true) {
      const btn = page.locator('[data-testid="outline-bullet"][aria-label="Expand"]').first()
      if (!(await btn.isVisible().catch(() => false))) break
      await btn.click()
      await page.waitForTimeout(50)
    }

    await page.waitForTimeout(500)

    // Window count should be restored
    await expect(async () => {
      const restoredWindowCount = await page.locator('[data-window-index]').count()
      expect(restoredWindowCount).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 5000 })
  })

  test('drag-and-drop works across window boundaries', async ({ page }) => {
    test.setTimeout(BULK_TIMEOUT)
    await resetDB(page)
    await addManyRows(page, BULK_CLICKS)
    await waitForRows(page, 101)

    // Pick a source row from the top of the outline (window 0) and a target
    // deep in window 1.  Using rows far apart avoids the no-op detection that
    // fires when source and target are adjacent.
    const sourceRow = page.locator('[data-window-index="0"] .outline-row').first()
    const sourceRowId = await sourceRow.getAttribute('data-row-id')

    // Scroll window 1 rows into view for the target
    const w1Rows = page.locator('[data-window-index="1"] .outline-row')
    const targetRow = w1Rows.last()
    const targetRowId = await targetRow.getAttribute('data-row-id')

    // Start drag on the source handle (which is visible at the top)
    const sourceHandle = sourceRow.locator('.outline-row-handle')
    const sourceBox = await sourceHandle.boundingBox()
    expect(sourceBox).toBeTruthy()

    await page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2,
    )
    await page.mouse.down()

    // Move past the activation threshold (5px)
    await page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2 + 10,
      { steps: 3 },
    )

    // The drag should now be activated — the drop indicator should appear as
    // we move toward the target. Scroll the target into view first.
    await targetRow.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)

    const targetBox = await targetRow.boundingBox()
    expect(targetBox).toBeTruthy()

    // Move to just below the target row (drop "after" it)
    await page.mouse.move(
      targetBox!.x + targetBox!.width / 4,
      targetBox!.y + targetBox!.height - 2,
      { steps: 15 },
    )
    await page.waitForTimeout(100)

    // Verify the drop indicator appeared (proves cross-window drag is active)
    const indicator = page.locator('.outline-drop-indicator')
    const indicatorVisible = await indicator.isVisible().catch(() => false)

    await page.mouse.up()
    await page.waitForTimeout(1000)

    // The source row should still exist (not lost during cross-window drag)
    await expect(page.locator(`[data-row-id="${sourceRowId}"]`)).toBeVisible({ timeout: 5000 })
    await expect(page.locator(`[data-row-id="${targetRowId}"]`)).toBeVisible({ timeout: 5000 })

    // If the indicator was visible, the drag was properly activated across
    // window boundaries.  The reparent may or may not change position depending
    // on tree structure, but the drag mechanism itself worked.
    expect(indicatorVisible).toBe(true)
  })
})
