import { expect, test, type ElementHandle, type Locator, type Page } from '@playwright/test'

type PmCounts = { mounts: number; unmounts: number }

const launcherShortcut = process.platform === 'darwin' ? 'Meta+K' : 'Control+K'

const setTheme = (page: Page, visualTheme: 'ghost' | 'null' | 'wipeout') =>
  page.evaluate((theme) => {
    document.documentElement.dataset.theme = 'dark'
    document.documentElement.dataset.visualTheme = theme
  }, visualTheme)

const openSidebar = async (page: Page) => {
  const sidebar = page.locator('.app-sidebar')
  if (!(await sidebar.isVisible())) {
    await page.getByRole('button', { name: 'Toggle dev tools' }).click()
    await expect(sidebar).toBeVisible({ timeout: 3_000 })
  }
}

const resetDatabase = async (page: Page) => {
  await page.goto('/')
  await openSidebar(page)
  const reset = page.getByTestId('reset-db-btn')
  await reset.click()
  await expect(reset).toContainText('Confirm', { timeout: 3_000 })
  await reset.click()
  await expect(reset).toContainText('Reset DB', { timeout: 10_000 })
  await page.getByRole('button', { name: 'Close sidebar' }).click()
  await page.getByTestId('workspace-tab').click()
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 10_000 })
}

const pmCounts = (page: Page): Promise<PmCounts> =>
  page.evaluate(() =>
    (
      window as unknown as {
        __hilaDebug: { pmCounts: () => PmCounts }
      }
    ).__hilaDebug.pmCounts(),
  )

const pmDelta = async (page: Page, before: PmCounts): Promise<PmCounts> => {
  const after = await pmCounts(page)
  return { mounts: after.mounts - before.mounts, unmounts: after.unmounts - before.unmounts }
}

const sameNode = async (
  original: ElementHandle<Element>,
  current: Locator,
): Promise<boolean> => {
  const currentHandle = await current.elementHandle()
  if (!currentHandle) return false
  const same = await original.evaluate((node, candidate) => node === candidate, currentHandle)
  await currentHandle.dispose()
  return same
}

const selectionState = (editor: Locator) =>
  editor.evaluate((element) => {
    const selection = window.getSelection()
    return {
      anchorOffset: selection?.anchorOffset ?? -1,
      focusOffset: selection?.focusOffset ?? -1,
      text: selection?.toString() ?? '',
      inside: selection?.anchorNode ? element.contains(selection.anchorNode) : false,
    }
  })

const openFirstFocus = async (page: Page) => {
  const row = page.locator('.outline-row').first()
  await row.hover()
  await row.locator('.nav-row-open-focus').click()
  await expect(page.getByTestId('focus-panel')).toHaveCount(1, { timeout: 5_000 })
}

for (const theme of ['ghost', 'null'] as const) {
  test(`${theme} Quick is centered over the unchanged stream`, async ({ page }) => {
    await resetDatabase(page)
    await setTheme(page, theme)
    await page.getByTestId('workspace-tab').focus()
    await page.keyboard.press(launcherShortcut)

    const launcher = page.getByTestId('quick-launcher')
    await expect(launcher).toBeVisible()
    await expect(launcher.locator('#quick-launcher-input')).toBeFocused()
    await expect(launcher.locator('[data-launcher-theme]')).toHaveAttribute(
      'data-launcher-theme',
      theme,
    )
    await expect(page.getByTestId('workspace-shell')).toBeAttached()

    const geometry = await launcher.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        viewportX: window.innerWidth / 2,
        viewportY: window.innerHeight / 2,
        width: rect.width,
      }
    })
    expect(Math.abs(geometry.centerX - geometry.viewportX)).toBeLessThan(2)
    expect(Math.abs(geometry.centerY - geometry.viewportY)).toBeLessThan(2)
    expect(geometry.width).toBeLessThanOrEqual(640)
    if (theme === 'ghost') {
      await expect(launcher).toHaveCSS('background-color', 'rgb(0, 0, 0)')
      await page.mouse.click(4, 4)
    } else {
      await page.keyboard.press('Escape')
    }

    await expect(launcher).toHaveCount(0)
    await expect(page.getByTestId('workspace-tab')).toBeFocused()
  })
}

