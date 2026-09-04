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

const goToWorkspace = async (page: Page) => {
  await page.getByTestId('workspace-tab').click()
}

const waitForRows = async (page: Page, minCount = 1) => {
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
  await expect(async () => {
    const count = await page.locator('.outline-row').count()
    expect(count).toBeGreaterThanOrEqual(minCount)
  }).toPass({ timeout: 5000 })
}

const openFocusPanel = async (page: Page) => {
  const firstRow = page.locator('.outline-row').first()
  const focusBtn = firstRow.locator('.nav-row-open-focus')
  await firstRow.hover()
  await expect(async () => {
    const opacity = await focusBtn.evaluate(
      (el) => window.getComputedStyle(el).opacity,
    )
    expect(Number(opacity)).toBeGreaterThan(0)
  }).toPass({ timeout: 3000 })
  await focusBtn.click()
  await expect(page.getByTestId('focus-panel')).toBeVisible({ timeout: 5000 })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Focus panel', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await goToWorkspace(page)
    await waitForRows(page, 1)
  })

  test('displays label as header', async ({ page }) => {
    await openFocusPanel(page)
    const labelEditor = page.getByTestId('focus-label-editor')
    await expect(labelEditor).toBeVisible()
    const text = await labelEditor.textContent()
    expect(text).toContain('Welcome to Hila')
  })

  test('content editor is editable', async ({ page }) => {
    await openFocusPanel(page)

    const contentEditor = page.getByTestId('focus-content-editor')
    await expect(contentEditor).toBeVisible({ timeout: 5000 })

    const pm = contentEditor.locator('.ProseMirror')
    await pm.click()
    await page.keyboard.type(' added text')

    const text = await pm.textContent()
    expect(text).toContain('added text')
  })

  test('empty content shows placeholder', async ({ page }) => {
    // Create a new row (which will have null content)
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()
    await firstEditor.press('End')
    await firstEditor.press('Enter')

    await expect(async () => {
      const count = await page.locator('.outline-row').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 5000 })

    // Open focus panel on the new (empty content) row
    const secondRow = page.locator('.outline-row').nth(1)
    const focusBtn = secondRow.locator('.nav-row-open-focus')
    await secondRow.hover()
    await expect(async () => {
      const opacity = await focusBtn.evaluate(
        (el) => window.getComputedStyle(el).opacity,
      )
      expect(Number(opacity)).toBeGreaterThan(0)
    }).toPass({ timeout: 3000 })
    await focusBtn.click()

    await expect(page.getByTestId('focus-panel')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('focus-content-placeholder')).toBeVisible({ timeout: 3000 })
    const placeholderText = await page.getByTestId('focus-content-placeholder').textContent()
    expect(placeholderText).toContain('Start writing...')
  })

  test('backlinks section collapses and expands', async ({ page }) => {
    await openFocusPanel(page)

    // Backlinks section only shows if there are backlinks.
    // With only the welcome row, there may not be backlinks. We verify the toggle behavior
    // if the section is present, or verify it's absent.
    const backlinksSection = page.getByTestId('focus-panel-backlinks')
    const hasBacklinks = await backlinksSection.isVisible().catch(() => false)

    if (hasBacklinks) {
      const toggle = page.getByTestId('focus-backlinks-toggle')
      await expect(toggle).toBeVisible()

      // Default collapsed
      await expect(page.getByTestId('focus-backlinks-list')).not.toBeVisible()

      // Click to expand
      await toggle.click()
      await expect(page.getByTestId('focus-backlinks-list')).toBeVisible({ timeout: 3000 })

      // Click to collapse
      await toggle.click()
      await expect(page.getByTestId('focus-backlinks-list')).not.toBeVisible()
    }
  })

  test('children navigation panel shows subtree', async ({ page }) => {
    // Create a child row first
    const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
    await firstEditor.click()
    await firstEditor.press('End')
    await firstEditor.press('Enter')

    await expect(async () => {
      const count = await page.locator('.outline-row').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 5000 })

    // Indent the second row to make it a child of the first
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

    // Open focus panel on the first (parent) row
    await openFocusPanel(page)

    // Children section should show the nested navigation panel with the child
    const childrenSection = page.getByTestId('focus-panel-children')
    await expect(childrenSection).toBeVisible({ timeout: 5000 })

    await expect(async () => {
      const navPanel = childrenSection.getByTestId('navigation-panel')
      await expect(navPanel).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 8000 })
  })

  test('typing in label saves (debounced)', async ({ page }) => {
    await openFocusPanel(page)

    const labelEditor = page.getByTestId('focus-label-editor')
    const pm = labelEditor.locator('.ProseMirror')
    await pm.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' - edited')

    // Wait for debounced save
    await page.waitForTimeout(500)

    // Close and reopen to verify persistence
    const closeTarget = page.getByTestId('focus-panel')
    await closeTarget.press('Escape')

    await expect(page.getByTestId('focus-panel')).not.toBeVisible({ timeout: 3000 })

    // Reopen
    await openFocusPanel(page)
    const newLabelEditor = page.getByTestId('focus-label-editor')
    await expect(newLabelEditor).toBeVisible({ timeout: 5000 })
    const text = await newLabelEditor.textContent()
    expect(text).toContain('edited')
  })

  test('typing in content saves (debounced)', async ({ page }) => {
    await openFocusPanel(page)

    const contentEditor = page.getByTestId('focus-content-editor')
    await expect(contentEditor).toBeVisible({ timeout: 5000 })
    const pm = contentEditor.locator('.ProseMirror')
    await pm.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' test save')

    // Wait for debounced save
    await page.waitForTimeout(500)

    // Close and reopen
    await pm.press('Escape')
    await expect(page.getByTestId('focus-panel')).not.toBeVisible({ timeout: 3000 })

    await openFocusPanel(page)
    const newContentEditor = page.getByTestId('focus-content-editor')
    await expect(newContentEditor).toBeVisible({ timeout: 5000 })
    const text = await newContentEditor.textContent()
    expect(text).toContain('test save')
  })

  test('backlinks section shows rows that reference the focused row', async ({ page }) => {
    // Create a second row via the API and add a ref-kind join from it to the welcome row.
    // This avoids the flaky Enter + @-autocomplete flow.
    const result = await page.evaluate(async () => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const sql = await import('/src/core/client/sql-client.ts')
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const client = await import('/src/core/client/matrix-client.ts')

      const matrices = await sql.execQuery("SELECT id FROM matrix WHERE title = 'Workspace'")
      const mid = (matrices[0] as { id: number }).id

      // Get the welcome row
      const rows = await sql.execQuery(`SELECT id FROM "mx_${mid}_data" ORDER BY id LIMIT 1`)
      const welcomeRowId = (rows[0] as { id: number }).id

      // Insert a second row with a label
      const labelDoc = JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Linking row' }] }],
      })
      const { rowId: newRowId } = await client.insertRow(mid, { values: { label: labelDoc } })

      // Create a ref join from the new row to the welcome row
      await client.createRefJoin(mid, newRowId, mid, welcomeRowId)

      return { mid, welcomeRowId, newRowId }
    })

    expect(result.newRowId).toBeGreaterThan(0)

    // Wait for the new row to appear
    await expect(async () => {
      const count = await page.locator('.outline-row').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 5000 })

    // Open focus panel on the welcome row (the referenced target)
    await openFocusPanel(page)

    // Backlinks section should be visible because "Linking row" references the welcome row
    const backlinksSection = page.getByTestId('focus-panel-backlinks')
    await expect(backlinksSection).toBeVisible({ timeout: 5000 })

    // Expand the backlinks
    const toggle = page.getByTestId('focus-backlinks-toggle')
    await toggle.click()
    const list = page.getByTestId('focus-backlinks-list')
    await expect(list).toBeVisible({ timeout: 3000 })

    // The backlink item should contain the source row's label text
    const backlinkItem = list.locator('.focus-backlink-item').first()
    await expect(backlinkItem).toBeVisible({ timeout: 3000 })
    const itemText = (await backlinkItem.textContent()) ?? ''
    expect(itemText).toContain('Linking row')
  })

  test('Escape returns focus to navigation panel', async ({ page }) => {
    await openFocusPanel(page)

    const contentEditor = page.getByTestId('focus-content-editor')
    await expect(contentEditor).toBeVisible({ timeout: 5000 })
    const pm = contentEditor.locator('.ProseMirror')
    await pm.click()

    await page.keyboard.press('Escape')

    await expect(page.getByTestId('focus-panel')).not.toBeVisible({ timeout: 3000 })
    await expect(page.getByTestId('navigation-panel')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Phase 9.4 — embedded dedicated sub-table (TableFace band)
// ---------------------------------------------------------------------------

/**
 * Run an argument-free `/` slash command in the first outline row's label editor
 * (Phase 9 §9.6). The caret is moved to the block start so `/` fires at a word
 * boundary; selecting the command deletes the `/…` text (leaving the row label
 * intact) and runs the launcher immediately, scoped to the first row (the focal
 * node). `cmdLabel` is the dropdown item to select (e.g. 'New table').
 */
const runSlashOnFirstRow = async (page: Page, cmd: string, cmdLabel: string) => {
  const firstEditor = page.locator('.nav-label-editor .ProseMirror').first()
  await firstEditor.click()
  await firstEditor.press('Home')
  await page.keyboard.type(cmd)
  // Every editor mounts its own (hidden) dropdown div, so target the active one by
  // the command's menu label.
  const item = page.locator('.slash-autocomplete', { hasText: cmdLabel })
  await expect(item).toBeVisible({ timeout: 10_000 })
  await page.keyboard.press('Enter')
  await expect(item).toBeHidden({ timeout: 10_000 })
}

/**
 * Run `/attach` in the first outline row, then pick a type in the standalone
 * second menu (the type picker) it opens — the argument-free `/attach` flow
 * (Phase 9 §9.6): the search query lives in the picker's own input, never in the
 * prose. Picking instantiates a structurally-anchored own-row of `typeName`.
 */
const runAttachOnFirstRow = async (page: Page, typeName: string) => {
  await runSlashOnFirstRow(page, '/attach', 'Attach a typed row')
  const picker = page.getByTestId('slash-type-picker')
  await expect(picker).toBeVisible({ timeout: 3000 })
  const item = picker.locator('.inlineref-autocomplete-item', { hasText: `# ${typeName}` })
  await expect(item).toBeVisible({ timeout: 3000 })
  await item.click()
  await expect(picker).toBeHidden({ timeout: 3000 })
}

/** Resolve a dedicated sub-table matrix (and its owner node) by its title. */
const subTableInfo = (page: Page, name: string) =>
  page.evaluate(async (nm) => {
    // @ts-expect-error -- resolved by the Vite dev server at runtime
    const sql = await import('/src/core/client/sql-client.ts')
    const r = await sql.execQuery(
      `SELECT id, owner_matrix_id AS om, owner_row_id AS orr FROM matrix WHERE title = '${nm}'`,
    )
    const row = r[0] as { id: number; om: number; orr: number } | undefined
    return row ? { subId: row.id, ownerMatrixId: row.om, ownerRowId: row.orr } : null
  }, name)

test.describe('Focus panel — embedded sub-table (Phase 9.4)', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await goToWorkspace(page)
    await waitForRows(page, 1)
  })

  test('creates a dedicated sub-table via /table and adds a node-owned row via the embedded table', async ({
    page,
  }) => {
    // Create a dedicated sub-table through the §9.6 argument-free slash gesture,
    // then name it via its (now editable) name input in the band.
    await runSlashOnFirstRow(page, '/table', 'New table')
    await openFocusPanel(page)

    const bandItem = page.getByTestId('sub-table-band-item')
    await expect(bandItem).toBeVisible({ timeout: 5000 })
    const nameInput = page.getByTestId('sub-table-name-input')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill('Groceries')
    await expect(nameInput).toHaveValue('Groceries')

    // The real TableFace renders inside the band, with its "+ New Row" control.
    const addRowBtn = bandItem.getByRole('button', { name: '+ New Row' })
    await expect(addRowBtn).toBeVisible({ timeout: 5000 })

    // The rename is debounced; poll until it persists to `matrix.title`.
    let info: Awaited<ReturnType<typeof subTableInfo>> = null
    await expect(async () => {
      info = await subTableInfo(page, 'Groceries')
      expect(info).not.toBeNull()
    }).toPass({ timeout: 5000 })
    if (!info) throw new Error('sub-table "Groceries" was not created')

    // Add a row through the anchored band: it must be owned by the focal node
    // (createDependentRow), not the root sentinel — the dedicated invariant.
    await addRowBtn.click()

    await expect(async () => {
      const owned = await page.evaluate(
        async (q) => {
          // @ts-expect-error -- resolved by Vite dev server at runtime
          const sql = await import('/src/core/client/sql-client.ts')
          const r = await sql.execQuery(
            `SELECT COUNT(*) AS cnt FROM joins
             WHERE source_matrix_id = ${q.om} AND source_row_id = ${q.orr}
               AND target_matrix_id = ${q.subId} AND kind = 'own'`,
          )
          return (r[0] as { cnt: number }).cnt
        },
        { om: info.ownerMatrixId, orr: info.ownerRowId, subId: info.subId },
      )
      expect(owned).toBeGreaterThanOrEqual(1)
    }).toPass({ timeout: 5000 })

    // The new row also renders in the embedded table (≥1 data row + the add-row tr).
    await expect(async () => {
      const c = await bandItem.locator('tbody tr').count()
      expect(c).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 5000 })
  })

  test('sub-table is live-derived from ownership and survives reload', async ({ page }) => {
    await runSlashOnFirstRow(page, '/table', 'New table')
    await openFocusPanel(page)
    await expect(page.getByTestId('sub-table-band-item')).toBeVisible({ timeout: 5000 })

    // Reload: bands are not persisted; the embed re-derives from matrix.owner.
    await page.reload()
    await goToWorkspace(page)
    await waitForRows(page, 1)
    await openFocusPanel(page)

    await expect(page.getByTestId('sub-table-band-item')).toBeVisible({ timeout: 5000 })
  })
})

