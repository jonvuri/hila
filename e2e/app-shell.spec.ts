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

  test('app loads with Workspace tab active', async ({ page }) => {
    const wsTab = page.getByTestId('workspace-tab')
    await expect(wsTab).toBeVisible({ timeout: 5000 })
    await expect(wsTab).toHaveAttribute('data-active', 'true')
  })

  test('stream view renders on load', async ({ page }) => {
    const streamView = page.getByTestId('stream-view')
    await expect(streamView).toBeVisible({ timeout: 5000 })

    await expect(page.getByTestId('navigation-panel')).toBeVisible({ timeout: 5000 })
  })

  test('no Outline, Notes, or Notes Outline tabs exist', async ({ page }) => {
    await expect(page.getByTestId('workspace-tab')).toBeVisible({ timeout: 5000 })

    const tabs = page.locator('.view-tab')
    const tabTexts = await tabs.allTextContents()

    expect(tabTexts).not.toContain('Outline')
    expect(tabTexts).not.toContain('Notes')
    expect(tabTexts).not.toContain('Notes Outline')

    expect(tabTexts).toContain('Workspace')
    expect(tabTexts).toContain('Table')
    expect(tabTexts).toContain('Tags')
  })

  test('Table tab shows workspace matrix in table face', async ({ page }) => {
    await expect(page.getByTestId('workspace-tab')).toBeVisible({ timeout: 5000 })

    const tableTab = page.locator('.view-tab', { hasText: 'Table' })
    await tableTab.click()

    await expect(page.locator('table')).toBeVisible({ timeout: 5000 })
  })

  test('Tags tab shows tag browser', async ({ page }) => {
    await expect(page.getByTestId('workspace-tab')).toBeVisible({ timeout: 5000 })

    const tagsTab = page.getByTestId('tags-tab')
    await tagsTab.click()

    await expect(page.locator('.tag-browser')).toBeVisible({ timeout: 5000 })
  })

  test('matrix browser shows workspace matrix with label and content columns', async ({
    page,
  }) => {
    await expect(page.getByTestId('workspace-tab')).toBeVisible({ timeout: 5000 })

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
