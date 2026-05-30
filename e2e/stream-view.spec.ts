import { test, expect, type Page } from '@playwright/test'

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
    const opacity = await focusBtn.evaluate(
      (el) => window.getComputedStyle(el).opacity,
    )
    expect(Number(opacity)).toBeGreaterThan(0)
  }).toPass({ timeout: 3000 })
  await focusBtn.click()
  await expect(page.getByTestId('focus-panel')).toBeVisible({ timeout: 5000 })
}

const rowEditorAt = (page: Page, i: number) =>
  page.locator('.outline-row').nth(i).locator('.nav-label-editor .ProseMirror')

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
  const children = page.getByTestId('stream-focus-column').last().getByTestId('focus-panel-children')
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
    const streamView = page.getByTestId('stream-view')
    await expect(streamView).toBeVisible()

    const navColumns = page.getByTestId('stream-nav-column')
    await expect(navColumns).toHaveCount(1)

    const focusColumns = page.getByTestId('stream-focus-column')
    await expect(focusColumns).toHaveCount(0)

    await expect(page.getByTestId('navigation-panel')).toBeVisible()
  })

  test('click right-arrow opens focus panel to the right', async ({ page }) => {
    await openFocusPanelOnRow(page, 0)

    const navColumns = page.getByTestId('stream-nav-column')
    await expect(navColumns).toHaveCount(1)

    const focusColumns = page.getByTestId('stream-focus-column')
    await expect(focusColumns).toHaveCount(1)

    const labelEditor = page.getByTestId('focus-label-editor')
    await expect(labelEditor).toBeVisible()
    const text = await labelEditor.textContent()
    expect(text).toContain('Welcome to Hila')
  })

  test('click right-arrow on child in nested nav panel appends a new focus column', async ({ page }) => {
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
      const opacity = await childFocusBtn.evaluate(
        (el) => window.getComputedStyle(el).opacity,
      )
      expect(Number(opacity)).toBeGreaterThan(0)
    }).toPass({ timeout: 3000 })
    await childFocusBtn.click()

    // A second focus panel should appear showing the child
    await expect(async () => {
      const focusColumns = page.getByTestId('stream-focus-column')
      await expect(focusColumns).toHaveCount(2)
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
    await expect(page.getByTestId('stream-focus-column')).toHaveCount(0)

    // Press Cmd/Ctrl+L
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${modifier}+l`)

    // Focus panel should open
    await expect(page.getByTestId('focus-panel')).toBeVisible({ timeout: 5000 })
    const focusColumns = page.getByTestId('stream-focus-column')
    await expect(focusColumns).toHaveCount(1)
  })

  test('Cmd+Left closes rightmost panel', async ({ page }) => {
    // Open a focus panel first
    await openFocusPanelOnRow(page, 0)
    await expect(page.getByTestId('stream-focus-column')).toHaveCount(1)

    // Press Cmd+Left (Meta+ArrowLeft)
    await page.keyboard.press('Meta+ArrowLeft')

    // Focus panel should be closed
    await expect(page.getByTestId('stream-focus-column')).toHaveCount(0)

    // Navigation panel should still be visible
    await expect(page.getByTestId('stream-nav-column')).toHaveCount(1)
    await expect(page.getByTestId('navigation-panel')).toBeVisible()
  })

  test('gap ancestor cards appear between panels when a deeper descendant is focused', async ({ page }) => {
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
    await expect(page.getByTestId('stream-focus-column')).toHaveCount(1)

    // No gap cards yet -- the focus panel's row is the leftmost (top-level) node.
    await expect(page.getByTestId('card-ancestor')).toHaveCount(0)

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
    await expect(page.getByTestId('stream-focus-column')).toHaveCount(2)

    // The skipped "Child" level is now rendered as a gap ancestor card + tab
    // between the two focus panels.
    await expect(async () => {
      const ancestorCount = await page.getByTestId('card-ancestor').count()
      expect(ancestorCount).toBeGreaterThanOrEqual(1)
    }).toPass({ timeout: 5000 })

    await expect(async () => {
      const tabTexts = await page.getByTestId('card-tab').allTextContents()
      expect(tabTexts.join(' | ')).toContain('Child')
    }).toPass({ timeout: 5000 })
  })

  test('total column count stays within limit of 4', async ({ page }) => {
    // Start with 1 nav column
    await expect(page.getByTestId('stream-nav-column')).toHaveCount(1)

    // Open a focus panel (2 columns: nav + focus)
    await openFocusPanelOnRow(page, 0)
    await expect(page.getByTestId('stream-focus-column')).toHaveCount(1)

    // Total columns = 2 (1 nav + 1 focus)
    const totalBefore = await page.locator('[data-testid="stream-nav-column"], [data-testid="stream-focus-column"]').count()
    expect(totalBefore).toBe(2)
  })
})

test.describe('Stream view: clickable ancestor tabs', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForRows(page, 1)
    // The dev-tools sidebar overlaps the far-right/deep focus columns these
    // tests exercise; close it so card-tab and row interactions aren't blocked.
    await closeSidebar(page)
  })

  test('clicking an ancestor tab focuses that ancestor and replaces deeper panels', async ({ page }) => {
    // Chain Alpha > Bravo > Charlie (distinct, non-substring names so tab/label
    // filters are unambiguous).
    await buildLinearChain(page, ['Alpha', 'Bravo', 'Charlie'])

    // Focus Alpha, then drill straight to Charlie (skipping Bravo) so Bravo is
    // rendered as a gap ancestor tab between the two focus panels.
    await openFocusPanelOnRow(page, 0)
    await expect(page.getByTestId('stream-focus-column')).toHaveCount(1)
    await drillIntoChild(page, 'Charlie')
    await expect(page.getByTestId('stream-focus-column')).toHaveCount(2)

    const bravoTab = page.getByTestId('card-tab').filter({ hasText: 'Bravo' })
    await expect(bravoTab).toBeVisible({ timeout: 5000 })

    // Click the Bravo tab -> Bravo becomes the rightmost focused card and the
    // deeper Charlie panel is replaced.
    await bravoTab.click()

    await expect(async () => {
      const text = await page.getByTestId('focus-label-editor').last().textContent()
      expect(text).toContain('Bravo')
    }).toPass({ timeout: 5000 })

    // Still two focus columns (Alpha, Bravo); no gap ancestor cards remain.
    await expect(page.getByTestId('stream-focus-column')).toHaveCount(2)
    await expect(page.getByTestId('card-ancestor')).toHaveCount(0)
  })

  test('clicking the workspace-title tab returns to the root navigation panel', async ({ page }) => {
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

    // Nav panel has been shifted off; the workspace-title tab is now present.
    await expect(page.getByTestId('stream-nav-column')).toHaveCount(0)
    const titleTab = page.getByTestId('card-tab').filter({ hasText: 'Workspace' })
    await expect(titleTab).toBeVisible({ timeout: 5000 })

    // Clicking it returns to the root navigation panel.
    await titleTab.click()

    await expect(page.getByTestId('stream-focus-column')).toHaveCount(0)
    await expect(page.getByTestId('stream-nav-column')).toHaveCount(1)
    await expect(page.getByTestId('navigation-panel')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('workspace-title-editor')).toBeVisible({ timeout: 5000 })
  })
})
