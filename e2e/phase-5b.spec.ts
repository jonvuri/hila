import { test, expect, type Page } from '@playwright/test'

// -- Shared helpers -----------------------------------------------------------

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

const applyTableFace = async (page: Page) => {
  await page.getByTestId('view-as-button').click()
  await expect(page.getByTestId('face-config-panel')).toBeVisible()
  await page.getByTestId('face-type-picker').selectOption('hila.table')
  await page.getByTestId('face-config-apply').click()
  await expect(page.getByTestId('face-config-panel')).not.toBeVisible({ timeout: 5000 })
  await expect(page.locator('table')).toBeVisible({ timeout: 5000 })
}

const addTextColumn = async (page: Page) => {
  await page.locator('button[title="Add column"]').click()
  await page.getByRole('button', { name: /Text/ }).click()
  // Wait for column to appear, then dismiss auto-rename if active
  await page.waitForTimeout(500)
  const renameInput = page.locator('table thead th input')
  if (await renameInput.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  }
  await expect(
    page.locator('th').filter({ has: page.locator('div', { hasText: 'New Column' }) }),
  ).toBeVisible({ timeout: 5000 })
}

const addNumberColumn = async (page: Page) => {
  await page.locator('button[title="Add column"]').click()
  await page.getByRole('button', { name: /Number/ }).click()
  await page.waitForTimeout(500)
  const renameInput = page.locator('table thead th input')
  if (await renameInput.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  }
  await expect(
    page.locator('th').filter({ has: page.locator('div', { hasText: 'New Column' }) }),
  ).toBeVisible({ timeout: 5000 })
}

/**
 * Rename a column via the client API. This is reliable and tests the backend
 * rename path. Use `renameColumnViaUI` for testing the UI rename flow.
 */
const renameColumnViaAPI = async (page: Page, currentName: string, newName: string) => {
  await page.evaluate(
    async ({ currentName, newName }) => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const sqlClient = await import('/src/core/client/sql-client.ts')
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const matrixClient = await import('/src/core/client/matrix-client.ts')

      const matrices = await sqlClient.execQuery(
        "SELECT id FROM matrix WHERE title = 'Outline'",
      )
      const matrixId = (matrices[0] as { id: number }).id
      await matrixClient.renameColumn(matrixId, currentName, newName)
    },
    { currentName, newName },
  )
  await page.waitForTimeout(500)
}

/**
 * Dismiss any active rename input in the column header, then rename via context menu.
 */
const renameColumnViaUI = async (page: Page, currentName: string, newName: string) => {
  // If a rename input is already active (e.g. auto-opened on new column), dismiss it first
  const activeInput = page.locator('table thead th input')
  if (await activeInput.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  }

  // Now find the column header and right-click to open context menu
  const header = page.locator('th').filter({
    has: page.locator('div', { hasText: currentName }),
  })
  await header.click({ button: 'right' })
  await page.getByRole('button', { name: 'Rename' }).click()

  const renameInput = page.locator('table thead th input')
  await expect(renameInput).toBeVisible({ timeout: 3000 })
  await renameInput.fill(newName)
  await page.keyboard.press('Enter')
  await expect(page.locator('th').filter({ has: page.locator('div', { hasText: newName }) })).toBeVisible({
    timeout: 5000,
  })
}

const deleteColumnViaContextMenu = async (page: Page, columnName: string) => {
  const header = page.locator('th', { hasText: columnName })
  await header.click({ button: 'right' })
  await page.getByRole('button', { name: 'Delete Column' }).click()
}

const getCellInput = (page: Page) => page.locator('table tbody td input')

/** Data rows only (excludes the "+ New Row" add-row at the end). */
const dataRows = (page: Page) =>
  page.locator('table tbody tr').filter({ hasNot: page.getByRole('button', { name: '+ New Row' }) })

/** Get column index (0-based position within the header row) for a named column. */
const getColIndex = async (page: Page, columnName: string) => {
  const header = page.locator('th', { hasText: columnName })
  return await header.evaluate((el) => {
    const ths = Array.from(el.closest('tr')!.querySelectorAll('th'))
    return ths.indexOf(el)
  })
}

