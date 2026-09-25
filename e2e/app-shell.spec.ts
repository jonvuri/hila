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

test.describe('App shell: workspace-based layout', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
  })

  test('app loads one stream root', async ({ page }) => {
    const workspaceShell = page.getByTestId('workspace-shell')
    await expect(workspaceShell).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('navigation-panel')).toBeVisible({ timeout: 5000 })
    await expect(
      page.locator('.view-switcher, [data-testid="table-tab"], [data-testid="tags-tab"]'),
    ).toHaveCount(0)
    await expect(page.locator('.tag-browser')).toHaveCount(0)
  })

  test('matrix browser shows workspace matrix with label and content columns', async ({
    page,
  }) => {
    await openSidebar(page)

    const matrixSection = page.getByTestId('matrix-browser')
    await expect(matrixSection).toBeVisible({ timeout: 5000 })

    const matrixText = await matrixSection.textContent()
    expect(matrixText).toContain('Workspace')

    // Click into the Workspace matrix detail and open Schema tab to see columns
    await page.locator('.mb-matrix-item', { hasText: 'Workspace' }).click()
    await expect(page.getByTestId('matrix-detail')).toBeVisible({ timeout: 3000 })

    await page.getByRole('button', { name: 'Schema' }).click()

    const detailText = await page.getByTestId('matrix-detail').textContent()
    expect(detailText).toContain('label')
    expect(detailText).toContain('content')
  })
})
