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

const switchToNotes = async (page: Page) => {
  await page.locator('.view-tab', { hasText: /^Notes$/ }).click()
  await expect(
    page.locator('.note-list-face, .note-list-empty, .note-list-items').first(),
  ).toBeVisible({ timeout: 5000 })
}

const createNote = async (page: Page, title: string) => {
  await page.locator('.note-list-add').click()
  await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })
  const titleInput = page.locator('.note-title-input')
  await titleInput.fill(title)
  await page.waitForTimeout(500)
}

const goBackToList = async (page: Page) => {
  await page.locator('.note-face-back').click()
  await expect(page.locator('.note-list-items')).toBeVisible({ timeout: 5000 })
}

const openNoteByTitle = async (page: Page, title: string) => {
  await page.locator('.note-list-item-title', { hasText: title }).click()
  await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })
}

const typeInlineRef = async (
  page: Page,
  trigger: '@' | '[[',
  searchText: string,
  selectCreate = false,
) => {
  const editor = page.locator('.note-body-editor .ProseMirror')
  await editor.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')

  if (trigger === '@') {
    await page.keyboard.type('@')
  } else {
    await page.keyboard.type('[[')
  }

  await expect(page.locator('.inlineref-autocomplete')).toBeVisible({ timeout: 5000 })

  if (searchText) {
    await page.keyboard.type(searchText)
    await page.waitForTimeout(500)
  }

  if (selectCreate) {
    const createOption = page.locator('.inlineref-autocomplete-create')
    await expect(createOption).toBeVisible({ timeout: 5000 })
    // Navigate to the "Create" option — it's always last
    // Keep pressing ArrowDown until the create item is selected
    for (let i = 0; i < 20; i++) {
      const selected = page.locator('.inlineref-autocomplete-selected')
      if (
        (await selected.count()) > 0 &&
        (await selected.getAttribute('class'))?.includes('inlineref-autocomplete-create')
      ) {
        break
      }
      await page.keyboard.press('ArrowDown')
    }
    await page.keyboard.press('Enter')
  } else {
    const existingOption = page.locator(
      '.inlineref-autocomplete-item:not(.inlineref-autocomplete-create)',
      { hasText: searchText },
    )
    await expect(existingOption).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Enter')
  }
}

const applyTableFace = async (page: Page) => {
  await page.getByTestId('view-as-button').click()
  await expect(page.getByTestId('face-config-panel')).toBeVisible()
  await page.getByTestId('face-type-picker').selectOption('hila.table')
  await page.getByTestId('face-config-apply').click()
  await expect(page.getByTestId('face-config-panel')).not.toBeVisible({ timeout: 5000 })
  await expect(page.locator('table')).toBeVisible({ timeout: 5000 })
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
// 1. Inline reference tests
// =============================================================================

test.describe('Inline references', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForOutline(page)
    await switchToNotes(page)
  })

  test('@ triggers autocomplete in a note body', async ({ page }) => {
    await page.locator('.note-list-item').first().click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    const editor = page.locator('.note-body-editor .ProseMirror')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('@')

    await expect(page.locator('.inlineref-autocomplete')).toBeVisible({ timeout: 5000 })
  })

  test('[[ still triggers autocomplete', async ({ page }) => {
    await page.locator('.note-list-item').first().click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    const editor = page.locator('.note-body-editor .ProseMirror')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('[[')

    await expect(page.locator('.inlineref-autocomplete')).toBeVisible({ timeout: 5000 })
  })

  test('select from autocomplete inserts an inlineref node', async ({ page }) => {
    await createNote(page, 'Target Note')
    await goBackToList(page)

    await openNoteByTitle(page, 'Welcome')

    const editor = page.locator('.note-body-editor .ProseMirror')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    await page.keyboard.type('@')
    await expect(page.locator('.inlineref-autocomplete')).toBeVisible({ timeout: 5000 })

    await page.keyboard.type('Target')
    await page.waitForTimeout(500)

    await expect(
      page.locator('.inlineref-autocomplete-item', { hasText: 'Target Note' }),
    ).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Enter')

    await expect(editor.locator('.inlineref')).toBeVisible({ timeout: 5000 })
    await expect(editor.locator('.inlineref')).toContainText('Target Note')
    await expect(page.locator('.inlineref-autocomplete')).not.toBeVisible()
  })

  test('click a reference to navigate to the target note', async ({ page }) => {
    await createNote(page, 'Nav Target')
    await goBackToList(page)

    await openNoteByTitle(page, 'Welcome')
    await typeInlineRef(page, '@', 'Nav Target')

    const editor = page.locator('.note-body-editor .ProseMirror')
    await expect(editor.locator('.inlineref')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(500)

    await editor.locator('.inlineref').click()

    await expect(page.locator('.note-title-input')).toHaveValue('Nav Target', { timeout: 5000 })
  })

  test('backlinks panel shows the source note on the target', async ({ page }) => {
    await createNote(page, 'Source Note')
    await goBackToList(page)

    await openNoteByTitle(page, 'Source Note')
    await typeInlineRef(page, '[[', 'Welcome')
    await page.waitForTimeout(500)

    await goBackToList(page)
    await openNoteByTitle(page, 'Welcome')

    await expect(page.locator('.note-backlinks')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.note-backlinks-item', { hasText: 'Source Note' })).toBeVisible({
      timeout: 5000,
    })
  })
})

