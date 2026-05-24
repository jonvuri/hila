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

const waitForRows = async (page: Page) => {
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
}

const switchToTags = async (page: Page) => {
  await page.getByTestId('tags-tab').click()
  await expect(page.locator('.tag-browser')).toBeVisible({ timeout: 5000 })
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

/**
 * Wait for an autocomplete option (item or create) to be visible.
 * Multiple ProseMirror editors (workspace rows) create multiple dropdowns on
 * document.body, so we wait for any visible option element instead of the
 * container to avoid Playwright strict-mode violations.
 */
const waitForAutocompleteOption = async (page: Page) => {
  await expect(
    page.locator('.inlineref-autocomplete-item, .inlineref-autocomplete-create').first(),
  ).toBeVisible({ timeout: 5000 })
}

/**
 * Type `#` + searchText in the currently focused editor, then select from
 * autocomplete. Does NOT press Enter first — caller must position the cursor.
 * For workspace rows, focus the target row's editor first.
 * For note bodies, click the editor and optionally press Enter for a new line.
 */
const typeHashTag = async (page: Page, searchText: string, selectCreate = false) => {
  await page.keyboard.type('#')

  if (searchText) {
    await page.keyboard.type(searchText)
    await page.waitForTimeout(500)
  }

  await waitForAutocompleteOption(page)

  if (selectCreate) {
    const createOption = page.locator('.inlineref-autocomplete-create')
    await expect(createOption).toBeVisible({ timeout: 5000 })
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
    await page.keyboard.press('Enter')
  }
}

/**
 * Create a new row by pressing Enter at the end of the first row,
 * then return a locator for the newly created row's editor.
 */
const createNewRow = async (page: Page) => {
  const firstEditor = page.locator('.outline-row .ProseMirror').first()
  await firstEditor.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)

  const newEditor = page.locator('.outline-row .ProseMirror').last()
  await newEditor.click()
  return newEditor
}

// =============================================================================
// 1. Tag insertion tests
// =============================================================================

test.describe('Tag insertion', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForRows(page)
  })

  test('# triggers autocomplete in a workspace row', async ({ page }) => {
    await createTagTypeViaAPI(page, 'task')

    const newEditor = await createNewRow(page)
    await page.keyboard.type('#')

    await waitForAutocompleteOption(page)
  })

  test('select an existing tag type inserts a colored tag badge in workspace row', async ({
    page,
  }) => {
    await createTagTypeViaAPI(page, 'task')

    const newEditor = await createNewRow(page)
    await typeHashTag(page, 'task')

    const tagBadge = newEditor.locator('.inlineref-own')
    await expect(tagBadge).toBeVisible({ timeout: 5000 })
    await expect(tagBadge).toContainText('#task')
  })

  test('tag insertion creates an aspect row in the tag matrix', async ({ page }) => {
    const { matrixId: tagMatrixId } = await createTagTypeViaAPI(page, 'task')

    const newEditor = await createNewRow(page)
    await typeHashTag(page, 'task')

    await expect(newEditor.locator('.inlineref-own')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(1000)

    const result = await runSQL(page, `SELECT COUNT(*) AS cnt FROM "mx_${tagMatrixId}_data"`)
    expect(result).toContain('"cnt": 1')
  })

})

// =============================================================================
// 2. Tag type creation tests
// =============================================================================

