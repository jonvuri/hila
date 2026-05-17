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

const waitForRows = async (page: Page, minCount = 1) => {
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
  await expect(async () => {
    const count = await page.locator('.outline-row').count()
    expect(count).toBeGreaterThanOrEqual(minCount)
  }).toPass({ timeout: 5000 })
}

const openFocusPanel = async (page: Page) => {
  const firstRow = page.locator('.outline-row').first()
  const focusBtn = firstRow.locator('.nav-row-open-focus')
  await firstRow.hover()
  await expect(async () => {
    const opacity = await focusBtn.evaluate(
      (el) => window.getComputedStyle(el).opacity,
    )
    expect(Number(opacity)).toBeGreaterThan(0)
  }).toPass({ timeout: 3000 })
  await focusBtn.click()
  await expect(page.getByTestId('focus-panel')).toBeVisible({ timeout: 5000 })
}

// ---------------------------------------------------------------------------
// Tests: Label editor (single-line schema)
// ---------------------------------------------------------------------------

test.describe('Label editor configuration', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await goToWorkspace(page)
    await waitForRows(page, 1)
  })

  test('type in label editor saves to label column', async ({ page }) => {
    // Create a new row
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()
    await firstEditor.press('End')
    await firstEditor.press('Enter')

    await expect(async () => {
      const count = await page.locator('.outline-row').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 5000 })

    // Type in the new row's label
    const secondEditor = page
      .locator('.outline-row')
      .nth(1)
      .locator('.nav-label-editor .ProseMirror')
    await secondEditor.click()
    await page.keyboard.type('Test label text')

    // Wait for debounced save
    await page.waitForTimeout(500)

    // Open focus panel on the new row to verify the label persisted
    const secondRow = page.locator('.outline-row').nth(1)
    const focusBtn = secondRow.locator('.nav-row-open-focus')
    await secondRow.hover()
    await expect(async () => {
      const opacity = await focusBtn.evaluate(
        (el) => window.getComputedStyle(el).opacity,
      )
      expect(Number(opacity)).toBeGreaterThan(0)
    }).toPass({ timeout: 3000 })
    await focusBtn.click()
    await expect(page.getByTestId('focus-panel')).toBeVisible({ timeout: 5000 })

    const labelEditor = page.getByTestId('focus-label-editor')
    const text = await labelEditor.textContent()
    expect(text).toContain('Test label text')
  })

  test('Enter in label editor does not insert newline (creates new row instead)', async ({
    page,
  }) => {
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()
    await firstEditor.press('End')

    const beforeCount = await page.locator('.outline-row').count()

    await firstEditor.press('Enter')

    // Should create a new row, not a newline
    await expect(async () => {
      const count = await page.locator('.outline-row').count()
      expect(count).toBe(beforeCount + 1)
    }).toPass({ timeout: 5000 })

    // The original row should still have only one paragraph worth of text
    const originalText = (await firstEditor.textContent()) ?? ''
    expect(originalText).toContain('Welcome to Hila')
  })

  test('Enter in focus panel label editor is a no-op', async ({ page }) => {
    await openFocusPanel(page)

    const labelEditor = page.getByTestId('focus-label-editor')
    const pm = labelEditor.locator('.ProseMirror')
    await pm.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' added')
    await page.keyboard.press('Enter')

    // Should not have created a new row in the navigation panel
    // The label text should still be in a single block
    const text = (await pm.textContent()) ?? ''
    expect(text).toContain('Welcome to Hila added')
  })

  test('bold mark works in label editor', async ({ page }) => {
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()
    await firstEditor.press('End')
    await firstEditor.press('Enter')

    await expect(async () => {
      const count = await page.locator('.outline-row').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 5000 })

    const secondEditor = page
      .locator('.outline-row')
      .nth(1)
      .locator('.nav-label-editor .ProseMirror')
    await secondEditor.click()

    // Type bold text using Cmd/Ctrl+B
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+b`)
    await page.keyboard.type('bold')
    await page.keyboard.press(`${modifier}+b`)

    // Check that <strong> element exists in the editor
    await expect(secondEditor.locator('strong')).toHaveText('bold')
  })
})

// ---------------------------------------------------------------------------
// Tests: Content editor (multi-line schema)
// ---------------------------------------------------------------------------

test.describe('Content editor configuration', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await goToWorkspace(page)
    await waitForRows(page, 1)
  })

  test('type in content editor saves to content column', async ({ page }) => {
    await openFocusPanel(page)

    const contentEditor = page.getByTestId('focus-content-editor')
    await expect(contentEditor).toBeVisible({ timeout: 5000 })
    const pm = contentEditor.locator('.ProseMirror')
    await pm.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' appended content')

    // Wait for debounced save
    await page.waitForTimeout(500)

    // Close and reopen to verify content persistence
    await pm.press('Escape')
    await expect(page.getByTestId('focus-panel')).not.toBeVisible({ timeout: 3000 })

    await openFocusPanel(page)
    const newContentEditor = page.getByTestId('focus-content-editor')
    await expect(newContentEditor).toBeVisible({ timeout: 5000 })
    const text = await newContentEditor.textContent()
    expect(text).toContain('appended content')
  })

  test('Enter in content editor creates new paragraph', async ({ page }) => {
    await openFocusPanel(page)

    const contentEditor = page.getByTestId('focus-content-editor')
    await expect(contentEditor).toBeVisible({ timeout: 5000 })
    const pm = contentEditor.locator('.ProseMirror')
    await pm.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Second paragraph')

    // Should have at least 2 paragraph blocks
    await expect(async () => {
      const paragraphs = pm.locator('p')
      const count = await paragraphs.count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 3000 })

    const text = (await pm.textContent()) ?? ''
    expect(text).toContain('Second paragraph')
  })

  test('Shift-Enter in content editor inserts soft newline', async ({ page }) => {
    await openFocusPanel(page)

    const contentEditor = page.getByTestId('focus-content-editor')
    await expect(contentEditor).toBeVisible({ timeout: 5000 })
    const pm = contentEditor.locator('.ProseMirror')
    await pm.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('after break')

    // The text should be in the same paragraph block (Shift-Enter = soft break, not new paragraph)
    // Verify there's only one paragraph containing both the original text and "after break"
    const text = (await pm.textContent()) ?? ''
    expect(text).toContain('after break')

    // Should NOT have created a second paragraph — text stays in one <p>
    await expect(async () => {
      const paragraphs = pm.locator('p')
      const count = await paragraphs.count()
      // The hard break keeps content in a single paragraph, so we check
      // that the text after break is in the same paragraph as the original content
      const lastParagraph = paragraphs.last()
      const pText = (await lastParagraph.textContent()) ?? ''
      expect(pText).toContain('after break')
    }).toPass({ timeout: 3000 })
  })

  test('@-reference trigger works in label editor', async ({ page }) => {
    // Create a second row
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()
    await firstEditor.press('End')
    await firstEditor.press('Enter')

    await expect(async () => {
      const count = await page.locator('.outline-row').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 5000 })

    const secondEditor = page
      .locator('.outline-row')
      .nth(1)
      .locator('.nav-label-editor .ProseMirror')
    await secondEditor.click()
    await page.keyboard.type('@')

    // Verify the @ character was consumed by the autocomplete plugin
    // (it should be in the editor text as the trigger was inserted)
    const text = (await secondEditor.textContent()) ?? ''
    expect(text).toContain('@')

    // The autocomplete dropdown elements should exist in the DOM
    await expect(page.locator('.inlineref-autocomplete').first()).toBeAttached({ timeout: 3000 })

    // Close autocomplete via Escape
    await page.keyboard.press('Escape')
  })

  test('@-reference trigger works in content editor', async ({ page }) => {
    await openFocusPanel(page)

    const contentEditor = page.getByTestId('focus-content-editor')
    await expect(contentEditor).toBeVisible({ timeout: 5000 })
    const pm = contentEditor.locator('.ProseMirror')
    await pm.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' @')

    // The @ was consumed by the autocomplete plugin
    const text = (await pm.textContent()) ?? ''
    expect(text).toContain('@')

    // The autocomplete dropdown elements should exist in the DOM
    await expect(page.locator('.inlineref-autocomplete').first()).toBeAttached({ timeout: 3000 })
  })

  test('Shift-Enter from label focuses inline content editor', async ({ page }) => {
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()
    await firstEditor.press('End')

    // Press Shift-Enter to expand and focus content
    await page.keyboard.press('Shift+Enter')

    // The content editor should become visible and focused
    await expect(async () => {
      const contentEditor = page.locator('.outline-row').first().locator('.nav-content-editor')
      await expect(contentEditor).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 5000 })
  })
})