// =============================================================================
// 2. Empty and ghost reference tests
// =============================================================================

test.describe('Empty and ghost references', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForOutline(page)
    await switchToNotes(page)
  })

  test('selecting "Create new" inserts an empty-state reference', async ({ page }) => {
    await page.locator('.note-list-item').first().click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    const editor = page.locator('.note-body-editor .ProseMirror')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    await page.keyboard.type('@')
    await expect(page.locator('.inlineref-autocomplete')).toBeVisible({ timeout: 5000 })

    await page.keyboard.type('Brand New Note')
    await page.waitForTimeout(500)

    const createOption = page.locator('.inlineref-autocomplete-create')
    await expect(createOption).toBeVisible({ timeout: 5000 })
    await expect(createOption).toContainText('Create "Brand New Note"')

    // Select the create option
    for (let i = 0; i < 20; i++) {
      const selected = page.locator('.inlineref-autocomplete-selected')
      if (
        (await selected.count()) > 0 &&
        (await selected.getAttribute('class'))?.includes('inlineref-autocomplete-create')
      ) {
        break
      }
      await page.keyboard.press('ArrowDown')
    }
    await page.keyboard.press('Enter')

    // An empty-state inlineref should appear
    const inlineref = editor.locator('.inlineref')
    await expect(inlineref).toBeVisible({ timeout: 5000 })
    await expect(inlineref).toContainText('Brand New Note')
    await expect(inlineref).toHaveClass(/inlineref-empty/)
  })

  test('clicking an empty-state reference creates the target and transitions to live', async ({
    page,
  }) => {
    await page.locator('.note-list-item').first().click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    const editor = page.locator('.note-body-editor .ProseMirror')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    // Insert an empty-state reference
    await page.keyboard.type('@')
    await expect(page.locator('.inlineref-autocomplete')).toBeVisible({ timeout: 5000 })
    await page.keyboard.type('Newly Created')
    await page.waitForTimeout(500)

    for (let i = 0; i < 20; i++) {
      const selected = page.locator('.inlineref-autocomplete-selected')
      if (
        (await selected.count()) > 0 &&
        (await selected.getAttribute('class'))?.includes('inlineref-autocomplete-create')
      ) {
        break
      }
      await page.keyboard.press('ArrowDown')
    }
    await page.keyboard.press('Enter')

    const inlineref = editor.locator('.inlineref')
    await expect(inlineref).toBeVisible({ timeout: 5000 })
    await expect(inlineref).toHaveClass(/inlineref-empty/)

    // Click the empty reference to create the target note and navigate
    await inlineref.click()

    // Should navigate to the newly created note
    await expect(page.locator('.note-title-input')).toHaveValue('Newly Created', {
      timeout: 5000,
    })
  })

  test('deleting a target note causes the reference to show ghost state', async ({ page }) => {
    // Create a note to link to, then delete it
    await createNote(page, 'Doomed Note')
    await goBackToList(page)

    // Add a reference from Welcome to Doomed Note
    await openNoteByTitle(page, 'Welcome')
    await typeInlineRef(page, '@', 'Doomed Note')

    const editor = page.locator('.note-body-editor .ProseMirror')
    await expect(editor.locator('.inlineref')).toBeVisible({ timeout: 5000 })
    await expect(editor.locator('.inlineref')).toContainText('Doomed Note')
    await page.waitForTimeout(500) // wait for save

    // Go back and delete the target note
    await goBackToList(page)

    const deleteBtn = page
      .locator('.note-list-item', { hasText: 'Doomed Note' })
      .locator('.note-list-item-delete')
    await deleteBtn.click()

    // Wait for the note to disappear from the list
    await expect(
      page.locator('.note-list-item-title', { hasText: 'Doomed Note' }),
    ).not.toBeVisible({ timeout: 5000 })

    // Re-open the Welcome note — the reference should now be in ghost state
    await openNoteByTitle(page, 'Welcome')

    const ghostRef = editor.locator('.inlineref-ghost')
    await expect(ghostRef).toBeVisible({ timeout: 5000 })
    await expect(ghostRef).toContainText('Doomed Note')
  })
})

