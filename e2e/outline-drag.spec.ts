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

/** Build three root-level rows: "DragA", "DragB", "DragC" from the welcome row. */
const setupThreeRows = async (page: Page) => {
  await resetDB(page)
  await waitForRows(page, 1)

  const firstEditor = page.locator('.ProseMirror').first()
  await firstEditor.click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.type('DragA')

  await page.keyboard.press('Meta+ArrowRight')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  await page.keyboard.type('DragB')

  await page.keyboard.press('Meta+ArrowRight')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  await page.keyboard.type('DragC')

  await page.waitForTimeout(500)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Drag-and-drop reordering', () => {
  test('dragging a row to a new position changes the order', async ({ page }) => {
    await setupThreeRows(page)

    const textsBefore = await getEditorTexts(page)
    const aIdx = textsBefore.indexOf('DragA')
    const cIdx = textsBefore.indexOf('DragC')
    expect(aIdx).toBeGreaterThanOrEqual(0)
    expect(cIdx).toBeGreaterThan(aIdx)

    const handles = page.locator('.outline-row-handle')
    const rows = page.locator('.outline-row')

    const sourceHandle = handles.nth(cIdx)
    const targetRow = rows.nth(aIdx)

    const sourceBox = await sourceHandle.boundingBox()
    const targetBox = await targetRow.boundingBox()
    expect(sourceBox).toBeTruthy()
    expect(targetBox).toBeTruthy()

    // Drag DragC handle to above DragA
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2)
    await page.mouse.down()

    await page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2 - 10,
      { steps: 3 },
    )
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + 2, { steps: 10 })
    await page.waitForTimeout(100)

    await page.mouse.up()
    await page.waitForTimeout(800)

    const textsAfter = await getEditorTexts(page)
    const cAfter = textsAfter.indexOf('DragC')

    // DragC should have moved earlier in the order
    expect(cAfter).toBeLessThan(cIdx)
  })

  test('drag within threshold does not reorder (no-op for small movements)', async ({ page }) => {
    await setupThreeRows(page)

    const textsBefore = await getEditorTexts(page)

    const handles = page.locator('.outline-row-handle')
    const sourceHandle = handles.nth(0)
    const sourceBox = await sourceHandle.boundingBox()
    expect(sourceBox).toBeTruthy()

    // Move only 2px (below 5px threshold)
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2 + 2,
    )
    await page.mouse.up()
    await page.waitForTimeout(500)

    const textsAfter = await getEditorTexts(page)
    expect(textsAfter).toEqual(textsBefore)
  })
})
