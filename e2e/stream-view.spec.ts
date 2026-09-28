import { test, expect, type ElementHandle, type Locator, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const closeSidebar = async (page: Page) => {
  const sidebar = page.locator('.app-sidebar')
  if (await sidebar.isVisible()) {
    await page.getByRole('button', { name: 'Close sidebar' }).click()
    await expect(sidebar).toBeHidden({ timeout: 3000 })
  }
}

const waitForRows = async (page: Page, minCount = 1) => {
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
  await expect(async () => {
    const count = await page.locator('.outline-row').count()
    expect(count).toBeGreaterThanOrEqual(minCount)
  }).toPass({ timeout: 5000 })
}

const openFocusPanelOnRow = async (page: Page, rowIndex: number) => {
  const row = page.locator('.outline-row').nth(rowIndex)
  const focusBtn = row.locator('.nav-row-open-focus')
  await row.hover()
  await expect(async () => {
    const opacity = await focusBtn.evaluate((el) => window.getComputedStyle(el).opacity)
    expect(Number(opacity)).toBeGreaterThan(0)
  }).toPass({ timeout: 3000 })
  await focusBtn.click()
  await expect(page.getByTestId('focus-panel')).toBeVisible({ timeout: 5000 })
}

const rowEditorAt = (page: Page, i: number) =>
  page.locator('.outline-row').nth(i).locator('.nav-label-editor .ProseMirror')

const workspaceColumns = (page: Page) => page.getByTestId('workspace-shell-column')

const navigationColumns = (page: Page) =>
  page.locator('[data-testid="workspace-shell-column"][data-panel-kind="navigation"]')

const focusColumns = (page: Page) =>
  page.locator('[data-testid="workspace-shell-column"][data-panel-kind="focus"]')

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
      inside: selection?.anchorNode ? element.contains(selection.anchorNode) : false,
    }
  })

const seedDenseFocusFixture = (page: Page, childCount = 105) =>
  page.evaluate(async (count) => {
    // @ts-expect-error -- Vite resolves this browser-only module at runtime.
    const sql = await import('/src/core/client/sql-client.ts')
    // @ts-expect-error -- Vite resolves this browser-only module at runtime.
    const matrix = await import('/src/core/client/matrix-client.ts')
    const makeDoc = (text: string) =>
      JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      })
    const matrixRows = (await sql.execQuery(
      "SELECT id FROM matrix WHERE title = 'Workspace'",
    )) as { id: number }[]
    const matrixId = matrixRows[0]!.id
    const parent = await matrix.insertRow(matrixId, {
      values: {
        label: makeDoc(
          'Dense responsive parent with a deliberately long label for narrow layout review',
        ),
        content: makeDoc('Dense focus content'),
      },
    })

    for (let index = 0; index < count; index += 1) {
      const child = await matrix.insertRow(matrixId, {
        parentKey: parent.key,
        values: {
          label: makeDoc(
            index === 0 ?
              'Expandable child with a deliberately long label for narrow layout review'
            : `Dense child ${index + 1}`,
          ),
          content: index % 10 === 0 ? makeDoc(`Dense content ${index + 1}`) : null,
        },
      })
      if (index === 0) {
        await matrix.insertRow(matrixId, {
          parentKey: child.key,
          values: { label: makeDoc('Nested disclosure child'), content: null },
        })
      }
    }

    return { parentRowId: parent.rowId as number }
  }, childCount)

