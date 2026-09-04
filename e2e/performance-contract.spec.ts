import {
  expect,
  test,
  type CDPSession,
  type ElementHandle,
  type Locator,
  type Page,
} from '@playwright/test'
import { cpus, totalmem } from 'node:os'

const CHURN_ROOT_COUNT = 130
const CHURN_DESCENDANT_COUNT = 40
const STRESS_BRANCH_ROWS = 72
const STRESS_CROSS_MATRIX_ROWS = 12
const STRESS_VIEW_ROWS = 120
const CPU_SLOWDOWN = 20
const MOUNTED_ROW_LIMIT = 400
const STRESS_P95_BUDGET_MS = 3_500
const TEST_TIMEOUT = 300_000

type PmCounts = { mounts: number; unmounts: number }

type ChurnFixture = {
  matrixId: number
  parentId: number
  targetId: number
  chainIds: number[]
}

type TraceEvent = {
  name?: string
  dur?: number
  args?: Record<string, unknown>
}

const doc = (text: string): string =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })

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
  await page.getByTestId('workspace-tab').click()
  await expect(page.locator('.outline-row').first()).toBeVisible({ timeout: 10_000 })
}

const waitForRowCount = async (page: Page, expected: number) => {
  await expect(page.locator('.outline-row')).toHaveCount(expected, { timeout: 30_000 })
}

const pmCounts = (page: Page): Promise<PmCounts> =>
  page.evaluate(() => {
    const debug = (
      window as unknown as {
        __hilaDebug: { pmCounts: () => PmCounts }
      }
    ).__hilaDebug
    return debug.pmCounts()
  })

const pmDelta = async (page: Page, before: PmCounts): Promise<PmCounts> => {
  const after = await pmCounts(page)
  return {
    mounts: after.mounts - before.mounts,
    unmounts: after.unmounts - before.unmounts,
  }
}

const waitForPmDelta = async (page: Page, before: PmCounts, expected: PmCounts) => {
  await expect.poll(() => pmDelta(page, before), { timeout: 10_000 }).toEqual(expected)
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

const openFocusForRow = async (scope: Locator, rowId: number) => {
  const row = scope.locator(`.outline-row[data-row-id="${rowId}"]`).first()
  await row.scrollIntoViewIfNeeded()
  await row.hover()
  await row.locator('.nav-row-open-focus').click()
}

const seedChurnFixture = (page: Page): Promise<ChurnFixture> =>
  page.evaluate(
    async ({ rootCount, descendantCount }) => {
      // @ts-expect-error -- Vite resolves this browser-only module at runtime.
      const sql = await import('/src/core/client/sql-client.ts')
      // @ts-expect-error -- Vite resolves this browser-only module at runtime.
      const matrix = await import('/src/core/client/matrix-client.ts')
      const makeDoc = (text: string) =>
        JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        })
      const matrixRows = await sql.execQuery("SELECT id FROM matrix WHERE title = 'Workspace'")
      const matrixId = (matrixRows[0] as { id: number }).id
      const roots: Array<{ rowId: number; key: Uint8Array }> = []
      for (let index = 0; index < rootCount; index += 1) {
        const row = await matrix.insertRow(matrixId, {
          values: { label: makeDoc(`Churn root ${index}`), content: null },
        })
        roots.push({ rowId: row.rowId as number, key: row.key as Uint8Array })
      }

      const parent = await matrix.insertRow(matrixId, {
        values: { label: makeDoc('Churn parent'), content: null },
      })
      const chainIds: number[] = []
      let chainParentKey = parent.key as Uint8Array
      for (let index = 0; index < 3; index += 1) {
        const row = await matrix.insertRow(matrixId, {
          parentKey: chainParentKey,
          values: { label: makeDoc(`Churn chain ${index}`), content: null },
        })
        chainIds.push(row.rowId as number)
        chainParentKey = row.key as Uint8Array
      }
      for (let index = 3; index < descendantCount; index += 1) {
        await matrix.insertRow(matrixId, {
          parentKey: parent.key,
          values: { label: makeDoc(`Churn child ${index}`), content: null },
        })
      }

      return {
        matrixId,
        parentId: parent.rowId as number,
        targetId: roots[0]!.rowId,
        chainIds,
      }
    },
    { rootCount: CHURN_ROOT_COUNT, descendantCount: CHURN_DESCENDANT_COUNT },
  )

