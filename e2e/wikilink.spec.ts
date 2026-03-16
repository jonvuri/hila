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

const createNote = async (page: Page, title: string) => {
  await page.locator('.note-list-add').click()
  await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })
  const titleInput = page.locator('.note-title-input')
  await titleInput.fill(title)
  await page.waitForTimeout(500)
}

const goBackToList = async (page: Page) => {
  await page.locator('.note-face-back').click()
  await expect(page.locator('.note-list-items')).toBeVisible({ timeout: 5000 })
}

test.describe('Wiki-links', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForOutline(page)
    await switchToNotes(page)
  })

  test('typing [[ in the body shows the autocomplete dropdown', async ({ page }) => {
    // Open the Welcome note
    await page.locator('.note-list-item').first().click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    const editor = page.locator('.note-body-editor .ProseMirror')
    await editor.click()

    // Move to end
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    // Type [[ to trigger autocomplete
    await page.keyboard.type('[[')

    // The autocomplete dropdown should appear
    await expect(page.locator('.wikilink-autocomplete')).toBeVisible({ timeout: 5000 })
  })

  test('type a note title in autocomplete, select it, verify wikilink node inserted', async ({
    page,
  }) => {
    // Create a second note to link to
    await createNote(page, 'Target Note')
    await goBackToList(page)

    // Open the Welcome note
    await page.locator('.note-list-item-title', { hasText: 'Welcome' }).click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    const editor = page.locator('.note-body-editor .ProseMirror')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    // Type [[ to trigger autocomplete, then type the target note name
    await page.keyboard.type('[[')
    await expect(page.locator('.wikilink-autocomplete')).toBeVisible({ timeout: 5000 })

    await page.keyboard.type('Target')
    await page.waitForTimeout(500) // wait for query to update

    // The autocomplete should show "Target Note" as an option
    await expect(
      page.locator('.wikilink-autocomplete-item', { hasText: 'Target Note' }),
    ).toBeVisible({ timeout: 5000 })

    // Press Enter to select the first option
    await page.keyboard.press('Enter')

    // The wikilink node should be inserted in the editor
    await expect(editor.locator('.wikilink')).toBeVisible({ timeout: 5000 })
    await expect(editor.locator('.wikilink')).toContainText('Target Note')

    // Autocomplete should be closed
    await expect(page.locator('.wikilink-autocomplete')).not.toBeVisible()
  })

  test('click a wikilink to navigate to the target note', async ({ page }) => {
    // Create a second note
    await createNote(page, 'Linked Note')
    await goBackToList(page)

    // Open the Welcome note and add a wikilink
    await page.locator('.note-list-item-title', { hasText: 'Welcome' }).click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    const editor = page.locator('.note-body-editor .ProseMirror')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    await page.keyboard.type('[[')
    await expect(page.locator('.wikilink-autocomplete')).toBeVisible({ timeout: 5000 })

    await page.keyboard.type('Linked')
    await page.waitForTimeout(500)

    await expect(
      page.locator('.wikilink-autocomplete-item', { hasText: 'Linked Note' }),
    ).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Enter')

    await expect(editor.locator('.wikilink')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(500) // wait for save

    // Click the wikilink to navigate
    await editor.locator('.wikilink').click()

    // Should navigate to the target note — title should show "Linked Note"
    await expect(page.locator('.note-title-input')).toHaveValue('Linked Note', { timeout: 5000 })
  })

  test('backlinks panel on target note shows the source note', async ({ page }) => {
    // Create a second note
    await createNote(page, 'Source Note')
    await goBackToList(page)

    // Open Source Note and add a wikilink to Welcome
    await page.locator('.note-list-item-title', { hasText: 'Source Note' }).click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    const editor = page.locator('.note-body-editor .ProseMirror')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    await page.keyboard.type('[[')
    await expect(page.locator('.wikilink-autocomplete')).toBeVisible({ timeout: 5000 })

    await page.keyboard.type('Welcome')
    await page.waitForTimeout(500)

    await expect(
      page.locator('.wikilink-autocomplete-item:not(.wikilink-autocomplete-create)', {
        hasText: 'Welcome',
      }),
    ).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Enter')

    await expect(editor.locator('.wikilink')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(500) // wait for save and wikilink sync

    // Navigate to the Welcome note to check backlinks
    await goBackToList(page)
    await page.locator('.note-list-item-title', { hasText: 'Welcome' }).click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    // The backlinks panel should show "Source Note"
    await expect(page.locator('.note-backlinks')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.note-backlinks-item', { hasText: 'Source Note' })).toBeVisible({
      timeout: 5000,
    })
  })
})
