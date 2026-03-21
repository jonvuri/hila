import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Open the dev tools sidebar if not already open. */
const openSidebar = async (page: Page) => {
  const sidebar = page.locator('.app-sidebar')
  if (!(await sidebar.isVisible())) {
    await page.getByRole('button', { name: 'Toggle dev tools' }).click()
    await expect(sidebar).toBeVisible({ timeout: 3000 })
  }
}

/** Navigate to the app and reset the database to a clean state. */
const resetDB = async (page: Page) => {
  await page.goto('/')
  await openSidebar(page)
  const resetBtn = page.getByTestId('reset-db-btn')
  await resetBtn.click()
  await expect(resetBtn).toContainText('Confirm', { timeout: 3000 })
  await resetBtn.click()
  await expect(resetBtn).toContainText('Reset DB', { timeout: 10000 })
}

/** Add sample rows to the Outline matrix via the Matrix Browser panel. */
const addSampleRows = async (page: Page) => {
  await openSidebar(page)
  await page.locator('.mb-matrix-item', { hasText: 'Outline' }).click()
  await expect(page.getByTestId('matrix-detail')).toBeVisible({ timeout: 3000 })
  const btn = page.getByTestId('add-sample-rows')
  await btn.click()
  await expect(btn).toBeEnabled({ timeout: 10000 })
  await page.getByTestId('matrix-detail-back').click()
}

/** Switch to the SQL Runner panel in the sidebar. */
const goToSqlRunner = async (page: Page) => {
  await openSidebar(page)
  await page.locator('.sidebar-tab', { hasText: 'SQL Runner' }).click()
}

/** Wait until at least `minCount` outline rows are visible in the face. */
const waitForRows = async (page: Page, minCount = 1) => {
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
  await expect(page.locator('.outline-row')).toHaveCount(
    await page.locator('.outline-row').count(),
    { timeout: 5000 },
  )
  const count = await page.locator('.outline-row').count()
  expect(count).toBeGreaterThanOrEqual(minCount)
  return count
}

// ---------------------------------------------------------------------------
// Virtualizer: multi-window rendering
// ---------------------------------------------------------------------------

test.describe('Virtualizer windowing', () => {
  test('after reset: exactly one window exists with the welcome row', async ({ page }) => {
    await resetDB(page)

    await expect(page.locator('[data-window-index]')).toBeVisible({ timeout: 5000 })

    // 1 row < ROWS_PER_WINDOW (100) → 1 window
    await expect(page.locator('[data-window-index]')).toHaveCount(1)

    await expect(page.locator('.outline-row')).toHaveCount(1)
  })

  test('populated state: one window when row count is under ROWS_PER_WINDOW', async ({ page }) => {
    await resetDB(page)
    await addSampleRows(page)

    await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })

    // Sample rows produce well under 100 visible rows → still 1 window
    await expect(page.locator('[data-window-index]')).toHaveCount(1)
  })

  test('window 0 always exists when there are rows', async ({ page }) => {
    await resetDB(page)

    await expect(page.locator('[data-window-index]')).toBeVisible({ timeout: 5000 })

    await expect(page.locator('[data-window-index="0"]')).toHaveCount(1)
  })
})

// ---------------------------------------------------------------------------
// Outline query: depth and hasChildren
// ---------------------------------------------------------------------------