const seedStressFixture = (page: Page) =>
  page.evaluate(
    async ({ branchRows, crossMatrixRows, viewRows }) => {
      // @ts-expect-error -- Vite resolves this browser-only module at runtime.
      const sql = await import('/src/core/client/sql-client.ts')
      // @ts-expect-error -- Vite resolves this browser-only module at runtime.
      const matrix = await import('/src/core/client/matrix-client.ts')
      const makeDoc = (text: string) =>
        JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        })
      const matrixRows = await sql.execQuery("SELECT id FROM matrix WHERE title = 'Workspace'")
      const matrixId = (matrixRows[0] as { id: number }).id
      const branch = await matrix.insertRow(matrixId, {
        values: { label: makeDoc('Stress branch'), content: null },
      })

      let deepParentKey = branch.key as Uint8Array
      for (let index = 0; index < branchRows; index += 1) {
        const nested = index < 10
        const row = await matrix.insertRow(matrixId, {
          parentKey: nested ? deepParentKey : branch.key,
          values: { label: makeDoc(`Stress row ${index}`), content: null },
        })
        if (nested) deepParentKey = row.key as Uint8Array
      }

      const crossMatrixId = (await matrix.createMatrix('Stress cross-matrix')) as number
      for (let index = 0; index < crossMatrixRows; index += 1) {
        await matrix.createDependentRow(matrixId, branch.rowId, crossMatrixId, {
          title: `Cross-matrix row ${index}`,
        })
      }

      const portalHost = await matrix.insertRow(matrixId, {
        values: { label: makeDoc('Stress portal host'), content: null },
      })
      const portalTarget = await matrix.insertRow(matrixId, {
        values: { label: makeDoc('Stress portal target'), content: null },
      })
      await matrix.addPortal(
        { matrixId, rowId: portalHost.rowId },
        { matrixId, rowId: portalTarget.rowId },
      )

      const viewHost = await matrix.insertRow(matrixId, {
        values: { label: makeDoc('Stress view host'), content: null },
      })
      const viewMatrixId = (await matrix.createMatrix('Stress view source')) as number
      await matrix.addColumn(viewMatrixId, 'detail', 'TEXT')
      for (let index = 0; index < viewRows; index += 1) {
        await sql.execMutation(
          `INSERT INTO "mx_${viewMatrixId}_data" (detail) VALUES ('View row ${index}')`,
        )
      }
      await matrix.createViewBlock(
        matrixId,
        viewHost.rowId,
        `SELECT * FROM "mx_${viewMatrixId}_data"`,
        'Stress folded view',
      )

      return { matrixId }
    },
    {
      branchRows: STRESS_BRANCH_ROWS,
      crossMatrixRows: STRESS_CROSS_MATRIX_ROWS,
      viewRows: STRESS_VIEW_ROWS,
    },
  )

const measureToggle = (button: Locator): Promise<number> =>
  button.evaluate(async (element) => {
    const initial = element.getAttribute('aria-expanded')
    const start = performance.now()
    element.click()
    for (let frame = 0; frame < 240; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      if (element.getAttribute('aria-expanded') !== initial) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        return performance.now() - start
      }
    }
    throw new Error('Stress toggle did not settle within 240 frames')
  })

const percentile = (samples: number[], ratio: number): number => {
  const ordered = [...samples].sort((left, right) => left - right)
  return ordered[Math.max(0, Math.ceil(ordered.length * ratio) - 1)]!
}

const trace = async (
  session: CDPSession,
  action: () => Promise<void>,
): Promise<TraceEvent[]> => {
  const completed = new Promise<{ stream: string }>((resolve) => {
    session.once('Tracing.tracingComplete', resolve)
  })
  await session.send('Tracing.start', {
    categories: 'devtools.timeline,disabled-by-default-devtools.timeline.stack',
    transferMode: 'ReturnAsStream',
  })
  await action()
  await session.send('Tracing.end')
  const { stream } = await completed
  let body = ''
  while (true) {
    const chunk = (await session.send('IO.read', { handle: stream })) as {
      data: string
      eof: boolean
    }
    body += chunk.data
    if (chunk.eof) break
  }
  await session.send('IO.close', { handle: stream })
  return (JSON.parse(body) as { traceEvents: TraceEvent[] }).traceEvents
}

