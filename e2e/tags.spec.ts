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
 * Multiple ProseMirror editors (outline rows) create multiple dropdowns on
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
 * For outline rows, focus the target row's editor first.
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
 * Create a new outline row by pressing Enter at the end of the first row,
 * then return a locator for the newly created row's editor.
 */
const createNewOutlineRow = async (page: Page) => {
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
    await waitForOutline(page)
  })

  test('# triggers autocomplete in an outline row', async ({ page }) => {
    await createTagTypeViaAPI(page, 'task')

    const newEditor = await createNewOutlineRow(page)
    await page.keyboard.type('#')

    await waitForAutocompleteOption(page)
  })

  test('select an existing tag type inserts a colored tag badge in outline', async ({
    page,
  }) => {
    await createTagTypeViaAPI(page, 'task')

    const newEditor = await createNewOutlineRow(page)
    await typeHashTag(page, 'task')

    const tagBadge = newEditor.locator('.inlineref-own')
    await expect(tagBadge).toBeVisible({ timeout: 5000 })
    await expect(tagBadge).toContainText('#task')
  })

  test('tag insertion creates an aspect row in the tag matrix', async ({ page }) => {
    const { matrixId: tagMatrixId } = await createTagTypeViaAPI(page, 'task')

    const newEditor = await createNewOutlineRow(page)
    await typeHashTag(page, 'task')

    await expect(newEditor.locator('.inlineref-own')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(1000)

    const result = await runSQL(page, `SELECT COUNT(*) AS cnt FROM "mx_${tagMatrixId}_data"`)
    expect(result).toContain('"cnt": 1')
  })

  test('# triggers autocomplete in a note body and tag insertion works', async ({ page }) => {
    await createTagTypeViaAPI(page, 'review')

    await switchToNotes(page)
    await page.locator('.note-list-item').first().click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    const editor = page.locator('.note-body-editor .ProseMirror')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    await typeHashTag(page, 'review')

    const tagBadge = editor.locator('.inlineref-own')
    await expect(tagBadge).toBeVisible({ timeout: 5000 })
    await expect(tagBadge).toContainText('#review')
  })

  test('aspect row created from note body tag is linked via join table', async ({ page }) => {
    const { matrixId: tagMatrixId } = await createTagTypeViaAPI(page, 'topic')

    await switchToNotes(page)
    await page.locator('.note-list-item').first().click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    const editor = page.locator('.note-body-editor .ProseMirror')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    await typeHashTag(page, 'topic')

    await expect(editor.locator('.inlineref-own')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(1000)

    const rowResult = await runSQL(page, `SELECT COUNT(*) AS cnt FROM "mx_${tagMatrixId}_data"`)
    expect(rowResult).toContain('"cnt": 1')

    const joinResult = await runSQL(
      page,
      `SELECT COUNT(*) AS cnt FROM joins WHERE target_matrix_id = ${tagMatrixId} AND kind = 'own'`,
    )
    expect(joinResult).toContain('"cnt": 1')
  })
})

// =============================================================================
// 2. Tag type creation tests
// =============================================================================

test.describe('Tag type creation via autocomplete', () => {
  test.beforeEach(async ({ page }) => {
    await resetDB(page)
    await waitForOutline(page)
  })

  test('typing a nonexistent tag name shows "Create tag type" option', async ({ page }) => {
    const newEditor = await createNewOutlineRow(page)
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
    const newEditor = await createNewOutlineRow(page)
    await typeHashTag(page, 'newtype', true)

    const tagBadge = newEditor.locator('.inlineref-own')
    await expect(tagBadge).toBeVisible({ timeout: 5000 })
    await expect(tagBadge).toContainText('#newtype')
  })

  test('newly created tag type appears in the tag browser', async ({ page }) => {
    const newEditor = await createNewOutlineRow(page)
    await typeHashTag(page, 'project', true)

    await expect(newEditor.locator('.inlineref-own')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(500)

    await switchToTags(page)
    await expect(page.getByTestId('tag-type-list')).toBeVisible({ timeout: 5000 })

    const tagTypeRow = page.locator('.tag-type-row', { hasText: '#project' })
    await expect(tagTypeRow).toBeVisible({ timeout: 5000 })
  })

  test('inline tag type creation also creates the aspect row', async ({ page }) => {
    const newEditor = await createNewOutlineRow(page)
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

  test('tag type creation in a note body works the same as in outline', async ({ page }) => {
    await switchToNotes(page)
    await page.locator('.note-list-item').first().click()
    await expect(page.locator('.note-face')).toBeVisible({ timeout: 5000 })

    const editor = page.locator('.note-body-editor .ProseMirror')
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    await typeHashTag(page, 'notetype', true)

    const tagBadge = editor.locator('.inlineref-own')
    await expect(tagBadge).toBeVisible({ timeout: 5000 })
    await expect(tagBadge).toContainText('#notetype')

    const tagTypeExists = await page.evaluate(async () => {
      // @ts-expect-error -- resolved by Vite dev server at runtime
      const matrixClient = await import('/src/core/client/matrix-client.ts')
      const tagTypes = await matrixClient.getAllTagTypes()
      return tagTypes.some((tt: { name: string }) => tt.name.toLowerCase() === 'notetype')
    })

    expect(tagTypeExists).toBe(true)
  })
})