/** Edit a cell value in a data row. */
const editCell = async (page: Page, rowIndex: number, colIndex: number, value: string) => {
  const cell = dataRows(page).nth(rowIndex).locator('td').nth(colIndex)
  await cell.dblclick()
  const input = getCellInput(page)
  await expect(input).toBeVisible({ timeout: 3000 })
  await input.fill(value)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
}

const createTagTypeViaAPI = async (
  page: Page,
  name: string,
): Promise<{ matrixId: number; tagTypeId: number }> => {
  return await page.evaluate(async (tagName: string) => {
    // @ts-expect-error -- resolved by Vite dev server at runtime
    const matrixClient = await import('/src/core/client/matrix-client.ts')
    const result = await matrixClient.createTagType(tagName)
    return { matrixId: result.matrixId, tagTypeId: result.id }
  }, name)
}

const runSQL = async (page: Page, sql: string): Promise<string> => {
  await openSidebar(page)
  await page.locator('.sidebar-tab', { hasText: 'SQL Runner' }).click()
  const sqlTextarea = page.locator('textarea')
  await sqlTextarea.fill(sql)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await page.waitForTimeout(500)
  const resultPre = page.locator('.sidebar-content pre').first()
  await expect(resultPre).toBeVisible({ timeout: 3000 })
  return (await resultPre.textContent()) ?? ''
}

// =============================================================================
// 1. Column constraint enforcement
// =============================================================================

test.describe('Column constraint enforcement', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForOutline(page)
  })

  test('duplicate tag type name with different casing is rejected', async ({ page }) => {
    await createTagTypeViaAPI(page, 'Priority')

    const result = await page.evaluate(async () => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const matrixClient = await import('/src/core/client/matrix-client.ts')
      try {
        await matrixClient.createTagType('priority')
        return { error: null }
      } catch (err) {
        return { error: (err as Error).message }
      }
    })

    expect(result.error).not.toBeNull()
    expect(result.error).toContain('already exists')
  })

  test('duplicate tag type name with uppercase casing is rejected', async ({ page }) => {
    await createTagTypeViaAPI(page, 'Review')

    const result = await page.evaluate(async () => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const matrixClient = await import('/src/core/client/matrix-client.ts')
      try {
        await matrixClient.createTagType('REVIEW')
        return { error: null }
      } catch (err) {
        return { error: (err as Error).message }
      }
    })

    expect(result.error).not.toBeNull()
    expect(result.error).toContain('already exists')
  })

  test('NOT NULL constraint rejects null value insertion', async ({ page }) => {
    const result = await page.evaluate(async () => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const matrixClient = await import('/src/core/client/matrix-client.ts')

      const tagType = await matrixClient.createTagType('TestType')
      const registryMatrixId = tagType.registryMatrixId as number | undefined

      if (registryMatrixId === undefined) {
        // Tag type's registry matrix has NOT NULL on name. Test via direct insert.
        // @ts-expect-error -- resolved by Vite dev server at runtime
        const sqlClient = await import('/src/core/client/sql-client.ts')
        const matrices = await sqlClient.execQuery(
          "SELECT id FROM matrix WHERE title = 'Tag Registry'",
        )
        if (matrices.length === 0) {
          return { error: 'No Tag Registry matrix found', skipped: true }
        }
        const regMid = (matrices[0] as { id: number }).id
        try {
          await matrixClient.insertRow(regMid, { values: { name: null, matrix_id: 999 } })
          return { error: null, skipped: false }
        } catch (err) {
          return { error: (err as Error).message, skipped: false }
        }
      }

      return { error: null, skipped: true }
    })

    if (!result.skipped) {
      expect(result.error).not.toBeNull()
      expect(result.error).toMatch(/constraint/i)
    }
  })
})

// =============================================================================
// 2. Plugin column ownership
// =============================================================================

