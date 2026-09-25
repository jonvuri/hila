import { test, expect, type Page } from '@playwright/test'

// -- Shared helpers -----------------------------------------------------------

const launcherShortcut = process.platform === 'darwin' ? 'Meta+K' : 'Control+K'

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

  // Tag type-nodes (Phase 8c) render as root outline rows with a type chip and
  // append after the welcome row, so a bare `.last()` can land on a type-node.
  // Target the last row that is NOT a type/aspect chip row — the new plain row.
  const plainRows = page
    .locator('.outline-row')
    .filter({ hasNot: page.getByTestId('row-type-chip') })
  const newEditor = plainRows.last().locator('.ProseMirror').first()
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

  // Phase 9.1: type-nodes render as root rows with a type chip; `createNewRow`
  // and the badge locator now target the plain (non-chip) row, so inline tag
  // type creation is exercised end-to-end again.
  test('selecting "Create tag type" creates the tag type and inserts a badge', async ({
    page,
  }) => {
    const newEditor = await createNewRow(page)
    await typeHashTag(page, 'newtype', true)

    const tagBadge = newEditor.locator('.inlineref-own')
    await expect(tagBadge).toBeVisible({ timeout: 5000 })
    await expect(tagBadge).toContainText('#newtype')
  })

  test('newly created tag type appears in launcher type browse', async ({ page }) => {
    const newEditor = await createNewRow(page)
    await typeHashTag(page, 'project', true)

    await expect(newEditor.locator('.inlineref-own')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(500)

    await page.keyboard.press(launcherShortcut)
    const launcher = page.getByTestId('quick-launcher')
    const input = launcher.locator('#quick-launcher-input')
    await input.fill('#project')
    const type = launcher.getByRole('option', { name: /project/ }).first()
    await expect(type).toBeVisible({ timeout: 5000 })
    await type.click()
    await expect(page.getByTestId('focus-panel')).toHaveAttribute(
      'data-launcher-subject-label',
      'project',
    )
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

    const labelField = panel
      .locator('.tag-panel-field')
      .filter({ hasText: 'label' })
      .locator('.tag-panel-field-input')
    await expect(labelField).toBeVisible({ timeout: 3000 })
    await labelField.fill('my-task')
    await labelField.blur()

    await page.waitForTimeout(500)

    const result = await runSQL(page, `SELECT label FROM "mx_${matrixId}_data" LIMIT 1`)
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

  test('tag data written through the property panel reaches the owned matrix', async ({
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

    const fieldInput = panel
      .locator('.tag-panel-field', { hasText: 'priority' })
      .locator('.tag-panel-field-input')
    await expect(fieldInput).toBeVisible({ timeout: 3000 })
    await fieldInput.fill('high')
    await fieldInput.blur()
    await page.waitForTimeout(500)

    await page.keyboard.press('Escape')
    await expect(panel).not.toBeVisible({ timeout: 3000 })

    await expect
      .poll(() =>
        page.evaluate(async (tagMatrixId) => {
          // @ts-expect-error -- Vite resolves this browser-only module at runtime.
          const sql = await import('/src/core/client/sql-client.ts')
          return sql.execQuery(`SELECT priority FROM "mx_${tagMatrixId}_data" LIMIT 1`)
        }, matrixId),
      )
      .toEqual([{ priority: 'high' }])
  })

  test('editing the aspect row is reflected in the tag badge', async ({ page }) => {
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

    await page.evaluate(async (tagMatrixId) => {
      // @ts-expect-error -- Vite resolves this browser-only module at runtime.
      const sql = await import('/src/core/client/sql-client.ts')
      // @ts-expect-error -- Vite resolves this browser-only module at runtime.
      const matrix = await import('/src/core/client/matrix-client.ts')
      const rows = (await sql.execQuery(
        `SELECT id FROM "mx_${tagMatrixId}_data" LIMIT 1`,
      )) as Array<{ id: number }>
      const id = rows[0]!.id
      await matrix.updateRow(tagMatrixId, id, { priority: 'urgent' })
    }, matrixId)

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

  // Phase 9.1: `createNewRow` now targets the plain (non-type-node) row, so the
  // badges attach to a real host workspace row. Deleting that host cascades the
  // aspect rows (the task/review matrixes themselves persist — only their rows
  // are removed), so the post-delete data-count queries are valid again.
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

    await page.evaluate(async ({ matrixId, rowId }) => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const client = await import('/src/core/client/matrix-client.ts')
      await client.deleteRow(matrixId, rowId)
    }, rowInfo!)

    await page.waitForTimeout(1000)

    await expect(async () => {
      const afterCounts = await page.evaluate(
        async ({ taskMid, reviewMid }) => {
          // @ts-expect-error -- resolved by Vite dev server at runtime
          const sql = await import('/src/core/client/sql-client.ts')
          const taskRows = await sql.execQuery(
            `SELECT COUNT(*) AS cnt FROM "mx_${taskMid}_data"`,
          )
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

  // Phase 9 (type-node carry-over): deleting the *type-node* itself drops its
  // owned matrix (the matrix-drop cascade, 8c §8.1) — a distinct axis from the
  // host-row cascade above. The host doc's badge is stripped/ghosted, the tag
  // vanishes from # autocomplete, and the promotion is cleared. We deliberately
  // do NOT query the dropped data table (it no longer exists).
  test('deleting a tag type-node strips host badges, clears promotion, and leaves autocomplete', async ({
    page,
  }) => {
    await createTagTypeViaAPI(page, 'task')

    const newEditor = await createNewRow(page)
    await typeHashTag(page, 'task')
    await expect(newEditor.locator('.inlineref-own')).toBeVisible({ timeout: 5000 })
    // Wait for the debounced save + syncInlineRefs to persist the badge into the
    // host doc and materialize the own-join.
    await page.waitForTimeout(1000)

    const workspaceMid = await page.evaluate(async () => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const sql = await import('/src/core/client/sql-client.ts')
      const rows = await sql.execQuery("SELECT id FROM matrix WHERE title = 'Workspace'")
      return (rows[0] as { id: number }).id
    })

    // Precondition: the badge is persisted in a host doc (the bullet label).
    const refsBefore = await page.evaluate(async (mid: number) => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const sql = await import('/src/core/client/sql-client.ts')
      const rows = await sql.execQuery(
        `SELECT COUNT(*) AS cnt FROM "mx_${mid}_data" WHERE label LIKE '%inlineref%'`,
      )
      return (rows[0] as { cnt: number }).cnt
    }, workspaceMid)
    expect(refsBefore).toBeGreaterThan(0)

    // Delete the type-node itself → matrix-drop cascade (8c §8.1).
    await page.evaluate(async () => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const client = await import('/src/core/client/matrix-client.ts')
      const tagTypes = await client.getAllTagTypes()
      const task = tagTypes.find((t: { name: string }) => t.name.toLowerCase() === 'task')
      await client.deleteTagType(task.id)
    })

    // The # badge is stripped from the host doc (eager inlineref cleanup).
    await expect(async () => {
      const refsAfter = await page.evaluate(async (mid: number) => {
        // @ts-expect-error -- resolved by Vite dev server at runtime
        const sql = await import('/src/core/client/sql-client.ts')
        const rows = await sql.execQuery(
          `SELECT COUNT(*) AS cnt FROM "mx_${mid}_data" WHERE label LIKE '%inlineref%'`,
        )
        return (rows[0] as { cnt: number }).cnt
      }, workspaceMid)
      expect(refsAfter).toBe(0)
    }).toPass({ timeout: 10000 })

    // The tag vanishes from getAllTagTypes (matrix dropped + promotion cleared)…
    const stillThere = await page.evaluate(async () => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const client = await import('/src/core/client/matrix-client.ts')
      const tagTypes = await client.getAllTagTypes()
      return tagTypes.some((t: { name: string }) => t.name.toLowerCase() === 'task')
    })
    expect(stillThere).toBe(false)

    // …and the promoted_nodes entry is gone (no resurrection hazard).
    const promotedCount = await page.evaluate(async () => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const sql = await import('/src/core/client/sql-client.ts')
      const rows = await sql.execQuery('SELECT COUNT(*) AS cnt FROM promoted_nodes')
      return (rows[0] as { cnt: number }).cnt
    })
    expect(promotedCount).toBe(0)

    // Re-typing #task now offers "Create" — no existing item remains to select.
    await newEditor.click()
    await page.keyboard.press('End')
    await page.keyboard.type('#task')
    await page.waitForTimeout(500)
    await expect(page.locator('.inlineref-autocomplete-create').first()).toBeVisible({
      timeout: 5000,
    })
    // No *existing* tag item remains (the create option also carries
    // `.inlineref-autocomplete-item`, so exclude it).
    await expect(
      page.locator('.inlineref-autocomplete-item:not(.inlineref-autocomplete-create)'),
    ).toHaveCount(0)
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
// 6. Phase 9.1 — heterogeneous children in one outline
// =============================================================================

test.describe('Heterogeneous children (Phase 9.1)', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForRows(page)
  })

  test('demo subtree renders interleaved bullets and #task/#note aspect rows', async ({
    page,
  }) => {
    await openSidebar(page)
    await page.getByTestId('add-demo-subtree-btn').click()

    // The tour root and a plain workspace child render.
    await expect(page.locator('.outline-row', { hasText: 'feature tour' })).toBeVisible({
      timeout: 5000,
    })
    await expect(page.locator('.outline-row', { hasText: 'a loose own-child' })).toBeVisible({
      timeout: 5000,
    })

    // Cross-matrix aspect rows render in the same outline, each with a type chip
    // labelled by its matrix (task / note) — distinct from a plain bullet.
    await expect(page.locator('.outline-row', { hasText: '#task aspect' })).toBeVisible({
      timeout: 5000,
    })
    await expect(page.locator('.outline-row', { hasText: '#note aspect' })).toBeVisible({
      timeout: 5000,
    })

    await expect(
      page
        .getByTestId('row-type-chip')
        .filter({ hasText: /^task$/ })
        .first(),
    ).toBeVisible({ timeout: 5000 })
    await expect(
      page
        .getByTestId('row-type-chip')
        .filter({ hasText: /^note$/ })
        .first(),
    ).toBeVisible({ timeout: 5000 })

    // A nested host owns its own task — heterogeneous children nest, too.
    await expect(page.locator('.outline-row', { hasText: 'nested host' })).toBeVisible({
      timeout: 5000,
    })
  })

  test('aspect-row type chip resolves to the matrix title inside a focus panel', async ({
    page,
  }) => {
    await openSidebar(page)
    await page.getByTestId('add-demo-subtree-btn').click()

    // Open the 9.1 host that owns the #task/#note aspects.
    const hostRow = page.locator('.outline-row', { hasText: 'Heterogeneous children' }).first()
    await expect(hostRow).toBeVisible({ timeout: 5000 })
    await hostRow.hover()
    await hostRow.locator('.nav-row-open-focus').click()

    // The nested navigation panel inside the focus column renders the #task
    // aspect row with a chip reading the matrix title ("task"), not a raw
    // "matrix <id>" fallback.
    const focusChildren = page
      .locator('[data-testid="workspace-shell-column"][data-panel-kind="focus"]')
      .last()
      .getByTestId('focus-panel-children')
    const taskRow = focusChildren
      .locator('.outline-row')
      .filter({ hasText: '#task aspect' })
      .first()
    await expect(taskRow).toBeVisible({ timeout: 5000 })
    const chip = taskRow.getByTestId('row-type-chip')
    await expect(chip).toHaveText('task', { timeout: 5000 })
  })
})

// =============================================================================
// 7. Phase 9 carry-over — type-nodes are ordinary, navigable workspace nodes
// =============================================================================

test.describe('Type-node navigability (Phase 9 carry-over)', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForRows(page)
  })

  test('a type-node renders at the root with a type chip and is navigable via open-focus', async ({
    page,
  }) => {
    await createTagTypeViaAPI(page, 'project')

    // The type-node is a real root outline row (label = tag name) with a distinct
    // "type" chip — not hidden, not a special side-path.
    const typeRow = page
      .locator('.outline-row')
      .filter({ has: page.getByTestId('row-type-chip') })
      .filter({ hasText: 'project' })
      .first()
    await expect(typeRow).toBeVisible({ timeout: 5000 })
    await expect(typeRow.getByTestId('row-type-chip')).toHaveText('type')

    // It now exposes the open-focus affordance (navigable like any node — the
    // Phase 9 carry-over resolution; previously blocked).
    await typeRow.hover()
    await typeRow.getByTestId('open-focus-btn').click()

    // Drilling in opens a focus panel titled by the type-node's name.
    const focusLabel = page.getByTestId('focus-panel-label').last()
    await expect(focusLabel).toContainText('project', { timeout: 5000 })
  })
})
