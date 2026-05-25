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

const goToWorkspace = async (page: Page) => {
  await page.getByTestId('workspace-tab').click()
}

const addSampleRowsToWorkspace = async (page: Page) => {
  await openSidebar(page)
  await page.locator('.mb-matrix-item', { hasText: 'Workspace' }).click()
  await expect(page.getByTestId('matrix-detail')).toBeVisible({ timeout: 3000 })
  const btn = page.getByTestId('add-sample-rows')
  await btn.click()
  await expect(btn).toBeEnabled({ timeout: 10000 })
  await page.getByTestId('matrix-detail-back').click()
}

const waitForRows = async (page: Page, minCount = 1) => {
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
  await expect(async () => {
    const count = await page.locator('.outline-row').count()
    expect(count).toBeGreaterThanOrEqual(minCount)
  }).toPass({ timeout: 5000 })
}

const getEditorTexts = async (page: Page): Promise<string[]> => {
  const editors = page.locator('.nav-label-editor .ProseMirror')
  const count = await editors.count()
  const texts: string[] = []
  for (let i = 0; i < count; i++) {
    texts.push(((await editors.nth(i).textContent()) ?? '').trim())
  }
  return texts
}

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Navigation panel', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await goToWorkspace(page)
    await waitForRows(page, 1)
  })

  test('renders rows with label text from workspace matrix', async ({ page }) => {
    const texts = await getEditorTexts(page)
    expect(texts.length).toBeGreaterThanOrEqual(1)
    expect(texts[0]).toContain('Welcome to Hila')
  })

  test('navigation panel has correct test ID', async ({ page }) => {
    await expect(page.getByTestId('navigation-panel')).toBeVisible()
  })

  test('Enter creates a new row', async ({ page }) => {
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()
    await firstEditor.press('End')
    const beforeCount = await page.locator('.outline-row').count()

    await firstEditor.press('Enter')

    await expect(async () => {
      const count = await page.locator('.outline-row').count()
      expect(count).toBe(beforeCount + 1)
    }).toPass({ timeout: 5000 })
  })

  test('Tab indents a row', async ({ page }) => {
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()
    await firstEditor.press('End')
    await firstEditor.press('Enter')

    await expect(async () => {
      const count = await page.locator('.outline-row').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 5000 })

    const secondRow = page.locator('.outline-row').nth(1)
    const depthBefore = await secondRow.getAttribute('data-depth')
    expect(depthBefore).toBe('0')

    await secondRow.locator('.nav-label-editor .ProseMirror').click()
    await page.keyboard.press('Tab')

    await expect(async () => {
      const depth = await page.locator('.outline-row').nth(1).getAttribute('data-depth')
      expect(depth).toBe('1')
    }).toPass({ timeout: 5000 })
  })

  test('Shift-Tab outdents a row', async ({ page }) => {
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()
    await firstEditor.press('End')
    await firstEditor.press('Enter')

    await expect(async () => {
      const count = await page.locator('.outline-row').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 5000 })

    const secondEditor = page.locator('.outline-row').nth(1).locator('.nav-label-editor .ProseMirror')
    await secondEditor.click()
    await page.keyboard.press('Tab')

    await expect(async () => {
      const depth = await page.locator('.outline-row').nth(1).getAttribute('data-depth')
      expect(depth).toBe('1')
    }).toPass({ timeout: 5000 })

    await page.keyboard.press('Shift+Tab')

    await expect(async () => {
      const depth = await page.locator('.outline-row').nth(1).getAttribute('data-depth')
      expect(depth).toBe('0')
    }).toPass({ timeout: 5000 })
  })

  test('Backspace at start merges/deletes empty row', async ({ page }) => {
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()
    await firstEditor.press('End')
    await firstEditor.press('Enter')

    await expect(async () => {
      const count = await page.locator('.outline-row').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 5000 })

    const countBefore = await page.locator('.outline-row').count()
    await page.keyboard.press('Backspace')

    await expect(async () => {
      const count = await page.locator('.outline-row').count()
      expect(count).toBe(countBefore - 1)
    }).toPass({ timeout: 5000 })
  })

  test('Arrow keys navigate between rows', async ({ page }) => {
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()
    await firstEditor.press('End')
    await firstEditor.press('Enter')

    await expect(async () => {
      const count = await page.locator('.outline-row').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 5000 })

    const secondEditor = page.locator('.outline-row').nth(1).locator('.nav-label-editor .ProseMirror')
    await secondEditor.click()
    await page.keyboard.type('Child row')

    await page.keyboard.press('ArrowUp')

    const firstPm = page.locator('.outline-row').nth(0).locator('.nav-label-editor .ProseMirror')
    await expect(firstPm).toBeFocused({ timeout: 3000 })
  })

  test('Collapse/expand works', async ({ page }) => {
    await addSampleRowsToWorkspace(page)
    await goToWorkspace(page)
    await waitForRows(page, 3)

    const collapseBtn = page.getByTestId('outline-bullet').first()
    const label = await collapseBtn.getAttribute('aria-label')
    if (label === 'Collapse') {
      const countBefore = await page.locator('.outline-row').count()
      await collapseBtn.click()

      await expect(async () => {
        const countAfter = await page.locator('.outline-row').count()
        expect(countAfter).toBeLessThan(countBefore)
      }).toPass({ timeout: 5000 })

      await collapseBtn.click()

      await expect(async () => {
        const countAfter = await page.locator('.outline-row').count()
        expect(countAfter).toBe(countBefore)
      }).toPass({ timeout: 5000 })
    }
  })

  test('Right-arrow button appears on hover', async ({ page }) => {
    const firstRow = page.locator('.outline-row').first()
    const focusBtn = firstRow.locator('.nav-row-open-focus')

    await expect(focusBtn).toBeAttached()

    await firstRow.hover()
    await expect(async () => {
      const opacity = await focusBtn.evaluate(
        (el) => window.getComputedStyle(el).opacity,
      )
      expect(Number(opacity)).toBeGreaterThan(0)
    }).toPass({ timeout: 3000 })
  })

  test('root-level navigation panel shows root breadcrumb tag', async ({ page }) => {
    await expect(page.getByTestId('breadcrumb-root')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('breadcrumb-root')).toHaveText('root')
  })

  test('Breadcrumbs display in subtree mode (focus view)', async ({ page }) => {
    await addSampleRowsToWorkspace(page)
    await goToWorkspace(page)
    await waitForRows(page, 3)

    const expandableBtn = page.locator('[data-testid="outline-bullet"][aria-label="Collapse"]').first()
    await expandableBtn.dblclick()

    await expect(page.getByTestId('breadcrumb-current')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('focus-title')).toBeVisible()
  })

  test('Focus panel shows row label in header', async ({ page }) => {
    const firstRow = page.locator('.outline-row').first()
    const focusBtn = firstRow.locator('.nav-row-open-focus')
    await firstRow.hover()
    await focusBtn.click()

    const focusLabel = page.getByTestId('focus-label-editor')
    await expect(focusLabel).toBeVisible({ timeout: 5000 })
    await expect(focusLabel).toContainText('Welcome to Hila')
  })

  test('content preview displays below label, clamped to 2 lines', async ({ page }) => {
    // The welcome row has content set by the seed. Verify the content
    // preview area is visible and uses CSS line clamping.
    const firstRow = page.locator('.outline-row').first()
    const preview = firstRow.getByTestId('content-preview')
    await expect(preview).toBeVisible({ timeout: 5000 })

    // Verify the text is non-empty (welcome content)
    const text = (await preview.textContent()) ?? ''
    expect(text.trim().length).toBeGreaterThan(0)

    // Verify CSS line-clamp is applied (display: -webkit-box, -webkit-line-clamp: 2)
    const lineClamp = await preview.evaluate(
      (el) => window.getComputedStyle(el).getPropertyValue('-webkit-line-clamp'),
    )
    expect(lineClamp).toBe('2')

    // Clicking the preview should expand it into a full content editor
    await preview.click()
    const contentEditor = firstRow.locator('.nav-content-editor')
    await expect(contentEditor).toBeVisible({ timeout: 3000 })
  })

  test('rows without content do not show content preview', async ({ page }) => {
    // Create a new row (it starts with null content)
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()
    await firstEditor.press('End')
    await firstEditor.press('Enter')

    await expect(async () => {
      const count = await page.locator('.outline-row').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 5000 })

    // The new row should not have a content preview
    const secondRow = page.locator('.outline-row').nth(1)
    const preview = secondRow.getByTestId('content-preview')
    await expect(preview).not.toBeVisible()
  })

  test('Drag-and-drop reorders rows', async ({ page }) => {
    // Create rows with explicit waits between each to avoid async focus races.
    // insertRow+requestFocus is async, so we must wait for each new row to appear
    // and explicitly focus it before typing.
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()
    await firstEditor.press('End')
    await firstEditor.press('Enter')

    const secondEditor = page.locator('.nav-label-editor .ProseMirror').nth(1)
    await expect(secondEditor).toBeVisible({ timeout: 5000 })
    await secondEditor.click()
    await page.keyboard.type('Second row')
    await expect(secondEditor).toContainText('Second row')

    await secondEditor.press('End')
    await secondEditor.press('Enter')

    const thirdEditor = page.locator('.nav-label-editor .ProseMirror').nth(2)
    await expect(thirdEditor).toBeVisible({ timeout: 5000 })
    await thirdEditor.click()
    await page.keyboard.type('Third row')
    await expect(thirdEditor).toContainText('Third row')

    const textsBefore = await getEditorTexts(page)
    const thirdHandle = page.locator('.outline-row').nth(2).locator('.outline-row-handle')
    const firstRow = page.locator('.outline-row').nth(0)

    // Use hover() for reliable positioning (performs actionability checks)
    await thirdHandle.hover()
    await page.mouse.down()

    const destBox = await firstRow.boundingBox()
    expect(destBox).toBeTruthy()
    await page.mouse.move(destBox!.x + destBox!.width / 2, destBox!.y - 5, { steps: 10 })
    await page.mouse.up()

    // Use retry assertion — reparentRow is async and the reactive update chain
    // (worker → SQLite → subscription → postMessage → reconcile → DOM) needs time
    await expect(async () => {
      const textsAfter = await getEditorTexts(page)
      expect(textsAfter).not.toEqual(textsBefore)
    }).toPass({ timeout: 5000 })
  })
})
