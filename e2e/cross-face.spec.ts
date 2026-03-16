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

const switchToNotesOutline = async (page: Page) => {
  await page.getByTestId('notes-outline-tab').click()
  await expect(page.locator('.outline-face')).toBeVisible({ timeout: 5000 })
}

test.describe('Cross-face data sharing', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForOutline(page)
  })

  test('notes outline tab provisions closure and shows notes as outline rows', async ({
    page,
  }) => {
    await switchToNotesOutline(page)

    // The welcome note should appear as an outline row
    await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })

    // The outline row content should contain the welcome note title "Welcome"
    const firstRow = page.locator('.outline-row').first()
    await expect(firstRow).toContainText('Welcome')
  })

  test('create a note in note list, verify it appears in notes outline', async ({ page }) => {
    // Create a new note in the note list
    await switchToNotes(page)
    await page.locator('.note-list-add').click()

    // Should navigate to the new note editor
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    // Set the title
    const titleInput = page.locator('.note-title-input')
    await titleInput.fill('Cross-Face Test')
    // Wait for debounced save
    await page.waitForTimeout(500)

    // Go back to list
    await page.locator('.note-face-back').click()
    await expect(page.locator('.note-list-items')).toBeVisible({ timeout: 3000 })

    // Now switch to notes outline
    await switchToNotesOutline(page)

    // The new note should appear as an outline row
    const rows = page.locator('.outline-row')
    await expect(rows).toHaveCount(2, { timeout: 5000 })

    // One row should contain the new note title
    await expect(page.locator('.outline-row', { hasText: 'Cross-Face Test' })).toBeVisible()
  })

  test('edit note title in note face, verify change in notes outline', async ({ page }) => {
    // Switch to notes and edit the welcome note's title
    await switchToNotes(page)
    await page.locator('.note-list-item').first().click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    const titleInput = page.locator('.note-title-input')
    await titleInput.fill('Updated Title')
    await page.waitForTimeout(500)

    // Go back to list, then switch to notes outline
    await page.locator('.note-face-back').click()
    await expect(page.locator('.note-list-items')).toBeVisible({ timeout: 3000 })

    await switchToNotesOutline(page)

    // The outline row should show the updated title
    await expect(page.locator('.outline-row').first()).toContainText('Updated Title', {
      timeout: 5000,
    })
  })

  test('edit note title in outline face, verify change in note face', async ({ page }) => {
    // First switch to notes outline
    await switchToNotesOutline(page)
    await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })

    // Click into the outline row editor and clear + type new text
    const editor = page.locator('.outline-row .outline-row-editor .ProseMirror').first()
    await editor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('Outline Edited')
    await page.waitForTimeout(500)

    // Switch to notes view
    await switchToNotes(page)

    // The note list should show the updated title
    await expect(page.locator('.note-list-item-title').first()).toContainText('Outline Edited', {
      timeout: 5000,
    })
  })

  test('indent a note in outline view to create hierarchy', async ({ page }) => {
    // Create a second note first
    await switchToNotes(page)
    await page.locator('.note-list-add').click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    const titleInput = page.locator('.note-title-input')
    await titleInput.fill('Child Note')
    await page.waitForTimeout(500)

    await page.locator('.note-face-back').click()
    await expect(page.locator('.note-list-items')).toBeVisible({ timeout: 3000 })

    // Switch to notes outline
    await switchToNotesOutline(page)
    await expect(page.locator('.outline-row')).toHaveCount(2, { timeout: 5000 })

    // Focus the second row and indent it (Tab)
    const secondEditor = page.locator('.outline-row .outline-row-editor .ProseMirror').nth(1)
    await secondEditor.click()
    await page.keyboard.press('Tab')

    // After indent, the first row should have a collapse indicator (has children)
    await expect(page.locator('.outline-row-bullet').first()).toContainText('▼', {
      timeout: 5000,
    })
  })

  test('trait auto-provisioning: closure is created for notes matrix', async ({ page }) => {
    // Before switching to notes outline, use SQL runner to verify only rank exists
    await openSidebar(page)
    await page.locator('.sidebar-tab', { hasText: 'SQL Runner' }).click()

    const sqlTextarea = page.locator('textarea')
    await sqlTextarea.fill(
      "SELECT trait_type FROM matrix_traits WHERE matrix_id = (SELECT id FROM matrix WHERE title = 'Notes') ORDER BY trait_type",
    )
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await page.waitForTimeout(500)

    // Before notes outline: only rank should exist
    const resultPre = page.locator('.sidebar-content pre').first()
    await expect(resultPre).toBeVisible({ timeout: 3000 })
    const textBefore = await resultPre.textContent()
    expect(textBefore).toContain('rank')
    expect(textBefore).not.toContain('closure')

    // Now switch to notes outline (triggers closure provisioning)
    await switchToNotesOutline(page)
    await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })

    // Check traits again via SQL runner
    await openSidebar(page)
    await page.locator('.sidebar-tab', { hasText: 'SQL Runner' }).click()
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await page.waitForTimeout(500)

    // After notes outline: both rank and closure should exist
    const resultAfter = page.locator('.sidebar-content pre').first()
    await expect(resultAfter).toContainText('closure', { timeout: 3000 })
    await expect(resultAfter).toContainText('rank')
  })
})