test.describe('Tag type creation via autocomplete', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForRows(page)
  })

  test('typing a nonexistent tag name shows "Create tag type" option', async ({ page }) => {
    const newEditor = await createNewRow(page)
    await page.keyboard.type('#')
    await page.keyboard.type('newtype')
    await page.waitForTimeout(500)

    const createOption = page.locator('.inlineref-autocomplete-create')
    await expect(createOption).toBeVisible({ timeout: 5000 })
    await expect(createOption).toContainText("Create 'newtype' tag type")
  })

  test('selecting "Create tag type" creates the tag type and inserts a badge', async ({
    page,
  }) => {
    const newEditor = await createNewRow(page)
    await typeHashTag(page, 'newtype', true)

    const tagBadge = newEditor.locator('.inlineref-own')
    await expect(tagBadge).toBeVisible({ timeout: 5000 })
    await expect(tagBadge).toContainText('#newtype')
  })

  test('newly created tag type appears in the tag browser', async ({ page }) => {
    const newEditor = await createNewRow(page)
    await typeHashTag(page, 'project', true)

    await expect(newEditor.locator('.inlineref-own')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(500)

    await switchToTags(page)
    await expect(page.getByTestId('tag-type-list')).toBeVisible({ timeout: 5000 })

    const tagTypeRow = page.locator('.tag-type-row', { hasText: '#project' })
    await expect(tagTypeRow).toBeVisible({ timeout: 5000 })
  })

  test('inline tag type creation also creates the aspect row', async ({ page }) => {
    const newEditor = await createNewRow(page)
    await typeHashTag(page, 'milestone', true)

    await expect(newEditor.locator('.inlineref-own')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(1000)

    const aspectExists = await page.evaluate(async () => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const matrixClient = await import('/src/core/client/matrix-client.ts')
      const tagTypes = await matrixClient.getAllTagTypes()
      const milestone = tagTypes.find(
        (tt: { name: string }) => tt.name.toLowerCase() === 'milestone',
      )
      if (!milestone) return false
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const sqlClient = await import('/src/core/client/sql-client.ts')
      const rows = await sqlClient.execQuery(
        `SELECT COUNT(*) AS cnt FROM "mx_${milestone.matrixId}_data"`,
      )
      return (rows[0] as { cnt: number }).cnt > 0
    })

    expect(aspectExists).toBe(true)
  })

})

// =============================================================================
// 3. Tag property panel tests
// =============================================================================