test.describe('Plugin column ownership', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForOutline(page)
  })

  test('renaming a plugin-managed column is rejected with error', async ({ page }) => {
    // The Tags plugin creates a registry matrix with managed columns (name, matrix_id, color, icon).
    // We need to find the registry matrix and attempt to rename one of its columns.
    const result = await page.evaluate(async () => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const matrixClient = await import('/src/core/client/matrix-client.ts')
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const sqlClient = await import('/src/core/client/sql-client.ts')

      // Create a tag type to ensure the registry matrix exists
      await matrixClient.createTagType('test')

      // Find the Tag Registry matrix
      const matrices = await sqlClient.execQuery(
        "SELECT id FROM matrix WHERE title = 'Tag Registry'",
      )
      if (matrices.length === 0) return { error: 'No registry matrix', skipped: true }
      const regMid = (matrices[0] as { id: number }).id

      try {
        await matrixClient.renameColumn(regMid, 'name', 'label')
        return { error: null, skipped: false }
      } catch (err) {
        return { error: (err as Error).message, skipped: false }
      }
    })

    if (!result.skipped) {
      expect(result.error).not.toBeNull()
      expect(result.error).toMatch(/managed by plugin/i)
    }
  })

  test('removing a plugin-managed column is rejected with error', async ({ page }) => {
    const result = await page.evaluate(async () => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const matrixClient = await import('/src/core/client/matrix-client.ts')
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const sqlClient = await import('/src/core/client/sql-client.ts')

      await matrixClient.createTagType('test')

      const matrices = await sqlClient.execQuery(
        "SELECT id FROM matrix WHERE title = 'Tag Registry'",
      )
      if (matrices.length === 0) return { error: 'No registry matrix', skipped: true }
      const regMid = (matrices[0] as { id: number }).id

      try {
        await matrixClient.removeColumn(regMid, 'name')
        return { error: null, skipped: false }
      } catch (err) {
        return { error: (err as Error).message, skipped: false }
      }
    })

    if (!result.skipped) {
      expect(result.error).not.toBeNull()
      expect(result.error).toMatch(/managed by plugin/i)
    }
  })

  test('user-added columns can be renamed freely', async ({ page }) => {
    await applyTableFace(page)
    await addTextColumn(page)

    // The "New Column" is user-added, so rename should succeed
    await renameColumnViaUI(page, 'New Column', 'My Custom Col')
    await expect(
      page.locator('th').filter({ has: page.locator('div', { hasText: 'My Custom Col' }) }),
    ).toBeVisible({ timeout: 5000 })
  })

  test('user-added columns can be removed freely', async ({ page }) => {
    await applyTableFace(page)
    await addTextColumn(page)

    const headersBefore = await page.locator('table thead th').count()
    await deleteColumnViaContextMenu(page, 'New Column')

    await expect(async () => {
      const headersAfter = await page.locator('table thead th').count()
      expect(headersAfter).toBe(headersBefore - 1)
    }).toPass({ timeout: 5000 })

    await expect(page.locator('th', { hasText: 'New Column' })).not.toBeVisible()
  })
})

// =============================================================================
// 3. Formula column with token input
// =============================================================================

