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

const commitWorkspaceKind = async (page: Page) => {
  const launcher = page.getByTestId('quick-launcher')
  const input = launcher.locator('#quick-launcher-input')
  await input.fill('Workspace')
  await expect(launcher.getByRole('option', { name: /Workspace/ }).first()).toBeVisible({
    timeout: 10_000,
  })
  await input.press('Tab')
  await expect(launcher.locator('[data-launcher-tempo="deep"]')).toBeVisible()
  await expect(launcher.locator('[data-chip-type="kind"]')).toContainText('Workspace')
  return { launcher, input }
}

const expectAnimatedEchoFrames = async (page: Page) => {
  const frames = page.getByTestId('launcher-echoes').locator('span')
  await expect(frames).toHaveCount(5)
  const animations = await frames.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element)
      return {
        durationSeconds: Math.max(
          ...style.animationDuration
            .split(',')
            .map((duration) => Number.parseFloat(duration) || 0),
        ),
        name: style.animationName,
      }
    }),
  )
  for (const animation of animations) {
    expect(animation.durationSeconds).toBeGreaterThan(0)
    expect(animation.name).not.toBe('none')
  }
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
  await expectAnimatedEchoFrames(page)
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

  await commitWorkspaceKind(page)
  const deepGeometry = await launcher.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  })
  expect(deepGeometry).toEqual({ left: 0, top: 0, width: 500, height: 844 })
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

for (const theme of ['ghost', 'null', 'wipeout'] as const) {
  for (const viewport of [
    { name: 'wide', width: 1_200, height: 900 },
    { name: 'narrow', width: 500, height: 844 },
  ] as const) {
    test(`${theme} Deep keeps one semantic shell at ${viewport.name} width`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await resetDatabase(page)
      await setTheme(page, theme)
      await page.getByTestId('workspace-tab').focus()
      await page.keyboard.press(launcherShortcut)

      const { launcher, input } = await commitWorkspaceKind(page)
      const preview = launcher.getByRole('listbox', { name: 'Query preview' })
      await expect(preview.getByRole('option').first()).toBeVisible({ timeout: 10_000 })
      await expect(input).toBeFocused()
      const previewId = await preview.getAttribute('id')
      expect(previewId).not.toBeNull()
      await expect(input).toHaveAttribute('aria-controls', previewId!)
      await expect(preview.locator('input, button, [contenteditable="true"]')).toHaveCount(0)

      const geometry = await launcher.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
          viewportX: window.innerWidth / 2,
          viewportY: window.innerHeight / 2,
        }
      })
      if (theme === 'wipeout') {
        expect(geometry.left).toBe(0)
        expect(geometry.top).toBe(0)
        expect(geometry.width).toBe(viewport.width)
        expect(geometry.height).toBe(viewport.height)
        await expectAnimatedEchoFrames(page)
      } else {
        expect(Math.abs(geometry.centerX - geometry.viewportX)).toBeLessThan(2)
        expect(Math.abs(geometry.centerY - geometry.viewportY)).toBeLessThan(2)
        expect(geometry.width).toBeLessThanOrEqual(960)
        expect(geometry.height).toBeLessThanOrEqual(
          viewport.width < 640 ? viewport.height - 16 : 720,
        )
      }
    })
  }
}

test('Deep preview reuses bound templates and keeps large multi-matrix fixtures bounded', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1_200, height: 900 })
  await resetDatabase(page)
  await setTheme(page, 'ghost')
  const logs: string[] = []
  page.on('console', (message) => logs.push(message.text()))

  const fixture = await page.evaluate(async () => {
    // @ts-expect-error -- Vite resolves this browser-only module at runtime.
    const sql = await import('/src/core/client/sql-client.ts')
    // @ts-expect-error -- Vite resolves this browser-only module at runtime.
    const matrix = await import('/src/core/client/matrix-client.ts')
    const matrixRows = await sql.execQuery("SELECT id FROM matrix WHERE title = 'Workspace'")
    const workspaceId = Number(matrixRows[0]?.id)
    const rootRows = await sql.execQuery(
      `SELECT id FROM "mx_${workspaceId}_data" ORDER BY id LIMIT 1`,
    )
    const ownerRowId = Number(rootRows[0]?.id)
    const targetMatrixId = Number(
      await matrix.createOwnedMatrix(
        { matrixId: workspaceId, rowId: ownerRowId },
        'Deep preview records',
        [
          { name: 'label', type: 'TEXT', role: 'label' },
          { name: 'status', type: 'TEXT' },
        ],
      ),
    )
    const distractorMatrixId = Number(
      await matrix.createOwnedMatrix(
        { matrixId: workspaceId, rowId: ownerRowId },
        'Deep preview distractor',
        [{ name: 'label', type: 'TEXT', role: 'label' }],
      ),
    )
    await sql.execDevelopmentSql(`
      WITH RECURSIVE seq(x) AS (
        VALUES(1)
        UNION ALL
        SELECT x + 1 FROM seq WHERE x < 1200
      )
      INSERT INTO "mx_${targetMatrixId}_data" (id, label, status)
      SELECT 8000000000000000 + x, printf('Deep row %04d', x),
             CASE x % 2 WHEN 0 THEN 'open' ELSE 'closed' END
      FROM seq
    `)
    await sql.execDevelopmentSql(`
      WITH RECURSIVE seq(x) AS (
        VALUES(1)
        UNION ALL
        SELECT x + 1 FROM seq WHERE x < 300
      )
      INSERT INTO "mx_${distractorMatrixId}_data" (id, label)
      SELECT 8100000000000000 + x, printf('Distractor row %04d', x)
      FROM seq
    `)
    return { targetMatrixId }
  })

  const before = await pmCounts(page)
  await page.getByTestId('workspace-tab').focus()
  await page.keyboard.press(launcherShortcut)
  const launcher = page.getByTestId('quick-launcher')
  const input = launcher.locator('#quick-launcher-input')
  await input.fill('Deep preview records')
  await expect(launcher.getByRole('option', { name: /Deep preview records/ })).toBeVisible({
    timeout: 10_000,
  })
  await input.press('Tab')

  const preview = launcher.getByRole('listbox', { name: 'Query preview' })
  await expect(preview.getByRole('option').first()).toBeVisible({ timeout: 10_000 })
  expect(await preview.getByRole('option').count()).toBeLessThanOrEqual(600)
  expect(await pmDelta(page, before)).toEqual({ mounts: 0, unmounts: 0 })

  const scrollport = preview.locator('[data-virtualizer-scrollport]')
  await scrollport.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll'))
  })
  await expect
    .poll(() => scrollport.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(30_000)
  await expect(preview.getByRole('option', { name: /Deep row 1000/ })).toBeVisible({
    timeout: 10_000,
  })
  expect(await preview.getByRole('option').count()).toBeLessThanOrEqual(600)

  logs.length = 0
  await input.pressSequentially('Deep row 11', { delay: 30 })
  await expect(preview.getByRole('option', { name: /Deep row 1100/ })).toBeVisible({
    timeout: 10_000,
  })
  const prepared = logs.filter(
    (message) =>
      message.includes('Prepared SQL for subscription:') &&
      message.includes(`mx_${fixture.targetMatrixId}_data`) &&
      message.includes('LIKE ?1'),
  )
  expect(prepared).toHaveLength(2)
  expect(await pmDelta(page, before)).toEqual({ mounts: 0, unmounts: 0 })
})