// Build a single linear ancestry chain `names[0] > names[1] > ...` in the root
// navigation panel. Rows are first created flat (deterministic count), then
// renamed (select-all + retype, split-immune), then indented purely via Tab so
// each row i ends up at depth i. Mirrors the robust patterns used elsewhere in
// this spec to avoid caret/focus races.
const buildLinearChain = async (page: Page, names: string[]) => {
  for (let i = 1; i < names.length; i++) {
    await rowEditorAt(page, i - 1).click()
    await page.keyboard.press('Enter')
    await expect(async () => {
      expect(await page.locator('.outline-row').count()).toBeGreaterThanOrEqual(i + 1)
    }).toPass({ timeout: 5000 })
  }

  for (let i = 0; i < names.length; i++) {
    await rowEditorAt(page, i).click()
    await rowEditorAt(page, i).press('ControlOrMeta+a')
    await page.keyboard.type(names[i]!)
    await expect(async () => {
      expect((await rowEditorAt(page, i).textContent())?.trim()).toBe(names[i])
    }).toPass({ timeout: 5000 })
  }

  for (let i = 1; i < names.length; i++) {
    await rowEditorAt(page, i).click()
    for (let d = 1; d <= i; d++) {
      await rowEditorAt(page, i).press('Tab')
      await expect(async () => {
        expect(await page.locator('.outline-row').nth(i).getAttribute('data-depth')).toBe(
          String(d),
        )
      }).toPass({ timeout: 5000 })
    }
  }
}