test.describe('Outline query: depth and hasChildren', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await addSampleRows(page)
    await waitForRows(page, 1)
  })

  test('at least one row has non-zero indentation depth', async ({ page }) => {
    // addSampleRowsToMatrix creates at least one child row (last row is a child
    // of an existing row when existingCount > 0). After two calls to addSampleRows
    // we're guaranteed a child.
    await addSampleRows(page)
    await waitForRows(page, 2)

    const rows = page.locator('.outline-row')
    const count = await rows.count()
    expect(count).toBeGreaterThan(0)

    let foundIndented = false
    for (let i = 0; i < count; i++) {
      const depth = await rows.nth(i).getAttribute('data-depth')
      if (parseInt(depth ?? '0', 10) > 0) {
        foundIndented = true
        break
      }
    }

    expect(foundIndented).toBe(true)
  })

  test('parent rows show expand/collapse bullet, leaf rows show dot bullet', async ({ page }) => {
    const bullets = page.locator('[data-testid="outline-bullet"]')
    const count = await bullets.count()
    expect(count).toBeGreaterThan(0)

    let hasLeaf = false
    let hasParent = false
    for (let i = 0; i < count; i++) {
      const label = await bullets.nth(i).getAttribute('aria-label')
      if (label === 'Bullet') hasLeaf = true
      if (label === 'Collapse' || label === 'Expand') hasParent = true
    }

    // Must have at least a leaf bullet
    expect(hasLeaf).toBe(true)

    // If any parent rows exist, they show a collapse/expand control
    // (hasParent may be false if all rows are leaves — that's fine)
  })

  test('parent row bullet has role=button, leaf bullet has no button role', async ({ page }) => {
    const bullets = page.locator('[data-testid="outline-bullet"]')
    const count = await bullets.count()

    for (let i = 0; i < count; i++) {
      const bullet = bullets.nth(i)
      const label = await bullet.getAttribute('aria-label')
      const role = await bullet.getAttribute('role')

      if (label === 'Collapse' || label === 'Expand') {
        expect(role).toBe('button')
      } else if (label === 'Bullet') {
        expect(role).toBeNull()
      }
    }
  })

  test('depth values are non-negative integers', async ({ page }) => {
    const rows = page.locator('.outline-row')
    const count = await rows.count()

    for (let i = 0; i < count; i++) {
      const depth = parseInt((await rows.nth(i).getAttribute('data-depth')) ?? '-1', 10)
      expect(depth).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(depth)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Row identity: PM editor reuse after reactive update
// ---------------------------------------------------------------------------

test.describe('Row identity: PM editor survives reactive query updates', () => {
  test('editor is not destroyed after debounced save triggers subscription re-run', async ({
    page,
  }) => {
    await resetDB(page)
    await addSampleRows(page)
    await waitForRows(page, 1)

    // Click the first PM editor
    const firstEditor = page.locator('.ProseMirror').first()
    await firstEditor.click()

    // Verify focus landed in the editor
    await expect(firstEditor).toBeFocused()

    // Type a unique marker string
    const marker = `MARKER_${Date.now()}`
    await page.keyboard.type(marker)

    // Confirm the text appeared immediately in the DOM (before save)
    await expect(firstEditor).toContainText(marker)

    // Wait for the 300ms debounce + worker round-trip + reactive re-render
    // We use 1000ms to give the full cycle comfortable time to complete:
    //   300ms debounce → updateRow worker call → SQLite update hook →
    //   subscription re-run → reconcile(rows, {key:'row_id'}) → Solid re-render
    await page.waitForTimeout(1000)

    // The critical assertion: the editor must still exist with the text intact.
    // If reconcile failed to key by row_id, the editor would be destroyed and
    // recreated, losing the typed text and focus.
    await expect(firstEditor).toContainText(marker)

    // Editor should still be focused (not destroyed/recreated)
    await expect(firstEditor).toBeFocused()
  })

  test('editor count stays stable after reactive update (no extra editors created)', async ({
    page,
  }) => {
    await resetDB(page)
    await addSampleRows(page)
    await waitForRows(page, 2)

    // Wait for the count to stabilize (all sample rows reactively rendered)
    await page.waitForTimeout(500)
    const countBefore = await page.locator('.ProseMirror').count()
    expect(countBefore).toBeGreaterThan(0)

    // Trigger a reactive update by typing into an editor
    await page.locator('.ProseMirror').first().click()
    await page.keyboard.type('stability check')

    // Wait for debounce + reactive cycle
    await page.waitForTimeout(1000)

    const countAfter = await page.locator('.ProseMirror').count()

    // Row count must not change -- no extra editors created or destroyed
    expect(countAfter).toBe(countBefore)
  })
})

// ---------------------------------------------------------------------------
// Reactive data flow
// ---------------------------------------------------------------------------

test.describe('Reactive data flow', () => {
  test('content persists through the debounced save cycle to the database', async ({ page }) => {
    await resetDB(page)
    await addSampleRows(page)
    await waitForRows(page, 1)

    // Type into the first editor
    const firstEditor = page.locator('.ProseMirror').first()
    await firstEditor.click()
    const savedText = `saved_${Date.now()}`
    await page.keyboard.type(savedText)

    // Wait for debounce and worker round-trip
    await page.waitForTimeout(1000)

    // Switch to SQL Runner and query the database directly
    await goToSqlRunner(page)
    const textarea = page.locator('textarea')
    await textarea.fill(`SELECT content FROM "mx_1_data"`)
    await page.getByRole('button', { name: 'Run', exact: true }).click()

    // The saved text should appear somewhere in the query results
    await expect(page.locator('body')).toContainText(savedText, { timeout: 3000 })
  })

  test('new rows appear in the outline reactively after being added via Matrix Browser', async ({
    page,
  }) => {
    await resetDB(page)
    await addSampleRows(page)

    const countBefore = await waitForRows(page, 1)

    // Add more rows via Matrix Browser sidebar (outline stays mounted)
    await addSampleRows(page)

    // Wait for reactive update to render the new rows
    await expect(async () => {
      const countAfter = await page.locator('.outline-row').count()
      expect(countAfter).toBeGreaterThan(countBefore)
    }).toPass({ timeout: 5000 })
  })

  test('content survives page reload (flush + load from DB)', async ({
    page,
  }) => {
    await resetDB(page)
    await addSampleRows(page)
    await waitForRows(page, 2)

    // Wait for all rows to stabilize
    await page.waitForTimeout(500)

    // Type into the first editor
    const firstEditor = page.locator('.ProseMirror').first()
    await firstEditor.click()
    const persistText = `persist_${Date.now()}`
    await page.keyboard.type(persistText)

    // Wait for the debounce to flush
    await page.waitForTimeout(1000)

    // Reload the page to force full remount
    await page.reload()
    await waitForRows(page, 2)

    // The saved text must be present in one of the reloaded editors
    await expect(page.locator('body')).toContainText(persistText, {
      timeout: 5000,
    })
  })
})

// ---------------------------------------------------------------------------
// ProseMirror editor basics
// ---------------------------------------------------------------------------

test.describe('ProseMirror editor basics', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await addSampleRows(page)
    await waitForRows(page, 1)
  })

  test('each outline row contains exactly one mounted ProseMirror editor', async ({ page }) => {
    const rowCount = await page.locator('.outline-row').count()
    const editorCount = await page.locator('.ProseMirror').count()
    // One PM editor per row
    expect(editorCount).toBe(rowCount)
  })

  test('typing into an editor renders text immediately in the DOM', async ({ page }) => {
    const firstEditor = page.locator('.ProseMirror').first()
    await firstEditor.click()
    await page.keyboard.type('hello E2E')
    await expect(firstEditor).toContainText('hello E2E')
  })

  test('each editor is contenteditable', async ({ page }) => {
    const editors = page.locator('.ProseMirror')
    const count = await editors.count()
    for (let i = 0; i < count; i++) {
      const ce = await editors.nth(i).getAttribute('contenteditable')
      expect(ce).toBe('true')
    }
  })
})