test.describe('canonical performance contract', () => {
  test('keeps editor churn exact and stable surfaces mounted', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT)
    await resetDatabase(page)
    const initialRows = await page.locator('.outline-row').count()
    const fixture = await seedChurnFixture(page)
    await waitForRowCount(page, initialRows + CHURN_ROOT_COUNT + 1 + CHURN_DESCENDANT_COUNT)

    const rootPanel = page.getByTestId('navigation-panel').first()
    const workspaceContent = page
      .locator('[data-panel-kind="navigation"]')
      .getByTestId('navigation-panel')
      .locator('xpath=..')
    const workspaceContentHandle = await workspaceContent.elementHandle()
    expect(workspaceContentHandle).toBeTruthy()

    const lastEditor = rootPanel.locator('.nav-label-editor .ProseMirror').last()
    const beforeWithinPage = await pmCounts(page)
    const beforeWithinPageRows = await rootPanel.locator('.outline-row').count()
    await lastEditor.click()
    await lastEditor.press('End')
    await lastEditor.press('Enter')
    await waitForRowCount(page, beforeWithinPageRows + 1)
    await waitForPmDelta(page, beforeWithinPage, { mounts: 1, unmounts: 0 })

    const stableRow = rootPanel
      .locator(`.outline-row[data-row-id="${fixture.targetId}"]`)
      .first()
    const stableEditor = stableRow.locator('.ProseMirror')
    const stableEditorHandle = await stableEditor.elementHandle()
    expect(stableEditorHandle).toBeTruthy()
    const beforeUpdate = await pmCounts(page)
    await page.evaluate(
      async ({ matrixId, rowId, label }) => {
        // @ts-expect-error -- Vite resolves this browser-only module at runtime.
        const matrix = await import('/src/core/client/matrix-client.ts')
        await matrix.updateRow(matrixId, rowId, { label })
      },
      { matrixId: fixture.matrixId, rowId: fixture.targetId, label: doc('Updated stable row') },
    )
    await expect(stableEditor).toContainText('Updated stable row', { timeout: 10_000 })
    expect(await pmDelta(page, beforeUpdate)).toEqual({ mounts: 0, unmounts: 0 })
    expect(await sameNode(stableEditorHandle!, stableEditor)).toBe(true)

    const boundaryEditor = rootPanel
      .locator('[data-window-index="0"] .nav-label-editor .ProseMirror')
      .nth(98)
    const beforeBoundaryInsert = await pmCounts(page)
    const beforeBoundaryRows = await rootPanel.locator('.outline-row').count()
    await boundaryEditor.click()
    await boundaryEditor.press('End')
    await boundaryEditor.press('Enter')
    await waitForRowCount(page, beforeBoundaryRows + 1)
    await waitForPmDelta(page, beforeBoundaryInsert, { mounts: 2, unmounts: 1 })

    const beforeBoundaryDelete = await pmCounts(page)
    await page.keyboard.press('Backspace')
    await waitForRowCount(page, beforeBoundaryRows)
    await waitForPmDelta(page, beforeBoundaryDelete, { mounts: 1, unmounts: 2 })
    expect(await sameNode(stableEditorHandle!, stableEditor)).toBe(true)

    const parentRow = rootPanel.locator(`.outline-row[data-row-id="${fixture.parentId}"]`)
    const collapse = parentRow.getByRole('button', { name: 'Collapse Churn parent' })
    const beforeCollapseRows = await rootPanel.locator('.outline-row').count()
    const beforeCollapse = await pmCounts(page)
    await collapse.click()
    await expect(parentRow.getByRole('button', { name: 'Expand Churn parent' })).toBeVisible()
    const afterCollapseRows = await rootPanel.locator('.outline-row').count()
    const rowsLeaving = beforeCollapseRows - afterCollapseRows
    expect(rowsLeaving).toBe(CHURN_DESCENDANT_COUNT + 1)
    await waitForPmDelta(page, beforeCollapse, { mounts: 0, unmounts: rowsLeaving })
    expect(await sameNode(stableEditorHandle!, stableEditor)).toBe(true)

    const beforeExpand = await pmCounts(page)
    await parentRow.getByRole('button', { name: 'Expand Churn parent' }).click()
    await waitForRowCount(page, beforeCollapseRows)
    await waitForPmDelta(page, beforeExpand, { mounts: rowsLeaving, unmounts: 0 })
    expect(await sameNode(stableEditorHandle!, stableEditor)).toBe(true)

    const scrollport = rootPanel.locator('.production-navigation-scrollport')
    await scrollport.evaluate(async (element) => {
      element.scrollTop = Math.min(element.scrollHeight - element.clientHeight, 1_800)
      for (let frame = 0; frame < 8; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
    })
    expect(await sameNode(workspaceContentHandle!, workspaceContent)).toBe(true)
    await scrollport.evaluate((element) => {
      element.scrollTop = 0
    })

    await openFocusForRow(rootPanel, fixture.parentId)
    await expect(page.getByTestId('focus-panel')).toHaveCount(1)
    const parentFocus = page.getByTestId('focus-panel').first()
    const parentFocusHandle = await parentFocus.elementHandle()
    expect(parentFocusHandle).toBeTruthy()

    for (const rowId of fixture.chainIds) {
      const activeFocus = page.getByTestId('focus-panel').last()
      await openFocusForRow(activeFocus.getByTestId('navigation-panel'), rowId)
      await expect(page.getByTestId('focus-panel')).toHaveCount(
        Math.min(4, fixture.chainIds.indexOf(rowId) + 2),
      )
    }
    expect(await sameNode(parentFocusHandle!, page.getByTestId('focus-panel').first())).toBe(
      true,
    )
    await expect(page.getByTestId('workspace-shell-breadcrumb').first()).toContainText(
      'Workspace',
    )
    expect(await sameNode(parentFocusHandle!, page.getByTestId('focus-panel').first())).toBe(
      true,
    )

    await Promise.all([
      workspaceContentHandle!.dispose(),
      stableEditorHandle!.dispose(),
      parentFocusHandle!.dispose(),
    ])
  })

  test('meets the bounded 20x-throttled browser backstop', async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(TEST_TIMEOUT)
    await resetDatabase(page)
    await seedStressFixture(page)
    await expect(page.locator('[data-block-row="true"]')).toHaveCount(STRESS_VIEW_ROWS, {
      timeout: 30_000,
    })
    await expect(page.locator('.outline-row')).toHaveCount(
      1 + 1 + STRESS_BRANCH_ROWS + STRESS_CROSS_MATRIX_ROWS + 2 + 1 + STRESS_VIEW_ROWS + 1,
      { timeout: 30_000 },
    )

    const rootPanel = page.getByTestId('navigation-panel').first()
    const mountedRows = await rootPanel.locator('.outline-row').count()
    expect(mountedRows).toBeGreaterThan(100)
    expect(mountedRows).toBeLessThanOrEqual(MOUNTED_ROW_LIMIT)

    const session = await page.context().newCDPSession(page)
    await session.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN })

    const toggle = () =>
      rootPanel.getByRole('button', { name: /^(Collapse|Expand) Stress branch$/ })
    await measureToggle(toggle())
    await measureToggle(toggle())

    const samples: number[] = []
    for (let sample = 0; sample < 7; sample += 1) {
      samples.push(await measureToggle(toggle()))
    }
    if ((await toggle().getAttribute('aria-expanded')) === 'false') {
      await measureToggle(toggle())
    }

    const beforeScroll = await pmCounts(page)
    const scrollport = rootPanel.locator('.production-navigation-scrollport')
    const traceEvents = await trace(session, () =>
      scrollport.evaluate(async (element) => {
        const limit = element.scrollHeight - element.clientHeight
        for (let frame = 0; frame < 48; frame += 1) {
          const progress = frame < 24 ? frame / 23 : (47 - frame) / 23
          element.scrollTop = limit * progress
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        }
      }),
    )
    const scrollChurn = await pmDelta(page, beforeScroll)
    const longTasks = traceEvents.filter(
      (event) => event.name === 'RunTask' && (event.dur ?? 0) >= 50_000,
    )
    const forcedLayouts = traceEvents.filter((event) => {
      if (event.name !== 'Layout' && event.name !== 'UpdateLayoutTree') return false
      return JSON.stringify(event.args ?? {}).includes('stackTrace')
    })
    const mountedAfterScroll = await rootPanel.locator('.outline-row').count()

    const result = {
      browser: browser.version(),
      viewport: page.viewportSize(),
      machineClass:
        process.env.HILA_PERF_MACHINE_CLASS ??
        `${cpus()[0]?.model ?? 'unknown CPU'}, ${cpus().length} logical CPUs, ${Math.round(totalmem() / 1024 ** 3)} GB memory`,
      target: 'typical downmarket mobile',
      estimatedMachineToTargetSlowdown: 6,
      cpuSlowdown: CPU_SLOWDOWN,
      fixture: {
        deepBranchRows: STRESS_BRANCH_ROWS,
        crossMatrixRows: STRESS_CROSS_MATRIX_ROWS,
        portalAppearances: 1,
        foldedViewRows: STRESS_VIEW_ROWS,
      },
      samplesMs: samples.map((sample) => Number(sample.toFixed(1))),
      medianMs: Number(percentile(samples, 0.5).toFixed(1)),
      p95Ms: Number(percentile(samples, 0.95).toFixed(1)),
      longTasks: longTasks.length,
      maxLongTaskMs: Number(
        Math.max(0, ...longTasks.map((event) => (event.dur ?? 0) / 1_000)).toFixed(1),
      ),
      forcedLayouts: forcedLayouts.length,
      mountedRows: { before: mountedRows, afterScroll: mountedAfterScroll },
      editorChurn: scrollChurn,
    }
    await testInfo.attach('performance-results.json', {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json',
    })
    console.log(`PERFORMANCE_RESULT ${JSON.stringify(result)}`)

    expect(result.p95Ms).toBeLessThanOrEqual(STRESS_P95_BUDGET_MS)
    expect(result.longTasks).toBe(0)
    expect(result.forcedLayouts).toBe(0)
    expect(mountedAfterScroll).toBeLessThanOrEqual(MOUNTED_ROW_LIMIT)

    await session.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    await session.detach()
  })
})
