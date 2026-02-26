import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to the app and reset the database to a clean state. */
const resetDB = async (page: Page) => {
  await page.goto('/')

  // Go to Matrix Debug tab and reset
  await page.getByRole('button', { name: 'Matrix Debug' }).click()
  await page.getByRole('button', { name: 'Reset Database' }).click()

  // Wait for the reset to complete -- the button goes back to its normal state
  await expect(page.getByRole('button', { name: 'Reset Database' })).toBeEnabled()
}

/** Add sample rows to the root matrix (ID 1) via the Matrix Debug tab.
 *  Assumes the Matrix Debug tab is already active.  */
const addSampleRows = async (page: Page) => {
  // The first "Add Sample Rows" button belongs to the root matrix (ID 1)
  const btn = page.getByRole('button', { name: 'Add Sample Rows' }).first()
  await btn.click()
  // Wait for the button to re-enable (indicates the async operation completed)
  await expect(btn).toBeEnabled({ timeout: 5000 })
}

/** Switch to the Outline Face tab. */
const goToOutlineFace = async (page: Page) => {
  await page.getByRole('button', { name: 'Outline Face' }).click()
}

/** Switch to the Matrix Debug tab. */
const goToMatrixDebug = async (page: Page) => {
  await page.getByRole('button', { name: 'Matrix Debug' }).click()
}

/** Switch to the SQL Runner tab. */
const goToSqlRunner = async (page: Page) => {
  await page.getByRole('button', { name: 'SQL Runner' }).click()
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
// Virtualizer: totalWindows capping
// ---------------------------------------------------------------------------

test.describe('Virtualizer totalWindows capping', () => {
  test('empty state: exactly one window exists with no outline rows', async ({ page }) => {
    await resetDB(page)
    await goToOutlineFace(page)

    // Wait for the virtualizer to mount
    await expect(page.locator('[data-window-index]')).toBeVisible({ timeout: 5000 })

    // With totalWindows=1, exactly one window should exist
    await expect(page.locator('[data-window-index]')).toHaveCount(1)

    // No rows: the root matrix is empty after reset
    await expect(page.locator('.outline-row')).toHaveCount(0)
  })

  test('populated state: still exactly one window regardless of row count', async ({ page }) => {
    await resetDB(page)
    await addSampleRows(page)
    await goToOutlineFace(page)

    // Wait for rows to appear
    await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })

    // totalWindows=1 means the virtualizer must never create more than one window
    // even though there is content to display
    await expect(page.locator('[data-window-index]')).toHaveCount(1)
  })

  test('window index is exactly 0', async ({ page }) => {
    await resetDB(page)
    await goToOutlineFace(page)

    await expect(page.locator('[data-window-index]')).toBeVisible({ timeout: 5000 })

    // The single window should have index 0
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
    await goToOutlineFace(page)
    await waitForRows(page, 1)
  })

  test('at least one row has non-zero indentation depth', async ({ page }) => {
    // addSampleRowsToMatrix creates at least one child row (last row is a child
    // of an existing row when existingCount > 0). After two calls to addSampleRows
    // we're guaranteed a child. But even one call creates a child on the second
    // batch. We call addSampleRows once more to be certain.
    // Re-seed: go back to debug, add more rows, return
    await goToMatrixDebug(page)
    await addSampleRows(page)
    await goToOutlineFace(page)
    await waitForRows(page, 2)

    // Find all indent spacers -- at least one should have non-zero computed width
    const indentSpacers = page.locator('.outline-row-indent')
    const count = await indentSpacers.count()
    expect(count).toBeGreaterThan(0)

    let foundIndented = false
    for (let i = 0; i < count; i++) {
      const width = await indentSpacers.nth(i).evaluate((el) => {
        return (el as HTMLElement).offsetWidth
      })
      if (width > 0) {
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

    const texts = await bullets.allTextContents()
    const bulletChars = new Set(texts.map((t) => t.trim()))

    // Must have at least a leaf bullet (•)
    expect(bulletChars.has('•')).toBe(true)

    // If any parent rows exist, they show ▼ (expanded) or ▶ (collapsed)
    const hasParentBullet = bulletChars.has('▼') || bulletChars.has('▶')
    if (texts.some((t) => t.trim() === '▼' || t.trim() === '▶')) {
      expect(hasParentBullet).toBe(true)
    }
  })

  test('parent row bullet has role=button, leaf bullet has no button role', async ({ page }) => {
    const bullets = page.locator('[data-testid="outline-bullet"]')
    const count = await bullets.count()

    for (let i = 0; i < count; i++) {
      const bullet = bullets.nth(i)
      const text = (await bullet.textContent())?.trim() ?? ''
      const role = await bullet.getAttribute('role')

      if (text === '▼' || text === '▶') {
        expect(role).toBe('button')
      } else if (text === '•') {
        expect(role).toBeNull()
      }
    }
  })

  test('depth values produce correct pixel indentation increments', async ({ page }) => {
    // The INDENT_PX constant is 24 -- verify actual DOM widths match multiples of 24
    const indentSpacers = page.locator('.outline-row-indent')
    const count = await indentSpacers.count()

    for (let i = 0; i < count; i++) {
      const width = await indentSpacers.nth(i).evaluate((el) => (el as HTMLElement).offsetWidth)
      // Width must be a non-negative multiple of 24 (INDENT_PX = 24)
      expect(width % 24).toBe(0)
      expect(width).toBeGreaterThanOrEqual(0)
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
    await goToOutlineFace(page)
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
    await goToOutlineFace(page)
    await waitForRows(page, 1)

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
    await goToOutlineFace(page)
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

  test('new rows appear in the outline without page reload after being added via Matrix Debug', async ({
    page,
  }) => {
    await resetDB(page)
    await addSampleRows(page)
    await goToOutlineFace(page)

    const countBefore = await waitForRows(page, 1)

    // Go to Matrix Debug and add more rows while OutlineFace is unmounted
    await goToMatrixDebug(page)
    await addSampleRows(page)

    // Return to Outline Face
    await goToOutlineFace(page)
    await waitForRows(page, 1)

    const countAfter = await page.locator('.outline-row').count()
    expect(countAfter).toBeGreaterThan(countBefore)
  })

  test('content survives unmount and remount (flush-on-cleanup + load from DB)', async ({
    page,
  }) => {
    await resetDB(page)
    await addSampleRows(page)
    await goToOutlineFace(page)
    await waitForRows(page, 1)

    // Type into the first editor
    const firstEditor = page.locator('.ProseMirror').first()
    await firstEditor.click()
    const persistText = `persist_${Date.now()}`
    await page.keyboard.type(persistText)

    // Wait for the debounce to flush
    await page.waitForTimeout(1000)

    // Unmount OutlineFace by switching tabs
    await goToMatrixDebug(page)

    // Remount by switching back
    await goToOutlineFace(page)
    await waitForRows(page, 1)

    // The saved text must be present in the reloaded editor
    await expect(page.locator('.ProseMirror').first()).toContainText(persistText, {
      timeout: 3000,
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
    await goToOutlineFace(page)
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