test.describe('Tag property panel', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForRows(page)
  })

  test('clicking a tag badge opens the property panel', async ({ page }) => {
    const { matrixId } = await createTagTypeViaAPI(page, 'task')

    await page.evaluate(
      async ({ matrixId }) => {
        // @ts-expect-error -- resolved by Vite dev server at runtime
        const client = await import('/src/core/client/matrix-client.ts')
        await client.addColumn(matrixId, 'status', 'TEXT', 'text')
      },
      { matrixId },
    )

    const newEditor = await createNewRow(page)
    await typeHashTag(page, 'task')
    await expect(newEditor.locator('.inlineref-own')).toBeVisible({ timeout: 5000 })

    const tagBadge = newEditor.locator('.inlineref-own')
    await tagBadge.click()

    const panel = page.locator('.tag-property-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })
    await expect(panel.locator('.tag-panel-badge')).toContainText('#task')
  })

  test('editing a field in the property panel persists the change', async ({ page }) => {
    const { matrixId } = await createTagTypeViaAPI(page, 'task')

    await page.evaluate(
      async ({ matrixId }) => {
        // @ts-expect-error -- resolved by Vite dev server at runtime
        const client = await import('/src/core/client/matrix-client.ts')
        await client.addColumn(matrixId, 'status', 'TEXT', 'text')
      },
      { matrixId },
    )

    const newEditor = await createNewRow(page)
    await typeHashTag(page, 'task')
    await expect(newEditor.locator('.inlineref-own')).toBeVisible({ timeout: 5000 })

    const tagBadge = newEditor.locator('.inlineref-own')
    await tagBadge.click()

    const panel = page.locator('.tag-property-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })

    const labelField = panel.locator('.tag-panel-field').filter({ hasText: 'label' }).locator('.tag-panel-field-input')
    await expect(labelField).toBeVisible({ timeout: 3000 })
    await labelField.fill('my-task')
    await labelField.blur()

    await page.waitForTimeout(500)

    const result = await runSQL(
      page,
      `SELECT label FROM "mx_${matrixId}_data" LIMIT 1`,
    )
    expect(result).toContain('my-task')
  })

  test('pressing Escape closes the panel and returns focus to the editor', async ({ page }) => {
    await createTagTypeViaAPI(page, 'task')

    const newEditor = await createNewRow(page)
    await typeHashTag(page, 'task')
    await expect(newEditor.locator('.inlineref-own')).toBeVisible({ timeout: 5000 })

    const tagBadge = newEditor.locator('.inlineref-own')
    await tagBadge.click()

    const panel = page.locator('.tag-property-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })
    // Allow the deferred event listeners (setTimeout 0) to attach
    await page.waitForTimeout(100)

    await page.keyboard.press('Escape')
    await expect(panel).not.toBeVisible({ timeout: 3000 })

    await newEditor.click()
    await expect(async () => {
      const focused = await page.evaluate(() => {
        const el = document.activeElement
        return el?.closest('.ProseMirror') !== null
      })
      expect(focused).toBe(true)
    }).toPass({ timeout: 3000 })
  })

  test('tag data is consistent between property panel and identity face (table view)', async ({
    page,
  }) => {
    const { matrixId } = await createTagTypeViaAPI(page, 'task')

    await page.evaluate(
      async ({ matrixId }) => {
        // @ts-expect-error -- resolved by Vite dev server at runtime
        const client = await import('/src/core/client/matrix-client.ts')
        await client.addColumn(matrixId, 'priority', 'TEXT', 'text')
      },
      { matrixId },
    )

    const newEditor = await createNewRow(page)
    await typeHashTag(page, 'task')
    await expect(newEditor.locator('.inlineref-own')).toBeVisible({ timeout: 5000 })

    const tagBadge = newEditor.locator('.inlineref-own')
    await tagBadge.click()

    const panel = page.locator('.tag-property-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })

    const fieldInput = panel.locator('.tag-panel-field-input').first()
    await expect(fieldInput).toBeVisible({ timeout: 3000 })
    await fieldInput.fill('high')
    await fieldInput.blur()
    await page.waitForTimeout(500)

    await page.keyboard.press('Escape')
    await expect(panel).not.toBeVisible({ timeout: 3000 })

    await switchToTags(page)
    const tagTypeRow = page.locator('.tag-type-row', { hasText: '#task' })
    await expect(tagTypeRow).toBeVisible({ timeout: 5000 })
    await tagTypeRow.click()

    await page.getByTestId('view-all-in-table').click()

    await expect(page.locator('table')).toBeVisible({ timeout: 5000 })

    await expect(async () => {
      const cellTexts = await page.locator('table tbody td').allTextContents()
      expect(cellTexts.some((t) => t.includes('high'))).toBe(true)
    }).toPass({ timeout: 5000 })
  })

  test('editing the aspect row in the table face is reflected in the tag badge', async ({
    page,
  }) => {
    const { matrixId } = await createTagTypeViaAPI(page, 'task')

    await page.evaluate(
      async ({ matrixId }) => {
        // @ts-expect-error -- resolved by Vite dev server at runtime
        const client = await import('/src/core/client/matrix-client.ts')
        await client.addColumn(matrixId, 'priority', 'TEXT', 'text')
      },
      { matrixId },
    )

    const newEditor = await createNewRow(page)
    await typeHashTag(page, 'task')
    await expect(newEditor.locator('.inlineref-own')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(500)

    await switchToTags(page)
    const tagTypeRow = page.locator('.tag-type-row', { hasText: '#task' })
    await expect(tagTypeRow).toBeVisible({ timeout: 5000 })
    await tagTypeRow.click()
    await page.getByTestId('view-all-in-table').click()
    await expect(page.locator('table')).toBeVisible({ timeout: 5000 })

    const priorityCol = page.locator('th', { hasText: 'priority' })
    await expect(priorityCol).toBeVisible({ timeout: 5000 })
    const colIndex = await priorityCol.evaluate((el) => {
      const ths = Array.from(el.closest('tr')!.querySelectorAll('th'))
      return ths.indexOf(el)
    })

    const cell = page.locator('table tbody tr').first().locator('td').nth(colIndex)
    await cell.dblclick()
    const input = page.locator('table tbody td input')
    await expect(input).toBeVisible({ timeout: 3000 })
    await input.fill('urgent')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    await page.locator('.view-tab', { hasText: /^Workspace$/ }).click()
    await waitForRows(page)

    await expect(async () => {
      const badge = page.locator('.inlineref-own').first()
      const badgeText = await badge.textContent()
      expect(badgeText).toContain('urgent')
    }).toPass({ timeout: 5000 })
  })
})

// =============================================================================
// 4. Tag lifecycle tests
// =============================================================================

test.describe('Tag lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForRows(page)
  })

  test('deleting a tag badge from label text removes the aspect row', async ({ page }) => {
    const { matrixId: tagMatrixId } = await createTagTypeViaAPI(page, 'task')

    const newEditor = await createNewRow(page)
    await typeHashTag(page, 'task')
    await expect(newEditor.locator('.inlineref-own')).toBeVisible({ timeout: 5000 })
    // Wait for the debounced save + syncInlineRefs to materialize the join
    await page.waitForTimeout(1000)

    const beforeCount = await page.evaluate(async (mid: number) => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const sql = await import('/src/core/client/sql-client.ts')
      const rows = await sql.execQuery(`SELECT COUNT(*) AS cnt FROM "mx_${mid}_data"`)
      return (rows[0] as { cnt: number }).cnt
    }, tagMatrixId)
    expect(beforeCount).toBe(1)

    // Select all text in the editor and delete it (removing the tag badge)
    await newEditor.click()
    await page.keyboard.press('Meta+a')
    await page.keyboard.press('Backspace')

    // Wait for debounced save (300ms) + syncInlineRefs cascade deletion
    await expect(async () => {
      const afterCount = await page.evaluate(async (mid: number) => {
        // @ts-expect-error -- resolved by Vite dev server at runtime
        const sql = await import('/src/core/client/sql-client.ts')
        const rows = await sql.execQuery(`SELECT COUNT(*) AS cnt FROM "mx_${mid}_data"`)
        return (rows[0] as { cnt: number }).cnt
      }, tagMatrixId)
      expect(afterCount).toBe(0)
    }).toPass({ timeout: 10000 })
  })

  test('deleting a workspace row cascade-deletes both tag aspect rows', async ({ page }) => {
    const { matrixId: taskMatrixId } = await createTagTypeViaAPI(page, 'task')
    const { matrixId: reviewMatrixId } = await createTagTypeViaAPI(page, 'review')

    const newEditor = await createNewRow(page)
    await typeHashTag(page, 'task')
    await expect(newEditor.locator('.inlineref-own').first()).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(300)

    await page.keyboard.press('End')
    await page.keyboard.type(' ')
    await typeHashTag(page, 'review')
    await expect(async () => {
      const count = await newEditor.locator('.inlineref-own').count()
      expect(count).toBe(2)
    }).toPass({ timeout: 5000 })
    // Wait for the debounced save to persist the document and materialize joins
    await page.waitForTimeout(1500)

    const beforeCounts = await page.evaluate(
      async ({ taskMid, reviewMid }) => {
        // @ts-expect-error -- resolved by Vite dev server at runtime
        const sql = await import('/src/core/client/sql-client.ts')
        const taskRows = await sql.execQuery(`SELECT COUNT(*) AS cnt FROM "mx_${taskMid}_data"`)
        const reviewRows = await sql.execQuery(`SELECT COUNT(*) AS cnt FROM "mx_${reviewMid}_data"`)
        return {
          task: (taskRows[0] as { cnt: number }).cnt,
          review: (reviewRows[0] as { cnt: number }).cnt,
        }
      },
      { taskMid: taskMatrixId, reviewMid: reviewMatrixId },
    )
    expect(beforeCounts.task).toBe(1)
    expect(beforeCounts.review).toBe(1)

    // Find the workspace row that has the tags (the one with own-kind join entries)
    const rowInfo = await page.evaluate(
      async ({ taskMid }) => {
        // @ts-expect-error -- resolved by Vite dev server at runtime
        const sql = await import('/src/core/client/sql-client.ts')
        const joins = await sql.execQuery(
          `SELECT source_matrix_id, source_row_id FROM joins WHERE target_matrix_id = ${taskMid} AND kind = 'own' LIMIT 1`,
        )
        if (joins.length === 0) return null
        const j = joins[0] as { source_matrix_id: number; source_row_id: number }
        return { matrixId: j.source_matrix_id, rowId: j.source_row_id }
      },
      { taskMid: taskMatrixId },
    )
    expect(rowInfo).not.toBeNull()

    await page.evaluate(
      async ({ matrixId, rowId }) => {
        // @ts-expect-error -- resolved by Vite dev server at runtime
        const client = await import('/src/core/client/matrix-client.ts')
        await client.deleteRow(matrixId, rowId)
      },
      rowInfo!,
    )

    await page.waitForTimeout(1000)

    await expect(async () => {
      const afterCounts = await page.evaluate(
        async ({ taskMid, reviewMid }) => {
          // @ts-expect-error -- resolved by Vite dev server at runtime
          const sql = await import('/src/core/client/sql-client.ts')
          const taskRows = await sql.execQuery(`SELECT COUNT(*) AS cnt FROM "mx_${taskMid}_data"`)
          const reviewRows = await sql.execQuery(
            `SELECT COUNT(*) AS cnt FROM "mx_${reviewMid}_data"`,
          )
          return {
            task: (taskRows[0] as { cnt: number }).cnt,
            review: (reviewRows[0] as { cnt: number }).cnt,
          }
        },
        { taskMid: taskMatrixId, reviewMid: reviewMatrixId },
      )
      expect(afterCounts.task).toBe(0)
      expect(afterCounts.review).toBe(0)
    }).toPass({ timeout: 10000 })
  })

  test('deleting an aspect row from the table face removes the tag badge from label text', async ({
    page,
  }) => {
    const { matrixId: tagMatrixId } = await createTagTypeViaAPI(page, 'task')

    const newEditor = await createNewRow(page)
    await typeHashTag(page, 'task')
    await expect(newEditor.locator('.inlineref-own')).toBeVisible({ timeout: 5000 })
    // Wait for debounced save to persist the document
    await page.waitForTimeout(1000)

    // Find the aspect row ID from the tag matrix
    const aspectRowId = await page.evaluate(async (mid: number) => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const sql = await import('/src/core/client/sql-client.ts')
      const rows = await sql.execQuery(`SELECT id FROM "mx_${mid}_data" LIMIT 1`)
      return (rows[0] as { id: number }).id
    }, tagMatrixId)

    // Delete the aspect row via deleteRow (simulates deletion from the identity face)
    await page.evaluate(
      async ({ matrixId, rowId }) => {
        // @ts-expect-error -- resolved by Vite dev server at runtime
        const client = await import('/src/core/client/matrix-client.ts')
        await client.deleteRow(matrixId, rowId)
      },
      { matrixId: tagMatrixId, rowId: aspectRowId },
    )

    await page.waitForTimeout(1000)

    // Verify the aspect row was deleted from the database
    await expect(async () => {
      const cnt = await page.evaluate(async (mid: number) => {
        // @ts-expect-error -- resolved by Vite dev server at runtime
        const sql = await import('/src/core/client/sql-client.ts')
        const rows = await sql.execQuery(`SELECT COUNT(*) AS cnt FROM "mx_${mid}_data"`)
        return (rows[0] as { cnt: number }).cnt
      }, tagMatrixId)
      expect(cnt).toBe(0)
    }).toPass({ timeout: 5000 })

    // The reverse lifecycle should remove the inline tag node from the label text
    await expect(async () => {
      const tagBadges = await page.locator('.inlineref-own:not(.inlineref-ghost)').count()
      expect(tagBadges).toBe(0)
    }).toPass({ timeout: 10000 })
  })
})