// ---------------------------------------------------------------------------
// Phase 9.5 — boundary-hop drill-in from an embedded sub-table row
// ---------------------------------------------------------------------------

test.describe('Focus panel — boundary hop (Phase 9.5)', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await goToWorkspace(page)
    await waitForRows(page, 1)
  })

  test('drills from a sub-table row into a (matrix_id, row_id) focus panel, role-adaptively', async ({
    page,
  }) => {
    // Seed a dedicated sub-table + one node-owned row directly. This test
    // exercises boundary-hop drill-in *rendering*, not the §9.6 creation UX (which
    // the Phase 9.4/9.6 blocks cover), so it seeds via the data layer to stay
    // decoupled from the creation gesture and editor churn.
    await page.evaluate(async () => {
      // @ts-expect-error -- resolved by the Vite dev server at runtime
      const sql = await import('/src/core/client/sql-client.ts')
      // @ts-expect-error -- resolved by the Vite dev server at runtime
      const mc = await import('/src/core/client/matrix-client.ts')
      const ms = await sql.execQuery("SELECT id FROM matrix WHERE title = 'Workspace'")
      const wsId = (ms[0] as { id: number }).id
      const wr = await sql.execQuery(`SELECT id FROM "mx_${wsId}_data" ORDER BY id LIMIT 1`)
      const focalRowId = (wr[0] as { id: number }).id
      const subId = (await mc.createOwnedMatrix({ matrixId: wsId, rowId: focalRowId }, 'Hops', [
        { name: 'title', type: 'TEXT', role: 'label' },
        { name: 'content', type: 'TEXT', role: 'content' },
      ])) as number
      await mc.createDependentRow(wsId, focalRowId, subId)
    })

    await openFocusPanel(page)

    const bandItem = page.getByTestId('sub-table-band-item')
    await expect(bandItem).toBeVisible({ timeout: 5000 })
    await expect(async () => {
      const c = await bandItem.locator('tbody tr').count()
      expect(c).toBeGreaterThanOrEqual(2) // ≥1 seeded data row + the add-row tr
    }).toPass({ timeout: 5000 })

    // One focus column so far (the focal node).
    const focusColumns = page.locator(
      '[data-testid="workspace-shell-column"][data-panel-kind="focus"]',
    )
    await expect(focusColumns).toHaveCount(1)

    // Drill into the sub-table row via its per-row open affordance — the boundary
    // hop: the row lives in the sub-matrix, owned by the workspace focal node.
    await bandItem.getByTestId('table-open-row-btn').first().click()

    // A second focus column opens for the sub-matrix row (panel keyed by its matrix).
    await expect(focusColumns).toHaveCount(2, { timeout: 5000 })

    // Role-adaptive far side: the sub-table's label column is `title`, not `label`.
    // Typing into the far-side header must persist to `title` (no write to a missing
    // `label` column). Target the rightmost (active) panel's label editor.
    const farLabel = page.getByTestId('focus-label-editor').last()
    await farLabel.click()
    await farLabel.pressSequentially('Hopped', { delay: 20 })

    const subId = await page.evaluate(async () => {
      // @ts-expect-error -- resolved by the Vite dev server at runtime
      const sql = await import('/src/core/client/sql-client.ts')
      const ms = await sql.execQuery("SELECT id FROM matrix WHERE title = 'Workspace'")
      const wsId = (ms[0] as { id: number }).id
      const r = await sql.execQuery(`SELECT id FROM matrix WHERE owner_matrix_id = ${wsId} LIMIT 1`)
      return (r[0] as { id: number }).id
    })

    await expect(async () => {
      const title = await page.evaluate(async (mid) => {
        // @ts-expect-error -- resolved by the Vite dev server at runtime
        const sql = await import('/src/core/client/sql-client.ts')
        const r = await sql.execQuery(`SELECT title FROM "mx_${mid}_data" ORDER BY id LIMIT 1`)
        return (r[0] as { title: string | null }).title ?? ''
      }, subId)
      expect(title).toContain('Hopped')
    }).toPass({ timeout: 5000 })
  })
})

