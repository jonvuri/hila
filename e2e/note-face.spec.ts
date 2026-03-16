import { test, expect, type Page } from '@playwright/test'

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

const waitForOutline = async (page: Page) => {
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
}

const switchToNotes = async (page: Page) => {
  await page.locator('.view-tab', { hasText: /^Notes$/ }).click()
  await expect(
    page.locator('.note-list-face, .note-list-empty, .note-list-items').first(),
  ).toBeVisible({ timeout: 5000 })
}

test.describe('Note face', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForOutline(page)
  })

  test('create a new note, verify it appears in the note list', async ({ page }) => {
    await switchToNotes(page)

    const itemsBefore = await page.locator('.note-list-item').count()

    await page.locator('.note-list-add').click()
    // Should navigate to note editor
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    // Go back to the list
    await page.locator('.note-face-back').click()
    await expect(page.locator('.note-list-items')).toBeVisible({ timeout: 5000 })

    await expect(async () => {
      const itemsAfter = await page.locator('.note-list-item').count()
      expect(itemsAfter).toBe(itemsBefore + 1)
    }).toPass({ timeout: 5000 })
  })

  test('click a note in the list, verify single-note face opens with title and body', async ({
    page,
  }) => {
    await switchToNotes(page)

    // Click the Welcome note
    await page.locator('.note-list-item').first().click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    // Title input should show "Welcome"
    const titleInput = page.locator('.note-title-input')
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toHaveValue('Welcome')

    // Body editor (ProseMirror) should be visible and contain text
    const bodyEditor = page.locator('.note-body-editor .ProseMirror')
    await expect(bodyEditor).toBeVisible()
    await expect(bodyEditor).toContainText('Welcome to Hila Notes')
  })

  test('edit the title, verify persistence after navigating away and back', async ({ page }) => {
    await switchToNotes(page)

    // Open the Welcome note
    await page.locator('.note-list-item').first().click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    // Edit the title
    const titleInput = page.locator('.note-title-input')
    await titleInput.fill('My Updated Note')
    await page.waitForTimeout(500) // wait for debounced save

    // Navigate back to list
    await page.locator('.note-face-back').click()
    await expect(page.locator('.note-list-items')).toBeVisible({ timeout: 5000 })

    // Verify the title in the list shows the update
    await expect(page.locator('.note-list-item-title').first()).toContainText('My Updated Note', {
      timeout: 5000,
    })

    // Re-open the note and verify the title persisted
    await page.locator('.note-list-item').first().click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.note-title-input')).toHaveValue('My Updated Note')
  })

  test('edit the body with rich text (bold, headings), verify persistence', async ({ page }) => {
    await switchToNotes(page)

    // Open the Welcome note
    await page.locator('.note-list-item').first().click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    const editor = page.locator('.note-body-editor .ProseMirror')
    await editor.click()

    // Select all and replace with new content
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('Normal text ')

    // Use markdown input rule for bold: **text**
    await page.keyboard.type('**bold words**')

    await page.waitForTimeout(500) // wait for debounced save

    // The input rule converts **bold words** to a <strong> element
    await expect(editor.locator('strong')).toContainText('bold words', { timeout: 5000 })

    // Add a heading via markdown input rule: # at start of a new paragraph
    await page.keyboard.press('Enter')
    await page.keyboard.type('# My Heading')
    // The heading input rule converts "# " at start of textblock to a heading
    await expect(editor.locator('h1, h2, h3')).toBeVisible({ timeout: 5000 })

    await page.waitForTimeout(500) // wait for debounced save

    // Navigate away and back to verify persistence
    await page.locator('.note-face-back').click()
    await expect(page.locator('.note-list-items')).toBeVisible({ timeout: 5000 })

    await page.locator('.note-list-item').first().click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    const editorAfter = page.locator('.note-body-editor .ProseMirror')
    await expect(editorAfter).toContainText('Normal text', { timeout: 5000 })
    await expect(editorAfter.locator('strong')).toContainText('bold words')
  })

  test('overflow columns appear in the property panel', async ({ page }) => {
    // Add a column to the notes matrix via the app's API
    await page.evaluate(async () => {
      // @ts-expect-error -- resolved by Vite dev server at runtime in browser
      const sqlClient = await import('/src/core/client/sql-client.ts')
      // @ts-expect-error -- resolved by Vite dev server at runtime in browser
      const matrixClient = await import('/src/core/client/matrix-client.ts')
      const result = await sqlClient.execQuery(
        "SELECT id FROM matrix WHERE title = 'Notes'",
      )
      const notesId = (result[0] as { id: number }).id
      await matrixClient.addColumn(notesId, 'tags', 'TEXT', 'text')
    })

    await switchToNotes(page)

    // Open the Welcome note
    await page.locator('.note-list-item').first().click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    // The property panel should show the "tags" overflow column
    await expect(page.locator('.note-property-panel')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.note-property-label', { hasText: 'tags' })).toBeVisible()
    await expect(page.locator('.note-property-input')).toBeVisible()
  })
})