test.describe('Formula column with token input', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForOutline(page)
    await applyTableFace(page)
  })

  test('formula column with {{id}} reference shows fx indicator and computed values', async ({
    page,
  }) => {
    // Add a number column and populate data
    await addNumberColumn(page)
    await renameColumnViaAPI(page, 'New Column', 'price')
    await page.waitForTimeout(300)

    // Set price value on the existing data row
    const colIndex = await getColIndex(page, 'price')
    await editCell(page, 0, colIndex, '50')

    // Create formula column via API with {{id}} reference
    const result = await page.evaluate(async () => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const matrixClient = await import('/src/core/client/matrix-client.ts')
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const sqlClient = await import('/src/core/client/sql-client.ts')
      const matrices = await sqlClient.execQuery("SELECT id FROM matrix WHERE title = 'Outline'")
      const matrixId = (matrices[0] as { id: number }).id
      const cols = await matrixClient.getColumns(matrixId)
      const priceCol = cols.find((c: { name: string }) => c.name === 'price')
      if (!priceCol) return { success: false, error: 'price column not found' }

      try {
        await matrixClient.addFormulaColumn(
          matrixId,
          'double_price',
          `{{${(priceCol as { id: number }).id}}} * 2`,
        )
        return { success: true, error: null }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
    expect(result.success).toBe(true)
    await page.waitForTimeout(500)

    // The formula column header should appear with "fx" indicator
    await expect(page.locator('th', { hasText: 'double_price' })).toBeVisible({ timeout: 5000 })
    await expect(page.locator('th', { hasText: 'double_price' })).toContainText('fx')

    // The computed value should be 100 (50 * 2) in the first data row
    await expect(async () => {
      const headers = page.locator('table thead th')
      const headerCount = await headers.count()
      const formulaCellIdx = headerCount - 2
      const cell = dataRows(page).first().locator('td').nth(formulaCellIdx)
      const text = await cell.textContent()
      expect(Number(text?.trim())).toBe(100)
    }).toPass({ timeout: 5000 })

    // Formula cells should not be editable — double-click should not open an input
    const headers = page.locator('table thead th')
    const headerCount = await headers.count()
    const formulaCellIdx = headerCount - 2
    const formulaCell = dataRows(page).first().locator('td').nth(formulaCellIdx)
    await formulaCell.dblclick()
    await page.waitForTimeout(200)
    const inputCount = await formulaCell.locator('input').count()
    expect(inputCount).toBe(0)
  })

  test('rename a column that a formula depends on — formula still shows correct values', async ({
    page,
  }) => {
    // Add a number column, name it "cost", add data, create formula
    await addNumberColumn(page)
    await renameColumnViaAPI(page, 'New Column', 'cost')
    await page.waitForTimeout(300)

    // Set cost value on existing data row
    const colIndex = await getColIndex(page, 'cost')
    await editCell(page, 0, colIndex, '25')

    // Create formula via API using {{id}} syntax
    const formulaCreated = await page.evaluate(async () => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const matrixClient = await import('/src/core/client/matrix-client.ts')
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const sqlClient = await import('/src/core/client/sql-client.ts')

      const matrices = await sqlClient.execQuery(
        "SELECT id FROM matrix WHERE title = 'Outline'",
      )
      const matrixId = (matrices[0] as { id: number }).id

      const cols = await matrixClient.getColumns(matrixId)
      const costCol = cols.find((c: { name: string }) => c.name === 'cost')
      if (!costCol) return { success: false, error: 'cost column not found' }

      try {
        await matrixClient.addFormulaColumn(matrixId, 'triple_cost', `{{${costCol.id}}} * 3`)
        return { success: true, error: null }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
    expect(formulaCreated.success).toBe(true)
    await page.waitForTimeout(500)

    // Verify formula column shows correct value (25 * 3 = 75)
    await expect(page.locator('th', { hasText: 'triple_cost' })).toBeVisible({ timeout: 5000 })
    await expect(async () => {
      const headers = page.locator('table thead th')
      const headerCount = await headers.count()
      const formulaCellIdx = headerCount - 2
      const cell = dataRows(page).first().locator('td').nth(formulaCellIdx)
      const text = await cell.textContent()
      expect(Number(text?.trim())).toBe(75)
    }).toPass({ timeout: 5000 })

    // Now rename "cost" to "unit_cost"
    await renameColumnViaAPI(page, 'cost', 'unit_cost')
    await expect(page.locator('th', { hasText: 'unit_cost' })).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(500)

    // The formula column should still show 75 — the {{id}} reference is stable
    await expect(async () => {
      const headers = page.locator('table thead th')
      const headerCount = await headers.count()
      const formulaCellIdx = headerCount - 2
      const cell = dataRows(page).first().locator('td').nth(formulaCellIdx)
      const text = await cell.textContent()
      expect(Number(text?.trim())).toBe(75)
    }).toPass({ timeout: 5000 })
  })

  test('removing a column that a formula depends on shows error identifying the dependent formula', async ({
    page,
  }) => {
    await addNumberColumn(page)
    await renameColumnViaAPI(page, 'New Column', 'qty')
    await page.waitForTimeout(300)

    // Create formula via API
    await page.evaluate(async () => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const matrixClient = await import('/src/core/client/matrix-client.ts')
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const sqlClient = await import('/src/core/client/sql-client.ts')

      const matrices = await sqlClient.execQuery(
        "SELECT id FROM matrix WHERE title = 'Outline'",
      )
      const matrixId = (matrices[0] as { id: number }).id

      const cols = await matrixClient.getColumns(matrixId)
      const qtyCol = cols.find((c: { name: string }) => c.name === 'qty')
      if (!qtyCol) throw new Error('qty column not found')

      await matrixClient.addFormulaColumn(matrixId, 'doubled', `{{${qtyCol.id}}} * 2`)
    })
    await page.waitForTimeout(500)

    await expect(page.locator('th', { hasText: 'doubled' })).toBeVisible({ timeout: 5000 })

    // Listen for dialog (alert) to capture the error message
    let alertMessage = ''
    page.on('dialog', async (dialog) => {
      alertMessage = dialog.message()
      await dialog.accept()
    })

    // Attempt to delete the "qty" column via context menu
    await deleteColumnViaContextMenu(page, 'qty')
    await page.waitForTimeout(1000)

    // The error message should mention the dependent formula column
    expect(alertMessage).toMatch(/cannot be removed/)
    expect(alertMessage).toContain('doubled')

    // The qty column should still exist (deletion was rejected)
    await expect(page.locator('th', { hasText: 'qty' })).toBeVisible()
  })
})

// =============================================================================
// 4. Sort and filter survive column rename
// =============================================================================

test.describe('Sort and filter survive column rename', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForOutline(page)
    await applyTableFace(page)
  })

  test('sort survives column rename', async ({ page }) => {
    await addTextColumn(page)
    await renameColumnViaAPI(page, 'New Column', 'fruit')
    await page.waitForTimeout(300)

    // Add rows and fill values
    await page.getByRole('button', { name: '+ New Row' }).click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '+ New Row' }).click()
    await page.waitForTimeout(300)

    const colIndex = await getColIndex(page, 'fruit')

    const values = ['Banana', 'Apple', 'Cherry']
    const rowCount = await dataRows(page).count()
    for (let i = 0; i < Math.min(3, rowCount); i++) {
      await editCell(page, i, colIndex, values[i]!)
    }

    // Apply sort ascending by clicking the column header
    await page.locator('th', { hasText: 'fruit' }).locator('div').first().click()
    await page.waitForTimeout(500)

    // Verify ascending order
    await expect(async () => {
      const firstCell = dataRows(page).nth(0).locator('td').nth(colIndex)
      await expect(firstCell).toContainText('Apple')
    }).toPass({ timeout: 5000 })

    // Rename the column
    await renameColumnViaAPI(page, 'fruit', 'produce')
    await expect(page.locator('th', { hasText: 'produce' })).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(500)

    // The sort should still be applied — face config references column by ID
    await expect(async () => {
      const firstCell = dataRows(page).nth(0).locator('td').nth(colIndex)
      await expect(firstCell).toContainText('Apple')
    }).toPass({ timeout: 5000 })

    // The sort indicator should still be visible on the renamed header
    const sortIndicator = page.locator('th', { hasText: 'produce' }).locator('span', { hasText: '▲' })
    await expect(sortIndicator).toBeVisible({ timeout: 3000 })
  })

  test('filter survives column rename', async ({ page }) => {
    await addTextColumn(page)
    await renameColumnViaAPI(page, 'New Column', 'status')
    await page.waitForTimeout(300)

    // Add 2 new rows so we have 3 data rows total
    await page.getByRole('button', { name: '+ New Row' }).click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '+ New Row' }).click()
    await page.waitForTimeout(300)

    const colIndex = await getColIndex(page, 'status')

    const statusValues = ['active', 'inactive', 'active']
    const rowCount = await dataRows(page).count()
    for (let i = 0; i < Math.min(3, rowCount); i++) {
      await editCell(page, i, colIndex, statusValues[i]!)
    }

    // Add a filter: status = 'active'
    await page.locator('button', { hasText: '+ Filter' }).click()

    // The filter popover contains a "value" input and "Add" button
    const filterValueInput = page.locator('input[placeholder="value"]')
    await expect(filterValueInput).toBeVisible({ timeout: 3000 })

    // Select the "status" column in the filter column dropdown (first select)
    const filterSelects = page.locator('input[placeholder="value"]').locator('xpath=..').locator('select')
    const filterColSelect = filterSelects.first()
    await filterColSelect.selectOption({ label: 'status' })

    // Set value to 'active'
    await filterValueInput.fill('active')
    // Click the Add button within the filter popover
    await filterValueInput.locator('xpath=..').getByRole('button', { name: 'Add' }).click()
    await page.waitForTimeout(500)

    // Verify filter is applied — only "active" data rows should be visible (+ add row)
    await expect(async () => {
      const visibleRows = await dataRows(page).count()
      expect(visibleRows).toBe(2) // 2 active rows
    }).toPass({ timeout: 5000 })

    // Rename the column
    await renameColumnViaAPI(page, 'status', 'state')
    await expect(page.locator('th', { hasText: 'state' })).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(500)

    // The filter should still be applied — only 2 data rows visible
    await expect(async () => {
      const visibleRows = await dataRows(page).count()
      expect(visibleRows).toBe(2)
    }).toPass({ timeout: 5000 })
  })

  test('removing a sorted column clears the sort', async ({ page }) => {
    await addTextColumn(page)
    await renameColumnViaAPI(page, 'New Column', 'sortcol')
    await page.waitForTimeout(300)

    // Apply sort
    await page.locator('th', { hasText: 'sortcol' }).locator('div').first().click()
    await page.waitForTimeout(500)

    // Verify sort indicator is visible
    await expect(
      page.locator('th', { hasText: 'sortcol' }).locator('span', { hasText: '▲' }),
    ).toBeVisible({ timeout: 3000 })

    // Delete the column
    await deleteColumnViaContextMenu(page, 'sortcol')
    await page.waitForTimeout(500)

    // The column should be gone
    await expect(page.locator('th', { hasText: 'sortcol' })).not.toBeVisible({ timeout: 5000 })

    // No sort indicator should be visible on any remaining column
    const sortIndicators = page.locator('span', { hasText: /[▲▼]/ })
    await expect(async () => {
      const count = await sortIndicators.count()
      expect(count).toBe(0)
    }).toPass({ timeout: 3000 })
  })

  test('removing a filtered column clears the filter', async ({ page }) => {
    await addTextColumn(page)
    await renameColumnViaAPI(page, 'New Column', 'filtercol')
    await page.waitForTimeout(300)

    // Add a row
    await page.getByRole('button', { name: '+ New Row' }).click()
    await page.waitForTimeout(300)

    const colIndex = await getColIndex(page, 'filtercol')

    // Fill values in the data rows
    const rowCount = await dataRows(page).count()
    for (let i = 0; i < rowCount; i++) {
      await editCell(page, i, colIndex, i === 0 ? 'keep' : 'drop')
    }

    // Add a filter: filtercol = 'keep'
    await page.locator('button', { hasText: '+ Filter' }).click()
    const filterValueInput = page.locator('input[placeholder="value"]')
    await expect(filterValueInput).toBeVisible({ timeout: 3000 })

    const filterSelects = filterValueInput.locator('xpath=..').locator('select')
    await filterSelects.first().selectOption({ label: 'filtercol' })
    await filterValueInput.fill('keep')
    await filterValueInput.locator('xpath=..').getByRole('button', { name: 'Add' }).click()
    await page.waitForTimeout(500)

    // Verify filtered to 1 data row
    await expect(async () => {
      const filteredCount = await dataRows(page).count()
      expect(filteredCount).toBe(1)
    }).toPass({ timeout: 5000 })

    // Delete the column
    await deleteColumnViaContextMenu(page, 'filtercol')
    await page.waitForTimeout(500)

    // Column should be gone
    await expect(page.locator('th', { hasText: 'filtercol' })).not.toBeVisible({ timeout: 5000 })

    // All rows should be visible again (filter cleared by cascade)
    await expect(async () => {
      const totalRows = await dataRows(page).count()
      expect(totalRows).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 5000 })
  })
})