// From the deepest (rightmost) focus panel, open a focus on the named child via
// its right-arrow button -- the same path the live nav rows use.
const drillIntoChild = async (page: Page, childText: string) => {
  const children = focusColumns(page).last().getByTestId('focus-panel-children')
  await expect(children).toBeVisible({ timeout: 5000 })
  const childRow = children.locator('.outline-row').filter({ hasText: childText }).first()
  await expect(childRow).toBeVisible({ timeout: 5000 })
  const btn = childRow.locator('.nav-row-open-focus')
  await childRow.hover()
  await expect(async () => {
    const opacity = await btn.evaluate((el) => window.getComputedStyle(el).opacity)
    expect(Number(opacity)).toBeGreaterThan(0)
  }).toPass({ timeout: 3000 })
  await btn.click()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Stream view: panel management', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForRows(page, 1)
  })

  test('initial state is single navigation panel at full width', async ({ page }) => {
    const workspaceShell = page.getByTestId('workspace-shell')
    await expect(workspaceShell).toBeVisible()

    const navColumns = navigationColumns(page)
    await expect(navColumns).toHaveCount(1)

    await expect(focusColumns(page)).toHaveCount(0)

    await expect(page.getByTestId('navigation-panel')).toBeVisible()
  })

  test('reduced motion keeps the shell and removes feedback duration', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })

    await expect(page.getByTestId('workspace-shell')).toBeVisible()
    const feedbackDuration = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--duration-feedback').trim(),
    )
    expect(feedbackDuration).toBe('0ms')
  })

  test('click right-arrow opens focus panel to the right', async ({ page }) => {
    await openFocusPanelOnRow(page, 0)

    const navColumns = navigationColumns(page)
    await expect(navColumns).toHaveCount(1)

    await expect(focusColumns(page)).toHaveCount(1)

    const labelEditor = page.getByTestId('focus-label-editor')
    await expect(labelEditor).toBeVisible()
    const text = await labelEditor.textContent()
    expect(text).toContain('Welcome to Hila')
  })

  test('click right-arrow on child in nested nav panel appends a new focus column', async ({
    page,
  }) => {
    // Create a child row
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()
    await firstEditor.press('End')
    await firstEditor.press('Enter')

    await expect(async () => {
      const count = await page.locator('.outline-row').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 5000 })

    // Type in the second row and indent it to make it a child
    const secondEditor = page
      .locator('.outline-row')
      .nth(1)
      .locator('.nav-label-editor .ProseMirror')
    await secondEditor.click()
    await page.keyboard.type('Child item')
    await page.keyboard.press('Tab')

    await expect(async () => {
      const depth = await page.locator('.outline-row').nth(1).getAttribute('data-depth')
      expect(depth).toBe('1')
    }).toPass({ timeout: 5000 })

    // Open focus panel on the parent row
    await openFocusPanelOnRow(page, 0)

    // Wait for children section to load in the focus panel
    const childrenSection = page.getByTestId('focus-panel-children')
    await expect(childrenSection).toBeVisible({ timeout: 5000 })

    await expect(async () => {
      const navPanel = childrenSection.getByTestId('navigation-panel')
      await expect(navPanel).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 8000 })

    // Find the child row's right-arrow button inside the focus panel's children
    const childRow = childrenSection.locator('.outline-row').first()
    await expect(childRow).toBeVisible({ timeout: 5000 })
    const childFocusBtn = childRow.locator('.nav-row-open-focus')
    await childRow.hover()
    await expect(async () => {
      const opacity = await childFocusBtn.evaluate((el) => window.getComputedStyle(el).opacity)
      expect(Number(opacity)).toBeGreaterThan(0)
    }).toPass({ timeout: 3000 })
    await childFocusBtn.click()

    // A second focus panel should appear showing the child
    await expect(async () => {
      await expect(focusColumns(page)).toHaveCount(2)
    }).toPass({ timeout: 5000 })

    // The new (rightmost) focus panel shows the child label
    const focusLabels = page.getByTestId('focus-label-editor')
    await expect(async () => {
      const text = await focusLabels.last().textContent()
      expect(text).toContain('Child item')
    }).toPass({ timeout: 5000 })
  })

  test('Cmd/Ctrl+L opens focus panel for focused row', async ({ page }) => {
    // Focus the first row's label editor
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()

    // No focus panel yet
    await expect(focusColumns(page)).toHaveCount(0)

    // Press Cmd/Ctrl+L
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+l`)

    // Focus panel should open
    await expect(page.getByTestId('focus-panel')).toBeVisible({ timeout: 5000 })
    await expect(focusColumns(page)).toHaveCount(1)
  })

  test('Cmd+Left closes rightmost panel', async ({ page }) => {
    // Open a focus panel first
    await openFocusPanelOnRow(page, 0)
    await expect(focusColumns(page)).toHaveCount(1)

    // Press Cmd+Left (Meta+ArrowLeft)
    await page.keyboard.press('Meta+ArrowLeft')

    // Focus panel should be closed
    await expect(focusColumns(page)).toHaveCount(0)

    // Navigation panel should still be visible
    await expect(navigationColumns(page)).toHaveCount(1)
    await expect(page.getByTestId('navigation-panel')).toBeVisible()
  })

  test('breadcrumb stays hidden while root navigation is visible', async ({ page }) => {
    // Build a nested tree: "Root" > "Child" > "Grandchild".
    // Gate each step on the row's text/depth to avoid editor focus races.
    const rowEditor = (i: number) =>
      page.locator('.outline-row').nth(i).locator('.nav-label-editor .ProseMirror')
    const expectRowText = async (i: number, text: string) => {
      await expect(async () => {
        expect((await rowEditor(i).textContent())?.trim()).toBe(text)
      }).toPass({ timeout: 5000 })
    }
    const expectRowDepth = async (i: number, depth: string) => {
      await expect(async () => {
        expect(await page.locator('.outline-row').nth(i).getAttribute('data-depth')).toBe(depth)
      }).toPass({ timeout: 5000 })
    }
    const expectRowCount = async (n: number) => {
      await expect(async () => {
        expect(await page.locator('.outline-row').count()).toBeGreaterThanOrEqual(n)
      }).toPass({ timeout: 5000 })
    }
    // Caret position is unreliable under the app's async focus management, so
    // we avoid depending on it. Pressing Enter always adds exactly one sibling
    // row (whether or not it splits existing text), so the row *count* is
    // deterministic. We then overwrite each row's text via select-all + retype
    // (split-immune) and build depth purely via Tab indents (caret-independent).
    const setRowText = async (i: number, text: string) => {
      await rowEditor(i).click()
      await rowEditor(i).press('ControlOrMeta+a')
      await page.keyboard.type(text)
      await expectRowText(i, text)
    }

    await rowEditor(0).click()
    await page.keyboard.press('Enter')
    await expectRowCount(2)
    await rowEditor(1).click()
    await page.keyboard.press('Enter')
    await expectRowCount(3)

    // Name the three rows: "Root" > "Child" > "Grandchild".
    await setRowText(0, 'Root')
    await setRowText(1, 'Child')
    await setRowText(2, 'Grandchild')

    // Build depth: "Child" under "Root", "Grandchild" under "Child".
    await rowEditor(1).click()
    await rowEditor(1).press('Tab')
    await expectRowDepth(1, '1')
    await rowEditor(2).click()
    await rowEditor(2).press('Tab')
    await expectRowDepth(2, '1')
    await rowEditor(2).press('Tab')
    await expectRowDepth(2, '2')

    // Open a focus panel on the root row (depth 0)
    await openFocusPanelOnRow(page, 0)
    await expect(focusColumns(page)).toHaveCount(1)

    // Root navigation is first, so the simple breadcrumb stays hidden.
    await expect(page.getByTestId('workspace-shell-breadcrumb')).toHaveCount(0)

    // From the focus panel's embedded outline, open a focus on "Grandchild"
    // (a deep descendant, skipping the "Child" level).
    const childrenSection = page.getByTestId('focus-panel-children')
    await expect(childrenSection).toBeVisible({ timeout: 5000 })
    const grandchildRow = childrenSection
      .locator('.outline-row')
      .filter({ hasText: 'Grandchild' })
      .first()
    await expect(grandchildRow).toBeVisible({ timeout: 5000 })
    const gcFocusBtn = grandchildRow.locator('.nav-row-open-focus')
    await grandchildRow.hover()
    await expect(async () => {
      const opacity = await gcFocusBtn.evaluate((el) => window.getComputedStyle(el).opacity)
      expect(Number(opacity)).toBeGreaterThan(0)
    }).toPass({ timeout: 3000 })
    await gcFocusBtn.click()

    // A second focus panel appears showing the grandchild.
    await expect(focusColumns(page)).toHaveCount(2)
    await expect(page.getByTestId('workspace-shell-breadcrumb')).toHaveCount(0)
  })

  test('total column count stays within limit of 4', async ({ page }) => {
    await buildLinearChain(page, ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'])
    await openFocusPanelOnRow(page, 0)
    await drillIntoChild(page, 'Bravo')
    await drillIntoChild(page, 'Charlie')
    await drillIntoChild(page, 'Delta')
    await drillIntoChild(page, 'Echo')

    await expect(workspaceColumns(page)).toHaveCount(4)
    await expect(navigationColumns(page)).toHaveCount(0)
    await expect(focusColumns(page)).toHaveCount(4)
  })
})

test.describe('Stream view: responsive shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 844 })
    await resetDB(page)
    await waitForRows(page, 1)
    await closeSidebar(page)
  })

  test('uses the 719/720 host boundary without remounting the active editor', async ({
    page,
  }) => {
    const shell = page.getByTestId('workspace-shell')
    const rootEditor = rowEditorAt(page, 0)
    const rootEditorHandle = await rootEditor.elementHandle()
    expect(rootEditorHandle).toBeTruthy()

    await page.setViewportSize({ width: 719, height: 844 })
    await expect(shell).toHaveAttribute('data-shell-presentation', 'single-panel')
    await expect(workspaceColumns(page)).toHaveCount(1)
    await expect(navigationColumns(page)).toHaveAttribute('data-visible', 'true')
    await expect(page.getByTestId('workspace-shell-breadcrumb')).toHaveCount(0)
    expect(await sameNode(rootEditorHandle!, rootEditor)).toBe(true)

    await page.setViewportSize({ width: 720, height: 844 })
    await expect(shell).toHaveAttribute('data-shell-presentation', 'bounded-rail')
    expect(await sameNode(rootEditorHandle!, rootEditor)).toBe(true)
    await rootEditorHandle!.dispose()

    await page.setViewportSize({ width: 1180, height: 844 })
    await openFocusPanelOnRow(page, 0)
    const editor = page.getByTestId('focus-label-editor').locator('.ProseMirror')
    const editorHandle = await editor.elementHandle()
    expect(editorHandle).toBeTruthy()
    await editor.click()
    await editor.press('End')
    const beforeSelection = await selectionState(editor)
    expect(beforeSelection.inside).toBe(true)

    await page.setViewportSize({ width: 719, height: 844 })
    await expect(shell).toHaveAttribute('data-shell-presentation', 'single-panel')
    await expect(workspaceColumns(page)).toHaveCount(2)
    await expect(navigationColumns(page)).toHaveAttribute('hidden', '')
    await expect(navigationColumns(page)).toBeHidden()
    await expect(focusColumns(page)).toHaveAttribute('data-visible', 'true')
    await expect(page.getByTestId('workspace-shell-breadcrumb')).toContainText('Workspace')
    await expect(editor).toBeFocused()
    expect(await sameNode(editorHandle!, editor)).toBe(true)
    expect(await selectionState(editor)).toEqual(beforeSelection)
    const narrowWidths = await shell.evaluate((element) => {
      const active = element.querySelector<HTMLElement>('[data-active="true"]')!
      return {
        shell: element.getBoundingClientRect().width,
        active: active.getBoundingClientRect().width,
      }
    })
    expect(narrowWidths.active).toBeCloseTo(narrowWidths.shell, 0)

    await page.setViewportSize({ width: 720, height: 844 })
    await expect(shell).toHaveAttribute('data-shell-presentation', 'bounded-rail')
    await expect(page.locator('[data-testid="workspace-shell-column"]:visible')).toHaveCount(2)
    await expect(page.getByTestId('workspace-shell-breadcrumb')).toHaveCount(0)
    await expect(editor).toBeFocused()
    expect(await sameNode(editorHandle!, editor)).toBe(true)
    expect(await selectionState(editor)).toEqual(beforeSelection)
    await editorHandle!.dispose()
  })

  test('preserves dense virtualized, disclosure, scroll, and pending-save state', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const { parentRowId } = await seedDenseFocusFixture(page)
    const parentRow = page.locator(`.outline-row[data-row-id="${parentRowId}"]`)
    await expect(parentRow).toBeVisible({ timeout: 20_000 })
    await parentRow.hover()
    await parentRow.locator('.nav-row-open-focus').click()
    await expect(page.getByTestId('focus-panel')).toBeVisible({ timeout: 10_000 })

    const activeFocus = focusColumns(page)
    const children = activeFocus.getByTestId('focus-panel-children')
    await expect(children.locator('.outline-row')).toHaveCount(106, { timeout: 30_000 })
    const disclosure = children.locator('button[aria-expanded]').first()
    await disclosure.click()
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false')

    const outlineScrollport = children.locator('.production-navigation-scrollport')
    await expect
      .poll(() => outlineScrollport.evaluate((element) => element.scrollHeight))
      .toBeGreaterThan(0)
    await outlineScrollport.evaluate((element) => {
      element.scrollTop = Math.min(900, element.scrollHeight - element.clientHeight)
      element.dispatchEvent(new Event('scroll'))
    })
    await expect
      .poll(() => outlineScrollport.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0)
    const scrollTop = await outlineScrollport.evaluate((element) => element.scrollTop)
    const scrollportHandle = await outlineScrollport.elementHandle()
    const virtualWindowIndex = await children
      .locator('[data-window-index]')
      .last()
      .getAttribute('data-window-index')
    expect(virtualWindowIndex).not.toBeNull()
    const virtualWindow = children.locator(`[data-window-index="${virtualWindowIndex!}"]`)
    const virtualWindowHandle = await virtualWindow.elementHandle()
    expect(scrollportHandle).toBeTruthy()
    expect(virtualWindowHandle).toBeTruthy()

    const navigationEditor = rowEditorAt(page, 0)
    const navigationRow = page.locator('.outline-row').nth(0)
    const editedRow = {
      matrixId: Number(await navigationRow.getAttribute('data-launcher-matrix-id')),
      rowId: Number(await navigationRow.getAttribute('data-row-id')),
    }
    expect(editedRow.matrixId).toBeGreaterThan(0)
    expect(editedRow.rowId).toBeGreaterThan(0)
    const navigationEditorHandle = await navigationEditor.elementHandle()
    expect(navigationEditorHandle).toBeTruthy()
    await navigationEditor.click()
    await navigationEditor.press('End')
    await page.keyboard.type(' pending resize save')
    await expect(navigationEditor).toBeFocused()

    await page.setViewportSize({ width: 500, height: 844 })
    const shell = page.getByTestId('workspace-shell')
    await expect(shell).toHaveAttribute('data-shell-presentation', 'single-panel')
    const navigation = navigationColumns(page)
    await expect(navigation).toHaveAttribute('aria-hidden', 'true')
    await expect(navigation).toHaveAttribute('inert', '')
    await expect(focusColumns(page)).toBeFocused()
    await expect(shell.getByRole('status')).toContainText(
      'Single-panel workspace. Focus moved to Dense responsive parent',
    )
    expect(await sameNode(navigationEditorHandle!, navigationEditor)).toBe(true)
    expect(await sameNode(scrollportHandle!, outlineScrollport)).toBe(true)
    expect(await sameNode(virtualWindowHandle!, virtualWindow)).toBe(true)
    expect(await outlineScrollport.evaluate((element) => element.scrollTop)).toBe(scrollTop)
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false')

    await page.setViewportSize({ width: 720, height: 844 })
    await expect(shell).toHaveAttribute('data-shell-presentation', 'bounded-rail')
    expect(await sameNode(navigationEditorHandle!, navigationEditor)).toBe(true)
    expect(await sameNode(scrollportHandle!, outlineScrollport)).toBe(true)
    expect(await sameNode(virtualWindowHandle!, virtualWindow)).toBe(true)
    expect(await outlineScrollport.evaluate((element) => element.scrollTop)).toBe(scrollTop)
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false')

    await expect
      .poll(
        () =>
          page.evaluate(async ({ matrixId, rowId }) => {
            // @ts-expect-error -- Vite resolves this browser-only module at runtime.
            const sql = await import('/src/core/client/sql-client.ts')
            const rows = (await sql.execQuery({
              sql: `SELECT label FROM "mx_${matrixId}_data" WHERE id = ?`,
              bindings: [rowId],
            })) as { label: string }[]
            return rows[0]?.label ?? ''
          }, editedRow),
        { timeout: 5_000 },
      )
      .toContain('pending resize save')
    await page.reload()
    await waitForRows(page, 1)
    await expect(rowEditorAt(page, 0)).toContainText('pending resize save')

    await navigationEditorHandle!.dispose()
    await scrollportHandle!.dispose()
    await virtualWindowHandle!.dispose()
  })

  test('keeps a keyboard-reachable four-panel path across themes and inputs', async ({
    browser,
    page,
  }) => {
    const names = [
      'Alpha ancestor with a deliberately long label for narrow ancestry review',
      'Bravo ancestor with a deliberately long label for narrow ancestry review',
      'Charlie ancestor with a deliberately long label for narrow ancestry review',
      'Delta ancestor with a deliberately long label for narrow ancestry review',
      'Echo active panel with a deliberately long label for narrow ancestry review',
    ]
    await buildLinearChain(page, names)
    await openFocusPanelOnRow(page, 0)
    await drillIntoChild(page, names[1]!)
    await drillIntoChild(page, names[2]!)
    await drillIntoChild(page, names[3]!)
    await drillIntoChild(page, names[4]!)
    const shell = page.getByTestId('workspace-shell')
    await expect(workspaceColumns(page)).toHaveCount(4)
    const retainedHandles = await workspaceColumns(page).elementHandles()
    expect(retainedHandles).toHaveLength(4)

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(shell).toHaveAttribute('data-shell-presentation', 'single-panel')
    const breadcrumb = page.getByTestId('workspace-shell-breadcrumb')
    const breadcrumbButtons = breadcrumb.getByRole('button')
    await expect(breadcrumbButtons).toHaveCount(5)
    expect(
      await breadcrumb.evaluate((element) => element.scrollWidth > element.clientWidth),
    ).toBe(true)
    await focusColumns(page).last().focus()
    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press('Tab')
      await expect(breadcrumbButtons.nth(index)).toBeFocused()
    }

    await page.emulateMedia({ reducedMotion: 'reduce' })
    const feedbackDuration = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--duration-feedback').trim(),
    )
    expect(feedbackDuration).toBe('0ms')

    const themes = ['ghost', 'null', 'wipeout'] as const
    const polarities = ['dark', 'light'] as const
    const widths = [390, 500, 719, 720, 1180] as const

    for (const theme of themes) {
      for (const polarity of polarities) {
        await page.evaluate(
          ([nextTheme, nextPolarity]) => {
            document.documentElement.dataset.visualTheme = nextTheme
            document.documentElement.dataset.theme = nextPolarity
          },
          [theme, polarity] as const,
        )
        for (const width of widths) {
          await page.setViewportSize({ width, height: 844 })
          const narrow = width <= 719
          await expect(shell).toHaveAttribute(
            'data-shell-presentation',
            narrow ? 'single-panel' : 'bounded-rail',
          )
          await expect(
            page.locator('[data-testid="workspace-shell-column"]:visible'),
          ).toHaveCount(narrow ? 1 : 4)
          await expect(workspaceColumns(page)).toHaveCount(4)
          if (narrow) {
            const hiddenColumns = page.locator(
              '[data-testid="workspace-shell-column"][data-active="false"]',
            )
            await expect(hiddenColumns).toHaveCount(3)
            for (const column of await hiddenColumns.all()) {
              await expect(column).toHaveAttribute('hidden', '')
              await expect(column).toHaveAttribute('aria-hidden', 'true')
              await expect(column).toHaveAttribute('inert', '')
            }
          }
        }
      }
    }

    for (let index = 0; index < retainedHandles.length; index += 1) {
      expect(await sameNode(retainedHandles[index]!, workspaceColumns(page).nth(index))).toBe(
        true,
      )
      await retainedHandles[index]!.dispose()
    }

    const coarseContext = await browser.newContext({
      hasTouch: true,
      viewport: { width: 500, height: 844 },
    })
    try {
      const coarsePage = await coarseContext.newPage()
      await resetDB(coarsePage)
      await waitForRows(coarsePage, 1)
      await closeSidebar(coarsePage)
      await openFocusPanelOnRow(coarsePage, 0)
      await expect(coarsePage.getByTestId('workspace-shell')).toHaveAttribute(
        'data-shell-presentation',
        'single-panel',
      )
      expect(await coarsePage.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(
        true,
      )
      const rootTarget = coarsePage
        .getByTestId('workspace-shell-breadcrumb')
        .getByRole('button', { name: 'Workspace' })
      const targetBox = await rootTarget.boundingBox()
      expect(targetBox?.width).toBeGreaterThanOrEqual(44)
      expect(targetBox?.height).toBeGreaterThanOrEqual(44)
    } finally {
      await coarseContext.close()
    }
  })
})

test.describe('Stream view: clickable breadcrumb', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForRows(page, 1)
    // The dev-tools sidebar overlaps the far-right/deep focus columns these
    // tests exercise. Close it so breadcrumb and row interactions are not blocked.
    await closeSidebar(page)
  })

  test('clicking an ancestor focuses it and replaces deeper panels', async ({ page }) => {
    await buildLinearChain(page, ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'])
    await openFocusPanelOnRow(page, 0)
    await drillIntoChild(page, 'Bravo')
    await drillIntoChild(page, 'Charlie')
    await drillIntoChild(page, 'Delta')
    await drillIntoChild(page, 'Echo')

    const breadcrumb = page.getByTestId('workspace-shell-breadcrumb')
    await expect(breadcrumb).toBeVisible({ timeout: 5000 })
    await expect(breadcrumb.getByRole('button', { name: 'Workspace' })).toBeVisible()
    const alphaButton = breadcrumb.getByRole('button', { name: 'Alpha' })
    await expect(alphaButton).toBeVisible()
    await alphaButton.click()

    await expect(async () => {
      const text = await page.getByTestId('focus-label-editor').last().textContent()
      expect(text).toContain('Alpha')
    }).toPass({ timeout: 5000 })

    await expect(focusColumns(page)).toHaveCount(1)
    await expect(page.getByTestId('workspace-shell-breadcrumb')).toBeVisible()
  })

  test('clicking the workspace title returns to root navigation', async ({ page }) => {
    // A 5-deep chain so that drilling down past MAX_COLUMNS shifts both the nav
    // panel and the top-level focus panel off the front. The resulting leftmost
    // panel (Bravo) has a hidden ancestor (Alpha), which is what makes the
    // workspace-title tab appear.
    await buildLinearChain(page, ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'])

    await openFocusPanelOnRow(page, 0) // focus Alpha
    await drillIntoChild(page, 'Bravo')
    await drillIntoChild(page, 'Charlie')
    await drillIntoChild(page, 'Delta')
    await drillIntoChild(page, 'Echo')

    await expect(navigationColumns(page)).toHaveCount(0)
    const breadcrumb = page.getByTestId('workspace-shell-breadcrumb')
    const titleButton = breadcrumb.getByRole('button', { name: 'Workspace' })
    await expect(titleButton).toBeVisible({ timeout: 5000 })

    await titleButton.click()

    await expect(focusColumns(page)).toHaveCount(0)
    await expect(navigationColumns(page)).toHaveCount(1)
    await expect(page.getByTestId('navigation-panel')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('workspace-title-editor')).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Stream view: focus panel headers + collapse', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForRows(page, 1)
    await closeSidebar(page)
  })

  // Build Alpha > Bravo > Charlie and focus down level by level so the panel
  // stack is [nav, Alpha, Bravo, Charlie] (Charlie active). No ancestor gaps.
  const buildChainAndDrill = async (page: Page) => {
    await buildLinearChain(page, ['Alpha', 'Bravo', 'Charlie'])
    await openFocusPanelOnRow(page, 0) // focus Alpha
    await expect(focusColumns(page)).toHaveCount(1)
    await drillIntoChild(page, 'Bravo')
    await expect(focusColumns(page)).toHaveCount(2)
    await drillIntoChild(page, 'Charlie')
    await expect(focusColumns(page)).toHaveCount(3)
  }

  test('every focus panel shows a header; only the active one is editable', async ({
    page,
  }) => {
    await buildChainAndDrill(page)

    // All three focus panels (Alpha, Bravo, Charlie) carry a header.
    await expect(page.getByTestId('focus-panel-label')).toHaveCount(3)

    // Exactly one editable header -- the active (rightmost) Charlie panel.
    await expect(page.getByTestId('focus-label-editor')).toHaveCount(1)
    await expect(async () => {
      const text = await page.getByTestId('focus-label-editor').textContent()
      expect(text).toContain('Charlie')
    }).toPass({ timeout: 5000 })

    // The two non-active panels render their header as a clickable collapse
    // target (a button, not an editor) titled with their own label.
    const collapseHeaders = page.locator('[data-collapsible="true"]')
    await expect(collapseHeaders).toHaveCount(2)
    const texts = await collapseHeaders.allTextContents()
    expect(texts.join(' | ')).toContain('Alpha')
    expect(texts.join(' | ')).toContain('Bravo')
  })

  test('clicking a non-active panel header collapses deeper panels and makes it active', async ({
    page,
  }) => {
    await buildChainAndDrill(page)

    // Click Alpha's (non-active) header -> collapse everything to its right.
    await page.locator('[data-collapsible="true"]').filter({ hasText: 'Alpha' }).click()

    await expect(focusColumns(page)).toHaveCount(1)
    // Alpha is now active: its header is the editable editor and no collapse
    // targets remain. (The collapse click itself does not enter edit mode --
    // the non-active header has no editor to focus.)
    await expect(page.locator('[data-collapsible="true"]')).toHaveCount(0)
    await expect(page.getByTestId('focus-label-editor')).toHaveCount(1)
    await expect(async () => {
      const text = await page.getByTestId('focus-label-editor').textContent()
      expect(text).toContain('Alpha')
    }).toPass({ timeout: 5000 })
  })

  test('collapsing to a middle panel keeps the panels at and left of it', async ({ page }) => {
    await buildChainAndDrill(page)

    // Click Bravo's (non-active, middle) header -> collapse only Charlie.
    await page.locator('[data-collapsible="true"]').filter({ hasText: 'Bravo' }).click()

    await expect(focusColumns(page)).toHaveCount(2)
    // Bravo is now active and editable; Alpha remains a collapse target.
    await expect(page.locator('[data-collapsible="true"]')).toHaveCount(1)
    await expect(async () => {
      const text = await page.getByTestId('focus-label-editor').textContent()
      expect(text).toContain('Bravo')
    }).toPass({ timeout: 5000 })
  })
})