// =============================================================================
// 3. Reference cell tests
// =============================================================================

test.describe('Reference cells in table face', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForOutline(page)
    await applyTableFace(page)
  })

  test('add a reference column via the + button', async ({ page }) => {
    await page.locator('button[title="Add column"]').click()
    await page.getByRole('button', { name: /Reference/ }).click()

    // The reference column dialog should appear to pick a target matrix
    const dialog = page.locator('[class*="filterPopover"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Select the first matrix and add
    await dialog.getByRole('button', { name: 'Add' }).click()

    // A "Reference" column header should now appear
    await expect(page.locator('th', { hasText: 'Reference' })).toBeVisible({ timeout: 5000 })
  })

  test('click a reference cell, select a target row, verify title shown', async ({ page }) => {
    // Add a few rows first so there's something to reference
    await page.getByRole('button', { name: '+ New Row' }).click()
    await page.waitForTimeout(300)

    // Add a reference column pointing at the same matrix (Outline)
    await page.locator('button[title="Add column"]').click()
    await page.getByRole('button', { name: /Reference/ }).click()

    const dialog = page.locator('[class*="filterPopover"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await dialog.getByRole('button', { name: 'Add' }).click()
    await expect(page.locator('th', { hasText: 'Reference' })).toBeVisible({ timeout: 5000 })

    // Find the reference column cell in the first row.
    // The ref cell shows "Empty" text when unset.
    const refCell = page.locator('table tbody tr').first().locator('[class*="refEmpty"]')
    await expect(refCell).toBeVisible({ timeout: 5000 })

    // Click "Empty" to open the reference search dropdown
    await refCell.click()

    const searchInput = page.locator('[class*="refSearchInput"]')
    await expect(searchInput).toBeVisible({ timeout: 5000 })

    // The dropdown should list available rows
    const firstResult = page.locator('[class*="refSearchItem"]').first()
    await expect(firstResult).toBeVisible({ timeout: 5000 })

    // Click the first result to select it
    await firstResult.click()

    // The cell should now show a reference badge with the target's title
    const refBadge = page.locator('table tbody tr').first().locator('[class*="refBadge"]')
    await expect(refBadge).toBeVisible({ timeout: 5000 })
  })

  test('clear a reference cell returns it to empty', async ({ page }) => {
    // Add a reference column
    await page.locator('button[title="Add column"]').click()
    await page.getByRole('button', { name: /Reference/ }).click()
    const dialog = page.locator('[class*="filterPopover"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await dialog.getByRole('button', { name: 'Add' }).click()
    await expect(page.locator('th', { hasText: 'Reference' })).toBeVisible({ timeout: 5000 })

    // Set a reference first
    const refCell = page.locator('table tbody tr').first().locator('[class*="refEmpty"]')
    await expect(refCell).toBeVisible({ timeout: 5000 })
    await refCell.click()

    const searchInput = page.locator('[class*="refSearchInput"]')
    await expect(searchInput).toBeVisible({ timeout: 5000 })

    const firstResult = page.locator('[class*="refSearchItem"]').first()
    await expect(firstResult).toBeVisible({ timeout: 5000 })
    await firstResult.click()

    const refBadge = page.locator('table tbody tr').first().locator('[class*="refBadge"]')
    await expect(refBadge).toBeVisible({ timeout: 5000 })

    // Clear the reference via the × button
    const clearBtn = page
      .locator('table tbody tr')
      .first()
      .locator('[aria-label="Clear reference"]')
    await clearBtn.click()

    // The cell should return to "Empty"
    await expect(
      page.locator('table tbody tr').first().locator('[class*="refEmpty"]'),
    ).toBeVisible({ timeout: 5000 })
    await expect(refBadge).not.toBeVisible()
  })
})

// =============================================================================
// 4. Cascade deletion tests
// =============================================================================

test.describe('Cascade deletion', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForOutline(page)
    await switchToNotes(page)
  })

  test('deleting a source row cascade-deletes owned targets', async ({ page }) => {
    // Create source and target notes
    await createNote(page, 'Owner Note')
    await goBackToList(page)
    await createNote(page, 'Owned Child')
    await goBackToList(page)

    // Verify both notes exist (Welcome + Owner Note + Owned Child = 3)
    await expect(async () => {
      const count = await page.locator('.note-list-item').count()
      expect(count).toBe(3)
    }).toPass({ timeout: 5000 })

    // Use page.evaluate to insert an own-kind join between Owner Note and Owned Child,
    // and set up PM JSON with an own-kind inlineref node in Owner Note's body
    await page.evaluate(async () => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const sqlClient = await import('/src/core/client/sql-client.ts')
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const matrixClient = await import('/src/core/client/matrix-client.ts')

      const matrixResult = await sqlClient.execQuery(
        "SELECT id FROM matrix WHERE title = 'Notes'",
      )
      const notesMatrixId = (matrixResult[0] as { id: number }).id

      const ownerResult = await sqlClient.execQuery(
        `SELECT id FROM "mx_${notesMatrixId}_data" WHERE title = 'Owner Note'`,
      )
      const ownerId = (ownerResult[0] as { id: number }).id

      const childResult = await sqlClient.execQuery(
        `SELECT id FROM "mx_${notesMatrixId}_data" WHERE title = 'Owned Child'`,
      )
      const childId = (childResult[0] as { id: number }).id

      // Insert an own-kind join
      await matrixClient.insertJoin(notesMatrixId, ownerId, notesMatrixId, childId, 'own')

      // Update the Owner Note's body to include an own-kind inlineref node
      const bodyJson = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Has owned child: ' },
              {
                type: 'inlineref',
                attrs: {
                  targetMatrixId: notesMatrixId,
                  targetRowId: childId,
                  kind: 'own',
                  cachedTitle: 'Owned Child',
                },
              },
            ],
          },
        ],
      })
      await matrixClient.updateRow(notesMatrixId, ownerId, { body: bodyJson })
    })

    // Now delete the Owner Note
    const deleteBtn = page
      .locator('.note-list-item', { hasText: 'Owner Note' })
      .locator('.note-list-item-delete')
    await deleteBtn.click()

    // Wait for Owner Note to disappear
    await expect(
      page.locator('.note-list-item-title', { hasText: 'Owner Note' }),
    ).not.toBeVisible({ timeout: 5000 })

    // The owned child should also be cascade-deleted
    await expect(async () => {
      const count = await page.locator('.note-list-item').count()
      expect(count).toBe(1) // Only Welcome remains
    }).toPass({ timeout: 5000 })

    await expect(
      page.locator('.note-list-item-title', { hasText: 'Owned Child' }),
    ).not.toBeVisible()
  })

  test('owned target no longer appears after cascade deletion', async ({ page }) => {
    // Create notes and set up an own join via evaluate
    await createNote(page, 'Parent')
    await goBackToList(page)
    await createNote(page, 'Child')
    await goBackToList(page)

    const childExists = await page.evaluate(async () => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const sqlClient = await import('/src/core/client/sql-client.ts')
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const matrixClient = await import('/src/core/client/matrix-client.ts')

      const matrixResult = await sqlClient.execQuery(
        "SELECT id FROM matrix WHERE title = 'Notes'",
      )
      const notesMatrixId = (matrixResult[0] as { id: number }).id

      const parentResult = await sqlClient.execQuery(
        `SELECT id FROM "mx_${notesMatrixId}_data" WHERE title = 'Parent'`,
      )
      const parentId = (parentResult[0] as { id: number }).id

      const childResult = await sqlClient.execQuery(
        `SELECT id FROM "mx_${notesMatrixId}_data" WHERE title = 'Child'`,
      )
      const childId = (childResult[0] as { id: number }).id

      await matrixClient.insertJoin(notesMatrixId, parentId, notesMatrixId, childId, 'own')

      // Delete parent — should cascade-delete child
      await matrixClient.deleteRow(notesMatrixId, parentId)

      // Verify child is gone at the data layer
      const remaining = await sqlClient.execQuery(
        `SELECT id FROM "mx_${notesMatrixId}_data" WHERE title = 'Child'`,
      )
      return remaining.length > 0
    })

    expect(childExists).toBe(false)

    // Refresh the note list to confirm UI reflects the cascade
    await switchToNotes(page)

    await expect(page.locator('.note-list-item-title', { hasText: 'Child' })).not.toBeVisible({
      timeout: 5000,
    })
    await expect(page.locator('.note-list-item-title', { hasText: 'Parent' })).not.toBeVisible({
      timeout: 5000,
    })
  })
})