// =============================================================================
// 5. Tag browser tests
// =============================================================================

test.describe('Tag browser', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForRows(page)
  })

  test('tag browser lists all registered tag types', async ({ page }) => {
    await createTagTypeViaAPI(page, 'task')
    await createTagTypeViaAPI(page, 'review')

    await switchToTags(page)
    await expect(page.getByTestId('tag-type-list')).toBeVisible({ timeout: 5000 })

    await expect(page.locator('.tag-type-row', { hasText: '#task' })).toBeVisible({
      timeout: 5000,
    })
    await expect(page.locator('.tag-type-row', { hasText: '#review' })).toBeVisible({
      timeout: 5000,
    })
  })

  test('instance counts update after creating tags on rows', async ({ page }) => {
    const { matrixId: tagMatrixId } = await createTagTypeViaAPI(page, 'task')

    // Create joins directly at the data layer (tag insertion is tested elsewhere)
    // so we can reliably verify the tag browser's instance count.
    await page.evaluate(
      async ({ tagMid }) => {
        // @ts-expect-error -- resolved by Vite dev server at runtime
        const sql = await import('/src/core/client/sql-client.ts')
        // @ts-expect-error -- resolved by Vite dev server at runtime
        const client = await import('/src/core/client/matrix-client.ts')

        const matrixResult = await sql.execQuery(
          "SELECT id FROM matrix WHERE title = 'Workspace'",
        )
        const workspaceMid = (matrixResult[0] as { id: number }).id

        // Ensure enough rows exist by inserting two new ones
        await client.insertRow(workspaceMid, { values: { label: '"Row A"' } })
        await client.insertRow(workspaceMid, { values: { label: '"Row B"' } })

        const workspaceRows = await sql.execQuery(
          `SELECT id FROM "mx_${workspaceMid}_data" ORDER BY id LIMIT 2`,
        )
        // Create two aspect rows targeting the tag matrix, joined from workspace rows
        for (let i = 0; i < 2; i++) {
          const sourceRowId = (workspaceRows[i] as { id: number }).id
          await client.createDependentRow(workspaceMid, sourceRowId, tagMid, {})
        }
      },
      { tagMid: tagMatrixId },
    )

    await switchToTags(page)
    await expect(page.getByTestId('tag-type-list')).toBeVisible({ timeout: 5000 })

    const taskRow = page.locator('.tag-type-row', { hasText: '#task' })
    await expect(taskRow).toBeVisible({ timeout: 5000 })

    await expect(async () => {
      const countText = await taskRow.locator('[data-testid="tag-type-count"]').textContent()
      expect(countText).toContain('2')
    }).toPass({ timeout: 5000 })
  })

  test('selecting a tag type shows its instances with source row context', async ({ page }) => {
    await createTagTypeViaAPI(page, 'task')

    const newEditor = await createNewRow(page)
    await page.keyboard.type('My tagged row ')
    await typeHashTag(page, 'task')
    await expect(newEditor.locator('.inlineref-own')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(1000)

    await switchToTags(page)
    await expect(page.getByTestId('tag-type-list')).toBeVisible({ timeout: 5000 })

    const taskRow = page.locator('.tag-type-row', { hasText: '#task' })
    await expect(taskRow).toBeVisible({ timeout: 5000 })
    await taskRow.click()

    await expect(page.getByTestId('tag-instance-list')).toBeVisible({ timeout: 5000 })

    const instanceRow = page.locator('[data-testid="tag-instance-row"]').first()
    await expect(instanceRow).toBeVisible({ timeout: 5000 })

    // Instance should show source row context (snippet containing the text we typed)
    await expect(async () => {
      const snippet = await instanceRow.locator('.tag-instance-snippet').textContent()
      expect(snippet).toContain('My tagged row')
    }).toPass({ timeout: 5000 })
  })

  test('clicking a tag instance navigates to the source workspace row', async ({ page }) => {
    await createTagTypeViaAPI(page, 'task')

    const newEditor = await createNewRow(page)
    await page.keyboard.type('Navigate target ')
    await typeHashTag(page, 'task')
    await expect(newEditor.locator('.inlineref-own')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(1000)

    await switchToTags(page)
    await expect(page.getByTestId('tag-type-list')).toBeVisible({ timeout: 5000 })

    const taskRow = page.locator('.tag-type-row', { hasText: '#task' })
    await taskRow.click()
    await expect(page.getByTestId('tag-instance-list')).toBeVisible({ timeout: 5000 })

    const instanceRow = page.locator('[data-testid="tag-instance-row"]').first()
    await instanceRow.click()

    // Should navigate back to the workspace view
    await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 5000 })
    // The workspace tab should now be active
    await expect(page.locator('.view-tab[data-active="true"]')).toContainText('Workspace', {
      timeout: 5000,
    })
  })

  test('creating a new tag type from the tag browser UI', async ({ page }) => {
    await switchToTags(page)
    await expect(page.locator('.tag-browser')).toBeVisible({ timeout: 5000 })

    await page.getByTestId('new-tag-type-btn').click()
    await expect(page.getByTestId('new-tag-type-form')).toBeVisible({ timeout: 3000 })

    await page.getByTestId('new-tag-type-input').fill('priority')
    await page.getByTestId('new-tag-type-submit').click()

    // The form should close and the new tag type should appear in the list
    await expect(page.getByTestId('new-tag-type-form')).not.toBeVisible({ timeout: 5000 })
    await expect(page.locator('.tag-type-row', { hasText: '#priority' })).toBeVisible({
      timeout: 5000,
    })
  })

  test('"View all in table" opens the identity face for the tag type matrix', async ({
    page,
  }) => {
    await createTagTypeViaAPI(page, 'task')

    // Create a tag instance so the matrix has data
    const newEditor = await createNewRow(page)
    await typeHashTag(page, 'task')
    await expect(newEditor.locator('.inlineref-own')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(1000)

    await switchToTags(page)
    const taskRow = page.locator('.tag-type-row', { hasText: '#task' })
    await expect(taskRow).toBeVisible({ timeout: 5000 })
    await taskRow.click()

    await expect(page.getByTestId('tag-instance-list')).toBeVisible({ timeout: 5000 })
    await page.getByTestId('view-all-in-table').click()

    // Should switch to the table view
    await expect(page.locator('table')).toBeVisible({ timeout: 5000 })
    // The table should have at least one data row (the aspect row we created)
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 5000 })
  })

  test('tag browser back button returns to the tag type list', async ({ page }) => {
    await createTagTypeViaAPI(page, 'task')

    await switchToTags(page)
    const taskRow = page.locator('.tag-type-row', { hasText: '#task' })
    await expect(taskRow).toBeVisible({ timeout: 5000 })
    await taskRow.click()

    await expect(page.getByTestId('tag-instance-list')).toBeVisible({ timeout: 5000 })

    await page.getByTestId('tag-browser-back').click()
    await expect(page.getByTestId('tag-type-list')).toBeVisible({ timeout: 5000 })
  })

  test('context menu: rename a tag type', async ({ page }) => {
    await createTagTypeViaAPI(page, 'task')

    await switchToTags(page)
    const taskRow = page.locator('.tag-type-row', { hasText: '#task' })
    await expect(taskRow).toBeVisible({ timeout: 5000 })

    await taskRow.click({ button: 'right' })
    await expect(page.getByTestId('tag-type-context-menu')).toBeVisible({ timeout: 3000 })

    await page.getByTestId('ctx-rename').click()
    const renameInput = page.getByTestId('tag-type-rename-input')
    await expect(renameInput).toBeVisible({ timeout: 3000 })

    await renameInput.fill('todo')
    await page.keyboard.press('Enter')

    await expect(page.locator('.tag-type-row', { hasText: '#todo' })).toBeVisible({
      timeout: 5000,
    })
    await expect(page.locator('.tag-type-row', { hasText: '#task' })).not.toBeVisible({
      timeout: 3000,
    })
  })

  test('context menu: delete a tag type', async ({ page }) => {
    await createTagTypeViaAPI(page, 'task')
    await createTagTypeViaAPI(page, 'review')

    await switchToTags(page)
    await expect(page.locator('.tag-type-row', { hasText: '#task' })).toBeVisible({
      timeout: 5000,
    })

    // Accept the confirm dialog
    page.on('dialog', (dialog) => void dialog.accept())

    const taskRow = page.locator('.tag-type-row', { hasText: '#task' })
    await taskRow.click({ button: 'right' })
    await expect(page.getByTestId('tag-type-context-menu')).toBeVisible({ timeout: 3000 })

    await page.getByTestId('ctx-delete').click()

    await expect(page.locator('.tag-type-row', { hasText: '#task' })).not.toBeVisible({
      timeout: 5000,
    })
    // The other tag type should still be visible
    await expect(page.locator('.tag-type-row', { hasText: '#review' })).toBeVisible({
      timeout: 3000,
    })
  })
})