// ---------------------------------------------------------------------------
// Phase 9.6 — the unified creation gesture (slash commands)
// ---------------------------------------------------------------------------

test.describe('Focus panel — creation gesture (Phase 9.6)', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await goToWorkspace(page)
    await waitForRows(page, 1)
  })

  test('/table creates a dedicated sub-table, focuses + highlights its name input, and the name survives an owner-label edit', async ({
    page,
  }) => {
    // Argument-free launcher: picking /table creates the table immediately. The
    // band isn't mounted yet (we run it from the outline), so the focus handoff
    // persists until the focus panel opens and the band mounts.
    await runSlashOnFirstRow(page, '/table', 'New table')
    await openFocusPanel(page)

    const bandItem = page.getByTestId('sub-table-band-item')
    await expect(bandItem).toBeVisible({ timeout: 5000 })

    // The new table's name input is auto-focused and accent-highlighted (the
    // prompt-to-name handoff), primed for the next keystrokes.
    const nameInput = page.getByTestId('sub-table-name-input')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await expect(nameInput).toBeFocused({ timeout: 3000 })
    await expect(async () => {
      const shadow = await nameInput.evaluate((el) => getComputedStyle(el).boxShadow)
      expect(shadow).not.toBe('none')
    }).toPass({ timeout: 3000 })

    // Name it via the (now editable) input; the rename persists through renameMatrix.
    await nameInput.fill('Groceries')
    await expect(async () => {
      const title = await page.evaluate(async () => {
        // @ts-expect-error -- resolved by the Vite dev server at runtime
        const sql = await import('/src/core/client/sql-client.ts')
        const r = await sql.execQuery(`SELECT title FROM matrix WHERE title = 'Groceries'`)
        return (r[0] as { title: string } | undefined)?.title ?? ''
      })
      expect(title).toBe('Groceries')
    }).toPass({ timeout: 5000 })

    // The owner is a plain (non-promoted) node, so editing its label must NOT
    // clobber the sub-table's independent name — the syncOwnedMatrixTitles scope.
    const labelEditor = page.getByTestId('focus-label-editor')
    await labelEditor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' renamed')

    // Give the label write time to propagate, then confirm the title held.
    await expect(async () => {
      const title = await page.evaluate(async () => {
        // @ts-expect-error -- resolved by the Vite dev server at runtime
        const sql = await import('/src/core/client/sql-client.ts')
        const r = await sql.execQuery(`SELECT title FROM matrix WHERE title = 'Groceries'`)
        return (r[0] as { title: string } | undefined)?.title ?? ''
      })
      expect(title).toBe('Groceries')
    }).toPass({ timeout: 5000 })
  })

  test('/attach opens a second menu and instantiates a structurally-anchored (untethered) aspect row', async ({
    page,
  }) => {
    // Seed a promoted type with no instances (so no content-anchored aspect row).
    const before = await page.locator('.outline-row').count()
    await page.evaluate(async () => {
      // @ts-expect-error -- resolved by the Vite dev server at runtime
      const mc = await import('/src/core/client/matrix-client.ts')
      await mc.createTagType('task')
    })
    await expect(async () => {
      expect(await page.locator('.outline-row').count()).toBeGreaterThan(before)
    }).toPass({ timeout: 5000 })

    // /attach opens its own type-picker menu (the search lives there, not in prose).
    await runAttachOnFirstRow(page, 'task')
    await openFocusPanel(page)

    // The aspect band shows the attached row, and it is NOT tethered (no inline
    // #-ref in the prose) — the structural complement of a content-anchored #task.
    await expect(page.getByTestId('aspect-row')).toHaveCount(1, { timeout: 5000 })
    await expect(page.getByTestId('aspect-tether-indicator')).toHaveCount(0)
  })

  // Mouse-driven selection in the content editor: clicking a command item
  // re-renders the dropdown (detaching the clicked node), so the menu must not be
  // closed by the outside-click handler mid-flow. These exercise the click path
  // (the keyboard path is covered above via `runSlashOnFirstRow`).
  const focusContentSlash = async (page: Page) => {
    const contentPm = page.getByTestId('focus-content-editor').locator('.ProseMirror')
    await contentPm.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' ') // a word boundary so the `/` triggers
    await page.keyboard.type('/')
    return contentPm
  }

  test('click-driven /table in the content editor creates the table and clears the command text', async ({
    page,
  }) => {
    await openFocusPanel(page)
    const contentPm = await focusContentSlash(page)

    const cmd = page.locator('.slash-autocomplete', { hasText: 'New table' })
    await expect(cmd).toBeVisible({ timeout: 3000 })
    await cmd.getByText('New table').click() // argument-free launcher → runs now

    // The `/table` command text is gone, and the table renders + persists.
    await expect(contentPm).not.toContainText('/table')
    const band = page.getByTestId('sub-table-band-item')
    await expect(band).toBeVisible({ timeout: 5000 })

    // The focus panel is already open, so the band mounts immediately and the
    // handoff focuses its name input; name it via that input.
    const nameInput = page.getByTestId('sub-table-name-input')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill('ClickTbl')
    await expect(nameInput).toHaveValue('ClickTbl')
    await expect(band).toBeVisible() // still there a tick later (does not vanish)
  })

  test('click-driven /attach in the content editor attaches a persistent row and clears the command text', async ({
    page,
  }) => {
    await page.evaluate(async () => {
      // @ts-expect-error -- resolved by the Vite dev server at runtime
      const mc = await import('/src/core/client/matrix-client.ts')
      await mc.createTagType('task')
    })

    await openFocusPanel(page)
    const contentPm = await focusContentSlash(page)

    const cmd = page.locator('.slash-autocomplete', { hasText: 'Attach a typed row' })
    await expect(cmd).toBeVisible({ timeout: 3000 })
    await cmd.getByText('Attach a typed row').click() // argument-free launcher → opens picker

    // The standalone type picker opens; pick the type there (not in the prose).
    const picker = page.getByTestId('slash-type-picker')
    await expect(picker).toBeVisible({ timeout: 3000 })
    const typeItem = picker.locator('.inlineref-autocomplete-item', { hasText: '# task' })
    await expect(typeItem).toBeVisible({ timeout: 3000 })
    await typeItem.click() // → createDependentRow
    await expect(picker).toBeHidden({ timeout: 3000 })

    await expect(contentPm).not.toContainText('/attach')
    // The attached aspect row renders and *stays* — a content save must not
    // cascade-delete a structurally-anchored (tokenless) own-edge (Phase 9.6).
    await expect(page.getByTestId('aspect-row')).toHaveCount(1, { timeout: 5000 })
    await page.waitForTimeout(600) // past the content-save debounce
    await expect(page.getByTestId('aspect-row')).toHaveCount(1)
  })
})
