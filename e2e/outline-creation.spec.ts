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
  await page.locator('.sidebar-tab', { hasText: 'Matrix Debug' }).click()
  await page.getByRole('button', { name: 'Reset Database' }).click()
  await expect(page.getByRole('button', { name: 'Reset Database' })).toBeEnabled()
}

const goToSqlRunner = async (page: Page) => {
  await openSidebar(page)
  await page.locator('.sidebar-tab', { hasText: 'SQL Runner' }).click()
}

const waitForRows = async (page: Page, minCount = 1) => {
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
  const count = await page.locator('.outline-row').count()
  expect(count).toBeGreaterThanOrEqual(minCount)
  return count
}

/** Place cursor at a character offset within a ProseMirror editor's first text node. */
const moveCursorToOffset = async (
  page: Page,
  editorLocator: ReturnType<Page['locator']>,
  charOffset: number,
) => {
  await editorLocator.evaluate(
    (el: HTMLElement, offset: number) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      const textNode = walker.nextNode()
      if (!textNode) return
      const clampedOffset = Math.min(offset, textNode.textContent?.length ?? 0)
      const range = document.createRange()
      range.setStart(textNode, clampedOffset)
      range.collapse(true)
      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)
    },
    charOffset,
  )
  await page.waitForTimeout(50)
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Row creation', () => {
  test.beforeEach(async ({ page }) => {
    // After reset, there is exactly 1 welcome row
    await resetDB(page)
    await waitForRows(page, 1)
  })

  test('Enter at end of row creates a new row below', async ({ page }) => {
    const initialCount = await page.locator('.outline-row').count()

    const firstEditor = page.locator('.ProseMirror').first()
    await firstEditor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('TestRow')

    // Move to absolute end of editor content
    await page.keyboard.press('Meta+ArrowRight')
    await page.keyboard.press('Enter')

    await page.waitForTimeout(500)

    const afterCount = await page.locator('.outline-row').count()
    expect(afterCount).toBe(initialCount + 1)
  })

  test('typing in new row renders text and persists after save cycle', async ({ page }) => {
    const firstEditor = page.locator('.ProseMirror').first()
    await firstEditor.click()
    await page.keyboard.press('Meta+ArrowRight')
    await page.keyboard.press('Enter')

    await page.waitForTimeout(500)

    const marker = `NEW_ROW_${Date.now()}`
    await page.keyboard.type(marker)

    // Wait for debounced save
    await page.waitForTimeout(1000)

    await expect(page.locator('body')).toContainText(marker)

    // Verify it persisted to the database
    await goToSqlRunner(page)
    const textarea = page.locator('textarea')
    await textarea.fill(`SELECT content FROM "mx_1_data"`)
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.locator('body')).toContainText(marker, { timeout: 3000 })
  })

  test('new row gets focus after Enter', async ({ page }) => {
    const initialCount = await page.locator('.outline-row').count()

    const firstEditor = page.locator('.ProseMirror').first()
    await firstEditor.click()
    await page.keyboard.press('Meta+ArrowRight')
    await page.keyboard.press('Enter')

    await page.waitForTimeout(500)

    const editors = page.locator('.ProseMirror')
    const newCount = await editors.count()
    expect(newCount).toBe(initialCount + 1)

    // The focused element should be a ProseMirror editor (not the first one)
    const focusedEditor = page.locator('.ProseMirror:focus')
    await expect(focusedEditor).toBeVisible()
  })
})

test.describe('Content splitting', () => {
  test('Enter in the middle of text splits content across two rows', async ({ page }) => {
    await resetDB(page)
    await waitForRows(page, 1)

    // Overwrite the welcome row with known text
    const firstEditor = page.locator('.ProseMirror').first()
    await firstEditor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('ABCDEF')

    await page.waitForTimeout(200)

    // Place cursor after "ABC" (offset 3)
    await moveCursorToOffset(page, firstEditor, 3)

    const countBefore = await page.locator('.outline-row').count()

    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)

    const countAfter = await page.locator('.outline-row').count()
    expect(countAfter).toBe(countBefore + 1)

    // First editor should contain "ABC"
    const firstText = ((await firstEditor.textContent()) ?? '').trim()
    expect(firstText).toBe('ABC')

    // The next editor should contain "DEF"
    const texts = await getEditorTexts(page)
    const abcIdx = texts.indexOf('ABC')
    expect(abcIdx).toBeGreaterThanOrEqual(0)
    expect(texts[abcIdx + 1]).toBe('DEF')
  })

  test('after split, cursor is at start of the new row', async ({ page }) => {
    await resetDB(page)
    await waitForRows(page, 1)

    const firstEditor = page.locator('.ProseMirror').first()
    await firstEditor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('SPLITME')

    await page.waitForTimeout(200)
    await moveCursorToOffset(page, firstEditor, 5) // after "SPLIT"

    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)

    // Typing should insert at the beginning of the new row
    await page.keyboard.type('|')
    await page.waitForTimeout(200)

    const texts = await getEditorTexts(page)
    expect(texts).toContain('SPLIT')
    expect(texts).toContain('|ME')
  })
})
