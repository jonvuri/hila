import { expect, type Page } from '@playwright/test'

export const openEmbeddedTable = async (page: Page): Promise<number> => {
  const matrixId = await page.evaluate(async () => {
    // @ts-expect-error -- Vite resolves this browser-only module at runtime.
    const sql = await import('/src/core/client/sql-client.ts')
    // @ts-expect-error -- Vite resolves this browser-only module at runtime.
    const matrix = await import('/src/core/client/matrix-client.ts')
    const workspaceRows = (await sql.execQuery(
      "SELECT id FROM matrix WHERE title = 'Workspace'",
    )) as Array<{ id: number }>
    const workspaceMatrixId = workspaceRows[0]!.id
    const ownerRows = (await sql.execQuery(
      `SELECT id FROM "mx_${workspaceMatrixId}_data" ORDER BY id LIMIT 1`,
    )) as Array<{ id: number }>
    const ownerRowId = ownerRows[0]!.id
    const tableMatrixId = await matrix.createOwnedMatrix(
      { matrixId: workspaceMatrixId, rowId: ownerRowId },
      'Test table',
      [
        { name: 'title', type: 'TEXT', role: 'label' },
        { name: 'content', type: 'TEXT', role: 'content' },
      ],
    )
    await matrix.applyFaceToMatrix('hila.table', tableMatrixId)
    await matrix.createDependentRow(workspaceMatrixId, ownerRowId, tableMatrixId, {
      title: 'Fixture row',
      content: 'Fixture content',
    })
    return tableMatrixId
  })

  const sidebar = page.locator('.app-sidebar')
  if (await sidebar.isVisible()) {
    await page.getByRole('button', { name: 'Close sidebar' }).click()
  }
  const ownerRow = page.locator('.outline-row').first()
  await ownerRow.hover()
  await ownerRow.locator('.nav-row-open-focus').click()
  await expect(page.getByTestId('focus-panel')).toBeVisible({ timeout: 5000 })
  await expect(page.getByTestId('sub-table-band-item')).toBeVisible({ timeout: 5000 })
  await expect(page.getByTestId('table-face')).toBeVisible({ timeout: 5000 })
  return matrixId
}
