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
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
  const count = await page.locator('.outline-row').count()
  expect(count).toBeGreaterThanOrEqual(minCount)
  return count
}

const getEditorTexts = async (page: Page): Promise<string[]> => {
  const editors = page.locator('.ProseMirror')
  const count = await editors.count()
  const texts: string[] = []
  for (let i = 0; i < count; i++) {
    texts.push(((await editors.nth(i).textContent()) ?? '').trim())
  }
  return texts
}

/** Move cursor to the very start of a ProseMirror editor via DOM Selection API.
 *  Keyboard-based approaches (Home, Cmd+Left) are unreliable across platforms
 *  in contenteditable, so we set the DOM selection directly and let PM sync. */
const moveCursorToStart = async (page: Page, editorLocator: ReturnType<Page['locator']>) => {
  await editorLocator.evaluate((el: HTMLElement) => {
    const p = el.querySelector('p, h1, h2, h3, h4, h5, h6')
    if (!p) return
    const target = p.firstChild ?? p
    const range = document.createRange()
    range.setStart(target, 0)
    range.collapse(true)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
  })
  // Give ProseMirror a tick to sync the DOM selection
  await page.waitForTimeout(50)
}

// Set up a controlled outline: two root-level rows with known text.
const setupTwoRows = async (page: Page): Promise<number> => {
  await resetDB(page)
  await waitForRows(page, 1)

  // Overwrite the welcome row with "Alpha"
  const firstEditor = page.locator('.ProseMirror').first()
  await firstEditor.click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('Alpha')

  // Create a new row after the first by pressing Enter at end
  await page.keyboard.press('Meta+ArrowRight')
  await page.keyboard.press('Enter')

  // Wait for the new row to appear
  await page.waitForTimeout(500)

  // Type "Beta" in the new row (which should be focused after Enter)
  await page.keyboard.type('Beta')

  // Wait for debounced saves
  await page.waitForTimeout(500)

  return page.locator('.outline-row').count()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Backspace at start of row', () => {
  test('backspace on first row at doc start is a no-op', async ({ page }) => {
    await resetDB(page)
    const initialCount = await waitForRows(page, 1)
    const initialTexts = await getEditorTexts(page)

    // Focus first editor, go to start, press Backspace
    const firstEditor = page.locator('.ProseMirror').first()
    await firstEditor.click()
    await moveCursorToStart(page, firstEditor)
    await page.keyboard.press('Backspace')

    await page.waitForTimeout(500)

    const afterCount = await page.locator('.outline-row').count()
    expect(afterCount).toBe(initialCount)

    const afterTexts = await getEditorTexts(page)
    expect(afterTexts).toEqual(initialTexts)
  })

  test('backspace deletes an empty row and focuses previous row', async ({ page }) => {
    await resetDB(page)
    const initialCount = await waitForRows(page, 1)

    // Focus first editor, go to end, press Enter to create empty row
    const firstEditor = page.locator('.ProseMirror').first()
    await firstEditor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Meta+ArrowRight')
    await page.keyboard.press('Enter')

    await page.waitForTimeout(500)
    const afterEnterCount = await page.locator('.outline-row').count()
    expect(afterEnterCount).toBe(initialCount + 1)

    // The new empty row should be focused. Press Backspace.
    await page.keyboard.press('Backspace')

    await page.waitForTimeout(500)

    const afterBackspaceCount = await page.locator('.outline-row').count()
    expect(afterBackspaceCount).toBe(initialCount)

    await expect(firstEditor).toBeFocused()
  })

  test('backspace at start of non-empty row merges content into previous row', async ({
    page,
  }) => {
    const rowCount = await setupTwoRows(page)

    const editors = page.locator('.ProseMirror')
    const texts = await getEditorTexts(page)
    const secondIdx = texts.findIndex((t) => t.includes('Beta'))
    expect(secondIdx).toBeGreaterThan(0)

    const secondEditor = editors.nth(secondIdx)

    await secondEditor.click()
    await moveCursorToStart(page, secondEditor)
    await page.keyboard.press('Backspace')

    await page.waitForTimeout(800)

    // Row count should have decreased by 1
    const afterCount = await page.locator('.outline-row').count()
    expect(afterCount).toBe(rowCount - 1)

    // The first editor should now contain the combined text
    const mergedText = ((await editors.first().textContent()) ?? '').trim()
    expect(mergedText).toContain('Alpha')
    expect(mergedText).toContain('Beta')
  })

  test('backspace merge preserves cursor at the merge point', async ({ page }) => {
    const _rowCount = await setupTwoRows(page)

    const editors = page.locator('.ProseMirror')
    const texts = await getEditorTexts(page)
    const secondIdx = texts.findIndex((t) => t.includes('Beta'))
    expect(secondIdx).toBeGreaterThan(0)

    const secondEditor = editors.nth(secondIdx)
    await secondEditor.click()
    await moveCursorToStart(page, secondEditor)
    await page.keyboard.press('Backspace')

    await page.waitForTimeout(800)

    // After merge, typing should insert at the merge point between Alpha and Beta
    await page.keyboard.type('|')

    const mergedText = ((await editors.first().textContent()) ?? '').trim()
    expect(mergedText).toContain('Alpha|Beta')
  })

  test('backspace on empty row created by Enter round-trips correctly', async ({ page }) => {
    await resetDB(page)
    await waitForRows(page, 1)

    // Overwrite first editor
    const firstEditor = page.locator('.ProseMirror').first()
    await firstEditor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('TestRow')
    await page.keyboard.press('End')
    await page.keyboard.press('Meta+ArrowRight')

    // Create empty row with Enter
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    // Verify new row exists
    const midTexts = await getEditorTexts(page)
    const testRowIdx = midTexts.findIndex((t) => t.includes('TestRow'))
    expect(testRowIdx).toBeGreaterThanOrEqual(0)

    // Now Backspace should delete the empty row
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(500)

    const afterTexts = await getEditorTexts(page)
    expect(afterTexts.filter((t) => t.includes('TestRow'))).toHaveLength(1)
    await expect(firstEditor).toBeFocused()
  })
})
