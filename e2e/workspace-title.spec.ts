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

const waitForRows = async (page: Page, minCount = 1) => {
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
  await expect(async () => {
    const count = await page.locator('.outline-row').count()
    expect(count).toBeGreaterThanOrEqual(minCount)
  }).toPass({ timeout: 5000 })
}

test.describe('Workspace title', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForRows(page, 1)
  })

  test('root navigation panel shows workspace title instead of "root"', async ({ page }) => {
    const titleEditor = page.getByTestId('workspace-title-editor')
    await expect(titleEditor).toBeVisible({ timeout: 5000 })
    await expect(titleEditor).toContainText('Workspace')
  })

  test('workspace title is editable and saves on blur', async ({ page }) => {
    const titleEditor = page.getByTestId('workspace-title-editor')
    await expect(titleEditor).toBeVisible({ timeout: 5000 })

    await titleEditor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('My Notes')
    await titleEditor.blur()

    // Wait for the save to propagate
    await page.waitForTimeout(500)

    // Title should reflect the new name
    await expect(titleEditor).toContainText('My Notes')
  })

  test('workspace title saves on Enter', async ({ page }) => {
    const titleEditor = page.getByTestId('workspace-title-editor')
    await expect(titleEditor).toBeVisible({ timeout: 5000 })

    await titleEditor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('Renamed')
    await page.keyboard.press('Enter')

    await page.waitForTimeout(500)
    await expect(titleEditor).toContainText('Renamed')
  })

  test('workspace title reverts on Escape', async ({ page }) => {
    const titleEditor = page.getByTestId('workspace-title-editor')
    await expect(titleEditor).toBeVisible({ timeout: 5000 })

    await titleEditor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('Should revert')
    await page.keyboard.press('Escape')

    await expect(titleEditor).toContainText('Workspace')
  })

  test('workspace title persists after database reset cycle', async ({ page }) => {
    const titleEditor = page.getByTestId('workspace-title-editor')
    await expect(titleEditor).toBeVisible({ timeout: 5000 })

    // Rename the workspace
    await titleEditor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('Persistent Name')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    // Reload the page (not a DB reset -- we want to test persistence)
    await page.reload()
    await waitForRows(page, 1)

    const reloadedTitle = page.getByTestId('workspace-title-editor')
    await expect(reloadedTitle).toBeVisible({ timeout: 5000 })
    await expect(reloadedTitle).toContainText('Persistent Name')
  })

  test('tab label reflects workspace title', async ({ page }) => {
    const tab = page.getByTestId('workspace-tab')
    await expect(tab).toContainText('Workspace', { timeout: 5000 })

    // Rename the workspace
    const titleEditor = page.getByTestId('workspace-title-editor')
    await titleEditor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('Custom Tab Name')
    await page.keyboard.press('Enter')

    // Tab label should update reactively
    await expect(tab).toContainText('Custom Tab Name', { timeout: 5000 })
  })

  test('breadcrumb shows workspace title when focused into subtree', async ({ page }) => {
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'

    // Add a child row by indenting
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    // Wait for the new row
    await expect(async () => {
      const count = await page.locator('.outline-row').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 5000 })

    // Indent the second row to make it a child
    const secondEditor = page.locator('.nav-label-editor .ProseMirror').nth(1)
    await secondEditor.click()
    await page.keyboard.press('Tab')
    await page.waitForTimeout(300)

    // Zoom into the first row using Cmd+Down
    await firstEditor.click()
    await page.keyboard.press(`${modifier}+ArrowDown`)
    await page.waitForTimeout(300)

    // The breadcrumb should show the workspace title
    const breadcrumbRoot = page.getByTestId('breadcrumb-root')
    await expect(breadcrumbRoot).toBeVisible({ timeout: 5000 })
    await expect(breadcrumbRoot).toContainText('Workspace')
  })
})
