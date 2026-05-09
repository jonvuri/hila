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

test.describe('Face configuration UI', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForOutline(page)
  })

  test('opens the face config panel via "View as…" button', async ({ page }) => {
    await page.getByTestId('view-as-button').click()
    await expect(page.getByTestId('face-config-panel')).toBeVisible({ timeout: 3000 })
  })

  test('face type picker lists available face types', async ({ page }) => {
    await page.getByTestId('view-as-button').click()
    await expect(page.getByTestId('face-config-panel')).toBeVisible()

    const picker = page.getByTestId('face-type-picker')
    await expect(picker).toBeVisible()

    const options = picker.locator('option')
    const count = await options.count()
    // At least the placeholder + table + outline + note + note-list = 5
    expect(count).toBeGreaterThanOrEqual(5)
  })

  test('selecting a face type shows slot bindings', async ({ page }) => {
    await page.getByTestId('view-as-button').click()
    await expect(page.getByTestId('face-config-panel')).toBeVisible()

    const picker = page.getByTestId('face-type-picker')
    // Select the outline face which has a primary_content slot
    await picker.selectOption('hila.outline')

    // Should show a slot binding row
    await expect(page.getByTestId('slot-binding-row')).toBeVisible({ timeout: 3000 })
    // The primary_content slot should be shown
    await expect(page.getByTestId('slot-binding-row')).toContainText('primary_content')
  })

  test('selecting a face type with no slots shows no binding rows', async ({ page }) => {
    await page.getByTestId('view-as-button').click()
    const picker = page.getByTestId('face-type-picker')
    await picker.selectOption('hila.table')

    // Table face has no slots so no binding rows should exist
    await expect(page.getByTestId('slot-binding-row')).not.toBeVisible()
  })

  test('can change a slot binding via dropdown', async ({ page }) => {
    // Switch to Notes tab to target the notes matrix
    await page.locator('.view-tab', { hasText: /^Notes$/ }).click()
    // Wait for notes view
    await expect(
      page.locator('.note-list-face, .note-list-empty, .note-list-items').first(),
    ).toBeVisible({ timeout: 5000 })

    await page.getByTestId('view-as-button').click()
    await expect(page.getByTestId('face-config-panel')).toBeVisible()

    const picker = page.getByTestId('face-type-picker')
    await picker.selectOption('hila.note')

    // Should have slot binding rows for title and body
    const rows = page.getByTestId('slot-binding-row')
    await expect(rows).toHaveCount(2)

    // Change the title slot to bind to body column (select by label since values are column IDs)
    const titleBinding = page.getByTestId('slot-binding-title')
    await titleBinding.selectOption({ label: 'body (TEXT)' })

    // Verify the dropdown changed (value is the column ID, which is a number)
    const selectedValue = await titleBinding.inputValue()
    expect(Number(selectedValue)).toBeGreaterThan(0)
  })

  test('apply button creates a face config and closes the panel', async ({ page }) => {
    await page.getByTestId('view-as-button').click()
    await expect(page.getByTestId('face-config-panel')).toBeVisible()

    const picker = page.getByTestId('face-type-picker')
    await picker.selectOption('hila.table')

    await page.getByTestId('face-config-apply').click()
    // The panel should close after applying
    await expect(page.getByTestId('face-config-panel')).not.toBeVisible({ timeout: 5000 })
  })

  test('cancel button closes the panel', async ({ page }) => {
    await page.getByTestId('view-as-button').click()
    await expect(page.getByTestId('face-config-panel')).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('face-config-panel')).not.toBeVisible()
  })

  test('overflow columns are displayed for face types with slots', async ({ page }) => {
    // Switch to Notes tab
    await page.locator('.view-tab', { hasText: /^Notes$/ }).click()
    await expect(
      page.locator('.note-list-face, .note-list-empty, .note-list-items').first(),
    ).toBeVisible({ timeout: 5000 })

    await page.getByTestId('view-as-button').click()
    await expect(page.getByTestId('face-config-panel')).toBeVisible()

    const picker = page.getByTestId('face-type-picker')
    // Outline face binds one slot (primary_content) and notes matrix has title + body
    await picker.selectOption('hila.outline')

    // Should show at least one overflow column (the one not bound to primary_content)
    await expect(page.getByTestId('overflow-column').first()).toBeVisible({ timeout: 3000 })
  })

  test('applying table face switches to the table view', async ({ page }) => {
    await page.getByTestId('view-as-button').click()
    const picker = page.getByTestId('face-type-picker')
    await picker.selectOption('hila.table')

    await page.getByTestId('face-config-apply').click()

    // Should switch to table view
    await expect(page.locator('.view-tab[data-active="true"]')).toContainText('Table')
  })
})