test('Mod-k yields from navigation and focus editors without editor churn', async ({
  page,
}) => {
  await resetDatabase(page)
  await setTheme(page, 'ghost')
  const navigationEditor = page.locator('.nav-label-editor .ProseMirror').first()
  await navigationEditor.click()
  await page.keyboard.press('End')
  const navigationHandle = await navigationEditor.elementHandle()
  expect(navigationHandle).not.toBeNull()
  const navigationText = await navigationEditor.textContent()
  const navigationSelection = await selectionState(navigationEditor)
  const beforeNavigation = await pmCounts(page)

  await page.keyboard.press(launcherShortcut)
  await expect(page.getByTestId('quick-launcher')).toBeVisible()
  await expect.poll(() => pmDelta(page, beforeNavigation)).toEqual({ mounts: 0, unmounts: 0 })
  await page.keyboard.press(launcherShortcut)
  await expect(page.getByTestId('quick-launcher')).toHaveCount(0)
  await expect.poll(() => pmDelta(page, beforeNavigation)).toEqual({ mounts: 0, unmounts: 0 })
  expect(await sameNode(navigationHandle!, navigationEditor)).toBe(true)
  await expect(navigationEditor).toBeFocused()
  await expect(navigationEditor).toHaveText(navigationText ?? '')
  expect(await selectionState(navigationEditor)).toEqual(navigationSelection)

  await openFirstFocus(page)
  const focusEditor = page.getByTestId('focus-label-editor').locator('.ProseMirror')
  await focusEditor.click()
  await page.keyboard.press('End')
  const focusHandle = await focusEditor.elementHandle()
  expect(focusHandle).not.toBeNull()
  const focusText = await focusEditor.textContent()
  const focusSelection = await selectionState(focusEditor)
  const beforeFocus = await pmCounts(page)

  await page.keyboard.press(launcherShortcut)
  await expect(page.getByTestId('quick-launcher')).toBeVisible()
  await expect.poll(() => pmDelta(page, beforeFocus)).toEqual({ mounts: 0, unmounts: 0 })
  await page.keyboard.press('Escape')
  await expect.poll(() => pmDelta(page, beforeFocus)).toEqual({ mounts: 0, unmounts: 0 })
  expect(await sameNode(focusHandle!, focusEditor)).toBe(true)
  await expect(focusEditor).toBeFocused()
  await expect(focusEditor).toHaveText(focusText ?? '')
  expect(await selectionState(focusEditor)).toEqual(focusSelection)
})

test('Wipeout aligns its wide Quick cursor and post-facto echoes to the workspace mark', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1_200, height: 900 })
  await resetDatabase(page)
  await setTheme(page, 'wipeout')
  await page.keyboard.press(launcherShortcut)

  const launcher = page.getByTestId('quick-launcher')
  const input = launcher.locator('#quick-launcher-input')
  await expect(input).toBeFocused()
  const geometry = await launcher.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  })
  expect(geometry).toEqual({ left: 0, top: 0, width: 640, height: 440 })
  await expect(launcher).toHaveCSS('background-color', 'rgb(0, 0, 0)')

  const aligned = await page.evaluate(() => {
    const mark = document.querySelector<HTMLElement>('[data-launcher-workspace-mark]')!
    const cursor = document.querySelector<HTMLElement>('[data-testid="launcher-block-cursor"]')!
    const markRect = mark.getBoundingClientRect()
    const cursorRect = cursor.getBoundingClientRect()
    return {
      markLeft: markRect.left,
      markTop: markRect.top,
      cursorLeft: cursorRect.left,
      cursorTop: cursorRect.top,
    }
  })
  expect(Math.abs(aligned.markLeft - aligned.cursorLeft)).toBeLessThan(1)
  expect(Math.abs(aligned.markTop - aligned.cursorTop)).toBeLessThan(1)
  await expect(page.getByTestId('launcher-echoes').locator('span')).toHaveCount(5)
})

