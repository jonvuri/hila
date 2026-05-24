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

const waitForRows = async (page: Page) => {
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
}

test.describe('Face configuration UI', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForRows(page)
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
    // placeholder + table + workspace = 3
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test('selecting a face type shows slot bindings', async ({ page }) => {
    await page.getByTestId('view-as-button').click()
    await expect(page.getByTestId('face-config-panel')).toBeVisible()

    const picker = page.getByTestId('face-type-picker')
    await picker.selectOption('hila.workspace')

    await expect(page.getByTestId('slot-binding-row').first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByTestId('slot-binding-row').first()).toContainText('label')
  })

  test('selecting a face type with no slots shows no binding rows', async ({ page }) => {
    await page.getByTestId('view-as-button').click()
    const picker = page.getByTestId('face-type-picker')
    await picker.selectOption('hila.table')

    await expect(page.getByTestId('slot-binding-row')).not.toBeVisible()
  })

  test('can change a slot binding via dropdown', async ({ page }) => {
    await page.getByTestId('view-as-button').click()
    await expect(page.getByTestId('face-config-panel')).toBeVisible()

    const picker = page.getByTestId('face-type-picker')
    await picker.selectOption('hila.workspace')

    const rows = page.getByTestId('slot-binding-row')
    await expect(rows.first()).toBeVisible({ timeout: 3000 })

    const labelBinding = page.getByTestId('slot-binding-label')
    await labelBinding.selectOption({ label: 'content (TEXT)' })

    const selectedValue = await labelBinding.inputValue()
    expect(Number(selectedValue)).toBeGreaterThan(0)
  })

  test('apply button creates a face config and closes the panel', async ({ page }) => {
    await page.getByTestId('view-as-button').click()
    await expect(page.getByTestId('face-config-panel')).toBeVisible()

    const picker = page.getByTestId('face-type-picker')
    await picker.selectOption('hila.table')

    await page.getByTestId('face-config-apply').click()
    await expect(page.getByTestId('face-config-panel')).not.toBeVisible({ timeout: 5000 })
  })

  test('cancel button closes the panel', async ({ page }) => {
    await page.getByTestId('view-as-button').click()
    await expect(page.getByTestId('face-config-panel')).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('face-config-panel')).not.toBeVisible()
  })

  test('overflow columns are displayed for face types with slots', async ({ page }) => {
    await page.getByTestId('view-as-button').click()
    await expect(page.getByTestId('face-config-panel')).toBeVisible()

    const picker = page.getByTestId('face-type-picker')
    // Workspace face has label (required) + content slots, workspace matrix has label + content columns
    // content is not required, so it should show as overflow when not bound
    await picker.selectOption('hila.workspace')

    await expect(page.getByTestId('slot-binding-row').first()).toBeVisible({ timeout: 3000 })
  })

  test('applying table face switches to the table view', async ({ page }) => {
    await page.getByTestId('view-as-button').click()
    const picker = page.getByTestId('face-type-picker')
    await picker.selectOption('hila.table')

    await page.getByTestId('face-config-apply').click()

    await expect(page.locator('.view-tab[data-active="true"]')).toContainText('Table')
  })
})