test('Wipeout keeps the narrow top-half state when reduced motion removes echoes', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 500, height: 844 })
  await resetDatabase(page)
  await setTheme(page, 'wipeout')
  await page.keyboard.press(launcherShortcut)

  const launcher = page.getByTestId('quick-launcher')
  await expect(launcher.locator('#quick-launcher-input')).toBeFocused()
  const geometry = await launcher.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  })
  expect(geometry).toEqual({ left: 0, top: 0, width: 500, height: 422 })
  const aligned = await page.evaluate(() => {
    const mark = document.querySelector<HTMLElement>('[data-launcher-workspace-mark]')!
    const cursor = document.querySelector<HTMLElement>('[data-testid="launcher-block-cursor"]')!
    const markRect = mark.getBoundingClientRect()
    const cursorRect = cursor.getBoundingClientRect()
    return {
      horizontal: Math.abs(markRect.left - cursorRect.left),
      vertical: Math.abs(markRect.top - cursorRect.top),
    }
  })
  expect(aligned.horizontal).toBeLessThan(1)
  expect(aligned.vertical).toBeLessThan(1)
  await expect(page.getByTestId('launcher-echoes')).toHaveCSS('display', 'none')
})

test('filters, explains command context, runs a command, and navigates cross-matrix', async ({
  page,
}) => {
  await resetDatabase(page)
  await setTheme(page, 'ghost')

  await page.getByTestId('workspace-tab').focus()
  await page.keyboard.press(launcherShortcut)
  let launcher = page.getByTestId('quick-launcher')
  let input = launcher.locator('#quick-launcher-input')
  await input.fill('new table')
  const unavailable = launcher.getByRole('option', { name: /New table/ })
  await expect(unavailable).toContainText('This command requires a node.')
  await input.press('Enter')
  await expect(launcher).toBeVisible()
  await page.keyboard.press('Escape')

  const editor = page.locator('.nav-label-editor .ProseMirror').first()
  await editor.click()
  await page.keyboard.press(launcherShortcut)
  launcher = page.getByTestId('quick-launcher')
  input = launcher.locator('#quick-launcher-input')
  await input.fill('new table')
  const command = launcher.getByRole('option', { name: /New table/ })
  await expect(command).toContainText('Under Welcome to Hila')
  await input.press('Enter')
  await expect(launcher).toHaveCount(0)
  await expect(page.locator('table')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('table-face')).toBeFocused()

  await page.getByTestId('workspace-tab').click()
  const target = await page.evaluate(async () => {
    // @ts-expect-error -- Vite resolves this browser-only module at runtime.
    const sql = await import('/src/core/client/sql-client.ts')
    // @ts-expect-error -- Vite resolves this browser-only module at runtime.
    const matrix = await import('/src/core/client/matrix-client.ts')
    const matrixRows = await sql.execQuery("SELECT id FROM matrix WHERE title = 'Workspace'")
    const matrixId = (matrixRows[0] as { id: number }).id
    const rootRows = await sql.execQuery(
      `SELECT id FROM "mx_${matrixId}_data" ORDER BY id LIMIT 1`,
    )
    const rootRowId = (rootRows[0] as { id: number }).id
    const targetMatrixId = (await matrix.createOwnedMatrix(
      { matrixId, rowId: rootRowId },
      'Launch targets',
      [{ name: 'title', type: 'TEXT', role: 'label' }],
    )) as number
    const targetRowId = (await matrix.createDependentRow(matrixId, rootRowId, targetMatrixId, {
      title: 'Boundary launch target',
    })) as number
    return { targetMatrixId, targetRowId }
  })

  await editor.click()
  await page.keyboard.press(launcherShortcut)
  launcher = page.getByTestId('quick-launcher')
  input = launcher.locator('#quick-launcher-input')
  await input.fill('Boundary launch target')
  const place = launcher.getByRole('option', { name: /Boundary launch target/ })
  await expect(place).toBeVisible({ timeout: 10_000 })
  await place.locator('[title="Show named things"]').dispatchEvent('pointerdown')
  await expect(launcher.locator('[data-filter="named"]')).toBeVisible()
  await expect(place).toBeVisible({ timeout: 10_000 })
  await place.click()

  const focused = page.locator(
    `[data-testid="focus-panel"][data-launcher-matrix-id="${target.targetMatrixId}"][data-launcher-row-id="${target.targetRowId}"]`,
  )
  await expect(focused).toBeVisible({ timeout: 10_000 })
})
